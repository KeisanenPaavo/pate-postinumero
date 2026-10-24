import "server-only";
import { cacheLife } from "next/cache";
import type { Lahiosoite } from "./palvelut";

// Taloyhtiön perustiedot PRH:n avoimesta YTJ-rajapinnasta (CC BY 4.0). Rakennuksen ja yhtiön välillä ei ole
// avointa linkkiä, joten yhtiöt päätellään osoitteesta ja sen lähiosoitteista (Digitransit reverse, ~150 m):
// 1. nimihaku kadunnimellä: yhtiön nimessä on katu ja talonumero ("Asunto Oy Fleminginkatu 4-6"),
// 2. postinumeron taloyhtiöt, joiden osoite on sama talo eikä c/o-osoite ole yrityksen (isännöitsijän osoitteessa
//    voi olla satoja muiden talojen yhtiöitä),
// 3. rakennuksen energiatodistuksen kohteen nimi ("As Oy Ihantola, talo A"), joka on yleensä taloyhtiö – löytää
//    myös yhtiöt, joiden nimessä ei ole katuosoitetta.
// Lähteet ja havainnot: docs/datan-saatavuus.md

const YTJ = "https://avoindata.prh.fi/opendata-ytj-api/v3/companies";
const SIVUJA = 5; // 100 yhtiötä sivulla

type Osoite = { type: number; street?: string | null; buildingNumber?: string | null; entrance?: string | null; co?: string | null; postCode?: string | null; postOffices?: { city: string; languageCode: string }[] };
type YtjYhtio = {
  businessId: { value: string };
  names: { name: string; type: string; endDate?: string | null }[];
  addresses: Osoite[];
  companySituations: { type: "SANE" | "SELTILA" | "KONK" }[];
  website?: { url: string } | null;
  registrationDate?: string | null;
  endDate?: string | null;
  status?: string;
};

export type Taloyhtio = {
  nimi: string;
  ytunnus: string;
  perustettu: number | null;
  /** "Rekisterissä", "Selvitystilassa", "Konkurssissa", "Saneerauksessa" tai "Lakannut". */
  tila: string;
  /** Mihin yhtiö löytyi: rakennuksen energiatodistuksesta tai nimestä (vahvat), pelkästä osoitteesta (heikompi) tai käyttäjän haulla. */
  osuma: "energiatodistus" | "nimi" | "osoite" | "haku";
  /** c/o-osoitteen yritys (yleensä isännöitsijä); yksityishenkilöiden nimiä ei välitetä. */
  hoitaja: string | null;
  /** Tunnettu vuokranantaja, jos c/o tai verkkosivu viittaa siihen: yhtiö on todennäköisesti yhden omistajan. */
  vuokranantaja: string | null;
  verkkosivu: string | null;
  /** Osoite, johon yhtiö osui (nimen tai rekisteriosoitteen perusteella), ja sen etäisyys haetusta osoitteesta. */
  osoite: string;
  metrit: number;
  /** Yhtiö osuu itse haettuun osoitteeseen (sama katu ja numero tai alle 15 m). */
  samaTalo: boolean;
};

// Vuokranantajat, joiden nimissä taloyhtiöitä on paljon. Komu Homes ja Intu Enterprises ovat Vella Kotien hallinnoijia.
const VUOKRANANTAJAT: [RegExp, string][] = [
  [/vellakodit|vella kodit|komu homes|intu enterprises/i, "Vella Kodit"],
  [/\bsato\b|sato\.fi/i, "SATO"],
  [/kojamo|lumo(kodit|\.fi)/i, "Kojamo (Lumo)"],
  [/\bavara\b|avara\.fi/i, "Avara"],
  [/m2-kodit|y-säätiö|ysaatio/i, "Y-Säätiö (M2-Kodit)"],
  [/\bheka\b|helsingin kaupungin asunnot/i, "Helsingin kaupungin asunnot (Heka)"],
  [/asuntosalkku/i, "Asuntosalkku"],
  [/\bovv\b|ovv-asuntopalvelut/i, "OVV Asuntopalvelut"],
];

async function haeKaikki(params: Record<string, string>): Promise<YtjYhtio[]> {
  const kaikki: YtjYhtio[] = [];
  for (let sivu = 1; sivu <= SIVUJA; sivu++) {
    const url = `${YTJ}?${new URLSearchParams({ ...params, companyForm: "AOY", page: String(sivu) })}`;
    const res = await fetch(url, { headers: { "User-Agent": "pate-postinumero/0.1" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`${res.status} PRH`);
    const js = (await res.json()) as { totalResults: number; companies: YtjYhtio[] };
    kaikki.push(...js.companies);
    // Liian suuren sivunumeron kohdalla rajapinta palauttaa ensimmäisen sivun, joten lopetetaan määrän perusteella.
    if (!js.companies.length || kaikki.length >= js.totalResults) break;
  }
  return kaikki;
}

/** Taloyhtiöt, joiden nimessä on kadunnimi (koko maa). Välimuistitetaan vain onnistuneet haut. */
async function nimella(katu: string) {
  "use cache";
  cacheLife("days");
  return haeKaikki({ name: katu });
}

async function postinumerolla(pno: string) {
  "use cache";
  cacheLife("days");
  return haeKaikki({ postCode: pno });
}

const pieni = (s: string) => s.toLocaleLowerCase("fi").replace(/\s+/g, " ").trim();
const regexpSuoja = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Talonumerot merkkijonosta: "4-6" → 4,5,6; "1, 3 ja 5" → 1,3,5. Väli rajataan, ettei "1-99" kata kaikkea. */
function numerot(s: string): number[] {
  const tulos: number[] = [];
  for (const osa of s.split(/\s*(?:,|\bja\b|&|\boch\b)\s*/)) {
    const m = osa.match(/^(\d+)\s*[a-zåäö]?\s*(?:[-–]\s*(\d+))?/i);
    if (!m) continue;
    const a = +m[1];
    const b = m[2] ? +m[2] : a;
    if (b >= a && b - a <= 10) for (let n = a; n <= b; n++) tulos.push(n);
    else tulos.push(a);
  }
  return tulos;
}

/** Onko yhtiön nimessä katu ja talonumero, esim. "Asunto Oy Fleminginkatu 4-6" osoitteelle Fleminginkatu 5. */
function nimiOsuu(nimi: string, katu: string, nro: number) {
  const m = pieni(nimi).match(new RegExp(`(?:^|[\\s-])${regexpSuoja(pieni(katu))}\\s+(\\d[\\d\\s,a-zåäö–-]*)`, "i"));
  return !!m && numerot(m[1]).includes(nro);
}

/** c/o-teksti on yritys (isännöitsijä tai omistaja), jos siinä on yhtiömuoto tai isännöinti. */
const onYritys = (co: string) => /\b(oy|oyj|ab|ky|ay|ltd|tmi)\b|isännöi|disponent|kodit|homes|kiinteistö/i.test(co);

function tila(y: YtjYhtio) {
  const t = y.companySituations[0]?.type;
  if (t === "KONK") return "Konkurssissa";
  if (t === "SELTILA") return "Selvitystilassa";
  if (t === "SANE") return "Saneerauksessa";
  if (y.endDate || y.status === "5") return "Lakannut";
  return "Rekisterissä";
}

function muunna(y: YtjYhtio, osuma: Taloyhtio["osuma"]): Omit<Taloyhtio, "osoite" | "metrit" | "samaTalo"> {
  const co = y.addresses.map((a) => a.co?.replace(/^c\/o\s*/i, "").trim()).find(Boolean) ?? null;
  const hoitaja = co && onYritys(co) ? co : null;
  const sivu = y.website?.url?.trim() || null;
  const vuokranantaja = VUOKRANANTAJAT.find(([re]) => re.test(`${co ?? ""} ${sivu ?? ""}`))?.[1] ?? null;
  return {
    nimi: y.names.find((n) => n.type === "1" && !n.endDate)?.name ?? y.names[0]?.name ?? "",
    ytunnus: y.businessId.value,
    perustettu: y.registrationDate ? +y.registrationDate.slice(0, 4) : null,
    tila: tila(y),
    osuma,
    hoitaja,
    vuokranantaja,
    verkkosivu: sivu ? (/^https?:\/\//.test(sivu) ? sivu : `https://${sivu}`) : null,
  };
}

// Yhtiömuodot nimen alussa tai lopussa; vertailussa jätetään pois ("As Oy Ihantola" = "Asunto Oy Ihantola").
const YHTIOMUOTO = /^(?:as\.?\s*oy|asunto[-\s]?oy|asunto-osakeyhtiö|bostads\s*ab|bostadsaktiebolaget|bab)\s+|\s+(?:as\.?\s*oy|asunto oy|bostads ab)$/i;

/** Taloyhtiön ydinnimi vertailuun: "Asunto Oy Papinkuja 2" → "papinkuja 2"; null, jos nimi ei ole asunto-osakeyhtiö. */
function ydinnimi(nimi: string) {
  const n = pieni(nimi).replace(/[“”"]/g, "");
  if (!YHTIOMUOTO.test(n)) return null;
  return n.replace(YHTIOMUOTO, "").replace(/\s+/g, " ").trim() || null;
}

/**
 * Energiatodistuksen kohteen nimestä taloyhtiön nimi: talon, portaan tai rakennuksen tarkenne pois.
 * "As Oy Malmin Kotiraitti - Rak H" → "As Oy Malmin Kotiraitti", "Asunto Oy Papinkuja 2 / talo 2" → "Asunto Oy Papinkuja 2".
 */
export function todistuksenYhtio(kohde: string): string | null {
  const nimi = kohde
    .split(/\s*(?:[,/(]|\s[-–]\s)\s*/)[0]
    .replace(/\s+(?:talo|rak\.?|rakennus|porras|rappu|krs|hus|huset)\b.*$/i, "")
    .trim();
  return ydinnimi(nimi) ? nimi : null;
}

const YTUNNUS = /^\d{7}-\d$/;

/** Rekisteriosoite tekstinä: "Porthaninkatu 10, 00530 Helsinki". */
function rekisteriosoite(y: YtjYhtio) {
  const a = y.addresses.find((x) => x.type === 1) ?? y.addresses[0];
  if (!a) return "";
  const kaupunki = a.postOffices?.find((p) => p.languageCode === "1")?.city ?? a.postOffices?.[0]?.city ?? "";
  return [[a.street, a.buildingNumber].filter(Boolean).join(" "), [a.postCode, kaupunki].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

async function ytunnuksella(ytunnus: string) {
  "use cache";
  cacheLife("days");
  return haeKaikki({ businessId: ytunnus });
}

/**
 * Käyttäjän oma haku Y-tunnuksella tai nimellä, kun automaattinen tunnistus ei osunut. Enintään 20 asunto-osakeyhtiötä,
 * voimassa olevat ensin; osoite on yhtiön rekisteriosoite (usein isännöitsijän).
 */
export async function haeTaloyhtio(haku: string): Promise<Taloyhtio[]> {
  const q = haku.trim();
  const yhtiot = YTUNNUS.test(q) ? await ytunnuksella(q) : await nimella(q);
  return yhtiot
    .map((y) => ({ ...muunna(y, "haku"), osoite: rekisteriosoite(y), metrit: 0, samaTalo: true }))
    .sort((a, b) => Number(a.tila === "Lakannut") - Number(b.tila === "Lakannut") || a.nimi.localeCompare(b.nimi, "fi"))
    .slice(0, 20);
}

/** "Hämeentie 3 A, Helsinki" → { katu: "Hämeentie", nro: 3, kunta: "Helsinki" }; null, jos talonumeroa ei ole. */
export function jasennaOsoite(teksti: string) {
  const [alku, ...loput] = teksti.split(",").map((s) => s.trim());
  const m = alku.match(/^(\D+?)\s+(\d+)/);
  if (!m) return null;
  return { katu: m[1].trim(), nro: +m[2], kunta: loput.at(-1) ?? null };
}

type Ehdokas = { katu: string; nro: number; kunta: string | null; pno: string | null; metrit: number; teksti: string };

/**
 * Taloyhtiöt osoitteen ympäriltä (enintään 8), lähin ensin. Taloyhtiön nimi- tai rekisteriosoite ei aina ole sama kuin
 * asunnon osoite (kulmatalo, porras toisella kadulla), joten verrataan kaikkiin ~150 m säteen osoitteisiin ja
 * merkitään samaTalo, kun yhtiö osuu itse osoitteeseen. Tyhjä lista = ei löytynyt; heittää, jos PRH ei vastaa.
 */
export async function taloyhtiotLahella(
  osoite: string,
  lahella: Lahiosoite[],
  pno: string | null,
  /** Osoitteen rakennusten energiatodistusten kohdenimet. */
  todistusnimet: string[] = [],
): Promise<Taloyhtio[]> {
  const oma = jasennaOsoite(osoite);
  const ehdokkaat: Ehdokas[] = [
    ...(oma ? [{ ...oma, pno, metrit: 0, teksti: `${oma.katu} ${oma.nro}` }] : []),
    ...lahella.flatMap((l) => {
      const nro = numerot(l.numero)[0];
      return nro ? [{ katu: l.katu, nro, kunta: l.kunta, pno: l.pno, metrit: l.metrit, teksti: `${l.katu} ${l.numero.match(/^\d+(?:\s*[-–]\s*\d+)?/)![0]}` }] : [];
    }),
  ];
  const todistusyhtiot = [...new Set(todistusnimet.map(todistuksenYhtio).filter((n): n is string => !!n))];
  if (!ehdokkaat.length && !todistusyhtiot.length) return [];
  const samaOsoite = (e: Ehdokas) => !!oma && pieni(e.katu) === pieni(oma.katu) && e.nro === oma.nro;

  const kadut = [...new Set(ehdokkaat.map((e) => e.katu))];
  const pnot = [...new Set([pno, ...ehdokkaat.map((e) => e.pno)].filter((x): x is string => !!x))].slice(0, 3);
  const [nimiListat, pnoListat, todistusListat] = await Promise.all([
    Promise.all(kadut.map((k) => nimella(k))),
    Promise.all(pnot.map((n) => postinumerolla(n).catch(() => []))),
    Promise.all(todistusyhtiot.map((n) => nimella(ydinnimi(n)!).catch(() => []))),
  ]);

  const yhtiot = new Map<string, YtjYhtio>();
  for (const y of [...nimiListat.flat(), ...pnoListat.flat(), ...todistusListat.flat()]) yhtiot.set(y.businessId.value, y);

  // Energiatodistuksen nimi: täsmälleen sama ydinnimi. Samannimisiä yhtiöitä voi olla monessa kunnassa, joten useasta
  // hyväksytään vain samalla postinumerolla tai samassa kunnassa oleva; yksittäinen osuma kelpaa, vaikka rekisteriosoite
  // olisi isännöitsijän muualla.
  const kunta = oma?.kunta ?? null;
  const todistuksesta = new Set<string>();
  for (const nimi of todistusyhtiot) {
    const ydin = ydinnimi(nimi);
    const samat = todistusListat.flat().filter((y) => y.names.some((n) => !n.endDate && ydinnimi(n.name) === ydin) && tila(y) !== "Lakannut");
    const paikalliset = samat.filter((y) =>
      y.addresses.some((a) => (pno && a.postCode === pno) || (a.postOffices ?? []).some((p) => !!kunta && pieni(p.city) === pieni(kunta))),
    );
    const valitut = paikalliset.length ? paikalliset : samat.length === 1 ? samat : [];
    for (const y of valitut) todistuksesta.add(y.businessId.value);
  }

  // Sama nimi voi olla monessa kunnassa ("Turun Hämeentie 3"): yhtiön osoitteen pitää olla samassa kunnassa
  // tai samalla postinumerolla kuin talo.
  const samaSeutu = (y: YtjYhtio, e: Ehdokas) =>
    y.addresses.some((a) => a.postCode === e.pno || (a.postOffices ?? []).some((p) => !!e.kunta && pieni(p.city) === pieni(e.kunta)));

  const tulos: Taloyhtio[] = [];
  for (const y of yhtiot.values()) {
    if (todistuksesta.has(y.businessId.value)) {
      tulos.push({ ...muunna(y, "energiatodistus"), osoite: oma ? `${oma.katu} ${oma.nro}` : osoite, metrit: 0, samaTalo: true });
      continue;
    }
    let paras: { e: Ehdokas; osuma: Taloyhtio["osuma"] } | null = null;
    for (const e of ehdokkaat) {
      const osuma = y.names.some((n) => nimiOsuu(n.name, e.katu, e.nro)) && samaSeutu(y, e)
        ? "nimi"
        : y.addresses.some((a) => pieni(a.street ?? "") === pieni(e.katu) && numerot(a.buildingNumber ?? "").includes(e.nro) && !(a.co && onYritys(a.co)))
          ? "osoite"
          : null;
      if (osuma && (!paras || e.metrit < paras.e.metrit || (e.metrit === paras.e.metrit && osuma === "nimi"))) paras = { e, osuma };
    }
    if (paras) tulos.push({ ...muunna(y, paras.osuma), osoite: paras.e.teksti, metrit: paras.e.metrit, samaTalo: samaOsoite(paras.e) || paras.e.metrit <= 15 });
  }

  // Lakanneet yhtiöt vain, jos voimassa olevia ei löytynyt (vanha yhtiö on voitu sulauttaa uuteen).
  const voimassa = tulos.filter((t) => t.tila !== "Lakannut");
  return (voimassa.length ? voimassa : tulos)
    .sort(
      (a, b) =>
        Number(b.samaTalo) - Number(a.samaTalo) ||
        Number(b.osuma === "energiatodistus") - Number(a.osuma === "energiatodistus") ||
        a.metrit - b.metrit ||
        (a.osuma === "nimi" ? -1 : 1),
    )
    .slice(0, 8);
}

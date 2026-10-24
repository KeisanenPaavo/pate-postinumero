import "server-only";
import { cacheLife } from "next/cache";

// Taloyhtiön perustiedot PRH:n avoimesta YTJ-rajapinnasta (CC BY 4.0). Rakennuksen ja yhtiön välillä ei ole
// avointa linkkiä, joten yhtiö päätellään osoitteesta:
// 1. nimihaku kadunnimellä: yhtiön nimessä on katu ja talonumero ("Asunto Oy Fleminginkatu 4-6"),
// 2. postinumeron taloyhtiöt, joiden osoite on sama talo eikä c/o-osoite ole yrityksen (isännöitsijän osoitteessa
//    voi olla satoja muiden talojen yhtiöitä).
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
  /** Mihin yhtiö löytyi: nimestä (vahva) vai pelkästä osoitteesta (heikompi). */
  osuma: "nimi" | "osoite";
  /** c/o-osoitteen yritys (yleensä isännöitsijä); yksityishenkilöiden nimiä ei välitetä. */
  hoitaja: string | null;
  /** Tunnettu vuokranantaja, jos c/o tai verkkosivu viittaa siihen: yhtiö on todennäköisesti yhden omistajan. */
  vuokranantaja: string | null;
  verkkosivu: string | null;
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

function muunna(y: YtjYhtio, osuma: Taloyhtio["osuma"]): Taloyhtio {
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

/** "Hämeentie 3 A, Helsinki" → { katu: "Hämeentie", nro: 3, kunta: "Helsinki" }; null, jos talonumeroa ei ole. */
export function jasennaOsoite(teksti: string) {
  const [alku, ...loput] = teksti.split(",").map((s) => s.trim());
  const m = alku.match(/^(\D+?)\s+(\d+)/);
  if (!m) return null;
  return { katu: m[1].trim(), nro: +m[2], kunta: loput.at(-1) ?? null };
}

/**
 * Osoitteen taloyhtiöt (enintään 3). Tyhjä lista = ei löytynyt; heittää, jos PRH ei vastaa.
 * Yksi talo voi kuulua useaan yhtiöön (A- ja B-talo), ja sama nimi voi olla eri kunnissa.
 */
export async function taloyhtiot(osoite: string, pno: string | null): Promise<Taloyhtio[]> {
  const o = jasennaOsoite(osoite);
  if (!o) return [];
  const [nimiLista, pnoLista] = await Promise.all([nimella(o.katu), pno ? postinumerolla(pno).catch(() => []) : []]);

  const kaupunki = (y: YtjYhtio) => y.addresses.flatMap((a) => a.postOffices ?? []).some((p) => pieni(p.city) === pieni(o.kunta ?? ""));
  const nimesta = nimiLista.filter((y) => y.names.some((n) => nimiOsuu(n.name, o.katu, o.nro)));
  // Sama nimi voi olla monessa kunnassa ("Turun Hämeentie 3"): osoitteen kunnan yhtiöt ensin. Jos niitä ei ole
  // (postiosoite isännöitsijällä toisessa kunnassa), kelpuutetaan vain saman postinumeron yhtiöt.
  const samaKunta = nimesta.filter(kaupunki);
  const nimiOsumat = (samaKunta.length ? samaKunta : nimesta).filter((y) => !pno || samaKunta.length || y.addresses.some((a) => a.postCode === pno));

  const osoitteesta = pnoLista.filter(
    (y) =>
      !nimiOsumat.some((n) => n.businessId.value === y.businessId.value) &&
      y.addresses.some(
        (a) => pieni(a.street ?? "") === pieni(o.katu) && numerot(a.buildingNumber ?? "").includes(o.nro) && !(a.co && onYritys(a.co)),
      ),
  );

  const tulos = [...nimiOsumat.map((y) => muunna(y, "nimi")), ...osoitteesta.map((y) => muunna(y, "osoite"))];
  // Lakanneet yhtiöt vain, jos voimassa olevia ei löytynyt (vanha yhtiö on voitu sulauttaa uuteen).
  const voimassa = tulos.filter((t) => t.tila !== "Lakannut");
  return (voimassa.length ? voimassa : tulos).slice(0, 3);
}

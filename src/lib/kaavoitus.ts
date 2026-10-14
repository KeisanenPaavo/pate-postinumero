import "server-only";
import { cacheLife } from "next/cache";
import type { Piste } from "./data";

// Kaavoitus ja rakentaminen osoitteen lähellä. Avoin vektoriaineisto on saatavilla vain Helsingistä:
// vireillä olevat asemakaavat, rakennuskiellot asemakaavan laatimiseksi ja kaivuilmoitukset (katu- ja johtotyöt).
// Espoon kaava- ja rakennuslupatasot vaativat tunnistautumisen (401) – Espoosta näytetään vain WMS-karttataso.
// Lähteet ja havainnot: docs/datan-saatavuus.md

const HKI = "https://kartta.hel.fi/ws/geoserver/avoindata/wfs";
const KAAVA_SADE = 500; // m
const TYO_SADE = 200; // m

export type VireillaKaava = { tunnus: string; vaihe: string; pintaAla: number | null; metrit: number; alueella: boolean };
export type Katutyo = { kuvaus: string; osoite: string | null; alkaa: string | null; paattyy: string | null; metrit: number };
export type Kaavoitus = {
  kunta: string;
  kaavat: VireillaKaava[];
  rakennuskielto: { selite: string; paattyy: string | null } | null;
  /** null = katutöiden haku epäonnistui (ei sama kuin "ei töitä"). */
  tyot: Katutyo[] | null;
  lahde: string;
};

type Geometria = { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
type Feature<P> = { geometry: Geometria | null; properties: P };

/**
 * Yhden tason kohteet pisteen ympäriltä. Välimuistitetaan tasoittain ja vain onnistuneet haut: virhe heitetään,
 * jottei tyhjä tulos jää välimuistiin (kaivuilmoitustaso vastaa välillä vasta ~15 s:ssa).
 */
async function hkiTaso<P>(taso: string, p: Piste, sadeM: number): Promise<Feature<P>[]> {
  "use cache";
  cacheLife("hours");
  // Suorakulmiohaku (lon,lat), tarkka etäisyys lasketaan alla.
  const dLat = sadeM / 111_320;
  const dLon = sadeM / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  const url = `${HKI}?${new URLSearchParams({
    service: "WFS", version: "1.1.0", request: "GetFeature", typeName: `avoindata:${taso}`,
    outputFormat: "application/json", srsName: "EPSG:4326",
    bbox: `${p.lon - dLon},${p.lat - dLat},${p.lon + dLon},${p.lat + dLat},EPSG:4326`,
  })}`;
  const res = await fetch(url, { headers: { "User-Agent": "pate-postinumero/0.1" }, signal: AbortSignal.timeout(40_000) });
  if (!res.ok) throw new Error(`${res.status} Helsinki ${taso}`);
  return ((await res.json()) as { features: Feature<P>[] }).features;
}

/** Monikulmion renkaat (ulko- ja sisäreunat, myös moniosaiset). */
function renkaat(g: Geometria | null): number[][][] {
  if (!g) return [];
  return g.type === "Polygon" ? (g.coordinates as number[][][]) : (g.coordinates as number[][][][]).flat();
}

/** Etäisyys pisteestä alueeseen metreinä (0, jos piste on alueella). Paikallinen tasoprojektio riittää < 1 km etäisyyksille. */
function etaisyys(p: Piste, g: Geometria | null): { metrit: number; sisalla: boolean } {
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 111_320;
  let sisalla = false;
  let min = Infinity;
  for (const r of renkaat(g)) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = [(r[j][0] - p.lon) * kx, (r[j][1] - p.lat) * ky];
      const [bx, by] = [(r[i][0] - p.lon) * kx, (r[i][1] - p.lat) * ky];
      if (by > 0 !== ay > 0 && 0 < ((ax - bx) * (0 - by)) / (ay - by) + bx) sisalla = !sisalla;
      // pisteen (origo) etäisyys janaan a–b
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return { metrit: sisalla ? 0 : Math.round(min), sisalla };
}

/** Helsingin kaavahakemiston vaiheteksti selkokielelle: "kylk 5.11.2024" → "käsitelty kaupunkiympäristölautakunnassa 5.11.2024". */
function vaihe(teksti: string | null | undefined) {
  const t = (teksti ?? "").trim();
  if (!t || /^vireillä$/i.test(t)) return "vireillä";
  if (/^nähtävillä/i.test(t)) return "nähtävillä – mielipiteen tai muistutuksen voi jättää";
  const ELIMET: Record<string, string> = {
    kylk: "kaupunkiympäristölautakunnassa",
    kslk: "kaupunkisuunnittelulautakunnassa",
    kvsto: "kaupunginvaltuustossa",
    khs: "kaupunginhallituksessa",
  };
  const m = t.match(/^(kylk|kslk|kvsto|khs)\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
  // "kylk 24.03.2026" → "käsitelty kaupunkiympäristölautakunnassa 24.3.2026"
  if (m) return `käsitelty ${ELIMET[m[1].toLowerCase()]} ${+m[2]}.${+m[3]}.${m[4]}`;
  return t;
}

type KaavaOm = { kaavatunnus: string; hyvaksymispvm: string | null; pintaala: number | null };
type KieltoOm = { laatu_selite: string | null; paattymispvm: string | null };
type KaivuOm = { tyon_tarkoitus: string | null; osoite: string | null; tyo_alkaa: string | null; tyo_paattyy: string | null };

function lyhennaOsoite(s: string | null | undefined) {
  const osat = (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!osat.length) return null;
  return osat.length > 3 ? `${osat.slice(0, 3).join(", ")} …` : osat.join(", ");
}

async function helsinki(p: Piste): Promise<Kaavoitus> {
  const [kaavat, kiellot, kaivut] = await Promise.all([
    hkiTaso<KaavaOm>("Kaavahakemisto_alue_kaava_vireilla", p, KAAVA_SADE),
    hkiTaso<KieltoOm>("Rakennuskieltoalue_asemakaavan_laatimiseksi", p, 50).catch(() => []),
    hkiTaso<KaivuOm>("Kaivuilmoitus_alue", p, TYO_SADE).catch(() => null),
  ]);

  const kaavaLista = kaavat
    .map((f) => ({ f, e: etaisyys(p, f.geometry) }))
    .filter(({ e }) => e.metrit <= KAAVA_SADE)
    .map(({ f, e }) => ({
      tunnus: f.properties.kaavatunnus,
      vaihe: vaihe(f.properties.hyvaksymispvm),
      pintaAla: f.properties.pintaala ?? null,
      metrit: e.metrit,
      alueella: e.sisalla,
    }))
    .filter((k, i, kaikki) => kaikki.findIndex((x) => x.tunnus === k.tunnus) === i)
    .sort((a, b) => a.metrit - b.metrit);

  const kielto = kiellot.find((f) => etaisyys(p, f.geometry).sisalla);

  // Käynnissä olevat tai seuraavan 3 kk aikana alkavat työt; samat (osoite + tarkoitus) yhdistetään.
  const tanaan = new Date().toISOString().slice(0, 10);
  const raja = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const tyot = kaivut
    ?.filter((f) => (f.properties.tyo_paattyy ?? "") >= tanaan && (f.properties.tyo_alkaa ?? "") <= raja)
    .map((f) => ({
      kuvaus: (f.properties.tyon_tarkoitus ?? "")
        .split("\n")[0]
        .replace(/^(Päätöksen saaja|Työstä vastaava) varaa tilaa (kaivutyölle[;.:]?\s*)?/i, "")
        .trim(),
      // Osoitekenttä voi olla pitkä luettelo kaduista – näytetään kolme ensimmäistä.
      osoite: lyhennaOsoite(f.properties.osoite),
      alkaa: f.properties.tyo_alkaa,
      paattyy: f.properties.tyo_paattyy,
      metrit: etaisyys(p, f.geometry).metrit,
    }))
    .filter((t) => t.metrit <= TYO_SADE)
    .map((t) => ({ ...t, kuvaus: t.kuvaus ? t.kuvaus.charAt(0).toUpperCase() + t.kuvaus.slice(1).replace(/\.$/, "") : "Kaivutyö" }))
    .sort((a, b) => a.metrit - b.metrit)
    .filter((t, i, kaikki) => kaikki.findIndex((x) => x.kuvaus === t.kuvaus && x.osoite === t.osoite) === i);

  return {
    kunta: "091",
    kaavat: kaavaLista,
    rakennuskielto: kielto ? { selite: kielto.properties.laatu_selite ?? "Rakennuskielto asemakaavan laatimiseksi", paattyy: kielto.properties.paattymispvm } : null,
    tyot: tyot ?? null,
    lahde: "Helsingin kaupunki: kaavahakemisto, rakennuskiellot ja kaivuilmoitukset (CC BY 4.0)",
  };
}

/** Kaavoitus ja rakentaminen osoitteen lähellä; null, jos kunnalta ei ole avointa vektoriaineistoa. */
export async function kaavoitus(p: Piste, kunta: string): Promise<Kaavoitus | null> {
  if (kunta === "091") return helsinki(p);
  return null;
}

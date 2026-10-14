import "server-only";
import { cacheLife } from "next/cache";
import raakaEspoo from "../../data/generated/oppilasalueet-espoo.json";
import type { Piste } from "./data";
import { etaisyysKm, oppilaitokset } from "./palvelut";

// Oppilaaksiottoalueet: mihin kouluun osoitteesta ensisijaisesti pääsee (lähikoulu).
// Avoin data on saatavilla vain Helsingistä (koulukohtaiset alueet) ja Espoosta (suomenkieliset oppilasalueet,
// ruotsinkieliset alakoulut). Muissa kunnissa palautetaan null ja käyttöliittymä näyttää lähimmät koulut.
// Lähteet ja havainnot: docs/datan-saatavuus.md

export type Lahikoulu = {
  nimi: string;
  luokat: "1–6" | "7–9";
  kieli: "suomi" | "ruotsi";
  lat: number | null;
  lon: number | null;
  km: number | null;
};

export type Oppilaaksiotto = {
  kunta: string;
  lahde: string;
  /** Helsinki: lukuvuosi, jota alueet koskevat. */
  lukuvuosi: string | null;
  /** Koulukohtaiset lähikoulut (Helsinki; Espoossa ruotsinkielinen alakoulu). */
  koulut: Lahikoulu[];
  /** Espoon suomenkielinen oppilasalue: lähikoulu osoitetaan alueen kouluista. */
  oppilasalue: { nimi: string; koulut: { nimi: string; lat: number; lon: number; km: number }[] } | null;
};

type Alue = { nimi: string; renkaat: [number, number][][] };
const espoo = raakaEspoo as unknown as { suomi: Alue[]; ruotsi: Alue[] };

/** Pistetesti parillisuussäännöllä kaikkien renkaiden yli (reiät ja moniosaiset alueet toimivat). */
function sisalla(p: Piste, alue: Alue) {
  let sisa = false;
  for (const rengas of alue.renkaat)
    for (let i = 0, j = rengas.length - 1; i < rengas.length; j = i++) {
      const [xi, yi] = rengas[i];
      const [xj, yj] = rengas[j];
      if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) sisa = !sisa;
    }
  return sisa;
}

const normalisoi = (s: string) => s.toLowerCase().normalize("NFC").trim();

/** Koulun sijainti koulurekisteristä nimellä (rekisterin sijainnit on korjattu ETL:ssä). */
function sijainti(nimi: string, p: Piste) {
  const o = oppilaitokset.find((k) => normalisoi(k.nimi) === normalisoi(nimi));
  return o ? { lat: o.lat, lon: o.lon, km: etaisyysKm(p, o) } : null;
}

/** Käynnissä oleva lukuvuosi: elokuusta alkaen "2026-2027", sitä ennen "2025-2026". */
function lukuvuosi(d = new Date()) {
  const v = d.getFullYear();
  return d.getMonth() >= 7 ? `${v}-${v + 1}` : `${v - 1}-${v}`;
}

// --- Helsinki ------------------------------------------------------------------------------

const HKI = "https://kartta.hel.fi/ws/geoserver/avoindata/wfs";
const HKI_TASOT = [
  ["alaaste_suomi", "1–6", "suomi"],
  ["ylaaste_suomi", "7–9", "suomi"],
  ["alaaste_ruotsi", "1–6", "ruotsi"],
  ["ylaaste_ruotsi", "7–9", "ruotsi"],
] as const;

type HkiOminaisuudet = { nimi_fi: string | null; nimi_se: string | null; toimipiste_id: number | null };

async function hkiTaso(taso: string, p: Piste): Promise<HkiOminaisuudet[]> {
  const url = `${HKI}?${new URLSearchParams({
    service: "WFS", version: "1.1.0", request: "GetFeature", typeName: `avoindata:Opev_ooa_${taso}`,
    outputFormat: "application/json", propertyName: "nimi_fi,nimi_se,toimipiste_id",
    cql_filter: `INTERSECTS(geom,SRID=4326;POINT(${p.lon} ${p.lat}))`,
  })}`;
  const res = await fetch(url, { headers: { "User-Agent": "pate-postinumero/0.1" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} Helsinki ${taso}`);
  return ((await res.json()) as { features: { properties: HkiOminaisuudet }[] }).features.map((f) => f.properties);
}

/** Palvelukartan toimipisteen sijainti, jos koulua ei löydy koulurekisteristä nimellä. */
async function toimipiste(id: number): Promise<Piste | null> {
  const res = await fetch(`https://api.hel.fi/servicemap/v2/unit/${id}/?only=location`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const c = ((await res.json()) as { location?: { coordinates: [number, number] } }).location?.coordinates;
  return c ? { lon: c[0], lat: c[1] } : null;
}

async function helsinki(p: Piste): Promise<Oppilaaksiotto> {
  const lv = lukuvuosi();
  // Kaupunki julkaisee nykyisen ja tulevan lukuvuoden alueet eri tasoina; valitaan käynnissä olevan lukuvuoden taso.
  // Syksyllä "tuleva"-taso voi olla jo käynnissä oleva lukuvuosi, jos nykyistä tasoa ei ole vielä päivitetty.
  const koulut = await Promise.all(
    HKI_TASOT.map(async ([taso, luokat, kieli]) => {
      // Ei .catch: jos jompikumpi haku epäonnistuu, koko tulos jätetään välimuistittamatta (muuten väärän
      // lukuvuoden alue voisi jäädä välimuistiin päiviksi). /api/piste palauttaa silloin oppilaaksiotto = null.
      const [nyt, tuleva] = await Promise.all([hkiTaso(taso, p), hkiTaso(`${taso}_tuleva`, p)]);
      const nimi = (o: HkiOminaisuudet) => o.nimi_fi ?? o.nimi_se ?? "";
      const valittu = [...nyt, ...tuleva].find((o) => nimi(o).includes(lv)) ?? nyt[0];
      if (!valittu) return null;
      const puhdas = nimi(valittu).replace(/\s*\d{4}\s*-\s*\d{4}\s*$/, "").trim();
      let paikka = sijainti(puhdas, p);
      if (!paikka && valittu.toimipiste_id) {
        const t = await toimipiste(valittu.toimipiste_id).catch(() => null);
        if (t) paikka = { ...t, km: etaisyysKm(p, t) };
      }
      return { nimi: puhdas, luokat, kieli, lat: paikka?.lat ?? null, lon: paikka?.lon ?? null, km: paikka?.km ?? null } satisfies Lahikoulu;
    }),
  );
  return {
    kunta: "091",
    lahde: "Helsingin kaupunki, oppilaaksiottoalueet (CC BY 4.0)",
    lukuvuosi: lv.replace("-", "–"),
    koulut: koulut.filter((k): k is Lahikoulu => !!k),
    oppilasalue: null,
  };
}

// --- Espoo ----------------------------------------------------------------------------------

// Suomenkielisen oppilasalueen koulut: kaupungin peruskoulut alueen sisällä (ei yksityisiä eikä ruotsinkielisiä).
const EI_LAHIKOULU = /skola|skolan|gymnasium|kristillinen|international|steiner|english|yksityinen|sjukhus|sairaala/i;

function espooHaku(p: Piste): Oppilaaksiotto | null {
  const alue = espoo.suomi.find((a) => sisalla(p, a));
  const ruotsi = espoo.ruotsi.find((a) => sisalla(p, a));
  if (!alue && !ruotsi) return null;
  const alueenKoulut = alue
    ? oppilaitokset
        .filter((o) => (o.tyyppi === "Peruskoulut" || o.tyyppi === "Perus- ja lukioasteen koulut") && !EI_LAHIKOULU.test(o.nimi) && sisalla(o, alue))
        .map((o) => ({ nimi: o.nimi, lat: o.lat, lon: o.lon, km: etaisyysKm(p, o) }))
        .sort((a, b) => a.km - b.km)
    : [];
  const ruotsiPaikka = ruotsi ? sijainti(ruotsi.nimi, p) : null;
  return {
    kunta: "049",
    lahde: "Espoon kaupunki, oppilaaksiottoalueet",
    lukuvuosi: null,
    koulut: ruotsi
      ? [{ nimi: ruotsi.nimi, luokat: "1–6", kieli: "ruotsi", lat: ruotsiPaikka?.lat ?? null, lon: ruotsiPaikka?.lon ?? null, km: ruotsiPaikka?.km ?? null }]
      : [],
    oppilasalue: alue ? { nimi: alue.nimi, koulut: alueenKoulut } : null,
  };
}

// --- Julkinen ---------------------------------------------------------------------------------

/** Osoitteen lähikoulut kunnan oppilaaksiottoalueista; null, jos kunnalta ei ole avointa dataa. */
export async function oppilaaksiotto(p: Piste, kunta: string): Promise<Oppilaaksiotto | null> {
  "use cache";
  cacheLife("days");
  if (kunta === "091") return helsinki(p);
  if (kunta === "049") return espooHaku(p);
  return null;
}

// Hakee Espoon oppilaaksiottoalueet tiedostoon, jota sivusto lukee buildissa (pistekysely tehdään palvelimella).
// Espoon WFS (Tekla) palauttaa vain GML:ää eikä tue pistesuodatusta, joten alueet ladataan kerralla.
//  - Suomenkieliset: 6 oppilasaluetta (lähikoulu osoitetaan alueen kouluista, ei koulukohtaisia alueita)
//  - Ruotsinkieliset alakoulut: koulukohtaiset alueet
// Helsingin alueet kysytään ajonaikaisesti suoraan kaupungin WFS:stä (tukee pistesuodatusta, päivittyy lukuvuosittain).
// Käyttö: node scripts/etl/oppilasalueet.mjs  →  data/generated/oppilasalueet-espoo.json
import { writeFile, mkdir } from "node:fs/promises";

const ESPOO = "https://kartat.espoo.fi/teklaogcweb/wfs.ashx";

async function gml(typeName) {
  const url = `${ESPOO}?${new URLSearchParams({ service: "WFS", version: "1.1.0", request: "GetFeature", typeName, srsName: "EPSG:4326" })}`;
  const res = await fetch(url, { headers: { "User-Agent": "pate-postinumero/0.1 (ETL)" }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${res.status} ${typeName}`);
  return res.text();
}

/** GML-featuret → [{ nimi, renkaat: [[[lon, lat], …], …] }]. Kaikki renkaat (ulko- ja sisäreunat) talteen; pistetesti parillisuussäännöllä. */
function jasenna(teksti) {
  const alueet = [];
  for (const [, f] of teksti.matchAll(/<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g)) {
    const nimi = f.match(/<GIS:Nimi>([^<]*)<\/GIS:Nimi>/)?.[1]?.trim();
    if (!nimi) continue;
    const renkaat = [];
    for (const [, rengas] of f.matchAll(/<gml:(?:LinearRing|Ring)>([\s\S]*?)<\/gml:(?:LinearRing|Ring)>/g)) {
      const pisteet = [...rengas.matchAll(/<gml:pos>([^<]+)<\/gml:pos>/g)].map(([, p]) => p.trim().split(/\s+/).map((n) => +(+n).toFixed(5)));
      if (pisteet.length >= 4) renkaat.push(pisteet);
    }
    if (renkaat.length) alueet.push({ nimi, renkaat });
  }
  return alueet;
}

const suomi = jasenna(await gml("GIS:Oppilaaksiottoalueet_suomenkielinen"));
const ruotsi = jasenna(await gml("GIS:Oppilaaksiottoalueet_ruotsinkielinen_ala_aste"));
// Järkevyystarkistus: koordinaatit Espoon alueella (lon ~24.5–24.95, lat ~59.9–60.4, merialue mukana).
const kaikki = [...suomi, ...ruotsi].flatMap((a) => a.renkaat.flat());
if (suomi.length < 5 || ruotsi.length < 5 || kaikki.some(([lon, lat]) => lon < 24.3 || lon > 25.1 || lat < 59.8 || lat > 60.5))
  throw new Error(`Epäilyttävä vastaus: ${suomi.length} suomenkielistä, ${ruotsi.length} ruotsinkielistä aluetta`);

await mkdir("data/generated", { recursive: true });
await writeFile(
  "data/generated/oppilasalueet-espoo.json",
  JSON.stringify({ luotu: new Date().toISOString().slice(0, 10), lahde: "Espoon kaupunki, oppilaaksiottoalueet (kartat.espoo.fi)", suomi, ruotsi }),
);
console.log(`Espoo: ${suomi.length} suomenkielistä oppilasaluetta, ${ruotsi.length} ruotsinkielisen alakoulun aluetta → data/generated/oppilasalueet-espoo.json`);

// Hakee Uudenmaan ruokakaupat ja päiväkodit OpenStreetMapista (Overpass) tiedostoon, jota sivusto
// lukee buildissa. Overpass on ajoittain ruuhkainen, joten haetaan kerran ETL:ssä eikä sivua katsottaessa.
// Käyttö: node scripts/etl/palvelupisteet.mjs [valmis-overpass-vastaus.json]  →  data/generated/palvelupisteet.json
import { readFile, writeFile, mkdir } from "node:fs/promises";

const KYSELY = `[out:json][timeout:180];
area["ISO3166-2"="FI-18"]->.u;
(nwr(area.u)[shop~"^(supermarket|convenience)$"];nwr(area.u)[amenity=kindergarten];);
out center tags;`;

const PALVELIMET = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Huoltoasemien myymälät ja kioskit eivät ole ruokakauppoja.
const EI_KAUPPA_BRAND = /^(neste|shell|teboil|st1|abc|r-kioski)\b/i;
const EI_KAUPPA_NIMI = /kiosk|kioski|tupakka/i;

async function haeOverpass() {
  for (let kierros = 0; kierros < 3; kierros++) {
    for (const url of PALVELIMET) {
      try {
        const res = await fetch(url, {
          method: "POST",
          body: new URLSearchParams({ data: KYSELY }),
          headers: { "User-Agent": "pate-postinumero/0.1 (ETL)" },
          signal: AbortSignal.timeout(200_000),
        });
        if (res.ok) return await res.json();
        console.warn(`${url}: ${res.status}`);
      } catch (e) {
        console.warn(`${url}: ${e.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 20_000));
  }
  throw new Error("Overpass ei vastannut");
}

const js = process.argv[2] ? JSON.parse(await readFile(process.argv[2], "utf8")) : await haeOverpass();

const kaupat = [];
const paivakodit = [];
for (const e of js.elements) {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  const nimi = t.name ?? t.brand;
  if (lat == null || lon == null || !nimi) continue;
  const piste = [+lat.toFixed(5), +lon.toFixed(5), nimi];
  if (t.amenity === "kindergarten") paivakodit.push(piste);
  else if (!EI_KAUPPA_BRAND.test(t.brand ?? "") && !EI_KAUPPA_NIMI.test(nimi)) kaupat.push([...piste, t.shop === "supermarket" ? "s" : "l"]);
}

if (kaupat.length < 300 || paivakodit.length < 300) throw new Error(`Epäilyttävän vähän pisteitä: ${kaupat.length} kauppaa, ${paivakodit.length} päiväkotia`);

await mkdir("data/generated", { recursive: true });
await writeFile(
  "data/generated/palvelupisteet.json",
  JSON.stringify({ luotu: new Date().toISOString().slice(0, 10), lahde: "© OpenStreetMap contributors, ODbL", kaupat, paivakodit }),
);
console.log(`${kaupat.length} kauppaa, ${paivakodit.length} päiväkotia → data/generated/palvelupisteet.json`);

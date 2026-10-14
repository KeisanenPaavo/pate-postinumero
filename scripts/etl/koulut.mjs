// Muodostaa Uudenmaan peruskoulut ja lukiot tiedostoon, jota sivusto lukee buildissa.
//
// Pohja: Tilastokeskuksen oppilaitosrekisteri (nimi ja koulutyyppi, myös yksityiset koulut).
// Korjaus: rekisterin koordinaatit ovat osin pielessä – erityisesti Espoossa ja Vantaalla kouluja on
// kilometrejä, jopa Turun seudulla väärässä paikassa (tarkistettu 14.10.2026, ks. docs/datan-saatavuus.md).
// Pääkaupunkiseudulla (Helsinki, Espoo, Vantaa, Kauniainen) sijainti otetaan kaupunkien omasta
// palvelukartasta (api.hel.fi/servicemap), kun koulu löytyy sieltä samalla nimellä. Palvelukartan koulut,
// joita rekisterissä ei ole lainkaan (esim. uudet koulut), lisätään.
//
// Käyttö: node scripts/etl/koulut.mjs  →  data/generated/koulut.json
import { writeFile, mkdir } from "node:fs/promises";

const UA = { "User-Agent": "pate-postinumero/0.1 (ETL)" };
// Uusimaa + marginaali (lon, lat)
const BBOX = [22.4, 59.5, 27.1, 61.2];

async function json(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const norm = (s) => s.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
// "Konepajan lukio, Töysänkadun toimipaikka" → "konepajan lukio"
const perusnimi = (s) => norm(s.split(/[,:(]/)[0]);

// --- Oppilaitosrekisteri -------------------------------------------------------------
const rekisteri = await json(
  "https://geo.stat.fi/geoserver/wfs?" +
    new URLSearchParams({
      service: "WFS", version: "1.1.0", request: "GetFeature", typeName: "oppilaitokset:oppilaitokset",
      outputFormat: "application/json", srsName: "EPSG:4326", propertyName: "onimi,oltyp_nimi,geom",
      bbox: `${BBOX.join(",")},EPSG:4326`,
    }),
);
if (rekisteri.features.length < 500) throw new Error(`Rekisteri palautti vain ${rekisteri.features.length} koulua`);

// --- Palvelukartta (pääkaupunkiseutu) --------------------------------------------------
const palvelut = await json("https://api.hel.fi/servicemap/v2/service/?page_size=1500");
const ryhma = (re) =>
  palvelut.results.filter((s) => re.test(s.name?.fi ?? "") && !/aikuisten/.test(s.name.fi)).map((s) => s.id);
const RYHMAT = [
  ["Peruskoulut", ryhma(/perusopetus luokille/)],
  ["Lukiot", ryhma(/lukiokoulutus/)],
];

const yksikot = new Map(); // id → { nimet, lat, lon, tyypit }
for (const [tyyppi, ids] of RYHMAT) {
  let url = `https://api.hel.fi/servicemap/v2/unit/?service=${ids.join(",")}&municipality=helsinki,espoo,vantaa,kauniainen&page_size=500&only=name,location,municipality`;
  while (url) {
    const js = await json(url);
    for (const u of js.results) {
      if (!u.location) continue;
      const vanha = yksikot.get(u.id);
      if (vanha) vanha.tyypit.add(tyyppi);
      else
        yksikot.set(u.id, {
          nimi: u.name.fi ?? u.name.sv,
          nimet: new Set([u.name.fi, u.name.sv].filter(Boolean).map(norm)),
          lon: u.location.coordinates[0],
          lat: u.location.coordinates[1],
          tyypit: new Set([tyyppi]),
        });
    }
    url = js.next;
  }
}
if (yksikot.size < 200) throw new Error(`Palvelukartta palautti vain ${yksikot.size} koulua`);

const nimella = new Map();
for (const u of yksikot.values()) for (const n of u.nimet) nimella.set(n, [...(nimella.get(n) ?? []), u]);

// --- Yhdistäminen ------------------------------------------------------------------------
const koulut = [];
const kaytetyt = new Set();
let korjattu = 0;
for (const f of rekisteri.features) {
  const { onimi, oltyp_nimi } = f.properties;
  let [lon, lat] = f.geometry.coordinates;
  const ehdokkaat = nimella.get(norm(onimi));
  // Vain yksiselitteinen nimiosuma: sama nimi voi esiintyä eri kunnissa.
  if (ehdokkaat?.length === 1) {
    const u = ehdokkaat[0];
    kaytetyt.add(u);
    if (Math.abs(u.lat - lat) > 0.002 || Math.abs(u.lon - lon) > 0.004) korjattu++;
    [lon, lat] = [u.lon, u.lat];
  }
  koulut.push([+lat.toFixed(5), +lon.toFixed(5), onimi, oltyp_nimi]);
}

// Palvelukartan koulut, joita rekisterissä ei ole. Toimipisteet ("X, Y:n toimipaikka") ohitetaan, jos
// pääkoulu on jo listalla, jottei sama koulu näy kahdesti.
const rekisterinNimet = new Set(rekisteri.features.map((f) => norm(f.properties.onimi)));
let lisatty = 0;
for (const u of yksikot.values()) {
  if (kaytetyt.has(u)) continue;
  if ([...u.nimet].some((n) => rekisterinNimet.has(n) || rekisterinNimet.has(perusnimi(n)))) continue;
  if (/paviljonki|sairaalaopetus|sjukhusskola|aikuislukio|etälukio/i.test(u.nimi)) continue;
  const tyyppi = u.tyypit.size > 1 ? "Perus- ja lukioasteen koulut" : [...u.tyypit][0];
  koulut.push([+u.lat.toFixed(5), +u.lon.toFixed(5), u.nimi, tyyppi]);
  lisatty++;
}

await mkdir("data/generated", { recursive: true });
await writeFile(
  "data/generated/koulut.json",
  JSON.stringify({
    luotu: new Date().toISOString().slice(0, 10),
    lahteet: ["Tilastokeskus: oppilaitosrekisteri", "Helsingin, Espoon, Vantaan ja Kauniaisen palvelukartta"],
    koulut,
  }),
);
console.log(`${koulut.length} koulua (rekisteri ${rekisteri.features.length}, sijainti korjattu ${korjattu}, palvelukartasta lisätty ${lisatty}) → data/generated/koulut.json`);

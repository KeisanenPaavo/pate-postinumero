// Muodostaa Uudenmaan kuntakeskusten koordinaatit: geokoodaa maamerkin Digitransitilla ja
// tarkistaa postinumeroalueesta, että piste osuu oikeaan kuntaan.
// Käyttö: node --env-file=.env scripts/etl/keskustat.mjs  →  data/config/keskustat.json
import { writeFile, mkdir } from "node:fs/promises";

// kuntanro: [kunta, maamerkki jonka mukaan keskusta paikannetaan]
const KUNNAT = {
  "091": ["Helsinki", "Rautatientori, Helsinki"],
  "049": ["Espoo", "Tapiola, Espoo"],
  "092": ["Vantaa", "Tikkurilan asema, Vantaa"],
  "235": ["Kauniainen", "Kauniaisten asema"],
  "245": ["Kerava", "Keravan asema"],
  "186": ["Järvenpää", "Järvenpään asema"],
  "858": ["Tuusula", "Hyrylä, Tuusula"],
  "543": ["Nurmijärvi", "Nurmijärven kirkonkylä"],
  "106": ["Hyvinkää", "Hyvinkään asema"],
  "505": ["Mäntsälä", "Mäntsälän asema"],
  "611": ["Pornainen", "Pornaisten kunnantalo"],
  "753": ["Sipoo", "Nikkilä, Sipoo"],
  "638": ["Porvoo", "Porvoon tori"],
  "018": ["Askola", "Monninkylä, Askola"],
  "616": ["Pukkila", "Pukkilan kirkonkylä"],
  "504": ["Myrskylä", "Myrskylän kunnantalo"],
  "407": ["Lapinjärvi", "Lapinjärven kirkonkylä"],
  "434": ["Loviisa", "Loviisan tori"],
  "257": ["Kirkkonummi", "Kirkkonummen asema"],
  "755": ["Siuntio", "Siuntion asema"],
  "149": ["Inkoo", "Inkoon kirkonkylä"],
  "710": ["Raasepori", "Tammisaari, Raasepori"],
  "078": ["Hanko", "Hangon asema"],
  "444": ["Lohja", "Lohjan tori"],
  "927": ["Vihti", "Nummela, Vihti"],
  "224": ["Karkkila", "Karkkilan linja-autoasema"],
};

const KEY = process.env.DIGITRANSIT_KEY;
if (!KEY) throw new Error("DIGITRANSIT_KEY puuttuu (aja --env-file=.env)");

async function geocode(text) {
  const u = new URL("https://api.digitransit.fi/geocoding/v1/search");
  u.search = new URLSearchParams({ text, size: "1", lang: "fi" });
  const res = await fetch(u, { headers: { "digitransit-subscription-key": KEY } });
  if (!res.ok) throw new Error(`geokoodaus ${res.status}`);
  const f = (await res.json()).features[0];
  return f && { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: f.properties.label };
}

async function kuntaAt({ lat, lon }) {
  const u = new URL("https://geo.stat.fi/geoserver/postialue/wfs");
  u.search = new URLSearchParams({
    service: "WFS", version: "1.1.0", request: "GetFeature", typeName: "postialue:pno_2026",
    outputFormat: "application/json", propertyName: "posti_alue,kunta",
    cql_filter: `INTERSECTS(geom,SRID=4326;POINT(${lon} ${lat}))`,
  });
  const p = (await (await fetch(u)).json()).features[0]?.properties;
  return p && { kunta: p.kunta, pno: p.posti_alue };
}

const out = {};
let failed = 0;
for (const [nro, [nimi, maamerkki]] of Object.entries(KUNNAT)) {
  const g = await geocode(maamerkki);
  const k = g && (await kuntaAt(g));
  const ok = k?.kunta === nro;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${nimi.padEnd(12)} ${maamerkki.padEnd(28)} → ${g?.label ?? "ei osumaa"} [${k?.pno ?? "-"}, kunta ${k?.kunta ?? "-"}]`);
  if (g) out[nro] = { nimi, kohde: maamerkki, lat: +g.lat.toFixed(5), lon: +g.lon.toFixed(5), tarkistettu: ok };
}

await mkdir("data/config", { recursive: true });
await writeFile("data/config/keskustat.json", JSON.stringify(out, null, 2) + "\n");
console.log(`\n${Object.keys(out).length} kuntaa kirjoitettu, ${failed} vaatii tarkistuksen → data/config/keskustat.json`);

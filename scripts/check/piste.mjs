// Hakee yhdelle koordinaatille kaikki pistekohtaiset tiedot: postinumero, melu, lähimmät koulut.
// Käyttö: node scripts/check/piste.mjs <lat> <lon>
//   esim. node scripts/check/piste.mjs 60.1841 24.9500
const [lat, lon] = process.argv.slice(2).map(Number);
if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
  console.error("Käyttö: node scripts/check/piste.mjs <lat> <lon>");
  process.exit(1);
}

const UA = { "User-Agent": "pate-postinumero-datacheck/0.1" };
const getJson = async (url, params) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: UA, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} ${u.host}`);
  return res.json();
};
const wfsPoint = (base, typeName, propertyName) =>
  getJson(base, {
    service: "WFS", version: "1.1.0", request: "GetFeature", typeName, propertyName,
    outputFormat: "application/json",
    cql_filter: `INTERSECTS(geom,SRID=4326;POINT(${lon} ${lat}))`,
  });

async function postinumero() {
  const js = await wfsPoint("https://geo.stat.fi/geoserver/postialue/wfs", "postialue:pno_2026", "posti_alue,nimi,kunta");
  const p = js.features[0]?.properties;
  return p ? `${p.posti_alue} ${p.nimi} (kuntanro ${p.kunta})` : "ei postinumeroaluetta";
}

const VAYLA = "https://avoinapi.vaylapilvi.fi/vaylatiedot/ows";
const NOISE_LAYERS = {
  "tiestotiedot:melu_paiva_maankad_22": "maantiet päivä",
  "tiestotiedot:melu_yo_maankad_22": "maantiet yö",
  "ratatiedot:melu_paiva_rautatiet_22": "radat päivä",
  "ratatiedot:melu_yo_rautatiet_22": "radat yö",
};
async function melu() {
  const parts = await Promise.all(
    Object.entries(NOISE_LAYERS).map(async ([layer, name]) => {
      const js = await wfsPoint(VAYLA, layer, "melu_db");
      return `${name}: ${js.features[0]?.properties.melu_db ?? "< alin vyöhyke"}`;
    }),
  );
  return parts.join(" | ");
}

async function koulut() {
  // Tilastokeskuksen oppilaitosrekisteri, ~2500 koulua – haetaan kaikki ja lasketaan etäisyys.
  const js = await getJson("https://geo.stat.fi/geoserver/wfs", {
    service: "WFS", version: "1.1.0", request: "GetFeature", typeName: "oppilaitokset:oppilaitokset",
    outputFormat: "application/json", srsName: "EPSG:4326", propertyName: "onimi,oltyp_nimi,geom",
  });
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dist = ([lo, la]) =>
    2 * R * Math.asin(Math.sqrt(Math.sin(rad(la - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(la)) * Math.sin(rad(lo - lon) / 2) ** 2));
  return js.features
    .map((f) => ({ ...f.properties, km: dist(f.geometry.coordinates) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 5)
    .map((k) => `${k.km.toFixed(1)} km  ${k.onimi} (${k.oltyp_nimi})`);
}

const checks = { Postinumero: postinumero, Melu: melu, Koulut: koulut };
const results = await Promise.allSettled(Object.values(checks).map((fn) => fn()));
console.log(`Piste ${lat}, ${lon}\n`);
for (const [i, name] of Object.keys(checks).entries()) {
  const r = results[i];
  const out = r.status === "fulfilled" ? r.value : `VIRHE: ${r.reason.message}`;
  console.log(`${name}:`);
  console.log([out].flat().map((l) => `  ${l}`).join("\n"));
}

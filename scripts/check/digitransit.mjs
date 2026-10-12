// Testaa Digitransit-geokoodauksen ja matka-ajat: lähtöosoite → lähin keskusta tai oma kohde.
// Käyttö: node --env-file=.env scripts/check/digitransit.mjs "<lähtöosoite>" ["<kohdeosoite>"]
//   esim. node --env-file=.env scripts/check/digitransit.mjs "Fleminginkatu 1, Helsinki"
//         node --env-file=.env scripts/check/digitransit.mjs "Fleminginkatu 1, Helsinki" "Keilaranta 1, Espoo"
const KEY = process.env.DIGITRANSIT_KEY;
if (!KEY) {
  console.error("DIGITRANSIT_KEY puuttuu. Aja: node --env-file=.env scripts/check/digitransit.mjs ...");
  process.exit(1);
}
const [fromText, toText] = process.argv.slice(2);
if (!fromText) {
  console.error('Käyttö: node --env-file=.env scripts/check/digitransit.mjs "<lähtöosoite>" ["<kohdeosoite>"]');
  process.exit(1);
}

const API = "https://api.digitransit.fi";
const headers = { "digitransit-subscription-key": KEY };

// Oletuskohteet: lähin kaupunkikeskus (laajennetaan myöhemmin ~50 kuntaan).
const CENTERS = [
  { name: "Helsinki, Rautatientori", lat: 60.1710, lon: 24.9414 },
  { name: "Espoo, Tapiola", lat: 60.1756, lon: 24.8050 },
  { name: "Vantaa, Tikkurila", lat: 60.2925, lon: 25.0440 },
  { name: "Tampere, Keskustori", lat: 61.4980, lon: 23.7610 },
  { name: "Turku, Kauppatori", lat: 60.4513, lon: 22.2672 },
  { name: "Oulu, Rotuaari", lat: 65.0124, lon: 25.4720 },
  { name: "Jyväskylä, Kauppakatu", lat: 62.2415, lon: 25.7470 },
  { name: "Kuopio, Tori", lat: 62.8925, lon: 27.6780 },
  { name: "Lahti, Kauppatori", lat: 60.9830, lon: 25.6560 },
  { name: "Pori, Kauppatori", lat: 61.4840, lon: 21.7970 },
];

async function geocode(text) {
  const u = new URL(`${API}/geocoding/v1/search`);
  u.search = new URLSearchParams({ text, size: "1", lang: "fi" });
  const res = await fetch(u, { headers });
  if (!res.ok) throw new Error(`Geokoodaus ${res.status}: ${await res.text()}`);
  const f = (await res.json()).features[0];
  if (!f) throw new Error(`Osoitetta ei löytynyt: ${text}`);
  const [lon, lat] = f.geometry.coordinates;
  return { name: f.properties.label, lat, lon, postalcode: f.properties.postalcode };
}

const km = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

// Seuraava arkipäivä klo 8.00 Suomen aikaa ISO-muodossa aikavyöhykkeineen.
function nextWeekdayMorning() {
  const d = new Date();
  do d.setDate(d.getDate() + 1); while ([0, 6].includes(d.getDay()));
  const date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });
  const offset = new Intl.DateTimeFormat("en", { timeZone: "Europe/Helsinki", timeZoneName: "longOffset" })
    .formatToParts(d).find((p) => p.type === "timeZoneName").value.replace("GMT", "");
  return `${date}T08:00:00${offset}`;
}

async function plan(from, to, dateTime, modes) {
  const query = `query ($from: PlanLabeledLocationInput!, $to: PlanLabeledLocationInput!, $dt: PlanDateTimeInput, $modes: PlanModesInput) {
    planConnection(origin: $from, destination: $to, dateTime: $dt, modes: $modes, first: 3) {
      edges { node { duration start end legs { mode duration route { shortName } } } }
    }
  }`;
  const loc = (p) => ({ location: { coordinate: { latitude: p.lat, longitude: p.lon } } });
  const res = await fetch(`${API}/routing/v2/finland/gtfs/v1`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { from: loc(from), to: loc(to), dt: { earliestDeparture: dateTime }, modes } }),
  });
  const js = await res.json();
  if (!res.ok || js.errors) throw new Error(`Reititys ${res.status}: ${JSON.stringify(js.errors ?? js).slice(0, 400)}`);
  return js.data.planConnection.edges.map((e) => e.node).sort((a, b) => a.duration - b.duration);
}

const fmtMin = (s) => `${Math.round(s / 60)} min`;
const describe = (it) => {
  const legs = it.legs.filter((l) => l.mode !== "WALK");
  const route = legs.map((l) => `${l.mode.toLowerCase()} ${l.route?.shortName ?? ""}`.trim()).join(" → ") || "kävely";
  return `${fmtMin(it.duration)} (${Math.max(legs.length - 1, 0)} vaihtoa): ${route}`;
};

const from = await geocode(fromText);
const to = toText ? await geocode(toText) : CENTERS.reduce((best, c) => (km(from, c) < km(from, best) ? c : best));
const dt = nextWeekdayMorning();

console.log(`Lähtö:  ${from.name} (${from.lat.toFixed(5)}, ${from.lon.toFixed(5)}) postinumero geokooderista: ${from.postalcode ?? "–"}`);
console.log(`Kohde:  ${to.name}${toText ? "" : " (lähin keskusta)"} — linnuntietä ${km(from, to).toFixed(1)} km`);
console.log(`Aika:   ${dt}\n`);

const variants = {
  "Julkinen liikenne": undefined,
  "Pyörä": { directOnly: true, direct: ["BICYCLE"] },
  "Kävely": { directOnly: true, direct: ["WALK"] },
};
for (const [name, modes] of Object.entries(variants)) {
  try {
    const its = await plan(from, to, dt, modes);
    console.log(`${name}:`);
    console.log(its.length ? its.slice(0, name === "Julkinen liikenne" ? 3 : 1).map((it) => `  ${describe(it)}`).join("\n") : "  ei reittiä");
  } catch (e) {
    console.log(`${name}: VIRHE ${e.message}`);
  }
}

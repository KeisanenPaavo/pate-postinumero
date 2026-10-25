// Omakotitalon riskit ja tontti pisteelle: tulva (Syke), maaperä (GTK), radon (STUK/Sotkanet, kunnittain),
// kiinteistöraja (MML, vaatii MML_API_KEY:n).
// Käyttö: node --env-file-if-exists=.env scripts/check/okt-riskit.mjs [<lat> <lon>]
//   ilman argumentteja ajetaan testipisteet eri puolilta Uuttamaata.
const TESTIPISTEET = [
  [60.1755, 24.805, "Tapiola (kerrostaloalue)"],
  [60.195, 24.596, "Kauklahti"],
  [60.351, 25.074, "Korso"],
  [60.293, 25.255, "Söderkulla"],
  [60.383, 24.75, "Klaukkala"],
  [60.256, 24.923, "Paloheinä"],
  [60.218, 24.662, "Kalajärvi"],
  [60.2, 24.976, "Vanhankaupunginlahti (tulva-alue)"],
  [60.3915, 25.661, "Porvoo, joenranta (tulva-alue)"],
];
const args = process.argv.slice(2).map(Number);
const pisteet = args.length === 2 && args.every(Number.isFinite) ? [[args[0], args[1], "annettu piste"]] : TESTIPISTEET;

const UA = { "User-Agent": "pate-postinumero-datacheck/0.1" };
const getJson = async (url, params = {}, headers = {}) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${u.host}`);
  return res.json();
};

// Syke: tulvan peittämä alue rasterina, vain WMS (WFS:ssä ei peittämätasoja). GetFeatureInfo palauttaa
// GRAY_INDEX: 4 = 1/20a, 6 = 1/100a, 8 = 1/1000a, 9 = vesistö/meri, 127 = ei tulvaa; tyhjä = ei kartoitettu.
const TULVA = { 4: "1/20a (melko yleinen)", 6: "1/100a (harvinainen)", 8: "1/1000a (erittäin harvinainen)", 9: "vesistö/meri", 127: "ei tulvaa" };
async function tulva(lat, lon) {
  const d = 0.0002;
  // Tasot erikseen: yhteiskyselyssä tyhjä taso jää pois, eikä arvoa voi yhdistää tasoon.
  const kysy = async (layer) => {
    const js = await getJson("https://paikkatiedot.ymparisto.fi/geoserver/tulva_perus_peittama/wms", {
      service: "WMS", version: "1.1.1", request: "GetFeatureInfo", layers: layer, query_layers: layer, styles: "",
      srs: "EPSG:4326", bbox: [lon - d, lat - d, lon + d, lat + d].join(","), width: 11, height: 11, x: 5, y: 5,
      info_format: "application/json", feature_count: 1,
    });
    const v = js.features[0]?.properties.GRAY_INDEX;
    return v == null ? "ei kartoitettu" : (TULVA[v] ?? v);
  };
  const [meri, vesisto] = await Promise.all([kysy("tulvanpeittama_meritulva"), kysy("tulvanpeittama_vesistotulva")]);
  return `meri: ${meri}, vesistö: ${vesisto}`;
}

// GTK: maaperä 1:20 000 / 1:50 000 ArcGIS REST -kyselynä (WFS toimii myös, mutta palauttaa GML:ää).
// Taso 46 = maapera_20k_pohjamaalajit, jossa myös pintamaalaji. Taso 53 = 1:200 000 varalla.
async function maapera(lat, lon) {
  const kysy = (taso) =>
    getJson(`https://gtkdata.gtk.fi/arcgis/rest/services/Rajapinnat/GTK_Maapera_WMS/MapServer/${taso}/query`, {
      geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: 4326, spatialRel: "esriSpatialRelIntersects",
      outFields: "PINTAMAALAJI,POHJAMAALAJI", returnGeometry: false, f: "json",
    }).then((js) => js.features[0]?.attributes);
  const a = await kysy(46);
  const fmt = (x) => (x.PINTAMAALAJI === x.POHJAMAALAJI ? x.PINTAMAALAJI : `${x.PINTAMAALAJI} / pohja ${x.POHJAMAALAJI}`);
  if (a && !a.PINTAMAALAJI.startsWith("Kartoittamaton")) return `1:20k: ${fmt(a)}`;
  const b = await kysy(53);
  return `1:20k: ${a ? "kartoittamaton" : "ei aineistoa"} → 1:200k: ${b ? fmt(b) : "ei aineistoa"}`;
}

// Radon: STUK ei julkaise pistekyselyä (vain 10 km ruutukartta kuvana). Sotkanetissa kunnittaiset luvut
// vuosittain mitattujen pientalojen mukaan: 3580 mediaani, 3581 yli 300 Bq/m³ %, 3582 mitattuja.
// Haetaan useampi vuosi ja painotetaan mittausten määrällä, koska yksittäisen vuoden otos on pieni.
const RADON_VUODET = [2019, 2020, 2021, 2022, 2023];
let radonCache;
async function radonKunnat() {
  radonCache ??= (async () => {
    const SOTKA = "https://sotkanet.fi/rest/1.1";
    const [alueet, ...rivit] = await Promise.all([
      getJson(`${SOTKA}/regions`),
      ...[3581, 3582].map((i) =>
        getJson(`${SOTKA}/json?indicator=${i}&genders=total&${RADON_VUODET.map((y) => `years=${y}`).join("&")}`),
      ),
    ]);
    const kunta = new Map(alueet.filter((a) => a.category === "KUNTA").map((a) => [a.title.fi, a.id]));
    const [yli300, mitattu] = rivit;
    return { kunta, yli300, mitattu };
  })();
  return radonCache;
}
async function radon(kuntaNimi) {
  const { kunta, yli300, mitattu } = await radonKunnat();
  const id = kunta.get(kuntaNimi);
  if (!id) return `kuntaa ${kuntaNimi} ei löydy`;
  let n = 0, yli = 0;
  for (const y of RADON_VUODET) {
    const m = mitattu.find((r) => r.region === id && r.year === y)?.value;
    const p = yli300.find((r) => r.region === id && r.year === y)?.value;
    if (m && p != null) { n += m; yli += (p / 100) * m; }
  }
  return n ? `${kuntaNimi}: ${((100 * yli) / n).toFixed(1)} % pientaloista yli 300 Bq/m³ (${n} mittausta ${RADON_VUODET[0]}–${RADON_VUODET.at(-1)})` : `${kuntaNimi}: ei mittauksia`;
}

// MML: kiinteistötietojen kyselypalvelu, avoimet tuotteet API-avaimella (ilmainen, itsepalvelu).
// Palsta pisteessä → kiinteistötunnus ja palstan alue, josta pinta-ala lasketaan.
async function kiinteisto(lat, lon) {
  const key = process.env.MML_API_KEY;
  if (!key) return "ohitettu: MML_API_KEY puuttuu";
  const js = await getJson(
    "https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/collections/PalstanSijaintitiedot/items",
    { bbox: [lon, lat, lon, lat].join(","), limit: 5, "api-key": key },
  );
  const f = js.features?.[0];
  return f ? `${f.properties.kiinteistotunnuksenEsitysmuoto ?? f.properties.kiinteistotunnus} (${f.geometry.type})` : "ei palstaa";
}

async function kuntaPisteessa(lat, lon) {
  const js = await getJson("https://geo.stat.fi/geoserver/tilastointialueet/wfs", {
    service: "WFS", version: "1.1.0", request: "GetFeature", typeName: "tilastointialueet:kunta1000k_2026",
    propertyName: "nimi", outputFormat: "application/json", cql_filter: `INTERSECTS(geom,SRID=4326;POINT(${lon} ${lat}))`,
  });
  return js.features[0]?.properties.nimi;
}

for (const [lat, lon, nimi] of pisteet) {
  const t0 = Date.now();
  const kunta = await kuntaPisteessa(lat, lon).catch(() => null);
  const checks = {
    Tulva: () => tulva(lat, lon),
    Maaperä: () => maapera(lat, lon),
    Radon: () => (kunta ? radon(kunta) : Promise.resolve("kunta ei tiedossa")),
    Kiinteistö: () => kiinteisto(lat, lon),
  };
  const results = await Promise.allSettled(Object.values(checks).map((fn) => fn()));
  console.log(`\n${nimi} (${lat}, ${lon}), ${kunta ?? "?"} – ${Date.now() - t0} ms`);
  for (const [i, name] of Object.keys(checks).entries()) {
    const r = results[i];
    console.log(`  ${name}: ${r.status === "fulfilled" ? r.value : `VIRHE: ${r.reason.message}`}`);
  }
}

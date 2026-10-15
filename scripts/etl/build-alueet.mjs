// ETL: hakee Uudenmaan postinumeroalueiden hinnat (Tilastokeskus) ja Paavo-tiedot ja
// kirjoittaa ne yhdeksi tiedostoksi, jonka sivusto lukee build-vaiheessa.
// Käyttö: node scripts/etl/build-alueet.mjs  →  data/generated/uusimaa.json
import { readFile, writeFile, mkdir } from "node:fs/promises";

const PX = "https://pxdata.stat.fi/PxWeb/api/v1/fi";
const KESKUSTAT = JSON.parse(await readFile("data/config/keskustat.json", "utf8"));
const KUNNAT = new Set(Object.keys(KESKUSTAT)); // Uudenmaan kuntanumerot

// --- apufunktiot -----------------------------------------------------------

async function px(table, query) {
  const res = await fetch(`${PX}/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, response: { format: "json-stat2" } }),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}
const sel = (code, values) => ({ code, selection: { filter: "item", values } });
const all = (code) => ({ code, selection: { filter: "all", values: ["*"] } });

// json-stat2 → funktio, joka palauttaa arvon dimensioavainten perusteella.
function cube(js) {
  const keys = js.id.map((id) =>
    Object.fromEntries(Object.entries(js.dimension[id].category.index)),
  );
  const strides = js.size.map((_, i) => js.size.slice(i + 1).reduce((a, b) => a * b, 1));
  const labels = js.id.map((id) => js.dimension[id].category.label);
  const list = (i) => Object.keys(keys[i]).sort((a, b) => keys[i][a] - keys[i][b]);
  const get = (...k) => js.value[k.reduce((s, key, i) => s + keys[i][key] * strides[i], 0)] ?? null;
  return { get, list, labels };
}

// --- 1. Postinumeroalueet ja kunnat ----------------------------------------

const wfs = new URL("https://geo.stat.fi/geoserver/postialue/wfs");
wfs.search = new URLSearchParams({
  service: "WFS", version: "1.1.0", request: "GetFeature", typeName: "postialue:pno_2026",
  outputFormat: "application/json", propertyName: "posti_alue,nimi,namn,kunta", srsName: "EPSG:4326",
});
// Geometriaa ei haeta, mutta vastaus sisältää jokaisen alueen bboxin → käytetään sen keskipistettä
// matka-aikojen oletuslähtöpisteenä, kun käyttäjä ei ole syöttänyt osoitetta.
const pnoFeatures = (await (await fetch(wfs)).json()).features.map((f) => {
  const [minLon, minLat, maxLon, maxLat] = f.bbox;
  return { ...f.properties, lat: +((minLat + maxLat) / 2).toFixed(5), lon: +((minLon + maxLon) / 2).toFixed(5) };
});
const alueet = Object.fromEntries(
  pnoFeatures
    .filter((p) => KUNNAT.has(p.kunta))
    .map((p) => [p.posti_alue, { pno: p.posti_alue, nimi: p.nimi, namn: p.namn, kunta: p.kunta, keskipiste: { lat: p.lat, lon: p.lon } }]),
);
const pnos = Object.keys(alueet).sort();
console.log(`Postinumeroalueita Uudellamaalla: ${pnos.length}`);

// --- 2. Hinnat postinumeroittain (13mu) -------------------------------------

const hMeta = await (await fetch(`${PX}/StatFin/ashi/13mu.px`)).json();
const hPnoCode = hMeta.variables.find((v) => v.code.startsWith("postinumero")).code;
const hPnos = pnos.filter((p) => hMeta.variables.find((v) => v.code === hPnoCode).values.includes(p));
const hinnat = cube(await px("StatFin/ashi/13mu.px", [all("timeperiod_y"), sel(hPnoCode, hPnos), all(hMeta.variables[2].code), all("contentscode")]));
const [hYears, , hTypes] = [hinnat.list(0), null, hinnat.list(2)];
const TYYPIT = { 1: "yksiot", 2: "kaksiot", 3: "kolmiot", 5: "rivitalot" };

for (const p of pnos) {
  const rows = hYears.map((y) => {
    const r = { vuosi: +y };
    for (const t of hTypes) {
      r[TYYPIT[t]] = hinnat.get(y, p, t, "keskihinta_aritm_nw");
      r[`${TYYPIT[t]}_lkm`] = hinnat.get(y, p, t, "lkm_julk20");
    }
    return r;
  });
  alueet[p].hinnat = hPnos.includes(p) ? rows : [];
}

// --- 3. Hinnat kunnittain (13mx), fallback ----------------------------------

const kHinnat = cube(await px("StatFin/ashi/13mx.px", [all("timeperiod_y"), sel("kunta_1_20150101", [...KUNNAT]), all("talotyyppi_5_20111209"), all("contentscode")]));
const kunnat = {};
for (const k of KUNNAT) {
  kunnat[k] = {
    kunta: k,
    nimi: KESKUSTAT[k].nimi,
    keskusta: KESKUSTAT[k],
    hinnat: kHinnat.list(0).map((y) => ({
      vuosi: +y,
      kaikki: kHinnat.get(y, k, "0", "keskihinta_aritm_nw"),
      rivitalot: kHinnat.get(y, k, "1", "keskihinta_aritm_nw"),
      kerrostalot: kHinnat.get(y, k, "3", "keskihinta_aritm_nw"),
      kaikki_lkm: kHinnat.get(y, k, "0", "lkm_julk20") ?? kHinnat.get(y, k, "0", "lkm_julk19"),
    })),
  };
}

// --- 4. Paavo ----------------------------------------------------------------

const IKARYHMAT = ["0_2", "3_6", "7_12", "13_15", "16_17", "18_19", "20_24", "25_29", "30_34", "35_39", "40_44", "45_49", "50_54", "55_59", "60_64", "65_69", "70_74", "75_79", "80_84", "85_"];
const PAAVO_VARS = [
  "pinta_ala", "euref_x", "euref_y",
  "he_vakiy", "he_kika", ...IKARYHMAT.map((g) => `he_${g}`),
  "ko_ika18y", "ko_perus", "ko_yliop", "ko_ammat", "ko_al_kork", "ko_yl_kork",
  "hr_tuy", "hr_mtu", "hr_ktu", "hr_pi_tul", "hr_ke_tul", "hr_hy_tul",
  "te_taly", "te_takk", "te_as_valj", "te_yks", "te_nuor", "te_eil_np", "te_laps", "te_plap", "te_aklap", "te_klap", "te_teini", "te_yhlap", "te_aik", "te_elak", "te_omis_as", "te_vuok_as",
  "tr_mtu", "ra_asunn", "ra_as_kpa", "ra_pt_as", "ra_kt_as",
  "pt_vakiy", "pt_tyoll", "pt_tyott", "pt_opisk", "pt_elakel",
];
const AIKASARJA_VARS = ["he_vakiy", "hr_mtu", "he_kika"];

const pMeta = await (await fetch(`${PX}/Postinumeroalueittainen_avoin_tieto/uusin/12f7.px`)).json();
const pPnoCode = pMeta.variables.find((v) => v.code.startsWith("postinumeroalue")).code;
// Kaksi kyselyä PxWebin 120 000 solun rajan vuoksi: kaikki muuttujat uusimmalta vuodelta + lyhyt aikasarja.
const pYears = pMeta.variables.find((v) => v.code === "timeperiod_y").values;
const pLatest = pYears.at(-1);
const paavo = cube(
  await px("Postinumeroalueittainen_avoin_tieto/uusin/12f7.px", [
    sel(pPnoCode, [...pnos, "SSS"]),
    sel("timeperiod_y", [pLatest]),
    sel("contentscode", PAAVO_VARS),
  ]),
);
const sarja = cube(
  await px("Postinumeroalueittainen_avoin_tieto/uusin/12f7.px", [
    sel(pPnoCode, [...pnos, "SSS"]),
    all("timeperiod_y"),
    sel("contentscode", AIKASARJA_VARS),
  ]),
);

const paavoRow = (p) => Object.fromEntries(PAAVO_VARS.map((v) => [v, paavo.get(p, pLatest, v)]));
const aikasarja = (p) =>
  pYears.map((y) => ({ vuosi: +y, ...Object.fromEntries(AIKASARJA_VARS.map((v) => [v, sarja.get(p, y, v)])) }));

for (const p of pnos) {
  alueet[p].paavo = paavoRow(p);
  alueet[p].paavo_aikasarja = aikasarja(p);
}
const kokoMaa = { paavo: paavoRow("SSS"), paavo_aikasarja: aikasarja("SSS") };

// Kuntatason vertailuluvut (12f8)
const kMeta = await (await fetch(`${PX}/Postinumeroalueittainen_avoin_tieto/uusin/12f8.px`)).json();
const kAlueCode = kMeta.variables.find((v) => v.code.startsWith("alue")).code;
const kAvailable = new Set(kMeta.variables.find((v) => v.code === kAlueCode).values);
const kVars = PAAVO_VARS.filter((v) => kMeta.variables.find((x) => x.code === "contentscode").values.includes(v));
const kPaavo = cube(
  await px("Postinumeroalueittainen_avoin_tieto/uusin/12f8.px", [
    sel(kAlueCode, [...KUNNAT].map((k) => `KU${k}`).filter((k) => kAvailable.has(k)).concat("MK01")),
    sel("timeperiod_y", [pLatest]),
    sel("contentscode", kVars),
  ]),
);
for (const k of KUNNAT) kunnat[k].paavo = Object.fromEntries(kVars.map((v) => [v, kPaavo.get(`KU${k}`, pLatest, v)]));
const maakunta = { nimi: "Uusimaa", paavo: Object.fromEntries(kVars.map((v) => [v, kPaavo.get("MK01", pLatest, v)])) };

// --- 5. Kirjoitus ---------------------------------------------------------------

const out = {
  meta: {
    luotu: new Date().toISOString(),
    paavo_vuosi: +pLatest,
    hinnat_vuodet: [+hYears[0], +hYears.at(-1)],
    lahteet: [
      "Tilastokeskus: Osakeasuntojen hinnat (13mu, 13mx), CC BY 4.0",
      `Tilastokeskus: Paavo – postinumeroalueittainen avoin tieto ${pLatest}, CC BY 4.0`,
      "Tilastokeskus: postinumeroalueet 2026 (geo.stat.fi), CC BY 4.0",
    ],
  },
  koko_maa: kokoMaa,
  maakunta,
  kunnat,
  alueet,
};
await mkdir("data/generated", { recursive: true });
await writeFile("data/generated/uusimaa.json", JSON.stringify(out));

const withPrice = pnos.filter((p) => alueet[p].hinnat.at(-1) && Object.values(TYYPIT).some((t) => alueet[p].hinnat.at(-1)[t] != null));
console.log(`Hinnat viimeisimmältä vuodelta: ${withPrice.length}/${pnos.length} alueella`);
console.log(`Paavo ${pLatest}: ${pnos.filter((p) => alueet[p].paavo.he_vakiy != null).length}/${pnos.length} alueella`);
console.log(`Kunnat: ${Object.values(kunnat).filter((k) => k.paavo.he_vakiy != null).length}/${KUNNAT.size} Paavo-luvuilla`);

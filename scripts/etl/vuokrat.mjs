// ETL: vuokra-asuntojen vuokrat huoneluvuittain Uudenmaan postinumeroalueille.
//
// Tilastokeskus ei julkaise vuokria postinumeroittain. Tarkin taso on vuokratilaston aluejako
// (alue_44_20260101): suurimmat kaupungit on jaettu postinumeroista koottuihin osa-alueisiin
// (esim. Helsinki 1–4), muut kunnat ovat oma alueensa tai kuuluvat kehyskuntiin tai maakuntaan.
// Jokaiselle postinumerolle valitaan tarkin alue, jolle vuokra julkaistaan.
//
// Taulut: 15fa (keskineliövuokrat, vapaarahoitteiset ja valtion tukemat) ja
// 15fc (vapaarahoitteisten kokonaisvuokrien kvartiilit, vain suurimmat kaupungit).
//
// Käyttö: node scripts/etl/vuokrat.mjs  →  data/generated/vuokrat.json
// Vaatii: data/generated/uusimaa.json (npm run data)
import { readFile, writeFile, mkdir } from "node:fs/promises";

const PX = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/asvu";
const ALUE = "alue_44_20260101"; // sekä luokituksen että PxWeb-muuttujan tunnus

const { alueet, kunnat } = JSON.parse(await readFile("data/generated/uusimaa.json", "utf8"));

async function json(url, body) {
  const res = await fetch(url, body && {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}: ${await res.text()}`);
  return res.json();
}
const sel = (code, values) => ({ code, selection: { filter: "item", values } });
const all = (code) => ({ code, selection: { filter: "all", values: ["*"] } });

// json-stat2 → arvo dimensioavainten perusteella (sama kuin build-alueet.mjs).
function cube(js) {
  const idx = js.id.map((id) => js.dimension[id].category.index);
  const strides = js.size.map((_, i) => js.size.slice(i + 1).reduce((a, b) => a * b, 1));
  return (...k) => js.value[k.reduce((s, key, i) => s + idx[i][key] * strides[i], 0)] ?? null;
}

// --- 1. Aluejako ja postinumerot -------------------------------------------------

const items = await json(
  `https://data.stat.fi/api/classifications/v2/classifications/${ALUE}/classificationItems?content=data&meta=max&lang=fi`,
);
const nimet = Object.fromEntries(items.map((it) => [it.code, it.classificationItemNames[0].name.replace(/^MK\d+ /, "")]));
// Osa-alueiden postinumerot ovat luokituksen selitteessä: "00100, 00120, …"
const osaAlue = {};
for (const it of items) {
  if (!/^\d{3}_\d$/.test(it.code)) continue;
  for (const pno of it.explanatoryNotes?.[0]?.includes?.[0]?.split(/,\s*/) ?? []) osaAlue[pno] = it.code;
}
// Kehyskunnat luetellaan nimillä selitteessä.
const kehys = new Set(items.find((it) => it.code === "keh").explanatoryNotes[0].includes[0].split(/,\s*|\s+ja\s+/));
// Kauniainen tilastoidaan yhdessä Espoon kanssa.
const kuntaAlue = (k) => (k === "235" ? "049" : nimet[k] ? k : kehys.has(kunnat[k].nimi) ? "keh" : "MK01");

const pnoAlue = {};
for (const p of Object.keys(alueet)) {
  const k = kuntaAlue(alueet[p].kunta);
  // Osa-aluejaosta puuttuvat postinumerot (esim. uudet) saavat kunnan luvut.
  pnoAlue[p] = osaAlue[p]?.startsWith(`${k}_`) ? osaAlue[p] : k;
}
const kuntaAlueet = Object.fromEntries(Object.keys(kunnat).map((k) => [k, kuntaAlue(k)]));
const koodit = [...new Set([...Object.values(pnoAlue), ...Object.values(kuntaAlueet), "MK01"])];

// --- 2. Keskineliövuokrat (15fa) ---------------------------------------------------

const faMeta = await json(`${PX}/15fa.px`);
const viimeisin = faMeta.variables.find((v) => v.code === "timeperiod_q").values.at(-1);
const fa = cube(
  await json(`${PX}/15fa.px`, {
    query: [sel(ALUE, koodit), all("rahoitus_2_20260101"), all("huoneluku_5_20260101"), sel("timeperiod_q", [viimeisin]), all("contentscode")],
    response: { format: "json-stat2" },
  }),
);

// --- 3. Kokonaisvuokrien kvartiilit (15fc) -----------------------------------------

const fcMeta = await json(`${PX}/15fc.px`);
const fcKoodit = koodit.filter((k) => fcMeta.variables[0].values.includes(k));
const fc = cube(
  await json(`${PX}/15fc.px`, {
    query: [sel(ALUE, fcKoodit), all("huoneluku_5_20260101"), sel("timeperiod_q", [viimeisin]), all("contentscode")],
    response: { format: "json-stat2" },
  }),
);

// --- 4. Kokoaminen -----------------------------------------------------------------

const HUONEET = { SSS: "kaikki", 1: "yksiot", 2: "kaksiot", 3: "kolmiot" };
const RAHOITUS = { 1: "vapaa", 2: "tuettu" };

const vuokraAlueet = {};
for (const a of koodit) {
  const tyypit = {};
  for (const [h, nimi] of Object.entries(HUONEET)) {
    const r = {};
    for (const [rh, rnimi] of Object.entries(RAHOITUS)) {
      r[rnimi] = fa(a, rh, h, viimeisin, "asvu_keskineliovuokra");
      r[`${rnimi}_lkm`] = fa(a, rh, h, viimeisin, "asvu_keskineliovuokra_lkm");
    }
    r.vapaa_uudet = fa(a, "1", h, viimeisin, "asvu_keskineliovuokra_u");
    r.vapaa_vuosimuutos = fa(a, "1", h, viimeisin, "asvu2025_vm");
    if (h !== "SSS" && fcKoodit.includes(a)) {
      r.kk_alakvartiili = fc(a, h, viimeisin, "asvu_q1");
      r.kk_mediaani = fc(a, h, viimeisin, "asvu_mediaani");
      r.kk_ylakvartiili = fc(a, h, viimeisin, "asvu_q3");
    }
    tyypit[nimi] = r;
  }
  vuokraAlueet[a] = {
    koodi: a,
    nimi: nimet[a],
    postinumerot: Object.keys(osaAlue).filter((p) => osaAlue[p] === a).length || null,
    ...(a === "keh" && { kunnat: [...kehys] }),
    tyypit,
  };
}

const out = {
  meta: {
    luotu: new Date().toISOString(),
    neljannes: viimeisin,
    lahde: "Tilastokeskus: Asuntojen vuokrat (15fa, 15fc), CC BY 4.0",
  },
  alueet: vuokraAlueet,
  postinumerot: pnoAlue,
  kunnat: kuntaAlueet,
};
await mkdir("data/generated", { recursive: true });
await writeFile("data/generated/vuokrat.json", JSON.stringify(out));

const tasot = Object.values(pnoAlue).reduce((m, a) => ((m[a.includes("_") ? "osa-alue" : a] = (m[a.includes("_") ? "osa-alue" : a] ?? 0) + 1), m), {});
console.log(`Vuokrat ${viimeisin}: ${koodit.length} aluetta, postinumerot tasoittain`, tasot);

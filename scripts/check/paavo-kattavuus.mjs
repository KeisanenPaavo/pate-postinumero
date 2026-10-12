// Mittaa Paavo-muuttujien kattavuuden (salaukset) ja hintadatan väestöpainotetun kattavuuden.
// Käyttö: node scripts/check/paavo-kattavuus.mjs
import { readFile } from "node:fs/promises";

const load = async (f) => JSON.parse(await readFile(f, "utf8"));
const paavo = await load("data/raw/paavo_uusin.json");
const hinnat = await load("data/raw/hinnat_13mu.json");

const keysOf = (js, id) =>
  Object.entries(js.dimension[id].category.index).sort((a, b) => a[1] - b[1]).map(([k]) => k);

// Paavo: [postinumero, vuosi(1), muuttuja]
const pnos = keysOf(paavo, paavo.id[0]);
const vars = keysOf(paavo, "contentscode");
const varLabels = paavo.dimension.contentscode.category.label;
const pv = (pi, vi) => paavo.value[pi * vars.length + vi];

const areas = pnos.map((p, pi) => (p === "SSS" ? null : p)).filter(Boolean);
console.log(`Paavo ${Object.keys(paavo.dimension.timeperiod_y.category.label)[0]}: ${areas.length} postinumeroaluetta\n`);
console.log("Muuttuja: arvo saatavilla / alueita");
for (const [vi, v] of vars.entries()) {
  const n = pnos.filter((p, pi) => p !== "SSS" && pv(pi, vi) != null).length;
  console.log(`  ${varLabels[v].padEnd(45)} ${String(n).padStart(4)} / ${areas.length} (${((100 * n) / areas.length).toFixed(0)} %)`);
}

// Väestöpainotettu hintakattavuus: kuinka moni asuu alueella, jolla on 2025 hinta jollekin talotyypille
const popIdx = vars.indexOf("he_vakiy");
const pop = new Map(pnos.map((p, pi) => [p, pv(pi, popIdx) ?? 0]));
const totalPop = pop.get("SSS");

const hId = hinnat.id;
const hYears = keysOf(hinnat, hId[0]);
const hPnos = keysOf(hinnat, hId[1]);
const hTypes = keysOf(hinnat, hId[2]);
const hContents = keysOf(hinnat, hId[3]);
const stride = (i) => hinnat.size.slice(i + 1).reduce((a, b) => a * b, 1);
const yi = hYears.indexOf("2025");
const ci = hContents.indexOf("keskihinta_aritm_nw");
const hasPrice = new Set(
  hPnos.filter((_, pi) =>
    hTypes.some((_, ti) => hinnat.value[yi * stride(0) + pi * stride(1) + ti * stride(2) + ci * stride(3)] != null),
  ),
);

let covered = 0;
for (const [p, n] of pop) if (p !== "SSS" && hasPrice.has(p)) covered += n;
const inPriceTable = hPnos.filter((p) => pop.has(p)).length;
console.log(`\nHintataulun postinumeroista Paavon (2026-rajat) alueilla: ${inPriceTable} / ${hPnos.length}`);
console.log(`Postinumeroalueita, joilla 2025 hinta: ${hasPrice.size} / ${areas.length} (${((100 * hasPrice.size) / areas.length).toFixed(0)} %)`);
console.log(`Väestöstä asuu hinta-alueilla: ${covered.toLocaleString("fi")} / ${totalPop.toLocaleString("fi")} (${((100 * covered) / totalPop).toFixed(0)} %)`);

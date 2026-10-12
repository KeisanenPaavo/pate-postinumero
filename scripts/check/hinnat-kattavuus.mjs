// Mittaa Tilastokeskuksen postinumerokohtaisten neliöhintojen (taulu 13mu) kattavuuden.
// Käyttö: node scripts/check/hinnat-kattavuus.mjs [data/raw/hinnat_13mu.json]
import { readFile } from "node:fs/promises";

const file = process.argv[2] ?? "data/raw/hinnat_13mu.json";
const js = JSON.parse(await readFile(file, "utf8"));

const dims = js.id.map((id) => {
  const cat = js.dimension[id].category;
  const keys = Object.entries(cat.index).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  return { id, keys, labels: cat.label };
});
const [yrs, pnos, types, contents] = dims;
const stride = (i) => js.size.slice(i + 1).reduce((a, b) => a * b, 1);
const val = (y, p, t, c) => js.value[y * stride(0) + p * stride(1) + t * stride(2) + c * stride(3)];

const priceIdx = contents.keys.indexOf("keskihinta_aritm_nw");
const countIdx = contents.keys.indexOf("lkm_julk20");

console.log(`Postinumeroita taulussa: ${pnos.keys.length}`);
for (const [yi, y] of yrs.keys.entries()) {
  const anyType = pnos.keys.filter((_, pi) => types.keys.some((_, ti) => val(yi, pi, ti, priceIdx) != null)).length;
  const perType = types.keys.map((t, ti) => {
    const n = pnos.keys.filter((_, pi) => val(yi, pi, ti, priceIdx) != null).length;
    return `${types.labels[t]}: ${n}`;
  });
  console.log(`\n${y}: hinta jollekin talotyypille ${anyType}/${pnos.keys.length} (${((100 * anyType) / pnos.keys.length).toFixed(0)} %)`);
  console.log("  " + perType.join(" | "));
}

// Esimerkkejä: tunnettuja postinumeroita
const last = yrs.keys.length - 1;
for (const p of ["00100", "00530", "02100", "33100", "20100", "90100", "40100", "99800"]) {
  const pi = pnos.keys.indexOf(p);
  if (pi < 0) { console.log(`${p}: ei taulussa`); continue; }
  const parts = types.keys.map((t, ti) => `${types.labels[t].replace("Kerrostalo ", "")}=${val(last, pi, ti, priceIdx) ?? "–"}€ (${val(last, pi, ti, countIdx) ?? "–"} kpl)`);
  console.log(`${pnos.labels[p]}: ${parts.join(", ")}`);
}

// ETL: Suomen kuntien nimet taloyhtiöiden nimien tulkintaan ("Asunto Oy Joensuun Kalevankatu 40" ei ole Helsingin yhtiö).
//
// Lähde: Tilastokeskuksen luokituspalvelu, kunta_1_20260101 (suomeksi ja ruotsiksi).
// Käyttö: node scripts/etl/kunnat.mjs  →  data/config/kunnat.json
import { writeFile } from "node:fs/promises";

const LUOKITUS = "https://data.stat.fi/api/classifications/v2/classifications/kunta_1_20260101/classificationItems";

async function nimet(kieli) {
  const res = await fetch(`${LUOKITUS}?content=data&meta=max&lang=${kieli}&format=json`);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const js = await res.json();
  return new Map(js.map((x) => [x.code, x.classificationItemNames[0].name]));
}

const [fi, sv] = await Promise.all([nimet("fi"), nimet("sv")]);
const kunnat = [...fi]
  .map(([koodi, nimi]) => ({ koodi, nimi, ...(sv.get(koodi) !== nimi ? { sv: sv.get(koodi) } : {}) }))
  .sort((a, b) => a.koodi.localeCompare(b.koodi));
await writeFile("data/config/kunnat.json", JSON.stringify({ luokitus: "kunta_1_20260101", kunnat }, null, 1) + "\n");
console.log(`${kunnat.length} kuntaa → data/config/kunnat.json`);

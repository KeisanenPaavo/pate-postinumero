// MapLibre 6 lataa web workerinsa erillisestä tiedostosta. Kopioidaan worker ja sen jaettu moduuli
// public/-kansioon, jotta ne löytyvät kiinteästä osoitteesta bundlauksesta riippumatta.
import { copyFile, mkdir } from "node:fs/promises";

const lahde = "node_modules/maplibre-gl/dist";
await mkdir("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(`${lahde}/${f}`, `public/maplibre/${f}`);
}

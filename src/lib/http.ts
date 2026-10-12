import type { Piste } from "./data";

/** Lukee "lat,lon"-parametrin ja tarkistaa, että se on Suomen alueella. */
export function lueKoordinaatti(value: string | null): Piste | null {
  if (!value) return null;
  const [lat, lon] = value.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 59 || lat > 71 || lon < 19 || lon > 32) return null;
  return { lat, lon };
}

export const virhe = (status: number, viesti: string) => Response.json({ virhe: viesti }, { status });

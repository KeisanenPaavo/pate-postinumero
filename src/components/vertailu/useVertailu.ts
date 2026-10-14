"use client";

import { useMemo, useSyncExternalStore } from "react";
import { VERTAILU, samaPiste, type Vertailtava } from "../osoite/yhteiset";

/** Vertailuun tallennetut osoitteet (enintään 3) ja niiden muokkaus. */
export function useVertailu() {
  const raw = useSyncExternalStore(VERTAILU.tilaa, VERTAILU.lue, () => "[]");
  const kohteet = useMemo(() => VERTAILU.jasenna(raw), [raw]);
  return {
    kohteet,
    taynna: kohteet.length >= VERTAILU.max,
    onko: (p: { lat: number; lon: number }) => kohteet.some((k) => samaPiste(k, p)),
    lisaa: (k: Vertailtava) => {
      if (kohteet.some((x) => samaPiste(x, k)) || kohteet.length >= VERTAILU.max) return;
      VERTAILU.tallenna([...kohteet, k]);
    },
    poista: (p: { lat: number; lon: number }) => VERTAILU.tallenna(kohteet.filter((k) => !samaPiste(k, p))),
  };
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";
import { VERTAILU, VERTAILUKOHDE, samaPiste, type Kohde, type Vertailtava } from "../osoite/yhteiset";

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

/** Vertailun kohdeosoite (yksi), johon matka-ajat ja -matkat lasketaan kaikista vertailtavista osoitteista. */
export function useVertailuKohde() {
  const raw = useSyncExternalStore(VERTAILUKOHDE.tilaa, VERTAILUKOHDE.lue, () => "[]");
  const kohde = useMemo(() => VERTAILUKOHDE.jasenna(raw)[0] ?? null, [raw]);
  return {
    kohde,
    aseta: (k: Kohde) => VERTAILUKOHDE.tallenna([k]),
    poista: () => VERTAILUKOHDE.tallenna([]),
  };
}

// --- Jaettava vertailu ------------------------------------------------------------------------
// Linkki: /vertailu?o=lat,lon,nimi&o=…&kohde=lat,lon,nimi (nimi voi sisältää pilkkuja: kaksi ensimmäistä kenttää ovat koordinaatit).

const koodaa = (k: Kohde) => `${k.lat.toFixed(5)},${k.lon.toFixed(5)},${k.nimi}`;

function pura(arvo: string | null): Kohde | null {
  if (!arvo) return null;
  const [lat, lon, ...nimi] = arvo.split(",");
  const p = { lat: Number(lat), lon: Number(lon) };
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || p.lat < 59 || p.lat > 71 || p.lon < 19 || p.lon > 32) return null;
  return { ...p, nimi: nimi.join(",").trim().slice(0, 120) || "Jaettu osoite" };
}

export function jakoParametrit(kohteet: Kohde[], kohde: Kohde | null) {
  const q = new URLSearchParams();
  kohteet.forEach((k) => q.append("o", koodaa(k)));
  if (kohde) q.set("kohde", koodaa(kohde));
  return q.toString();
}

/**
 * Vertailun lähde: jaettu linkki (URL) tai käyttäjän oma, selaimeen tallennettu vertailu.
 * Jaettua vertailua voi muokata (muutokset päivittävät linkin) ja sen voi tallentaa omaksi.
 */
export function useVertailuLahde() {
  const params = useSearchParams();
  const router = useRouter();
  const oma = useVertailu();
  const omaKohde = useVertailuKohde();
  const jaetut = params.getAll("o").map(pura).filter((k): k is Kohde => !!k).slice(0, VERTAILU.max);
  const jaettuKohde = pura(params.get("kohde"));

  if (!jaetut.length)
    return {
      jaettu: false as const,
      kohteet: oma.kohteet,
      taynna: oma.taynna,
      lisaa: oma.lisaa,
      poista: oma.poista,
      kohde: omaKohde.kohde,
      asetaKohde: omaKohde.aseta,
      poistaKohde: omaKohde.poista,
      omienMaara: oma.kohteet.length,
      tallennaOmaksi: () => {},
    };

  const paivita = (kohteet: Kohde[], kohde: Kohde | null) => {
    const q = jakoParametrit(kohteet, kohde);
    router.replace(q && kohteet.length ? `/vertailu?${q}` : "/vertailu", { scroll: false });
  };
  return {
    jaettu: true as const,
    kohteet: jaetut,
    taynna: jaetut.length >= VERTAILU.max,
    lisaa: (k: Kohde) => {
      if (!jaetut.some((x) => samaPiste(x, k)) && jaetut.length < VERTAILU.max) paivita([...jaetut, k], jaettuKohde);
    },
    poista: (p: { lat: number; lon: number }) => paivita(jaetut.filter((k) => !samaPiste(k, p)), jaettuKohde),
    kohde: jaettuKohde,
    asetaKohde: (k: Kohde) => paivita(jaetut, k),
    poistaKohde: () => paivita(jaetut, null),
    omienMaara: oma.kohteet.length,
    tallennaOmaksi: () => {
      VERTAILU.tallenna(jaetut);
      VERTAILUKOHDE.tallenna(jaettuKohde ? [jaettuKohde] : []);
      router.replace("/vertailu", { scroll: false });
    },
  };
}

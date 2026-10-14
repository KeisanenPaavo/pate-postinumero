"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export type Piste = { lat: number; lon: number };
export type Kohde = Piste & { nimi: string };
export type Matka = { julkinen: number | null; vaihdot: number | null; reitti: string | null; pyora: number | null; kavely: number | null };
export type Melu = {
  maantiet: { paiva: string | null; yo: string | null };
  rautatiet: { paiva: string | null; yo: string | null };
  helsinkiYhteismelu?: string | null;
};
export type Koulu = { nimi: string; tyyppi: string; km: number; lat: number; lon: number };
export type PalveluPiste = { nimi: string; lat: number; lon: number; km: number };
export type Pysakki = { nimi: string; lat: number; lon: number; metrit: number; kulkuneuvo: string; linjat: string[] };
export type JunaAsema = { nimi: string; lat: number; lon: number; metrit: number; lahijunat: string[]; kaukojunat: boolean };
export type Lahella = {
  kaupat: (PalveluPiste & { tyyppi: string })[];
  paivakodit: PalveluPiste[];
  pysakit: Pysakki[] | null;
  junaAsemat: JunaAsema[] | null;
};
export type PisteTiedot = { melu: Melu | null; koulut: Koulu[] | null };

export const pisteParam = (p: Piste) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

/** Osoite URL:sta (?p=lat,lon&osoite=…) tai null. Lähtöpiste = osoite tai alueen keskipiste. */
export function useOsoite(keskipiste: Piste) {
  const params = useSearchParams();
  const p = params.get("p")?.split(",").map(Number);
  const osoite: Kohde | null =
    p && p.length === 2 && p.every(Number.isFinite) ? { lat: p[0], lon: p[1], nimi: params.get("osoite") ?? "Valittu osoite" } : null;
  return { osoite, lahto: osoite ?? keskipiste };
}

// Sama URL haetaan vain kerran, vaikka useampi komponentti tarvitsee sen (yhteenveto + osio).
const valimuisti = new Map<string, Promise<unknown>>();

function hae<T>(url: string): Promise<T> {
  let lupaus = valimuisti.get(url);
  if (!lupaus) {
    lupaus = fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    lupaus.catch(() => valimuisti.delete(url));
    valimuisti.set(url, lupaus);
  }
  return lupaus as Promise<T>;
}

export function useJson<T>(url: string | null) {
  const [tila, setTila] = useState<{ url: string | null; data?: T; virhe?: boolean }>({ url: null });
  useEffect(() => {
    if (!url) return;
    let peruttu = false;
    hae<T>(url)
      .then((data) => !peruttu && setTila({ url, data }))
      .catch(() => !peruttu && setTila({ url, virhe: true }));
    return () => {
      peruttu = true;
    };
  }, [url]);
  return tila.url === url ? tila : { url, data: undefined, virhe: false };
}

export const useLahella = (lahto: Piste) => useJson<Lahella>(`/api/lahella?p=${pisteParam(lahto)}`);
export type Kavely = { minuutit: number; metrit: number; reitti: [number, number][] };
export const useKavely = (lahto: Piste, kohde: Piste | null) =>
  useJson<Kavely>(kohde ? `/api/kavely?mista=${pisteParam(lahto)}&minne=${pisteParam(kohde)}` : null);
export const usePisteTiedot = (lahto: Piste) => useJson<PisteTiedot>(`/api/piste?p=${pisteParam(lahto)}`);
export const useMatka = (lahto: Piste, kohde: Piste) =>
  useJson<Matka>(`/api/matka?mista=${pisteParam(lahto)}&minne=${pisteParam(kohde)}`);

// --- Selkokieliset tulkinnat ----------------------------------------------------

export type Tuomio = {
  taso: "hyva" | "huomio" | "vakava" | "tuntematon";
  otsikko: string;
  selitys: string;
  /** Päiväajan kovimman lähteen vyöhykkeen alaraja (dB), null jos alle mallinnetun vyöhykkeen. */
  db: number | null;
};

/** Asuinalueiden päiväajan ohjearvo (VNp 993/1992). */
export const OHJEARVO_PAIVA = 55;

/** "50-55 dB" / "55–60 dB" → 50 */
const alaraja = (s: string | null | undefined) => (s ? Number(s.match(/\d+/)?.[0]) : null);

export function meluTuomio(melu: Melu | null | undefined): Tuomio {
  if (!melu) return { taso: "tuntematon", otsikko: "Ei tietoa", selitys: "Melutietoa ei saatu.", db: null };
  const arvot = [melu.maantiet.paiva, melu.rautatiet.paiva, melu.helsinkiYhteismelu].map(alaraja).filter((n): n is number => n != null);
  const db = arvot.length ? Math.max(...arvot) : null;
  if (db == null || db < 50)
    return { taso: "hyva", otsikko: "Hiljainen", selitys: "Ei merkittävää tie- tai raideliikenteen melua.", db };
  if (db < OHJEARVO_PAIVA)
    return { taso: "hyva", otsikko: "Kohtalainen", selitys: `Liikenne kuuluu (${db}–${db + 5} dB), mutta jää asuinalueiden ohjearvon alle.`, db };
  if (db < 65)
    return { taso: "huomio", otsikko: "Meluisa", selitys: `Melu ylittää asuinalueiden ohjearvon 55 dB päivällä (${db}–${db + 5} dB). Tarkista ikkunoiden suunta.`, db };
  return { taso: "vakava", otsikko: "Erittäin meluisa", selitys: `Päiväajan melu ${db} dB tai yli – selvästi yli ohjearvon.`, db };
}

/** Desibelivyöhyke tekstinä: 60 → "60–65 dB", 65 → "yli 65 dB", null → "alle 45 dB". */
export const meluVyohyke = (db: number | null) => (db == null ? "alle 45 dB" : db >= 65 ? "yli 65 dB" : `${db}–${db + 5} dB`);

export const minuuttia = (n: number | null | undefined) => (n == null ? "–" : `${n} min`);
export const km = (n: number) => `${n.toFixed(1).replace(".", ",")} km`;

/** Kävelyetäisyyden tarkkuus riittää: alle kilometri 10 metrin tarkkuudella, muuten 0,1 km. */
export const etaisyys = (km: number) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(1).replace(".", ",")} km`);

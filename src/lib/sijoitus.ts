import "server-only";
import { alueenVuokrat, kaikkiAlueet, kunta as haeKunta, type Alue } from "./data";

// Sijoittajalle-osion tunnusluvut: bruttovuokratuotto huoneluvuittain hinnoista ja vuokrista.

export const HUONETYYPIT = [
  ["yksiot", "Yksiöt"],
  ["kaksiot", "Kaksiot"],
  ["kolmiot", "Kolmiot+"],
] as const;

export type Huonetyyppi = (typeof HUONETYYPIT)[number][0];

export type TyypinTuotto = {
  tyyppi: Huonetyyppi;
  /** Alueen neliöhinta viimeisimmältä vuodelta; null, jos kauppoja liian vähän. */
  hinta: number | null;
  /** Vapaarahoitteinen keskineliövuokra €/m²/kk vuokratilaston alueelta. */
  vuokra: number | null;
  /** Bruttovuokratuotto (vuosivuokra / hinta), esim. 0.052. */
  tuotto: number | null;
  /** Uudenmaan postinumeroiden bruttotuottojen mediaani samalle tyypille. */
  mediaani: number | null;
  /** Osuus Uudenmaan alueista, joilla tuotto on pienempi (0–1). */
  sijoitus: number | null;
  /** Neliöhinnan keskimääräinen vuosimuutos viiden vuoden ajalta, esim. −0.012. */
  hintamuutos: number | null;
};

const tuotto = (vuokra: number | null | undefined, hinta: number | null | undefined) =>
  vuokra != null && hinta ? (vuokra * 12) / hinta : null;

const karkea = (koodi: string) => (koodi === "MK01" ? "uusimaa" : koodi === "keh" ? "kehyskunnat" : null);

/** Vertailuun vain alueet, joilla on oman kaupungin vuokrat: koko Uudenmaan keskivuokra halvoilla alueilla vääristäisi tuottoja ylös. */
function tyypinTuotto(alue: Alue, t: Huonetyyppi) {
  const v = alueenVuokrat(alue);
  if (!v || karkea(v.alue.koodi)) return null;
  return tuotto(v.alue.tyypit[t].vapaa, alue.hinnat.at(-1)?.[t]);
}

const mediaani = (arvot: number[]) => {
  if (!arvot.length) return null;
  const s = [...arvot].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Uudenmaan tuotot tyypeittäin vertailua varten (lasketaan kerran).
let kaikkiTuotot: Record<Huonetyyppi, number[]> | null = null;
function uudenmaanTuotot() {
  if (!kaikkiTuotot) {
    const alueet = kaikkiAlueet();
    kaikkiTuotot = Object.fromEntries(
      HUONETYYPIT.map(([t]) => [t, alueet.map((a) => tyypinTuotto(a, t)).filter((x): x is number => x != null)]),
    ) as Record<Huonetyyppi, number[]>;
  }
  return kaikkiTuotot;
}

/** Vuotuinen muutos viiden vuoden päästä (geometrinen keskiarvo). */
function hintamuutos(alue: Alue, t: Huonetyyppi) {
  const viimeisin = alue.hinnat.at(-1);
  const vanha = alue.hinnat.find((h) => h.vuosi === (viimeisin?.vuosi ?? 0) - 5);
  const uusi = viimeisin?.[t];
  const ennen = vanha?.[t];
  return uusi != null && ennen ? (uusi / ennen) ** (1 / 5) - 1 : null;
}

export type AlueenTuotot = {
  vuosi: number | null;
  /** Vuokratilaston alue, jolta vuokrat ovat. */
  vuokraAlue: string;
  /** Vuokrat ovat koko Uudenmaan tai kehyskuntien keskiarvoja – tuotto on silloin vain suuntaa-antava. */
  karkea: "uusimaa" | "kehyskunnat" | null;
  tyypit: TyypinTuotto[];
  /** Kunnan kerrostalojen neliöhinta laskurin oletukseksi, kun alueelta ei ole omaa hintaa. */
  kuntaHinta: number | null;
};

export function alueenTuotot(alue: Alue): AlueenTuotot | null {
  const v = alueenVuokrat(alue);
  if (!v) return null;
  const kaikki = uudenmaanTuotot();
  const tyypit = HUONETYYPIT.map(([t]): TyypinTuotto => {
    const hinta = alue.hinnat.at(-1)?.[t] ?? null;
    const vuokra = v.alue.tyypit[t].vapaa;
    const oma = tuotto(vuokra, hinta);
    const lista = kaikki[t];
    return {
      tyyppi: t,
      hinta,
      vuokra,
      tuotto: oma,
      mediaani: mediaani(lista),
      sijoitus: oma != null && lista.length && !karkea(v.alue.koodi) ? lista.filter((x) => x < oma).length / lista.length : null,
      hintamuutos: hintamuutos(alue, t),
    };
  });
  return {
    vuosi: alue.hinnat.at(-1)?.vuosi ?? null,
    vuokraAlue: v.alue.nimi,
    karkea: karkea(v.alue.koodi),
    tyypit,
    kuntaHinta: haeKunta(alue.kunta).hinnat.at(-1)?.kerrostalot ?? null,
  };
}

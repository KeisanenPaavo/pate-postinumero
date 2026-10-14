import "server-only";
import { kerrostaloHinta, kunta as haeKunta, type Alue } from "./data";
import { euroa, genetiivi } from "./muotoilu";

// Raporttisivun ja vertailun yhteiset tunnusluvut (sama muotoilu molemmissa).

/** "+12 %" / "−15 %" */
export const muutos = (uusi: number, vanha: number) => {
  const pct = Math.round((uusi / vanha - 1) * 100);
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)} %`;
};

/** Hinta suhteessa kuntaan: "8 % yli Helsingin keskitason" / "Helsingin keskitasoa". */
export function suhdeKuntaan(arvo: number | null | undefined, vertailu: number | null | undefined, kuntaNimi: string) {
  if (arvo == null || !vertailu) return null;
  const pct = Math.round((arvo / vertailu - 1) * 100);
  if (Math.abs(pct) < 3) return `${genetiivi(kuntaNimi)} keskitasoa`;
  return `${Math.abs(pct)} % ${pct > 0 ? "yli" : "alle"} ${genetiivi(kuntaNimi)} keskitason`;
}

export type AlueenHinta = {
  arvo: string;
  alateksti: string;
  /** Kerrostalojen neliöhinta euroina (vertailun järjestykseen); null jos ei tietoa. */
  euroa: number | null;
  /** true, jos alueelta ei ole omaa hintaa ja luku on kunnan keskiarvo. */
  kunnanKeskiarvo: boolean;
  /** "8 % yli Helsingin keskitason" tai null. */
  suhde: string | null;
};

/** Kerrostalojen neliöhinta tiivistelmään: alueen oma hinta, muutos 5 vuodessa ja suhde kuntaan. */
export function alueenHinta(alue: Alue): AlueenHinta {
  const k = haeKunta(alue.kunta);
  const viimeisin = alue.hinnat.at(-1);
  const hinta = viimeisin ? kerrostaloHinta(viimeisin) : null;
  const viiden = alue.hinnat.find((h) => h.vuosi === (viimeisin?.vuosi ?? 0) - 5);
  const hinta5 = viiden ? kerrostaloHinta(viiden) : null;
  const kuntaHinta = k.hinnat.at(-1);
  const suhde = suhdeKuntaan(hinta?.hinta, kuntaHinta?.kerrostalot, k.nimi);
  if (!hinta)
    return {
      arvo: `${euroa(kuntaHinta?.kerrostalot)}/m²`,
      alateksti: `${k.nimi} keskimäärin – alueelta liian vähän kauppoja`,
      euroa: kuntaHinta?.kerrostalot ?? null,
      kunnanKeskiarvo: true,
      suhde: null,
    };
  return {
    arvo: `${euroa(hinta.hinta)}/m²`,
    alateksti: [suhde, hinta5 ? `${muutos(hinta.hinta, hinta5.hinta)} vuodesta ${viiden!.vuosi}` : `${hinta.lkm} kauppaa ${viimeisin!.vuosi}`]
      .filter(Boolean)
      .join(" · "),
    euroa: hinta.hinta,
    kunnanKeskiarvo: false,
    suhde,
  };
}

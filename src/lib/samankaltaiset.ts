import "server-only";
import { kaikkiAlueet, type Alue, type Paavo } from "./data";

// Samankaltaiset alueet: asukasrakenne ja rakennuskanta (Paavo) standardoituna Uudenmaan alueiden kesken.
// Hinta ei ole mukana laskennassa, jotta sivulla voi näyttää samanlaisia alueita eri hintatasoilla.

/** Alle tämän asukasmäärän alueiden luvut ovat epävakaita (ja osin salattuja), joten niitä ei ehdoteta. */
const MIN_ASUKKAAT = 200;

const osuus = (osa: number | null, koko: number | null) => (osa == null || !koko ? null : osa / koko);

/** Piirre ja sen paino etäisyydessä. */
const PIIRTEET: [string, number, (p: Paavo) => number | null][] = [
  ["tulot", 1.5, (p) => p.hr_mtu],
  ["keski-ikä", 1, (p) => p.he_kika],
  ["korkeakoulutetut", 1, (p) => osuus((p.ko_al_kork ?? 0) + (p.ko_yl_kork ?? 0), p.ko_ika18y)],
  ["lapsitaloudet", 1, (p) => osuus(p.te_laps, p.te_taly)],
  ["yksinasuvat", 1, (p) => osuus(p.te_yks, p.te_taly)],
  ["omistusasunnot", 1, (p) => osuus(p.te_omis_as, p.te_taly)],
  ["kerrostalot", 1.5, (p) => osuus(p.ra_kt_as, p.ra_asunn)],
  // Asukastiheys logaritmina: erottaa kantakaupungin, lähiöt ja haja-asutusalueet.
  ["tiheys", 1.5, (p) => (p.he_vakiy && p.pinta_ala ? Math.log10(p.he_vakiy / (p.pinta_ala / 1e6)) : null)],
];

type Vektori = (number | null)[];

function laske() {
  const alueet = kaikkiAlueet().filter((a) => (a.paavo.he_vakiy ?? 0) >= MIN_ASUKKAAT);
  const raaka = alueet.map((a) => PIIRTEET.map(([, , f]) => f(a.paavo)));
  // z-pisteet: (arvo − keskiarvo) / keskihajonta Uudenmaan alueiden kesken.
  const tilastot = PIIRTEET.map((_, i) => {
    const arvot = raaka.map((r) => r[i]).filter((v): v is number => v != null);
    const ka = arvot.reduce((s, v) => s + v, 0) / arvot.length;
    const sd = Math.sqrt(arvot.reduce((s, v) => s + (v - ka) ** 2, 0) / arvot.length) || 1;
    return { ka, sd };
  });
  const vektorit = new Map<string, Vektori>(
    alueet.map((a, j) => [a.pno, raaka[j].map((v, i) => (v == null ? null : (v - tilastot[i].ka) / tilastot[i].sd))]),
  );
  return { alueet, vektorit };
}

let valimuisti: ReturnType<typeof laske> | null = null;

function etaisyys(a: Vektori, b: Vektori) {
  let summa = 0;
  let painot = 0;
  PIIRTEET.forEach(([, w], i) => {
    if (a[i] == null || b[i] == null) return;
    summa += w * (a[i]! - b[i]!) ** 2;
    painot += w;
  });
  return painot ? Math.sqrt(summa / painot) : Infinity;
}

/** Asukasrakenteeltaan ja rakennuskannaltaan lähimmät Uudenmaan postinumeroalueet. */
export function samankaltaisetAlueet(alue: Alue, maara = 5): Alue[] {
  valimuisti ??= laske();
  const oma = valimuisti.vektorit.get(alue.pno);
  if (!oma) return [];
  return valimuisti.alueet
    .filter((a) => a.pno !== alue.pno)
    .map((a) => ({ a, d: etaisyys(oma, valimuisti!.vektorit.get(a.pno)!) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, maara)
    .map((x) => x.a);
}

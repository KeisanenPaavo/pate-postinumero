"use client";

import { useState } from "react";
import { eur, HOITOVASTIKE_M2, Kentta, kuukausiera, lue, pros, pyorista, TyyppiValinta, VARAINSIIRTOVERO, type LaskurinTyyppi } from "./laskuri";

function oletukset(t: LaskurinTyyppi, varaHinta: number | null) {
  const hinta = t.hinta ?? varaHinta;
  return {
    ala: String(t.ala),
    myyntihinta: hinta ? String(pyorista(hinta * t.ala, 1000)) : "",
    yhtiolaina: "0",
    vuokra: t.vuokra ? String(pyorista(t.vuokra * t.ala, 10)) : "",
    hoitovastike: String(pyorista(HOITOVASTIKE_M2 * t.ala, 5)),
    rahoitusvastike: "0",
  };
}

export type TuottoSyotteet = {
  myyntihinta: number;
  yhtiolaina: number;
  /** €/kk */
  vuokra: number;
  hoitovastike: number;
  rahoitusvastike: number;
  tyhjatKuukaudet: number;
  /** Pankkilainan osuus myyntihinnasta, 0–1. */
  lainaosuus: number;
  korko: number;
  lainaAika: number;
};

/**
 * Sijoitusasunnon ensimmäisen vuoden luvut. Tuotot ovat null, kun hintaa tai vuokraa ei ole. Nettotuotossa
 * vuokrat tyhjien kuukausien jälkeen miinus hoitovastikkeet, jaettuna velattomalla hinnalla + varainsiirtoverolla.
 */
export function tuottolaskelma(s: TuottoSyotteet) {
  const velaton = s.myyntihinta + s.yhtiolaina;
  const vuokrakuukaudet = Math.min(12, Math.max(0, 12 - s.tyhjatKuukaudet));
  const pankkilaina = s.myyntihinta * Math.min(1, Math.max(0, s.lainaosuus));
  const era = kuukausiera(pankkilaina, s.korko, s.lainaAika);
  const vero = velaton * VARAINSIIRTOVERO;
  const omaPaaoma = s.myyntihinta - pankkilaina + vero;

  const vuosivuokra = s.vuokra * vuokrakuukaudet;
  const nettovuokra = vuosivuokra - s.hoitovastike * 12;
  const kassavirta = vuosivuokra / 12 - s.hoitovastike - s.rahoitusvastike - era;
  // Ensimmäisen vuoden lyhennykset: erät miinus korot, korot laskettuna kuukausittain pienenevästä pääomasta.
  let jaljella = pankkilaina;
  let lyhennykset = 0;
  for (let i = 0; i < 12 && era > 0; i++) {
    const lyhennys = era - jaljella * (s.korko / 12);
    lyhennykset += lyhennys;
    jaljella -= lyhennys;
  }

  const valmis = velaton > 0 && s.vuokra > 0;
  return {
    velaton,
    vero,
    pankkilaina,
    era,
    omaPaaoma,
    kassavirta,
    lyhennykset,
    brutto: valmis ? (s.vuokra * 12) / velaton : null,
    netto: valmis ? nettovuokra / (velaton + vero) : null,
    omanPaaomanTuotto: valmis && omaPaaoma > 0 ? (kassavirta * 12 + lyhennykset) / omaPaaoma : null,
  };
}

/**
 * Sijoitusasunnon tuottolaskuri: oletukset alueen neliöhinnoista ja -vuokrista, käyttäjä korjaa kohteen omilla luvuilla.
 * Laskee brutto- ja nettovuokratuoton, kuukausittaisen kassavirran ja oman pääoman tuoton ensimmäiseltä vuodelta.
 */
export function Tuottolaskuri({ tyypit, varaHinta }: { tyypit: LaskurinTyyppi[]; varaHinta: number | null }) {
  const [tyyppi, setTyyppi] = useState(tyypit[1]?.avain ?? tyypit[0].avain);
  const [kohde, setKohde] = useState(() => oletukset(tyypit.find((t) => t.avain === tyyppi)!, varaHinta));
  const [rahoitus, setRahoitus] = useState({ lainaosuus: "70", korko: "3,5", laina_aika: "25", tyhjat: "0,5" });

  const valitse = (avain: string) => {
    setTyyppi(avain);
    setKohde(oletukset(tyypit.find((t) => t.avain === avain)!, varaHinta));
  };

  const l = tuottolaskelma({
    myyntihinta: lue(kohde.myyntihinta),
    yhtiolaina: lue(kohde.yhtiolaina),
    vuokra: lue(kohde.vuokra),
    hoitovastike: lue(kohde.hoitovastike),
    rahoitusvastike: lue(kohde.rahoitusvastike),
    tyhjatKuukaudet: lue(rahoitus.tyhjat),
    lainaosuus: lue(rahoitus.lainaosuus) / 100,
    korko: lue(rahoitus.korko) / 100,
    lainaAika: lue(rahoitus.laina_aika),
  });
  const { velaton, vero, era, omaPaaoma, kassavirta, lyhennykset } = l;

  const valmis = l.brutto != null;
  const tulokset = [
    { nimi: "Bruttovuokratuotto", arvo: l.brutto != null ? pros.format(l.brutto) : "–", selite: "vuosivuokra / velaton hinta" },
    {
      nimi: "Nettovuokratuotto",
      arvo: l.netto != null ? pros.format(l.netto) : "–",
      selite: "vuokrat − hoitovastikkeet / velaton hinta + varainsiirtovero",
    },
    {
      nimi: "Kassavirta",
      arvo: valmis ? `${eur(kassavirta)}/kk` : "–",
      selite: era > 0 ? `lainan erä ${eur(era)}/kk, josta lyhennystä noin ${eur(lyhennykset / 12)}` : "ilman pankkilainaa",
      korostus: valmis ? (kassavirta < 0 ? "text-accent" : "text-good") : "",
    },
    {
      nimi: "Oman pääoman tuotto",
      arvo: l.omanPaaomanTuotto != null ? pros.format(l.omanPaaomanTuotto) : "–",
      selite: `kassavirta + lyhennykset / oma pääoma ${eur(omaPaaoma)}`,
    },
  ];

  const kentta = (ryhma: "kohde" | "rahoitus", avain: string, nimi: string, yksikko: string) => {
    const arvot: Record<string, string> = ryhma === "kohde" ? kohde : rahoitus;
    const aseta = (arvo: string) =>
      ryhma === "kohde" ? setKohde((a) => ({ ...a, [avain]: arvo })) : setRahoitus((a) => ({ ...a, [avain]: arvo }));
    return <Kentta key={avain} nimi={nimi} yksikko={yksikko} arvo={arvot[avain]} onChange={aseta} />;
  };

  return (
    <div className="border-t-[3px] border-ink pt-4">
      <h3 className="font-semibold">Tuottolaskuri</h3>
      <p className="mt-1 max-w-[640px] text-[15px] text-muted">
        Oletukset ovat alueen keskihintoja ja -vuokria. Korjaa ne kohteen myynti-ilmoituksen luvuilla.
      </p>
      <TyyppiValinta tyypit={tyypit} valittu={tyyppi} onValitse={valitse} />

      <div className="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="grid content-start gap-x-4 gap-y-3 sm:grid-cols-2">
          {kentta("kohde", "myyntihinta", "Myyntihinta", "€")}
          {kentta("kohde", "yhtiolaina", "Yhtiölainaosuus", "€")}
          {kentta("kohde", "ala", "Pinta-ala", "m²")}
          {kentta("kohde", "vuokra", "Vuokra", "€/kk")}
          {kentta("kohde", "hoitovastike", "Hoitovastike", "€/kk")}
          {kentta("kohde", "rahoitusvastike", "Rahoitusvastike", "€/kk")}
          {kentta("rahoitus", "lainaosuus", "Pankkilaina", "% myyntihinnasta")}
          {kentta("rahoitus", "korko", "Korko", "%")}
          {kentta("rahoitus", "laina_aika", "Laina-aika", "vuotta")}
          {kentta("rahoitus", "tyhjat", "Tyhjät kuukaudet", "kk/vuosi")}
        </div>

        <div className="self-start">
          <dl aria-live="polite" className="border-t border-ink">
            {tulokset.map((r) => (
              <div key={r.nimi} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-grid py-3">
                <dt>{r.nimi}</dt>
                <dd className={`font-serif text-[1.625rem] leading-none font-semibold tabular ${r.korostus ?? ""}`}>{r.arvo}</dd>
                <dd className="mt-1 basis-full text-[13px] text-muted">{r.selite}</dd>
              </div>
            ))}
          </dl>
          <p className="pt-3 text-[13px] text-muted">
            Velaton hinta {valmis ? eur(velaton) : "–"}, varainsiirtovero {valmis ? eur(vero) : "–"} (1,5 %). Hoitovastikkeen oletus on{" "}
            {HOITOVASTIKE_M2.toLocaleString("fi-FI")} €/m². Luvut ovat ennen veroja eivätkä sisällä remontteja, vakuutuksia tai
            arvonmuutosta. Rahoitusvastike on laskettu kokonaan kuluksi.
          </p>
        </div>
      </div>
    </div>
  );
}

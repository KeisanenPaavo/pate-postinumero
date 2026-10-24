"use client";

import { useId } from "react";

// Tuottolaskurin ja vuokra vai oma -laskurin yhteiset osat: syötekentät, asuntotyypin valinta ja laskukaavat.

export type LaskurinTyyppi = {
  avain: string;
  nimi: string;
  /** Oletuspinta-ala, m². */
  ala: number;
  /** Alueen neliöhinta ja -vuokra oletusarvoiksi. */
  hinta: number | null;
  vuokra: number | null;
};

/** Asunto-osakkeen varainsiirtovero velattomasta hinnasta (1.1.2024 alkaen). */
export const VARAINSIIRTOVERO = 0.015;
/** Hoitovastikkeen oletus €/m²/kk, kun ilmoituksen lukua ei ole syötetty. */
export const HOITOVASTIKE_M2 = 4.5;

const luku = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 });
export const pros = new Intl.NumberFormat("fi-FI", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const eur = (n: number) => `${n < 0 ? "−" : ""}${luku.format(Math.abs(n))} €`;
export const pyorista = (n: number, tarkkuus: number) => Math.round(n / tarkkuus) * tarkkuus;
/** Syötekentän luku: välilyönnit pois, desimaalipilkku käy. */
export const lue = (s: string) => {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Annuiteettilainan kuukausierä. */
export function kuukausiera(laina: number, vuosikorko: number, vuotta: number) {
  const n = vuotta * 12;
  if (laina <= 0 || n <= 0) return 0;
  const r = vuosikorko / 12;
  return r === 0 ? laina / n : (laina * r) / (1 - (1 + r) ** -n);
}

export function Kentta({
  nimi,
  yksikko,
  arvo,
  onChange,
  vihje,
}: {
  nimi: string;
  yksikko: string;
  arvo: string;
  onChange: (arvo: string) => void;
  vihje?: string | null;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold">{nimi}</span>
      <span className="mt-1 flex min-h-11 items-center border border-ink bg-page focus-within:outline-2 focus-within:outline-accent">
        <input
          inputMode="decimal"
          value={arvo}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent px-2 py-2 text-right tabular outline-none"
        />
        <span className="shrink-0 pr-2 text-[13px] text-muted">{yksikko}</span>
      </span>
      {vihje && <span className="mt-0.5 block text-[12px] text-muted">{vihje}</span>}
    </label>
  );
}

export function TyyppiValinta({ tyypit, valittu, onValitse }: { tyypit: LaskurinTyyppi[]; valittu: string; onValitse: (avain: string) => void }) {
  const id = useId();
  return (
    <fieldset className="mt-4">
      <legend className="sr-only">Asunnon tyyppi</legend>
      <div className="flex flex-wrap gap-2">
        {tyypit.map((t) => (
          <label
            key={t.avain}
            className={`flex min-h-11 cursor-pointer items-center border px-4 text-[15px] ${
              t.avain === valittu ? "border-ink bg-ink text-page" : "border-rule hover:border-ink"
            }`}
          >
            <input type="radio" name={`${id}-tyyppi`} value={t.avain} checked={t.avain === valittu} onChange={() => onValitse(t.avain)} className="sr-only" />
            {t.nimi}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

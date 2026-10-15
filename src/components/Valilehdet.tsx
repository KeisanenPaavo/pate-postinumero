"use client";

import { useEffect, useId, useMemo, useRef, useSyncExternalStore } from "react";
import { selainLista } from "./osoite/yhteiset";

export type Valilehti = { avain: string; nimi: string; sisalto: React.ReactNode };

const varastot = new Map<string, ReturnType<typeof selainLista<string>>>();
const varasto = (ryhma: string) => {
  if (!varastot.has(ryhma)) varastot.set(ryhma, selainLista<string>(`valilehti:${ryhma}`, 1));
  return varastot.get(ryhma)!;
};

/**
 * Välilehdet osion sisällä. Valinta muistetaan selaimessa (sama valinta seuraavalla alueella), ja
 * osoitteen #avain (esim. tiivistelmän linkki #vuokrat) avaa välilehden ja vierittää sen näkyviin.
 * Kaikki paneelit renderöidään (piilotettuina), jotta sisältö on sivun HTML:ssä.
 */
export function Valilehdet({ ryhma, valilehdet }: { ryhma: string; valilehdet: Valilehti[] }) {
  const v = varasto(ryhma);
  const raw = useSyncExternalStore(v.tilaa, v.lue, () => "[]");
  const tallennettu = useMemo(() => v.jasenna(raw)[0], [v, raw]);
  const valittu = valilehdet.some((t) => t.avain === tallennettu) ? tallennettu! : valilehdet[0].avain;
  const id = useId();
  const lista = useRef<HTMLDivElement>(null);
  const avaimet = valilehdet.map((t) => t.avain).join(" ");

  useEffect(() => {
    const avaaHashista = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!avaimet.split(" ").includes(hash)) return;
      v.tallenna([hash]);
      // Paneeli on piilossa ennen valintaa, joten selain ei vieritä siihen itse.
      requestAnimationFrame(() => lista.current?.scrollIntoView({ block: "start" }));
    };
    avaaHashista();
    window.addEventListener("hashchange", avaaHashista);
    return () => window.removeEventListener("hashchange", avaaHashista);
  }, [v, avaimet]);

  const valitse = (avain: string, fokus = false) => {
    v.tallenna([avain]);
    if (fokus) document.getElementById(`${id}-${avain}-tab`)?.focus();
  };
  const nappain = (e: React.KeyboardEvent, i: number) => {
    const siirto = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!siirto) return;
    e.preventDefault();
    valitse(valilehdet[(i + siirto + valilehdet.length) % valilehdet.length].avain, true);
  };

  return (
    <div>
      <div ref={lista} role="tablist" className="flex scroll-mt-28 gap-6 overflow-x-auto border-b border-rule [scrollbar-width:none] sm:scroll-mt-16">
        {valilehdet.map((t, i) => {
          const on = t.avain === valittu;
          return (
            <button
              key={t.avain}
              id={`${id}-${t.avain}-tab`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${id}-${t.avain}`}
              tabIndex={on ? 0 : -1}
              onClick={() => valitse(t.avain)}
              onKeyDown={(e) => nappain(e, i)}
              className={`-mb-px min-h-11 border-b-2 text-[15px] font-semibold whitespace-nowrap ${on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.nimi}
            </button>
          );
        })}
      </div>
      {valilehdet.map((t) => (
        <div
          key={t.avain}
          id={`${id}-${t.avain}`}
          role="tabpanel"
          aria-labelledby={`${id}-${t.avain}-tab`}
          hidden={t.avain !== valittu}
          className="pt-5"
        >
          {t.sisalto}
        </div>
      ))}
    </div>
  );
}

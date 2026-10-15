"use client";

import { useState } from "react";
import { KULKUTAVAT, PALVELUAIHEET, useAsetukset, type Aihe } from "./yhteiset";

/**
 * "Mukauta raporttia": käyttäjä valitsee, näytetäänkö päiväkodit ja koulut sekä mitkä kulkutavat
 * matka-ajoissa. Valinnat tallentuvat selaimeen ja koskevat kaikkia raportteja ja vertailua.
 */
export function RaportinAsetukset() {
  const a = useAsetukset();
  const [auki, setAuki] = useState(false);
  const valinta = ({ avain, nimi }: { avain: Aihe; nimi: string }, viimeinen = false) => (
    <label key={avain} className={`flex min-h-11 items-center gap-2.5 ${viimeinen ? "text-muted" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        className="size-[18px] accent-[var(--accent)]"
        checked={a.nakyy(avain)}
        disabled={viimeinen}
        onChange={(e) => a.aseta(avain, e.target.checked)}
      />
      {nimi}
    </label>
  );
  const ainoaKulkutapa = a.kulkutavat.length === 1 ? a.kulkutavat[0].avain : null;

  return (
    <div className="contents">
      <button type="button" aria-expanded={auki} onClick={() => setAuki(!auki)} className="linkki min-h-11">
        Mukauta raporttia{a.piilotettuja ? ` (${a.piilotettuja} piilotettu)` : ""}
      </button>
      {auki && (
        <div className="mt-2 mb-2 basis-full border-l-[3px] border-ink bg-grid px-4 py-3">
          <div className="grid gap-x-10 gap-y-3 sm:grid-cols-[auto_auto] sm:justify-start">
            <fieldset>
              <legend className="font-semibold">Lähipalvelut</legend>
              {PALVELUAIHEET.map((p) => valinta(p))}
            </fieldset>
            <fieldset>
              <legend className="font-semibold">Matka-ajat</legend>
              <div className="grid grid-cols-2 gap-x-6">{KULKUTAVAT.map((k) => valinta(k, k.avain === ainoaKulkutapa))}</div>
            </fieldset>
          </div>
          <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 text-[13px] text-muted">
            <span>Piilotetut tiedot jätetään pois raporteista ja vertailusta. Valinnat tallentuvat vain tähän selaimeen.</span>
            <button type="button" onClick={() => setAuki(false)} className="min-h-11 text-sm font-medium text-ink-2 underline hover:text-ink">
              Valmis
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

/** Näyttää sisällön vain, jos aihetta ei ole piilotettu (esim. koko Koulut-osio). */
export function Piilotettava({ aihe, children }: { aihe: Aihe; children: React.ReactNode }) {
  return useAsetukset().nakyy(aihe) ? children : null;
}

/** Yläpalkin osiolinkit ilman piilotettuja osioita. */
export function OsioLinkit({ osiot }: { osiot: readonly (readonly [string, string, Aihe?])[] }) {
  const a = useAsetukset();
  return (
    <ul className="flex whitespace-nowrap text-sm font-medium">
      {osiot
        .filter(([, , aihe]) => !aihe || a.nakyy(aihe))
        .map(([id, nimi]) => (
          <li key={id}>
            <a href={`#${id}`} className="inline-flex min-h-11 items-center px-2.5 hover:text-accent hover:underline">
              {nimi}
            </a>
          </li>
        ))}
    </ul>
  );
}

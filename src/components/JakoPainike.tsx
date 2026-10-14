"use client";

import { useState } from "react";

/**
 * Jakaa linkin: kosketuslaitteilla järjestelmän jakovalikko (navigator.share), muuten kopiointi leikepöydälle.
 * Jos kopiointi ei onnistu (esim. selain estää), linkki näytetään valmiiksi valittuna kenttänä.
 */
export function JakoPainike({ teksti, otsikko, url }: { teksti: string; otsikko: string; url: () => string }) {
  const [tila, setTila] = useState<"kopioitu" | "kasin" | null>(null);
  const [linkki, setLinkki] = useState("");

  async function jaa() {
    const osoite = url();
    const kosketus = window.matchMedia("(pointer: coarse)").matches;
    if (kosketus && navigator.share) {
      try {
        await navigator.share({ title: otsikko, url: osoite });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // käyttäjä sulki jakovalikon
      }
    }
    try {
      await navigator.clipboard.writeText(osoite);
      setTila("kopioitu");
      setTimeout(() => setTila(null), 3000);
    } catch {
      setLinkki(osoite);
      setTila("kasin");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3">
      <button type="button" onClick={jaa} className="linkki min-h-11">
        {teksti}
      </button>
      <span role="status" className="text-sm text-good">
        {tila === "kopioitu" ? "Linkki kopioitu leikepöydälle" : ""}
      </span>
      {tila === "kasin" && (
        <input
          readOnly
          value={linkki}
          aria-label="Jaettava linkki"
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
          className="min-h-11 w-full max-w-md border border-ink bg-page px-2 text-sm"
        />
      )}
    </span>
  );
}

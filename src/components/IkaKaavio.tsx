"use client";

import { useState } from "react";

export type IkaRyhma = { nimi: string; alue: number | null; vertailu: number | null };

const pct = (v: number | null) => (v == null ? "–" : `${(v * 100).toFixed(1).replace(".", ",")} %`);

/** Ikäryhmien osuudet: alue mustana palkkina, kunta harmaana merkkinä. */
export function IkaKaavio({ ryhmat, alueNimi, vertailuNimi }: { ryhmat: IkaRyhma[]; alueNimi: string; vertailuNimi: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...ryhmat.flatMap((r) => [r.alue ?? 0, r.vertailu ?? 0]), 0.01);

  return (
    <figure>
      <table className="w-full text-sm">
        <caption className="sr-only">Asukkaiden ikäjakauma, osuus asukkaista</caption>
        <thead className="sr-only">
          <tr>
            <th>Ikäryhmä</th>
            <th>{alueNimi}</th>
            <th>{vertailuNimi}</th>
          </tr>
        </thead>
        <tbody className="border-t border-ink">
          {ryhmat.map((r, i) => (
            <tr key={r.nimi} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className="border-b border-grid">
              <th scope="row" className="w-16 py-1.5 pr-2 text-left font-normal tabular">
                {r.nimi}
              </th>
              <td className="py-1.5">
                <div className="relative h-3.5">
                  {r.alue != null && <div className="absolute inset-y-0 left-0 bg-series-1" style={{ width: `${(r.alue / max) * 100}%` }} />}
                  {r.vertailu != null && (
                    <div
                      className="absolute -inset-y-1 w-[3px] bg-series-2 ring-2 ring-page"
                      style={{ left: `calc(${(r.vertailu / max) * 100}% - 1.5px)` }}
                    />
                  )}
                </div>
              </td>
              <td className="w-32 py-1.5 pl-3 text-right tabular">
                <span className="font-semibold">{pct(r.alue)}</span>
                <span className={`text-muted ${hover === i ? "" : "sr-only"}`}> ({pct(r.vertailu)})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 text-[13px] text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-3 bg-series-1" />
          {alueNimi}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-[3px] bg-series-2" />
          {vertailuNimi}
        </span>
        <span>Osuus asukkaista</span>
      </figcaption>
    </figure>
  );
}

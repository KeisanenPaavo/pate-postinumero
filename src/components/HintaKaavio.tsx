"use client";

import { useEffect, useRef, useState } from "react";

type Rivi = { vuosi: number; alue: number | null; kunta: number | null };

const M = { top: 30, right: 12, bottom: 28, left: 52 };
const fmt = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 });

/**
 * Kerrostalojen neliöhinta: alue mustalla, kunta harmaalla, alueen huippuvuosi punaisella pisteellä.
 * Arvot luetaan suoraan selitteestä ja hover-tiedosta; sama data taulukkona avattavissa.
 */
export function HintaKaavio({ data, alueNimi, kuntaNimi }: { data: Rivi[]; alueNimi: string; kuntaNimi: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // viewBox seuraa todellista leveyttä, jotta tekstit pysyvät luettavan kokoisina myös mobiilissa.
  const kehys = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(700);
  useEffect(() => {
    const el = kehys.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 520 ? 220 : 260;
  const sarjat = [
    { key: "kunta" as const, nimi: kuntaNimi, vari: "var(--series-2)", leveys: 2 },
    { key: "alue" as const, nimi: alueNimi, vari: "var(--series-1)", leveys: 3 },
  ];

  const arvot = data.flatMap((d) => [d.alue, d.kunta]).filter((v): v is number => v != null);
  if (!arvot.length) return null;
  const step = 1000;
  const yMin = Math.floor(Math.min(...arvot) / step) * step;
  const yMax = Math.ceil(Math.max(...arvot) / step) * step;
  const ticks = Array.from({ length: Math.round((yMax - yMin) / step) + 1 }, (_, i) => yMin + i * step).filter(
    (_, i, a) => a.length <= 6 || i % 2 === 0,
  );
  const x = (i: number) => M.left + (i / Math.max(data.length - 1, 1)) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - M.top - M.bottom);

  // Katkaisee viivan kohdissa, joissa arvo puuttuu.
  const polut = (key: "alue" | "kunta") => {
    const out: string[] = [];
    let d = "";
    data.forEach((r, i) => {
      const v = r[key];
      if (v == null) {
        if (d) out.push(d);
        d = "";
      } else d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    if (d) out.push(d);
    return out;
  };

  const viimeinen = (key: "alue" | "kunta") => {
    for (let i = data.length - 1; i >= 0; i--) if (data[i][key] != null) return i;
    return -1;
  };

  let huippu = -1;
  data.forEach((r, i) => {
    if (r.alue != null && (huippu < 0 || r.alue > data[huippu].alue!)) huippu = i;
  });
  const huippuAnkkuri = huippu < 0 ? "middle" : x(huippu) > W - 80 ? "end" : x(huippu) < M.left + 60 ? "start" : "middle";

  const h = hover != null ? data[hover] : null;
  const iA = viimeinen("alue");
  const iK = viimeinen("kunta");

  return (
    <figure>
      <figcaption className="mb-2 text-[13px] text-muted">Kerrostalojen neliöhinta, €/m²</figcaption>
      <div ref={kehys} className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none overflow-visible"
          role="img"
          aria-label={`Kerrostalojen neliöhinta vuosina ${data[0].vuosi}–${data.at(-1)!.vuosi}: ${alueNimi} ja ${kuntaNimi}`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - M.left) / (W - M.left - M.right)) * (data.length - 1));
            setHover(Math.max(0, Math.min(data.length - 1, i)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--muted)" className="tabular">
                {fmt.format(t)}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="var(--axis)" />
          {data.map((r, i) =>
            (i % 4 === 0 && data.length - 1 - i >= 2) || i === data.length - 1 ? (
              <text
                key={r.vuosi}
                x={x(i)}
                y={H - M.bottom + 18}
                textAnchor={i === data.length - 1 ? "end" : i === 0 ? "start" : "middle"}
                fontSize={12}
                fill="var(--muted)"
                className="tabular"
              >
                {r.vuosi}
              </text>
            ) : null,
          )}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={M.top - 8} y2={H - M.bottom} stroke="var(--rule)" />}
          {sarjat.map((s) => (
            <g key={s.key}>
              {polut(s.key).map((d) => (
                <path key={d} d={d} fill="none" stroke={s.vari} strokeWidth={s.leveys} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {hover != null && data[hover][s.key] != null && (
                <circle cx={x(hover)} cy={y(data[hover][s.key]!)} r={4.5} fill={s.vari} stroke="var(--page)" strokeWidth={2} />
              )}
            </g>
          ))}
          {huippu >= 0 && huippu !== data.length - 1 && (
            <g>
              <circle cx={x(huippu)} cy={y(data[huippu].alue!)} r={5} fill="var(--accent)" />
              <text
                x={x(huippu)}
                y={y(data[huippu].alue!) - 12}
                textAnchor={huippuAnkkuri}
                fontSize={13}
                fill="var(--accent)"
                className="tabular"
              >
                {data[huippu].vuosi}: {fmt.format(data[huippu].alue!)} €
              </text>
            </g>
          )}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-0 border border-ink bg-page px-3 py-2 text-[13px]"
            style={{ left: `${(x(hover!) / W) * 100}%`, transform: hover! > data.length / 2 ? "translateX(-108%)" : "translateX(8%)" }}
          >
            <p className="mb-1 font-semibold">{h.vuosi}</p>
            {[...sarjat].reverse().map((s) => (
              <p key={s.key} className="flex items-center gap-1.5 whitespace-nowrap text-ink-2">
                <span className="inline-block h-0.5 w-3" style={{ background: s.vari }} />
                {s.nimi}: <span className="tabular text-ink">{h[s.key] != null ? `${fmt.format(h[s.key]!)} €/m²` : "ei tietoa"}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <p className="mt-3 text-sm text-muted">
        {iA >= 0 && (
          <>
            <span aria-hidden className="mr-1.5 inline-block h-[3px] w-4 bg-series-1 align-middle" />
            <strong className="font-semibold text-ink">{alueNimi}</strong> {fmt.format(data[iA].alue!)} €
            {iK >= 0 && " "}
          </>
        )}
        {iK >= 0 && (
          <>
            <span aria-hidden className="mr-1.5 ml-1 inline-block h-0.5 w-4 bg-series-2 align-middle" />
            <strong className="font-semibold text-ink-2">{kuntaNimi}</strong> {fmt.format(data[iK].kunta!)} €
          </>
        )}{" "}
        (€/m², {data[Math.max(iA, iK)].vuosi})
      </p>
      <details className="text-sm">
        <summary className="linkki min-h-11 cursor-pointer content-center">Näytä taulukkona</summary>
        <table className="mt-2 w-full max-w-md text-left text-sm tabular">
          <thead className="text-muted">
            <tr className="border-b border-ink">
              <th className="py-1.5 font-medium">Vuosi</th>
              <th className="py-1.5 text-right font-medium">{alueNimi}</th>
              <th className="py-1.5 text-right font-medium">{kuntaNimi}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.vuosi} className="border-b border-grid">
                <td className="py-1.5">{r.vuosi}</td>
                <td className="py-1.5 text-right">{r.alue != null ? `${fmt.format(r.alue)} €` : "–"}</td>
                <td className="py-1.5 text-right">{r.kunta != null ? `${fmt.format(r.kunta)} €` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

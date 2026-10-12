"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlueIkoni, HakuIkoni, SijaintiIkoni } from "./Ikonit";

export type Osoite = { nimi: string; lat: number; lon: number };
export type AlueValinta = { pno: string; nimi: string; kunta: string; slug: string };

type Ehdotus = { tyyppi: "alue"; alue: AlueValinta } | { tyyppi: "osoite"; osoite: Osoite };

const normalisoi = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Hakukenttä: katuosoitteet Digitransitista ja (valinnaisesti) postinumerot/aluenimet paikallisesti.
 * Käyttäjä valitsee osumista – ensimmäistä osumaa ei hyväksytä automaattisesti, koska geokooderi
 * korjaa kirjoitusvirheitä liian rohkeasti.
 */
export function OsoiteHaku({
  onValitse,
  onValitseAlue,
  alueet,
  placeholder = "Esim. Fleminginkatu 1, Helsinki",
  label = "Osoite",
  autoFocus,
  iso,
}: {
  onValitse: (o: Osoite) => void;
  onValitseAlue?: (a: AlueValinta) => void;
  alueet?: AlueValinta[];
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  iso?: boolean;
}) {
  const id = useId();
  const [teksti, setTeksti] = useState("");
  const [osumat, setOsumat] = useState<Osoite[]>([]);
  const [aktiivinen, setAktiivinen] = useState(-1);
  const [auki, setAuki] = useState(false);
  const [virhe, setVirhe] = useState<string | null>(null);
  const [vastattu, setVastattu] = useState<string | null>(null); // kysely, johon osumat vastaavat
  const pyynto = useRef(0);
  const q = teksti.trim();

  const alueOsumat: Ehdotus[] =
    alueet && q.length >= 2
      ? alueet
          .filter((a) => (/^\d+$/.test(q) ? a.pno.startsWith(q) : normalisoi(a.nimi).includes(normalisoi(q))))
          .slice(0, 4)
          .map((alue) => ({ tyyppi: "alue", alue }))
      : [];
  const ehdotukset: Ehdotus[] = [...alueOsumat, ...(q.length >= 3 ? osumat.map((osoite) => ({ tyyppi: "osoite" as const, osoite })) : [])];

  useEffect(() => {
    if (q.length < 3 || /^\d+$/.test(q)) return;
    const nro = ++pyynto.current;
    const ajastin = setTimeout(async () => {
      try {
        const res = await fetch(`/api/haku?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error();
        const data: Osoite[] = await res.json();
        if (nro !== pyynto.current) return;
        setOsumat(data);
        setVastattu(q);
        setAktiivinen(-1);
        setVirhe(null);
      } catch {
        if (nro === pyynto.current) setVirhe("Osoitehaku ei juuri nyt toimi. Yritä hetken päästä uudelleen.");
      }
    }, 250);
    return () => clearTimeout(ajastin);
  }, [q]);

  function valitse(e: Ehdotus) {
    setAuki(false);
    setOsumat([]);
    if (e.tyyppi === "alue") {
      setTeksti(`${e.alue.pno} ${e.alue.nimi}`);
      onValitseAlue?.(e.alue);
    } else {
      setTeksti(e.osoite.nimi);
      onValitse(e.osoite);
    }
  }

  const eiOsumia = auki && vastattu === q && ehdotukset.length === 0;

  return (
    <div className="relative">
      <label htmlFor={id} className={`mb-1.5 block font-semibold ${iso ? "text-base" : "text-sm"}`}>
        {label}
      </label>
      <div className="relative">
        <HakuIkoni className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink ${iso ? "left-4 h-6 w-6" : "left-3 h-5 w-5"}`} />
        <input
          id={id}
          type="search"
          role="combobox"
          aria-expanded={auki && ehdotukset.length > 0}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={aktiivinen >= 0 ? `${id}-${aktiivinen}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          autoFocus={autoFocus}
          value={teksti}
          placeholder={placeholder}
          onChange={(e) => {
            setTeksti(e.target.value);
            setAuki(true);
            setAktiivinen(-1);
          }}
          onFocus={() => setAuki(true)}
          onBlur={() => setTimeout(() => setAuki(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAktiivinen((i) => Math.min(i + 1, ehdotukset.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAktiivinen((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              // Enter ilman valintaa: jos ehdotuksia on vain yksi, valitaan se.
              const e2 = ehdotukset[aktiivinen] ?? (ehdotukset.length === 1 ? ehdotukset[0] : undefined);
              if (e2) {
                e.preventDefault();
                valitse(e2);
              }
            } else if (e.key === "Escape") {
              setAuki(false);
            }
          }}
          className={`w-full rounded-none border-ink bg-page pr-3 text-ink outline-none placeholder:text-muted focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent ${
            iso ? "min-h-16 border-2 pl-12 font-serif text-xl" : "min-h-12 border pl-10 text-base"
          }`}
        />
      </div>
      {auki && ehdotukset.length > 0 && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute z-40 -mt-px max-h-80 w-full overflow-auto border border-ink bg-page py-1 shadow-[0_8px_24px_rgba(20,20,20,0.12)]"
        >
          {ehdotukset.map((e, i) => (
            <li
              key={e.tyyppi === "alue" ? `a-${e.alue.pno}` : `o-${e.osoite.nimi}-${e.osoite.lat}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === aktiivinen}
              onMouseDown={(ev) => {
                ev.preventDefault();
                valitse(e);
              }}
              className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 ${i === aktiivinen ? "bg-ink text-page [&_.text-muted]:text-page/75" : "hover:bg-grid"}`}
            >
              {e.tyyppi === "alue" ? <AlueIkoni className="h-5 w-5 shrink-0 text-muted" /> : <SijaintiIkoni className="h-5 w-5 shrink-0 text-muted" />}
              {e.tyyppi === "alue" ? (
                <span>
                  <span className="font-medium">
                    {e.alue.pno} {e.alue.nimi}
                  </span>
                  <span className="block text-xs text-muted">Postinumeroalue · {e.alue.kunta}</span>
                </span>
              ) : (
                <span>
                  {e.osoite.nimi}
                  <span className="block text-xs text-muted">Osoite</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {eiOsumia && (
        <p className="mt-1.5 text-sm text-ink-2">Ei osumia Uudeltamaalta. Kokeile kirjoittaa kadunnimi ja numero, esim. &quot;Mannerheimintie 10&quot;.</p>
      )}
      {virhe && <p className="mt-1.5 text-sm text-critical">{virhe}</p>}
    </div>
  );
}

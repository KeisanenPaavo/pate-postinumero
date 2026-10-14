"use client";

import Link from "next/link";
import { useState } from "react";
import { OsoiteHaku, type Osoite } from "../OsoiteHaku";
import { useOmatKohteet } from "../osoite/Osiot";
import {
  OHJEARVO_PAIVA,
  ensisijainenLahikoulu,
  etaisyys,
  meluTuomio,
  meluVyohyke,
  pisteParam,
  useJson,
  type Kavely,
  type Kohde,
  type Lahella,
  type Matka,
  type Piste,
  type PisteTiedot,
  type Vertailtava,
} from "../osoite/yhteiset";
import { useVertailu } from "./useVertailu";

type Hinta = { arvo: string; alateksti: string; euroa: number | null; kunnanKeskiarvo: boolean; suhde: string | null };
type PisteVastaus = PisteTiedot & { pno: string; slug?: string; uusimaa: boolean; alue?: { nimi: string; kunta: string; hinta: Hinta } };

const matkaUrl = (a: Piste, b: Piste) => `/api/matka?mista=${pisteParam(a)}&minne=${pisteParam(b)}`;
const kavelyUrl = (a: Piste, b: Piste) => `/api/kavely?mista=${pisteParam(a)}&minne=${pisteParam(b)}`;

/**
 * Yhden vertailtavan osoitteen tiedot. Koukut kutsutaan aina samassa järjestyksessä (tyhjällä osoitteella
 * URL on null eikä mitään haeta), jotta vertailussa voi olla 0–3 saraketta.
 */
function useSarake(o: Vertailtava | null, keskusta: Kohde, omat: Kohde[]) {
  const piste = useJson<PisteVastaus>(o ? `/api/piste?p=${pisteParam(o)}` : null);
  const keskustaan = useJson<Matka>(o ? matkaUrl(o, keskusta) : null);
  const oma0 = useJson<Matka>(o && omat[0] ? matkaUrl(o, omat[0]) : null);
  const oma1 = useJson<Matka>(o && omat[1] ? matkaUrl(o, omat[1]) : null);
  const oma2 = useJson<Matka>(o && omat[2] ? matkaUrl(o, omat[2]) : null);
  const lahella = useJson<Lahella>(o ? `/api/lahella?p=${pisteParam(o)}` : null);
  const pysakki = lahella.data?.pysakit?.[0] ?? null;
  const kauppa = lahella.data?.kaupat?.[0] ?? null;
  const lahikoulu = ensisijainenLahikoulu(piste.data?.oppilaaksiotto);
  const koulu = lahikoulu ?? piste.data?.koulut?.find((k) => /perus/i.test(k.tyyppi)) ?? null;
  const kPysakki = useJson<Kavely>(o && pysakki ? kavelyUrl(o, pysakki) : null);
  const kKauppa = useJson<Kavely>(o && kauppa ? kavelyUrl(o, kauppa) : null);
  const kKoulu = useJson<Kavely>(o && koulu ? kavelyUrl(o, koulu) : null);
  return { o, piste, keskustaan, omat: [oma0, oma1, oma2], lahella, pysakki, kauppa, koulu, lahikoulu: !!lahikoulu, kPysakki, kKauppa, kKoulu };
}

type Sarake = ReturnType<typeof useSarake>;
type Solu = { arvo: string; selite?: string; luku: number | null; varoitus?: boolean } | "lataa" | "virhe" | "tyhja";
type Rivi = { otsikko: string; paras: string; solut: Solu[] };

/** Haun tila soluksi: ladataan / virhe / valmis. */
function solu<T>(haku: { data?: T; virhe?: boolean }, f: (d: T) => Solu): Solu {
  if (haku.virhe) return "virhe";
  if (haku.data === undefined) return "lataa";
  return f(haku.data);
}

function kavelySolu(haku: { data?: Kavely; virhe?: boolean }, kohde: { nimi: string } | null, lisa = "", lahdeValmis = true): Solu {
  if (!kohde) return lahdeValmis ? "tyhja" : "lataa";
  return solu(haku, (k) => ({ arvo: `${k.minuutit} min`, selite: `${kohde.nimi}${lisa} · ${etaisyys(k.metrit / 1000)}`, luku: k.minuutit }));
}

function rivit(sarakkeet: Sarake[], omat: Kohde[]): Rivi[] {
  const matkaSolu = (m: { data?: Matka; virhe?: boolean }) =>
    solu(m, (d) => (d.julkinen == null ? { arvo: "–", selite: "ei julkista yhteyttä", luku: null } : { arvo: `${d.julkinen} min`, selite: d.reitti ?? undefined, luku: d.julkinen }));
  return [
    {
      otsikko: "Neliöhinta (kerrostalo)",
      paras: "edullisin",
      solut: sarakkeet.map((s) =>
        solu(s.piste, (d) =>
          d.alue ? { arvo: d.alue.hinta.arvo, selite: d.alue.hinta.kunnanKeskiarvo ? "kunnan keskiarvo" : (d.alue.hinta.suhde ?? undefined), luku: d.alue.hinta.euroa } : "tyhja",
        ),
      ),
    },
    { otsikko: "Helsingin keskustaan julkisilla", paras: "nopein", solut: sarakkeet.map((s) => matkaSolu(s.keskustaan)) },
    ...omat.map((k, i) => ({ otsikko: `${k.nimi.replace(/, [^,]+$/, "")} julkisilla`, paras: "nopein", solut: sarakkeet.map((s) => matkaSolu(s.omat[i])) })),
    {
      otsikko: "Lähin pysäkki kävellen",
      paras: "lähin",
      solut: sarakkeet.map((s) =>
        kavelySolu(s.kPysakki, s.pysakki, s.pysakki ? `, ${s.pysakki.kulkuneuvo} ${s.pysakki.linjat.slice(0, 3).join(", ")}` : "", !!s.lahella.data || !!s.lahella.virhe),
      ),
    },
    {
      otsikko: "Ruokakauppa kävellen",
      paras: "lähin",
      solut: sarakkeet.map((s) => kavelySolu(s.kKauppa, s.kauppa, "", !!s.lahella.data || !!s.lahella.virhe)),
    },
    {
      otsikko: "Lähikoulu kävellen",
      paras: "lähin",
      solut: sarakkeet.map((s) => kavelySolu(s.kKoulu, s.koulu, s.lahikoulu ? " (oppilaaksiottoalue)" : " (lähin peruskoulu)", !!s.piste.data || !!s.piste.virhe)),
    },
    {
      otsikko: "Liikennemelu päivällä",
      paras: "hiljaisin",
      solut: sarakkeet.map((s) =>
        solu(s.piste, (d) => {
          const t = meluTuomio(d.melu);
          if (t.taso === "tuntematon") return "tyhja";
          return { arvo: meluVyohyke(t.db), selite: t.otsikko, luku: t.db ?? 40, varoitus: t.db != null && t.db >= OHJEARVO_PAIVA };
        }),
      ),
    },
    {
      otsikko: "Lähin juna-asema",
      paras: "lähin",
      solut: sarakkeet.map((s) =>
        solu(s.lahella, (d) => {
          const a = d.junaAsemat?.[0];
          return a ? { arvo: etaisyys(a.metrit / 1000), selite: `${a.nimi} (linnuntietä)`, luku: a.metrit } : { arvo: "–", selite: "ei 3 km säteellä", luku: null };
        }),
      ),
    },
  ];
}

/** Rivin paras arvo (pienin luku), kun vertailtavia on vähintään kaksi ja arvot eroavat. */
function parhaat(r: Rivi): Set<number> {
  const luvut = r.solut.map((s) => (typeof s === "object" ? s.luku : null));
  const ok = luvut.filter((l): l is number => l != null);
  if (ok.length < 2 || Math.min(...ok) === Math.max(...ok)) return new Set();
  const min = Math.min(...ok);
  return new Set(luvut.flatMap((l, i) => (l === min ? [i] : [])));
}

export function Vertailu({ keskusta }: { keskusta: Kohde }) {
  const v = useVertailu();
  const omat = useOmatKohteet();
  const s0 = useSarake(v.kohteet[0] ?? null, keskusta, omat);
  const s1 = useSarake(v.kohteet[1] ?? null, keskusta, omat);
  const s2 = useSarake(v.kohteet[2] ?? null, keskusta, omat);
  const sarakkeet = [s0, s1, s2].slice(0, v.kohteet.length);

  if (!v.kohteet.length)
    return (
      <div className="max-w-xl">
        <p className="mb-5">
          Vertailussa ei ole vielä osoitteita. Lisää ensimmäinen osoite alla tai raporttisivulta painikkeella <em>Lisää vertailuun</em>.
        </p>
        <LisaaOsoite onLisaa={v.lisaa} />
      </div>
    );

  return (
    <div>
      {/* Mobiilissa rivin otsikko omalla rivillään arvojen yläpuolella, jotta kolme saraketta mahtuu ilman vaakavieritystä. */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-t-[3px] border-ink align-top">
              <th scope="col" className="hidden w-[22%] py-3 pr-4 sm:table-cell">
                <span className="sr-only">Tieto</span>
              </th>
              {sarakkeet.map((s) => (
                <th key={pisteParam(s.o!)} scope="col" className="py-3 pr-3 font-normal break-words sm:pr-4">
                  <span className="block font-serif text-lg leading-tight font-semibold sm:text-xl">{s.o!.nimi.replace(/, [^,]+$/, "")}</span>
                  <span className="block text-sm text-muted">
                    {s.piste.data?.alue ? `${s.piste.data.alue.nimi} ${s.piste.data.pno} · ${s.piste.data.alue.kunta}` : s.piste.virhe ? "Tietoja ei saatu" : "…"}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-4 text-sm">
                    {s.piste.data?.slug && (
                      <Link
                        href={`/${s.piste.data.slug}?${new URLSearchParams({ p: pisteParam(s.o!), osoite: s.o!.nimi })}`}
                        className="linkki inline-flex min-h-11 items-center"
                      >
                        Avaa raportti
                      </Link>
                    )}
                    <button type="button" onClick={() => v.poista(s.o!)} className="inline-flex min-h-11 items-center font-medium text-ink-2 underline hover:text-accent">
                      Poista
                    </button>
                  </span>
                </th>
              ))}
              {!v.taynna && (
                <th scope="col" className="hidden w-[28%] py-3 font-normal sm:table-cell">
                  <LisaaOsoite onLisaa={v.lisaa} />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rivit(sarakkeet, omat).map((r) => {
              const p = parhaat(r);
              return [
                <tr key={`${r.otsikko}-m`} className="border-t border-rule sm:hidden">
                  <th scope="colgroup" colSpan={sarakkeet.length} className="pt-3 text-sm font-semibold">
                    {r.otsikko}
                  </th>
                </tr>,
                <tr key={r.otsikko} className="align-top sm:border-t sm:border-rule">
                  <th scope="row" className="hidden py-3 pr-4 text-[15px] font-medium sm:table-cell">
                    {r.otsikko}
                  </th>
                  {r.solut.map((c, i) => (
                    <td key={i} className="pt-1 pr-3 pb-3 break-words sm:py-3 sm:pr-4">
                      {c === "lataa" ? (
                        <span className="text-muted">…</span>
                      ) : c === "virhe" ? (
                        <span className="text-sm text-muted">Tietoa ei saatu</span>
                      ) : c === "tyhja" ? (
                        <span className="text-muted">–</span>
                      ) : (
                        <>
                          <span className={`luku block text-lg sm:text-xl ${c.varoitus ? "text-accent" : ""}`}>{c.arvo}</span>
                          {p.has(i) && <span className="block text-sm font-semibold text-good">✓ {r.paras}</span>}
                          {c.selite && <span className="block text-sm text-muted">{c.selite}</span>}
                        </>
                      )}
                    </td>
                  ))}
                  {!v.taynna && <td className="hidden sm:table-cell" />}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      {!v.taynna && (
        <div className="mt-6 max-w-md sm:hidden">
          <LisaaOsoite onLisaa={v.lisaa} />
        </div>
      )}
      <div className="mt-2 border-t border-ink pt-3 text-[13px] text-muted">
        <p>
          Julkisen liikenteen matka-ajat seuraavana arkiaamuna klo 8, kävelyajat Digitransitin reitityksellä. Melu on mallinnettu
          päiväajan liikennemelu (ohjearvo {OHJEARVO_PAIVA} dB). Vertailu tallentuu vain tähän selaimeen.
        </p>
        {omat.length === 0 && (
          <p className="mt-1">Vinkki: lisää oma kohde (esim. työpaikka) jonkin raportin Liikenne-osiossa, niin matka-aika sinne näkyy vertailussa.</p>
        )}
      </div>
    </div>
  );
}

/** Osoitteen lisäys vertailuun: vain Uudenmaan osoitteet (tiedot kattavat vain Uudenmaan). */
function LisaaOsoite({ onLisaa }: { onLisaa: (k: Vertailtava) => void }) {
  const [tila, setTila] = useState<{ teksti: string; virhe?: boolean } | null>(null);
  async function valitse(o: Osoite) {
    setTila({ teksti: "Tarkistetaan osoitetta…" });
    try {
      const res = await fetch(`/api/piste?p=${pisteParam(o)}&vain=alue`);
      const d: { uusimaa: boolean } = await res.json();
      if (!d.uusimaa) return setTila({ teksti: "Osoite on Uudenmaan ulkopuolella. Palvelu kattaa toistaiseksi vain Uudenmaan.", virhe: true });
      setTila(null);
      onLisaa({ nimi: o.nimi, lat: o.lat, lon: o.lon });
    } catch {
      setTila({ teksti: "Osoitteen tarkistus epäonnistui. Yritä uudelleen.", virhe: true });
    }
  }
  return (
    <div>
      <OsoiteHaku onValitse={valitse} label="Lisää osoite vertailuun" placeholder="Esim. Fleminginkatu 1, Helsinki" />
      {tila && (
        <p role="status" className={`mt-1.5 text-sm ${tila.virhe ? "text-critical" : "text-ink-2"}`}>
          {tila.teksti}
        </p>
      )}
    </div>
  );
}

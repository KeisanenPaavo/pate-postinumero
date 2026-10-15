"use client";

import Link from "next/link";
import { useState } from "react";
import { OsoiteHaku, type Osoite } from "../OsoiteHaku";
import { RaportinAsetukset } from "../osoite/Asetukset";
import { useOmatKohteet } from "../osoite/Osiot";
import {
  OHJEARVO_PAIVA,
  ensisijainenLahikoulu,
  etaisyys,
  meluTuomio,
  meluVyohyke,
  pisteParam,
  useAsetukset,
  useJson,
  type Kavely,
  type Kohde,
  type Kulkutapa,
  type Lahella,
  type Matka,
  type Piste,
  type PisteTiedot,
  type Vertailtava,
} from "../osoite/yhteiset";
import { JakoPainike } from "../JakoPainike";
import { jakoParametrit, useVertailuLahde } from "./useVertailu";

type Hinta = { arvo: string; alateksti: string; euroa: number | null; kunnanKeskiarvo: boolean; suhde: string | null };
type PisteVastaus = PisteTiedot & { pno: string; slug?: string; uusimaa: boolean; alue?: { nimi: string; kunta: string; hinta: Hinta } };

const matkaUrl = (a: Piste, b: Piste) => `/api/matka?mista=${pisteParam(a)}&minne=${pisteParam(b)}`;
const kavelyUrl = (a: Piste, b: Piste) => `/api/kavely?mista=${pisteParam(a)}&minne=${pisteParam(b)}`;

/**
 * Yhden vertailtavan osoitteen tiedot. Koukut kutsutaan aina samassa järjestyksessä (tyhjällä osoitteella
 * URL on null eikä mitään haeta), jotta vertailussa voi olla 0–3 saraketta.
 */
function useSarake(o: Vertailtava | null, keskusta: Kohde, omat: Kohde[], kohde: Kohde | null, koulut: boolean) {
  const piste = useJson<PisteVastaus>(o ? `/api/piste?p=${pisteParam(o)}` : null);
  const keskustaan = useJson<Matka>(o ? matkaUrl(o, keskusta) : null);
  const oma0 = useJson<Matka>(o && omat[0] ? matkaUrl(o, omat[0]) : null);
  const oma1 = useJson<Matka>(o && omat[1] ? matkaUrl(o, omat[1]) : null);
  const oma2 = useJson<Matka>(o && omat[2] ? matkaUrl(o, omat[2]) : null);
  const kohteeseen = useJson<Matka>(o && kohde ? matkaUrl(o, kohde) : null);
  const lahella = useJson<Lahella>(o ? `/api/lahella?p=${pisteParam(o)}` : null);
  const pysakki = lahella.data?.pysakit?.[0] ?? null;
  const kauppa = lahella.data?.kaupat?.[0] ?? null;
  const lahikoulu = ensisijainenLahikoulu(piste.data?.oppilaaksiotto);
  const koulu = lahikoulu ?? piste.data?.koulut?.find((k) => /perus/i.test(k.tyyppi)) ?? null;
  const kPysakki = useJson<Kavely>(o && pysakki ? kavelyUrl(o, pysakki) : null);
  const kKauppa = useJson<Kavely>(o && kauppa ? kavelyUrl(o, kauppa) : null);
  const kKoulu = useJson<Kavely>(o && koulu && koulut ? kavelyUrl(o, koulu) : null);
  return { o, piste, keskustaan, kohteeseen, omat: [oma0, oma1, oma2], lahella, pysakki, kauppa, koulu, lahikoulu: !!lahikoulu, kPysakki, kKauppa, kKoulu };
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

type Asetukset = ReturnType<typeof useAsetukset>;

function rivit(sarakkeet: Sarake[], omat: Kohde[], kohde: Kohde | null, asetukset: Asetukset): Rivi[] {
  const km = (m: number | null | undefined) => (m != null ? etaisyys(m / 1000) : null);
  /** Matka-aika valitulla kulkutavalla. */
  const aikaSolu = (k: Kulkutapa) => (m: { data?: Matka; virhe?: boolean }) =>
    solu(m, (d): Solu => {
      if (k === "julkinen")
        return d.julkinen == null ? { arvo: "–", selite: "ei julkista yhteyttä", luku: null } : { arvo: `${d.julkinen} min`, selite: d.reitti ?? undefined, luku: d.julkinen };
      if (k === "auto")
        return d.auto == null
          ? { arvo: "–", selite: "ajoreittiä ei löytynyt", luku: null }
          : { arvo: `${d.auto} min`, selite: [km(d.autoMetrit), "ilman ruuhkaa"].filter(Boolean).join(", "), luku: d.auto };
      if (k === "pyora")
        return d.pyora == null ? { arvo: "–", selite: "pyöräreittiä ei löytynyt", luku: null } : { arvo: `${d.pyora} min`, selite: km(d.pyoraMetrit) ?? undefined, luku: d.pyora };
      return d.kavely == null ? { arvo: "–", selite: "kävelyreittiä ei löytynyt", luku: null } : { arvo: `${d.kavely} min`, luku: d.kavely };
    });
  // Matkan pituus tietä pitkin: ajoreitti, muuten pyöräreitti tai julkisen yhteyden matka.
  const pituusSolu = (m: { data?: Matka; virhe?: boolean }) =>
    solu(m, (d) => {
      const [metrit, selite] =
        d.autoMetrit != null ? [d.autoMetrit, "ajoreittiä pitkin"] : d.pyoraMetrit != null ? [d.pyoraMetrit, "pyöräreittiä pitkin"] : [d.julkinenMetrit ?? null, "julkisen yhteyden reittiä"];
      return metrit == null ? { arvo: "–", luku: null } : { arvo: etaisyys(metrit / 1000), selite, luku: metrit };
    });
  // Kävelyaika pitkille matkoille ei ole vertailussa hyödyllinen (usein tunteja), joten se jätetään pois.
  const tavat = asetukset.kulkutavat.filter((t) => t.avain !== "kavely");
  const matkaRivit = (nimi: string, haku: (s: Sarake) => { data?: Matka; virhe?: boolean }) =>
    tavat.map((t) => ({
      otsikko: `${nimi}: ${t.nimi.toLowerCase()}`,
      paras: "nopein",
      solut: sarakkeet.map((s) => aikaSolu(t.avain)(haku(s))),
    }));
  const kohdeNimi = kohde?.nimi.replace(/, [^,]+$/, "");
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
    ...matkaRivit("Helsingin keskustaan", (s) => s.keskustaan),
    ...(kohde
      ? [
          ...matkaRivit(kohdeNimi!, (s) => s.kohteeseen),
          { otsikko: `${kohdeNimi}: matka`, paras: "lyhin", solut: sarakkeet.map((s) => pituusSolu(s.kohteeseen)) },
        ]
      : []),
    ...omat.flatMap((k, i) => matkaRivit(k.nimi.replace(/, [^,]+$/, ""), (s) => s.omat[i])),
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
    ...(asetukset.nakyy("koulut")
      ? [
          {
            otsikko: "Lähikoulu kävellen",
            paras: "lähin",
            solut: sarakkeet.map((s) => kavelySolu(s.kKoulu, s.koulu, s.lahikoulu ? " (oppilaaksiottoalue)" : " (lähin peruskoulu)", !!s.piste.data || !!s.piste.virhe)),
          },
        ]
      : []),
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
  const v = useVertailuLahde();
  const omat = useOmatKohteet();
  const { kohde } = v;
  const asetukset = useAsetukset();
  const koulut = asetukset.nakyy("koulut");
  const s0 = useSarake(v.kohteet[0] ?? null, keskusta, omat, kohde, koulut);
  const s1 = useSarake(v.kohteet[1] ?? null, keskusta, omat, kohde, koulut);
  const s2 = useSarake(v.kohteet[2] ?? null, keskusta, omat, kohde, koulut);
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
      {v.jaettu && (
        <div className="mb-6 border-l-[3px] border-ink bg-grid px-4 py-3">
          <p>
            <strong className="font-semibold">Katselet jaettua vertailua.</strong> Muutokset päivittävät vain tämän linkin, eivät omaa
            vertailuasi.
          </p>
          <p className="mt-1 flex flex-wrap gap-x-5">
            <button type="button" onClick={v.tallennaOmaksi} className="linkki min-h-11">
              {v.omienMaara ? `Tallenna omaksi vertailuksi (korvaa nykyiset ${v.omienMaara})` : "Tallenna omaksi vertailuksi"}
            </button>
            <Link href="/vertailu" className="inline-flex min-h-11 items-center font-medium text-ink-2 underline hover:text-accent">
              {v.omienMaara ? "Näytä oma vertailu" : "Sulje jaettu vertailu"}
            </Link>
          </p>
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center justify-end gap-x-6">
        <RaportinAsetukset />
        <JakoPainike
          teksti="Jaa vertailu"
          otsikko="Osoitteiden vertailu – Aluetarkistus"
          url={() => `${window.location.origin}/vertailu?${jakoParametrit(v.kohteet, kohde)}`}
        />
      </div>
      <KohdeValitsin kohde={kohde} onAseta={v.asetaKohde} onPoista={v.poistaKohde} />
      {/* Mobiilissa rivin otsikko omalla rivillään arvojen yläpuolella, jotta kolme saraketta mahtuu ilman vaakavieritystä. */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-t-[3px] border-ink align-top">
              <th scope="col" className="hidden w-[22%] py-3 pr-4 sm:table-cell">
                <span className="sr-only">Tieto</span>
              </th>
              {sarakkeet.map((s) => (
                <th key={pisteParam(s.o!)} scope="col" className="py-3 pr-3 font-normal break-words hyphens-auto sm:pr-4">
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
            {rivit(sarakkeet, omat, kohde, asetukset).map((r) => {
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
          Julkisen liikenteen matka-ajat seuraavana arkiaamuna klo 8; auto-, pyörä- ja kävelyajat ja matkat Digitransitin reitityksellä
          (autolla ilman ruuhkaa). Melu on mallinnettu
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

/** Vapaasti valittava kohdeosoite (esim. työpaikka): matka-ajat ja matka sinne jokaisesta vertailtavasta osoitteesta. */
function KohdeValitsin({ kohde, onAseta, onPoista }: { kohde: Kohde | null; onAseta: (k: Kohde) => void; onPoista: () => void }) {
  const [muokkaa, setMuokkaa] = useState(false);
  if (kohde && !muokkaa)
    return (
      <div className="mb-6 flex flex-wrap items-baseline gap-x-5 border-l-[3px] border-accent pl-4">
        <p>
          Matkat osoitteeseen <strong className="font-semibold">{kohde.nimi}</strong> näkyvät taulukossa.
        </p>
        <span className="flex gap-x-5">
          <button type="button" onClick={() => setMuokkaa(true)} className="linkki min-h-11">
            Vaihda kohde
          </button>
          <button type="button" onClick={onPoista} className="min-h-11 font-medium text-ink-2 underline hover:text-accent">
            Poista kohde
          </button>
        </span>
      </div>
    );
  return (
    <div className="mb-6 max-w-md">
      <OsoiteHaku
        onValitse={(o) => {
          onAseta({ nimi: o.nimi, lat: o.lat, lon: o.lon });
          setMuokkaa(false);
        }}
        label="Vertaa matkaa osoitteeseen (esim. työpaikka)"
        placeholder="Kirjoita kohteen osoite"
        autoFocus={muokkaa}
      />
      {muokkaa && (
        <button type="button" onClick={() => setMuokkaa(false)} className="mt-1 min-h-11 text-sm font-medium text-ink-2 hover:text-ink">
          Peruuta
        </button>
      )}
    </div>
  );
}

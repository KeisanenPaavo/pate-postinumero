"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Kartta } from "../Kartta";
import { JakoPainike } from "../JakoPainike";
import { OsoiteHaku, type Osoite } from "../OsoiteHaku";
import { useVertailu } from "../vertailu/useVertailu";
import {
  OHJEARVO_PAIVA,
  ensisijainenLahikoulu,
  etaisyys,
  km,
  meluTuomio,
  meluVyohyke,
  minuuttia,
  pisteParam,
  useKavely,
  useLahella,
  useMatka,
  useOsoite,
  usePisteTiedot,
  type Kohde,
  type Oppilaaksiotto,
  type Piste,
  type Tuomio,
} from "./yhteiset";

const isoAlku = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Melun toinen virke standfirstiin – sama tuomio kuin melu-osiossa, lyhyemmin. */
function meluVirke(t: Tuomio) {
  if (t.taso === "tuntematon") return null;
  if (t.db == null || t.db < 50) return "Liikennemelu on vähäistä.";
  if (t.db < OHJEARVO_PAIVA) return "Liikenne kuuluu, mutta melu jää ohjearvon alle.";
  if (t.db < 65) return "Liikennemelu ylittää asuinalueiden ohjearvon.";
  return "Liikennemelu ylittää ohjearvon selvästi.";
}

// --- Osoitepalkki: raportin otsikko ---------------------------------------------------

/**
 * Raportin pääotsikko (osoite tai alueen nimi), datasta koottu yhteenvetovirke ja osoitteen vaihto.
 * Virke muodostetaan säännöillä: matka-aika keskustaan, hinta vs. kunta ja (osoitteella) melutuomio.
 */
export function Osoitepalkki({
  keskipiste,
  alueNimi,
  hintaLause,
  keskusta,
}: {
  keskipiste: Piste;
  alueNimi: string;
  hintaLause: string | null;
  keskusta: Kohde;
}) {
  const { osoite, lahto } = useOsoite(keskipiste);
  const router = useRouter();
  const pathname = usePathname();
  const [muokkaa, setMuokkaa] = useState(false);
  const matka = useMatka(lahto, keskusta);
  const tiedot = usePisteTiedot(lahto);

  const [tila, setTila] = useState<{ teksti: string; virhe?: boolean } | null>(null);

  /** Selvittää osoitteen postinumeroalueen: sama alue → päivitetään vain osoite, muu alue → siirrytään sen sivulle. */
  async function aseta(o: Osoite) {
    const haku = new URLSearchParams({ p: pisteParam(o), osoite: o.nimi });
    setTila({ teksti: "Haetaan osoitteen aluetta…" });
    try {
      const res = await fetch(`/api/piste?p=${pisteParam(o)}&vain=alue`);
      if (!res.ok) throw new Error();
      const data: { uusimaa: boolean; slug?: string } = await res.json();
      if (!data.uusimaa || !data.slug) {
        setTila({ teksti: "Osoite on Uudenmaan ulkopuolella. Palvelu kattaa toistaiseksi vain Uudenmaan.", virhe: true });
        return;
      }
      setTila(null);
      setMuokkaa(false);
      if (`/${data.slug}` === pathname) router.replace(`${pathname}?${haku}`, { scroll: false });
      else router.push(`/${data.slug}?${haku}`);
    } catch {
      setTila({ teksti: "Osoitteen alueen haku epäonnistui. Yritä uudelleen.", virhe: true });
    }
  }

  const osat = [
    matka.data?.julkinen != null && `${matka.data.julkinen} minuuttia julkisilla Helsingin keskustaan`,
    hintaLause,
  ].filter(Boolean);
  const virkkeet = [
    osat.length ? `${isoAlku(osat.join(", "))}.` : null,
    osoite && tiedot.data ? meluVirke(meluTuomio(tiedot.data.melu)) : null,
  ].filter(Boolean);

  return (
    <div>
      <h1 className="mt-3 font-serif text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.02em] text-balance sm:text-[4rem]">
        {osoite ? osoite.nimi.replace(/, [^,]+$/, "") : alueNimi}
      </h1>
      <p className="mt-5 max-w-[760px] font-serif text-[1.375rem] leading-[1.35] text-ink-2 sm:text-[1.625rem]">
        {virkkeet.join(" ") || " "}
      </p>
      {osoite && !muokkaa ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-6">
          <button type="button" onClick={() => setMuokkaa(true)} className="linkki min-h-11">
            Vaihda osoite
          </button>
          <VertailuPainike osoite={osoite} />
          <JakoPainike teksti="Jaa raportti" otsikko={`${osoite.nimi} – Aluetarkistus`} url={() => window.location.href} />
        </p>
      ) : (
        <div className="mt-6 max-w-xl">
          {!osoite && (
            <p className="mb-3 text-ink-2">
              Luvut on laskettu alueen keskeltä. Syötä asunnon osoite, niin melu, matka-ajat ja koulut lasketaan juuri sille kohdalle.
            </p>
          )}
          <OsoiteHaku onValitse={aseta} label="Asunnon osoite" autoFocus={muokkaa} />
          {tila && (
            <p role="status" className={`mt-1.5 text-sm ${tila.virhe ? "text-critical" : "text-ink-2"}`}>
              {tila.teksti}
            </p>
          )}
          {muokkaa && (
            <button type="button" onClick={() => { setMuokkaa(false); setTila(null); }} className="mt-1 min-h-11 text-sm font-medium text-ink-2 hover:text-ink">
              Peruuta
            </button>
          )}
          {!osoite && (
            <p className="mt-2">
              <JakoPainike teksti="Jaa alueen raportti" otsikko={`${alueNimi} – Aluetarkistus`} url={() => window.location.href} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Tallentaa raportin osoitteen vertailuun (enintään 3) tai kertoo, että se on jo siellä. */
function VertailuPainike({ osoite }: { osoite: Kohde }) {
  const v = useVertailu();
  if (v.onko(osoite))
    return (
      <Link href="/vertailu" className="linkki inline-flex min-h-11 items-center">
        Vertailussa ({v.kohteet.length}) – avaa vertailu
      </Link>
    );
  if (v.taynna)
    return (
      <Link href="/vertailu" className="linkki inline-flex min-h-11 items-center">
        Vertailu täynnä (3) – avaa vertailu
      </Link>
    );
  return (
    <button type="button" onClick={() => v.lisaa({ nimi: osoite.nimi, lat: osoite.lat, lon: osoite.lon })} className="linkki min-h-11">
      + Lisää vertailuun
    </button>
  );
}

// --- Yhteenveto: tiivistelmätaulukko --------------------------------------------------

function Rivi({ href, otsikko, arvo, selite, korostus }: { href: string; otsikko: string; arvo: string; selite?: React.ReactNode; korostus?: boolean }) {
  return (
    <tr className="grid grid-cols-[1fr_auto] gap-x-4 border-t border-rule py-3 sm:table-row sm:py-0">
      <th scope="row" className="text-left font-medium sm:w-[30%] sm:py-4 sm:pr-4">
        <a href={href} className="-my-[13px] inline-block py-[13px] hover:text-accent hover:underline">
          {otsikko}
        </a>
      </th>
      <td className={`luku row-span-2 self-center text-right text-2xl whitespace-nowrap sm:py-4 sm:pr-6 sm:text-left ${korostus ? "text-accent" : ""}`}>
        {arvo}
      </td>
      <td className="text-[15px] text-muted sm:py-4">{selite}</td>
    </tr>
  );
}

/** Neljä tärkeintä vastausta heti otsikon alla. Hinta tulee palvelimelta valmiina. */
export function Yhteenveto({
  keskipiste,
  hinta,
  keskusta,
}: {
  keskipiste: Piste;
  hinta: { arvo: string; alateksti: string };
  keskusta: Kohde;
}) {
  const { osoite, lahto } = useOsoite(keskipiste);
  const matka = useMatka(lahto, keskusta);
  const tiedot = usePisteTiedot(lahto);
  const melu = osoite && tiedot.data ? meluTuomio(tiedot.data.melu) : null;
  // Lähikoulu oppilaaksiottoalueelta (Helsinki, Espoo); muualla lähin peruskoulu linnuntietä.
  const lahikoulu = ensisijainenLahikoulu(tiedot.data?.oppilaaksiotto);
  const koulu = lahikoulu ?? tiedot.data?.koulut?.find((k) => /perus/i.test(k.tyyppi)) ?? tiedot.data?.koulut?.[0];
  const lahella = useLahella(lahto);
  const pysakki = lahella.data?.pysakit?.[0] ?? null;
  const kauppa = lahella.data?.kaupat?.[0] ?? null;
  // Kävelyreitit lähimpiin arjen kohteisiin (samat haut kuin Lähiympäristö-kartalla – välimuisti jaetaan).
  const kavelyPysakki = useKavely(lahto, pysakki);
  const kavelyKauppa = useKavely(lahto, kauppa);
  const kavelyKoulu = useKavely(lahto, koulu ?? null);
  const yli = melu?.db != null && melu.db >= OHJEARVO_PAIVA;
  const ladataan = "…";
  const keskelta = osoite ? "" : " (alueen keskeltä)";

  /**
   * Kävelyrivi: arvona kävelyminuutit, selitteenä kohde ja kävelymatka. Jos reittiä ei saada,
   * näytetään linnuntie-etäisyys ja kerrotaan se selitteessä.
   */
  const kavelyRivi = (
    kohde: { nimi: string } | null | undefined,
    linnuntieKm: number | undefined,
    kavely: ReturnType<typeof useKavely>,
    lisa: string,
    haku: { virhe?: boolean; valmis: boolean },
  ) => {
    if (!kohde) return { arvo: haku.virhe ? "–" : haku.valmis ? "–" : ladataan, selite: haku.valmis && !haku.virhe ? "Ei lähistöllä." : undefined };
    const nimi = `${kohde.nimi}${lisa}${keskelta}`;
    // Yli 45 min kävely ei ole arjen mittari (maaseutu): isona arvona matka, kävelyaika selitteessä.
    if (kavely.data && kavely.data.minuutit > 45)
      return { arvo: etaisyys(kavely.data.metrit / 1000), selite: `kävellen ${kavely.data.minuutit} min · ${nimi}` };
    if (kavely.data) return { arvo: `${kavely.data.minuutit} min`, selite: `kävellen ${etaisyys(kavely.data.metrit / 1000)} · ${nimi}` };
    if (kavely.virhe && linnuntieKm != null) return { arvo: etaisyys(linnuntieKm), selite: `linnuntietä · ${nimi}` };
    return { arvo: ladataan, selite: nimi };
  };
  const lahellaHaku = { virhe: lahella.virhe, valmis: !!lahella.data };
  const rPysakki = kavelyRivi(
    pysakki,
    pysakki ? pysakki.metrit / 1000 : undefined,
    kavelyPysakki,
    pysakki ? `, ${pysakki.kulkuneuvo} ${pysakki.linjat.slice(0, 3).join(", ")}${pysakki.linjat.length > 3 ? " …" : ""}` : "",
    lahellaHaku,
  );
  const rKauppa = kavelyRivi(kauppa, kauppa?.km, kavelyKauppa, "", lahellaHaku);
  const rKoulu = kavelyRivi(koulu, koulu?.km, kavelyKoulu, lahikoulu ? ` (${lahikoulu.selite})` : "", { virhe: tiedot.virhe, valmis: !!tiedot.data });

  return (
    <section aria-labelledby="tiivistelma" className="mt-10 border-t-[3px] border-ink">
      <h2 id="tiivistelma" className="kapiteeli py-3">
        Tiivistelmä
      </h2>
      <table className="w-full border-b border-rule">
        <tbody className="block sm:table-row-group">
          <Rivi href="#hinnat" otsikko="Neliöhinta" arvo={hinta.arvo} selite={hinta.alateksti} />
          <Rivi
            href="#liikenne"
            otsikko="Keskustaan"
            arvo={matka.data ? minuuttia(matka.data.julkinen) : matka.virhe ? "–" : ladataan}
            selite={
              matka.data
                ? matka.data.julkinen == null
                  ? "Julkista yhteyttä ei löytynyt arkiaamuna klo 8."
                  : `${matka.data.reitti ?? "julkisilla"}, arkiaamuna klo 8`
                : matka.virhe
                  ? "Reittiä ei saatu."
                  : undefined
            }
          />
          <Rivi href="#lahella" otsikko="Lähin pysäkki" arvo={rPysakki.arvo} selite={rPysakki.selite} />
          <Rivi href="#lahella" otsikko="Lähin ruokakauppa" arvo={rKauppa.arvo} selite={rKauppa.selite} />
          <Rivi
            href="#melu"
            otsikko="Liikennemelu"
            arvo={!osoite ? "–" : melu ? (melu.taso === "tuntematon" ? "–" : meluVyohyke(melu.db)) : tiedot.virhe ? "–" : ladataan}
            korostus={yli}
            selite={
              !osoite ? (
                "Arvioidaan osoitekohtaisesti – syötä osoite."
              ) : melu ? (
                yli ? (
                  <>
                    <strong className="font-semibold text-accent">Yli ohjearvon</strong> ({OHJEARVO_PAIVA} dB päivällä)
                  </>
                ) : (
                  `${melu.otsikko}: ${melu.selitys.charAt(0).toLowerCase()}${melu.selitys.slice(1)}`
                )
              ) : undefined
            }
          />
          <Rivi
            href="#koulut"
            otsikko={lahikoulu ? "Lähikoulu" : "Lähin peruskoulu"}
            arvo={rKoulu.arvo}
            selite={rKoulu.selite}
          />
        </tbody>
      </table>
    </section>
  );
}

// --- Liikenne ------------------------------------------------------------------------

const OMAT_AVAIN = "omatKohteet";
const OMAT_MUUTOS = "omatKohteet:muutos";
const MAX_OMAT = 3;
let muistissa = "[]";

function lueOmatRaw(): string {
  try {
    return localStorage.getItem(OMAT_AVAIN) ?? muistissa;
  } catch {
    return muistissa;
  }
}

function tilaaOmat(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(OMAT_MUUTOS, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(OMAT_MUUTOS, cb);
  };
}

function tallennaOmat(k: Kohde[]) {
  muistissa = JSON.stringify(k);
  try {
    localStorage.setItem(OMAT_AVAIN, muistissa);
  } catch {
    // selaimen tallennus ei käytössä – kohteet pysyvät muistissa sivun ajan
  }
  window.dispatchEvent(new Event(OMAT_MUUTOS));
}

function jasennaOmat(raw: string): Kohde[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.slice(0, MAX_OMAT) : [];
  } catch {
    return [];
  }
}

/** Käyttäjän omat kohteet (esim. työpaikka), jotka tallentuvat selaimeen. Käytetään myös vertailussa. */
export function useOmatKohteet() {
  const raw = useSyncExternalStore(tilaaOmat, lueOmatRaw, () => "[]");
  return useMemo(() => jasennaOmat(raw), [raw]);
}

export function Liikenne({ keskipiste, oletuskohteet }: { keskipiste: Piste; oletuskohteet: Kohde[] }) {
  const { osoite, lahto } = useOsoite(keskipiste);
  const omatRaw = useSyncExternalStore(tilaaOmat, lueOmatRaw, () => "[]");
  const omat = useMemo(() => jasennaOmat(omatRaw), [omatRaw]);
  const [lisaa, setLisaa] = useState(false);

  return (
    <div>
      <p className="mb-4 max-w-[640px]">Nopein reitti seuraavana arkiaamuna klo 8 lähtien {osoite ? "osoitteesta" : "alueen keskeltä"}.</p>
      <ul className="space-y-6">
        {oletuskohteet.map((k) => (
          <MatkaRivi key={k.nimi} lahto={lahto} kohde={k} />
        ))}
        {omat.map((k, i) => (
          <MatkaRivi key={`${k.nimi}-${i}`} lahto={lahto} kohde={k} onPoista={() => tallennaOmat(omat.filter((_, j) => j !== i))} />
        ))}
      </ul>
      {lisaa ? (
        <div className="mt-5 max-w-md">
          <OsoiteHaku
            onValitse={(o) => {
              tallennaOmat([...omat, { nimi: o.nimi, lat: o.lat, lon: o.lon }].slice(-MAX_OMAT));
              setLisaa(false);
            }}
            label="Minne kuljet usein? (työ, koulu, harrastus)"
            placeholder="Kirjoita kohteen osoite"
            autoFocus
          />
          <button type="button" onClick={() => setLisaa(false)} className="mt-1 min-h-11 text-sm font-medium text-ink-2 hover:text-ink">
            Peruuta
          </button>
        </div>
      ) : (
        omat.length < MAX_OMAT && (
          <p className="mt-3">
            <button type="button" onClick={() => setLisaa(true)} className="linkki min-h-11">
              + Lisää oma kohde, esimerkiksi työpaikka
            </button>
          </p>
        )
      )}
      <p className="mt-1 text-[13px] text-muted">Omat kohteet tallentuvat vain tähän selaimeen. Reitit: Digitransit.</p>
    </div>
  );
}

function MatkaRivi({ lahto, kohde, onPoista }: { lahto: Piste; kohde: Kohde; onPoista?: () => void }) {
  const { data, virhe } = useMatka(lahto, kohde);
  const kavely = !data || (data.kavely != null && data.kavely <= 60);
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="font-semibold">{kohde.nimi}</p>
        {onPoista && (
          <button
            type="button"
            onClick={onPoista}
            className="min-h-11 text-sm font-medium text-ink-2 underline hover:text-accent"
            aria-label={`Poista kohde ${kohde.nimi}`}
          >
            Poista
          </button>
        )}
      </div>
      {virhe ? (
        <p className="border-y border-ink py-4 text-accent">Reittiä ei saatu. Yritä myöhemmin uudelleen.</p>
      ) : (
        <dl className={`mt-2 grid border-y border-ink ${kavely ? "grid-cols-3" : "grid-cols-2"}`}>
          <Aika nimi="Julkisilla" arvo={data ? minuuttia(data.julkinen) : "…"} lisa={data?.reitti ? `${data.reitti}${data.vaihdot ? `, ${data.vaihdot} vaihto${data.vaihdot > 1 ? "a" : ""}` : ""}` : undefined} />
          <Aika nimi="Pyörällä" arvo={data ? minuuttia(data.pyora) : "…"} />
          {kavely && <Aika nimi="Kävellen" arvo={data ? minuuttia(data.kavely) : "…"} />}
        </dl>
      )}
    </li>
  );
}

function Aika({ nimi, arvo, lisa }: { nimi: string; arvo: string; lisa?: string }) {
  return (
    <div className="flex flex-col py-4 pr-3 not-first:border-l not-first:border-rule not-first:pl-3 sm:not-first:pl-4">
      <dt className="text-[13px] text-muted">{nimi}</dt>
      <dd className="luku text-[1.75rem] leading-tight sm:text-[2.5rem]">{arvo}</dd>
      {lisa && <dd className="text-sm">{lisa}</dd>}
    </div>
  );
}

// --- Melu ---------------------------------------------------------------------------

const ASTEIKKO = [
  { nimi: "alle 45", ala: null },
  { nimi: "45–50", ala: 45 },
  { nimi: "50–55", ala: 50 },
  { nimi: "55–60", ala: 55 },
  { nimi: "60–65", ala: 60 },
  { nimi: "yli 65", ala: 65 },
] as const;

function asteikonPorras(db: number | null) {
  if (db == null) return 0;
  let i = 0;
  ASTEIKKO.forEach((a, j) => {
    if (a.ala != null && db >= a.ala) i = j;
  });
  return i;
}

/** Kuusiportainen päiväajan meluasteikko, nykyinen taso korostettuna. */
function MeluAsteikko({ db }: { db: number | null }) {
  const nyt = asteikonPorras(db);
  return (
    <figure className="mt-5">
      <ol className="grid grid-cols-6 gap-0.5 text-[12px] leading-tight tabular">
        {ASTEIKKO.map((a, i) => (
          <li
            key={a.nimi}
            aria-current={i === nyt ? "true" : undefined}
            style={{ background: `var(--melu-${i + 1})`, color: i >= 4 ? "var(--on-accent)" : "var(--ink)" }}
            className={`flex min-h-11 flex-col justify-center px-1.5 py-2 sm:px-2 ${i === nyt ? "font-bold outline-2 outline-offset-2 outline-ink" : ""}`}
          >
            <span>{a.nimi}</span>
            {i === nyt && <span>◂ tämä</span>}
          </li>
        ))}
      </ol>
      <figcaption className="mt-2 text-[13px] text-muted">dB päivällä · ohjearvo {OHJEARVO_PAIVA} dB asuinalueilla</figcaption>
    </figure>
  );
}

export function MeluOsio({ keskipiste, pno, kunta }: { keskipiste: Piste; pno: string; kunta: string }) {
  const { osoite, lahto } = useOsoite(keskipiste);
  const tiedot = usePisteTiedot(lahto);
  const tuomio = meluTuomio(tiedot.data?.melu);
  const melu = tiedot.data?.melu;
  const arvo = (s: string | null | undefined) => (s ? s.replace("-", "–") : "alle 45 dB");
  const yo = melu ? [melu.maantiet.yo, melu.rautatiet.yo].filter((v): v is string => !!v).map(arvo) : [];

  return (
    <div>
      {osoite ? (
        !tiedot.data && !tiedot.virhe ? (
          <p className="text-muted">Haetaan melutietoja…</p>
        ) : tuomio.taso === "tuntematon" ? (
          <p className="max-w-[640px]">Melutietoa ei saatu tälle osoitteelle. Kartalta näet melualueet.</p>
        ) : (
          <>
            <p className="max-w-[640px]">
              <span className="font-semibold">{tuomio.otsikko}.</span> Päiväajan liikennemelu on{" "}
              <strong className={tuomio.db != null && tuomio.db >= OHJEARVO_PAIVA ? "text-accent" : ""}>{meluVyohyke(tuomio.db)}</strong>
              {tuomio.db != null && tuomio.db >= OHJEARVO_PAIVA
                ? `, mikä ylittää asuinalueiden ohjearvon ${OHJEARVO_PAIVA} dB.`
                : `, mikä jää asuinalueiden ohjearvon ${OHJEARVO_PAIVA} dB alle.`}
              {yo.length > 0 && ` Yöllä tie- ja raideliikenteen melu on ${yo.join(" / ")}.`}
              {tuomio.db != null && tuomio.db >= OHJEARVO_PAIVA && " Kannattaa selvittää, mihin suuntaan makuuhuoneen ikkunat avautuvat."}
            </p>
            <MeluAsteikko db={tuomio.db} />
            {melu && (
              <dl className="mt-5 grid max-w-[640px] grid-cols-[auto_1fr] gap-x-6 border-t border-ink text-[15px]">
                <dt className="border-b border-rule py-2 text-ink-2">Maantiet</dt>
                <dd className="border-b border-rule py-2 tabular">
                  päivällä {arvo(melu.maantiet.paiva)}, yöllä {arvo(melu.maantiet.yo)}
                </dd>
                <dt className="border-b border-rule py-2 text-ink-2">Rautatiet</dt>
                <dd className="border-b border-rule py-2 tabular">
                  päivällä {arvo(melu.rautatiet.paiva)}, yöllä {arvo(melu.rautatiet.yo)}
                </dd>
                {melu.helsinkiYhteismelu !== undefined && (
                  <>
                    <dt className="border-b border-rule py-2 text-ink-2">Helsingin katuverkko</dt>
                    <dd className="border-b border-rule py-2 tabular">päivällä {melu.helsinkiYhteismelu ?? "alle alimman vyöhykkeen"}</dd>
                  </>
                )}
              </dl>
            )}
            <p className="mt-2 max-w-[640px] text-[13px] text-muted">
              Ohjearvo asuinalueilla on 55 dB päivällä ja 50 dB yöllä. Lähteet: Väylävirasto, EU-meluselvitys 2022
              {melu?.helsinkiYhteismelu !== undefined ? "; Helsingin kaupunki 2022" : ""}.
              {melu?.helsinkiYhteismelu === undefined && kunta !== "049" && " Tämän kunnan katuverkon melua ei ole mukana."}
            </p>
          </>
        )
      ) : (
        <p className="max-w-[640px]">Melu arvioidaan osoitekohtaisesti. Syötä osoite sivun yläosaan, niin saat melutason juuri sille kohdalle. Kartalta näet melualueet koko alueella.</p>
      )}
      <div className="mt-8">
        <Kartta piste={lahto} onOsoite={!!osoite} pno={pno} kunta={kunta} />
      </div>
    </div>
  );
}

// --- Koulut --------------------------------------------------------------------------

export function Koulut({ keskipiste }: { keskipiste: Piste }) {
  const { osoite, lahto } = useOsoite(keskipiste);
  const tiedot = usePisteTiedot(lahto);
  const o = tiedot.data?.oppilaaksiotto;
  return (
    <div>
      {tiedot.data && <Lahikoulut o={o ?? null} osoite={!!osoite} />}
      <h3 className="mt-8 mb-2 font-semibold">Lähimmät koulut</h3>
      <p className="mb-4 max-w-[640px]">Lähimmät koulut {osoite ? "osoitteesta" : "alueen keskeltä"} linnuntietä.</p>
      {tiedot.data?.koulut ? (
        <ol className="border-t border-ink">
          {tiedot.data.koulut.map((k) => (
            <li key={k.nimi} className="flex items-baseline justify-between gap-4 border-b border-rule py-3">
              <span>
                {k.nimi} <span className="text-muted">· {k.tyyppi.toLowerCase().replace(/t$/, "")}</span>
              </span>
              <span className="font-semibold whitespace-nowrap tabular">{km(k.km)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted">{tiedot.virhe ? "Koulujen haku epäonnistui. Yritä myöhemmin uudelleen." : "Haetaan kouluja…"}</p>
      )}
      <p className="mt-2 text-[13px] text-muted">
        Lähde: Tilastokeskus, oppilaitosrekisteri; sijainnit pääkaupunkiseudulla kaupunkien palvelukartasta.
      </p>
    </div>
  );
}

/** Oppilaaksiottoalueen lähikoulut: Helsingissä koulukohtaisesti, Espoossa oppilasalue ja sen koulut. */
function Lahikoulut({ o, osoite }: { o: Oppilaaksiotto | null; osoite: boolean }) {
  const keskelta = osoite ? "" : " Tiedot koskevat alueen keskipistettä – syötä osoite, niin lähikoulu katsotaan juuri sille kohdalle.";
  if (!o)
    return (
      <div>
        <h3 className="mb-2 font-semibold">Lähikoulu</h3>
        <p className="max-w-[640px]">
          Lähikoulun määrää kunnan oppilaaksiottoalue, ei etäisyys. Tämä kunta ei julkaise alueita avoimena datana, joten tarkista
          lähikoulu kunnan sivuilta. Alla lähimmät koulut linnuntietä.
        </p>
      </div>
    );
  const kieli = (k: "suomi" | "ruotsi") => (k === "suomi" ? "suomenkielinen" : "ruotsinkielinen");
  return (
    <div>
      <h3 className="mb-2 font-semibold">Lähikoulu{o.lukuvuosi ? ` lukuvuonna ${o.lukuvuosi}` : ""}</h3>
      {o.oppilasalue && (
        <div>
          <p className="mb-3 max-w-[640px]">
            Osoite kuuluu <strong className="font-semibold">{o.oppilasalue.nimi.replace(/oppilasalue$/, "oppilasalueeseen")}</strong>. Espoo
            osoittaa suomenkielisen lähikoulun tämän alueen kouluista – yleensä lähimmästä, mutta kaupunki päättää sen
            oppilaskohtaisesti.{keskelta}
          </p>
          <ol className="max-w-[640px] border-t border-ink">
            {o.oppilasalue.koulut.slice(0, 8).map((k) => (
              <li key={k.nimi} className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5 text-[15px]">
                <span>{k.nimi}</span>
                <span className="font-semibold whitespace-nowrap tabular">{km(k.km)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {o.koulut.length > 0 && (
        <div className={o.oppilasalue ? "mt-5" : ""}>
          <p className="mb-3 max-w-[640px]">
            {o.kunta === "091"
              ? "Osoitteen oppilaaksiottoalueen koulut, joihin oppilas ensisijaisesti osoitetaan."
              : "Ruotsinkielinen lähikoulu osoitteen oppilaaksiottoalueelta."}
            {o.oppilasalue ? "" : keskelta}
          </p>
          <table className="w-full max-w-[640px] text-left text-[15px]">
            <tbody className="border-t border-ink">
              {o.koulut.map((k) => (
                <tr key={`${k.kieli}${k.luokat}`} className="border-b border-rule">
                  <th scope="row" className="py-2.5 pr-4 align-top font-normal text-muted whitespace-nowrap">
                    {kieli(k.kieli)}, {k.luokat}
                  </th>
                  <td className="py-2.5 font-semibold">{k.nimi}</td>
                  <td className="py-2.5 pl-3 text-right whitespace-nowrap tabular">{k.km != null ? km(k.km) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[13px] text-muted">Lähde: {o.lahde}. Etäisyydet linnuntietä.</p>
    </div>
  );
}

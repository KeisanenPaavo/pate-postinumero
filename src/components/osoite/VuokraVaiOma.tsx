"use client";

import { useEffect, useRef, useState } from "react";
import { eur, HOITOVASTIKE_M2, Kentta, kuukausiera, lue, pyorista, TyyppiValinta, VARAINSIIRTOVERO, type LaskurinTyyppi } from "./laskuri";

export type VertailunTyyppi = LaskurinTyyppi & {
  /** Kaksion tms. mediaanikuukausivuokra, kun se on tilastoitu (suurimmat kaupungit). */
  kkVuokra: number | null;
  /** Alueen neliöhinnan keskimääräinen vuosimuutos viideltä vuodelta, esim. −0.027. */
  hintamuutos: number | null;
};

/** Välityspalkkio ym. myyntikulut, jotka omistaja maksaa myydessään (osuus myyntihinnasta). */
const MYYNTIKULUT = 0.03;
/** Remonttivaran oletus €/m²/kk (asunnon omat pintaremontit, kodinkoneet). */
const REMONTTIVARA_M2 = 1;

const desimaali = new Intl.NumberFormat("fi-FI", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function oletukset(t: VertailunTyyppi, varaHinta: number | null) {
  const hinta = t.hinta ?? varaHinta;
  const vuokra = t.kkVuokra ?? (t.vuokra ? t.vuokra * t.ala : null);
  return {
    hinta: hinta ? String(pyorista(hinta * t.ala, 1000)) : "",
    ala: String(t.ala),
    vuokra: vuokra ? String(pyorista(vuokra, 10)) : "",
    hoitovastike: String(pyorista(HOITOVASTIKE_M2 * t.ala, 5)),
    remonttivara: String(pyorista(REMONTTIVARA_M2 * t.ala, 5)),
  };
}

type Syotteet = {
  hinta: number;
  vuokra: number;
  hoitovastike: number;
  remonttivara: number;
  omarahoitus: number;
  korko: number;
  lainaAika: number;
  arvonnousu: number;
  kulujenNousu: number;
  tuotto: number;
  vuotta: number;
};

export type Vuosi = { vuosi: number; omistaja: number; vuokralainen: number };

/**
 * Kuukausisimulointi samalla rahalla: omistaja maksaa käsirahan ja varainsiirtoveron, vuokralainen sijoittaa saman summan.
 * Joka kuukausi se, jonka asuminen vie vähemmän kassaa, sijoittaa erotuksen. Varallisuus = asunnon arvo myyntikulujen jälkeen
 * − jäljellä oleva laina + sijoitukset; vuokralaisella pelkät sijoitukset. Ennen veroja.
 */
export function simuloi(s: Syotteet) {
  const laina = s.hinta * (1 - s.omarahoitus);
  const era = kuukausiera(laina, s.korko, s.lainaAika);
  const alkupanos = s.hinta * s.omarahoitus + s.hinta * VARAINSIIRTOVERO;
  const kkTuotto = (1 + s.tuotto) ** (1 / 12) - 1;
  const varallisuus = (kk: number, saldo: number, salkku: number) => s.hinta * (1 + s.arvonnousu) ** (kk / 12) * (1 - MYYNTIKULUT) - saldo + salkku;

  let saldo = laina;
  let omistajanSalkku = 0;
  let vuokralaisenSalkku = alkupanos;
  const vuodet: Vuosi[] = [{ vuosi: 0, omistaja: varallisuus(0, saldo, 0), vuokralainen: alkupanos }];
  const ensimmainen = { korot: 0, lyhennys: 0, vastike: 0, remontti: 0, vuokra: 0 };

  for (let kk = 1; kk <= s.vuotta * 12; kk++) {
    const nousu = (1 + s.kulujenNousu) ** Math.floor((kk - 1) / 12);
    const korot = saldo * (s.korko / 12);
    const lyhennys = saldo > 0 ? Math.min(era - korot, saldo) : 0;
    saldo -= lyhennys;
    const vastike = s.hoitovastike * nousu;
    const remontti = s.remonttivara * nousu;
    const vuokra = s.vuokra * nousu;
    const omistaminen = korot + lyhennys + vastike + remontti;

    omistajanSalkku *= 1 + kkTuotto;
    vuokralaisenSalkku *= 1 + kkTuotto;
    if (omistaminen > vuokra) vuokralaisenSalkku += omistaminen - vuokra;
    else omistajanSalkku += vuokra - omistaminen;

    if (kk <= 12) {
      ensimmainen.korot += korot / 12;
      ensimmainen.lyhennys += lyhennys / 12;
      ensimmainen.vastike += vastike / 12;
      ensimmainen.remontti += remontti / 12;
      ensimmainen.vuokra += vuokra / 12;
    }
    if (kk % 12 === 0) vuodet.push({ vuosi: kk / 12, omistaja: varallisuus(kk, saldo, omistajanSalkku), vuokralainen: vuokralaisenSalkku });
  }

  const omistaminen = ensimmainen.korot + ensimmainen.lyhennys + ensimmainen.vastike + ensimmainen.remontti;
  const ohitus = vuodet.find((v) => v.vuosi > 0 && v.omistaja >= v.vuokralainen)?.vuosi ?? null;
  return { laina, era, alkupanos, kk: { ...ensimmainen, omistaminen }, vuodet, ohitus };
}

/**
 * Vuokralla vai omistaen kassavirran kannalta: kuukausikulut ensimmäisenä vuonna ja varallisuus vertailuajan lopussa,
 * kun molemmat käyttävät asumiseen ja säästämiseen saman rahan. Oletukset alueen hinnoista ja vuokrista.
 */
export function VuokraVaiOma({
  tyypit,
  varaHinta,
  vuokramuutos,
}: {
  tyypit: VertailunTyyppi[];
  varaHinta: number | null;
  /** Vuokratilaston alueen vuokrien vuosimuutos, %. */
  vuokramuutos: number | null;
}) {
  const [tyyppi, setTyyppi] = useState(tyypit[1]?.avain ?? tyypit[0].avain);
  const [kohde, setKohde] = useState(() => oletukset(tyypit.find((t) => t.avain === tyyppi)!, varaHinta));
  const [oletus, setOletus] = useState({
    omarahoitus: "15",
    korko: "3,5",
    laina_aika: "25",
    arvonnousu: "1,5",
    kulujen_nousu: "2",
    tuotto: "5",
    vuotta: "10",
  });
  const valittu = tyypit.find((t) => t.avain === tyyppi)!;

  const valitse = (avain: string) => {
    setTyyppi(avain);
    setKohde(oletukset(tyypit.find((t) => t.avain === avain)!, varaHinta));
  };

  const s: Syotteet = {
    hinta: lue(kohde.hinta),
    vuokra: lue(kohde.vuokra),
    hoitovastike: lue(kohde.hoitovastike),
    remonttivara: lue(kohde.remonttivara),
    omarahoitus: Math.min(100, Math.max(0, lue(oletus.omarahoitus))) / 100,
    korko: lue(oletus.korko) / 100,
    lainaAika: Math.max(1, lue(oletus.laina_aika)),
    arvonnousu: lue(oletus.arvonnousu) / 100,
    kulujenNousu: lue(oletus.kulujen_nousu) / 100,
    tuotto: lue(oletus.tuotto) / 100,
    vuotta: Math.min(40, Math.max(1, Math.round(lue(oletus.vuotta)))),
  };
  const valmis = s.hinta > 0 && s.vuokra > 0;
  const r = valmis ? simuloi(s) : null;
  const loppu = r?.vuodet.at(-1);

  const kohdeKentta = (avain: keyof typeof kohde, nimi: string, yksikko: string) => (
    <Kentta nimi={nimi} yksikko={yksikko} arvo={kohde[avain]} onChange={(v) => setKohde((a) => ({ ...a, [avain]: v }))} />
  );
  const oletusKentta = (avain: keyof typeof oletus, nimi: string, yksikko: string, vihje?: string | null) => (
    <Kentta nimi={nimi} yksikko={yksikko} arvo={oletus[avain]} onChange={(v) => setOletus((a) => ({ ...a, [avain]: v }))} vihje={vihje} />
  );
  const muutos = (x: number) => `${x >= 0 ? "+" : "−"}${desimaali.format(Math.abs(x))} %/v`;

  return (
    <div>
      <TyyppiValinta tyypit={tyypit} valittu={tyyppi} onValitse={valitse} />

      <div className="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="grid content-start gap-x-4 gap-y-3 sm:grid-cols-2">
          {kohdeKentta("hinta", "Asunnon hinta", "€")}
          {kohdeKentta("vuokra", "Vastaavan asunnon vuokra", "€/kk")}
          {kohdeKentta("hoitovastike", "Hoitovastike", "€/kk")}
          {kohdeKentta("remonttivara", "Remonttivara", "€/kk")}
          {oletusKentta("omarahoitus", "Omarahoitus", "%")}
          {oletusKentta("korko", "Lainan korko", "%")}
          {oletusKentta("laina_aika", "Laina-aika", "vuotta")}
          {oletusKentta("vuotta", "Vertailuaika", "vuotta")}
          {oletusKentta(
            "arvonnousu",
            "Asunnon arvonnousu",
            "%/v",
            valittu.hintamuutos != null ? `alueella 5 v: ${muutos(valittu.hintamuutos * 100)}` : null,
          )}
          {oletusKentta(
            "kulujen_nousu",
            "Asumiskulujen nousu",
            "%/v",
            `vuokra ja vastikkeet${vuokramuutos != null ? `; vuokrat viime vuonna ${muutos(vuokramuutos)}` : ""}`,
          )}
          {oletusKentta("tuotto", "Säästöjen tuotto", "%/v", "esim. osakerahasto pitkällä aikavälillä")}
        </div>

        <div className="self-start" aria-live="polite">
          {!r || !loppu ? (
            <p className="text-muted">Syötä asunnon hinta ja vuokra.</p>
          ) : (
            <>
              <h3 className="font-semibold">Kuukausikulut ensimmäisenä vuonna</h3>
              <table className="mt-2 w-full text-left text-[15px] tabular">
                <tbody className="border-t border-ink">
                  <Rivi nimi="Lainan korot" arvo={r.kk.korot} />
                  <Rivi nimi="Lainan lyhennys" arvo={r.kk.lyhennys} selite="kertyy omaan varallisuuteen" />
                  <Rivi nimi="Hoitovastike" arvo={r.kk.vastike} />
                  <Rivi nimi="Remonttivara" arvo={r.kk.remontti} />
                  <Rivi nimi="Omistaen yhteensä" arvo={r.kk.omistaminen} vahva />
                  <Rivi nimi="Vuokralla" arvo={r.kk.vuokra} vahva />
                </tbody>
              </table>
              <p className="mt-3 text-[15px]">
                {r.kk.omistaminen > r.kk.vuokra ? (
                  <>
                    Omistaminen vie <strong className="font-semibold">{eur(r.kk.omistaminen - r.kk.vuokra)}/kk</strong> enemmän kassaa, mutta
                    lyhennyksiä lukuun ottamatta se maksaa {eur(r.kk.omistaminen - r.kk.lyhennys)}/kk eli{" "}
                    {r.kk.omistaminen - r.kk.lyhennys < r.kk.vuokra
                      ? `${eur(r.kk.vuokra - r.kk.omistaminen + r.kk.lyhennys)} vähemmän`
                      : `${eur(r.kk.omistaminen - r.kk.lyhennys - r.kk.vuokra)} enemmän`}{" "}
                    kuin vuokra.
                  </>
                ) : (
                  <>
                    Omistaminen vie <strong className="font-semibold">{eur(r.kk.vuokra - r.kk.omistaminen)}/kk</strong> vähemmän kassaa kuin
                    vuokralla asuminen, ja lisäksi {eur(r.kk.lyhennys)}/kk lyhennyksiä kertyy omaan varallisuuteen.
                  </>
                )}
              </p>

              <h3 className="mt-6 font-semibold">Varallisuus {s.vuotta} vuoden päästä</h3>
              <dl className="mt-2 border-t border-ink">
                <div className="flex items-baseline justify-between gap-4 border-b border-grid py-3">
                  <dt>Omistaen</dt>
                  <dd className="font-serif text-[1.625rem] leading-none font-semibold tabular">{eur(pyorista(loppu.omistaja, 1000))}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-grid py-3">
                  <dt>Vuokralla ja säästäen</dt>
                  <dd className="font-serif text-[1.625rem] leading-none font-semibold tabular">{eur(pyorista(loppu.vuokralainen, 1000))}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[15px]">
                {loppu.omistaja >= loppu.vuokralainen ? (
                  <>
                    Omistaja on <strong className="font-semibold">{eur(pyorista(loppu.omistaja - loppu.vuokralainen, 1000))}</strong> paremmassa
                    asemassa.{" "}
                    {r.ohitus && r.ohitus > 1 && `Omistaminen menee vuokralla asumisen edelle ${r.ohitus}. vuonna, kun kaupan kulut on kurottu kiinni.`}
                  </>
                ) : (
                  <>
                    Vuokralainen on <strong className="font-semibold">{eur(pyorista(loppu.vuokralainen - loppu.omistaja, 1000))}</strong>{" "}
                    paremmassa asemassa, jos se sijoittaa käsirahan ja kuukausittaisen erotuksen.
                    {r.ohitus == null && ` Omistaminen ei kuro eroa kiinni ${s.vuotta} vuodessa näillä oletuksilla.`}
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      {r && <VarallisuusKaavio vuodet={r.vuodet} />}

      <p className="mt-3 max-w-[640px] text-[13px] text-muted">
        Molemmat käyttävät saman rahan: vuokralainen sijoittaa omistajan käsirahan ({r ? eur(pyorista(r.alkupanos, 100)) : "–"} sisältäen
        varainsiirtoveron 1,5 %) ja joka kuukausi se, jonka asuminen on halvempaa, sijoittaa erotuksen. Omistajan varallisuudesta on
        vähennetty {MYYNTIKULUT * 100} %:n myyntikulut. Luvut ovat ennen veroja: oman asunnon myyntivoitto on verovapaa kahden vuoden
        asumisen jälkeen, sijoitusten tuotosta maksetaan pääomatuloveroa. Asuntolainan korkoja ei voi enää vähentää verotuksessa.
        Taloyhtiön isot remontit (esim. putkiremontti) eivät sisälly hoitovastikkeeseen.
      </p>
    </div>
  );
}

function Rivi({ nimi, arvo, selite, vahva }: { nimi: string; arvo: number; selite?: string; vahva?: boolean }) {
  return (
    <tr className={`border-b ${vahva ? "border-ink" : "border-grid"}`}>
      <th scope="row" className={`py-2 pr-3 text-left ${vahva ? "font-semibold" : "font-normal"}`}>
        {nimi}
        {selite && <span className="block text-[13px] font-normal text-muted">{selite}</span>}
      </th>
      <td className={`py-2 text-right align-top whitespace-nowrap ${vahva ? "font-semibold" : ""}`}>{eur(arvo)}/kk</td>
    </tr>
  );
}

const M = { top: 16, right: 12, bottom: 28, left: 56 };
const luku = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 });

/** Varallisuus vuosittain: omistaja mustalla, vuokralainen harmaalla. Arvot myös taulukkona ruudunlukijalle. */
function VarallisuusKaavio({ vuodet }: { vuodet: Vuosi[] }) {
  const kehys = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(700);
  useEffect(() => {
    const el = kehys.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 520 ? 200 : 240;
  const arvot = vuodet.flatMap((v) => [v.omistaja, v.vuokralainen]);
  const raaka = (Math.max(...arvot, 0) - Math.min(...arvot, 0)) / 4;
  const step = [10_000, 20_000, 25_000, 50_000, 100_000, 200_000, 250_000, 500_000].find((x) => x >= raaka) ?? 1_000_000;
  const yMin = Math.floor(Math.min(...arvot, 0) / step) * step;
  const yMax = Math.ceil(Math.max(...arvot) / step) * step;
  const ticks = Array.from({ length: Math.round((yMax - yMin) / step) + 1 }, (_, i) => yMin + i * step);
  const x = (vuosi: number) => M.left + (vuosi / Math.max(vuodet.length - 1, 1)) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - M.top - M.bottom);
  const polku = (key: "omistaja" | "vuokralainen") => vuodet.map((v, i) => `${i ? "L" : "M"}${x(v.vuosi).toFixed(1)},${y(v[key]).toFixed(1)}`).join("");
  // Vuosimerkinnät tiheydellä, joka mahtuu leveyteen (~40 px / merkintä).
  const joka = [1, 2, 5, 10].find((n) => (vuodet.length - 1) / n <= (W - M.left - M.right) / 40) ?? 10;
  const xTicks = vuodet.filter((v) => v.vuosi % joka === 0);
  const sarjat = [
    { key: "vuokralainen" as const, nimi: "Vuokralla ja säästäen", vari: "var(--series-2)", leveys: 2 },
    { key: "omistaja" as const, nimi: "Omistaen", vari: "var(--series-1)", leveys: 3 },
  ];

  return (
    <figure className="mt-8">
      <figcaption className="mb-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]">
        <span className="font-semibold">Varallisuus vuosittain</span>
        {[...sarjat].reverse().map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-muted">
            <span aria-hidden className="inline-block h-[3px] w-4" style={{ background: s.vari }} />
            {s.nimi}
          </span>
        ))}
      </figcaption>
      <div ref={kehys}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Varallisuus vuosittain omistaen ja vuokralla">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="12" fill="var(--muted)" className="tabular">
                {t === 0 ? "0" : `${luku.format(t / 1000)} t€`}
              </text>
            </g>
          ))}
          {xTicks.map((v) => (
            <text
              key={v.vuosi}
              x={x(v.vuosi)}
              y={H - 8}
              textAnchor={v.vuosi === vuodet.length - 1 ? "end" : v.vuosi === 0 ? "start" : "middle"}
              fontSize="12"
              fill="var(--muted)"
              className="tabular"
            >
              {v.vuosi === 0 ? "nyt" : `${v.vuosi} v`}
            </text>
          ))}
          {sarjat.map((s) => (
            <path key={s.key} d={polku(s.key)} fill="none" stroke={s.vari} strokeWidth={s.leveys} strokeLinejoin="round" />
          ))}
        </svg>
      </div>
      <table className="sr-only">
        <caption>Varallisuus vuosittain</caption>
        <thead>
          <tr>
            <th scope="col">Vuosi</th>
            <th scope="col">Omistaen</th>
            <th scope="col">Vuokralla ja säästäen</th>
          </tr>
        </thead>
        <tbody>
          {vuodet.map((v) => (
            <tr key={v.vuosi}>
              <th scope="row">{v.vuosi}</th>
              <td>{eur(pyorista(v.omistaja, 100))}</td>
              <td>{eur(pyorista(v.vuokralainen, 100))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

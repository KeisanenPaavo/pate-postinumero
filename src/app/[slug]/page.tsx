import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HintaKaavio } from "@/components/HintaKaavio";
import { IkaKaavio, type IkaRyhma } from "@/components/IkaKaavio";
import { Piilotettava } from "@/components/osoite/Asetukset";
import { KaavoitusOsio } from "@/components/osoite/Kaavoitus";
import { Lahiymparisto } from "@/components/osoite/Lahiymparisto";
import { RakennusTiedot } from "@/components/osoite/Rakennus";
import { TaloyhtioOsio, VainOsoitteelle } from "@/components/osoite/Taloyhtio";
import { Tuottolaskuri } from "@/components/osoite/Tuottolaskuri";
import { VuokraVaiOma } from "@/components/osoite/VuokraVaiOma";
import { Koulut, Liikenne, MeluOsio, Osoitepalkki, Yhteenveto, type TiivistelmaRivi } from "@/components/osoite/Osiot";
import { Valilehdet } from "@/components/Valilehdet";
import {
  HELSINGIN_KESKUSTA,
  alueSlugilla,
  alueenVuokrat,
  hintaSarjat,
  kaikkiAlueet,
  kerrostaloHinta,
  kokoMaa,
  kunta as haeKunta,
  meta,
  slugify,
  vuokraNeljannes,
  type Alue,
  type Paavo,
  type VuokraTyyppi,
} from "@/lib/data";
import { Ylapalkki } from "@/components/Ylapalkki";
import { alueenHinta, muutos, suhdeKuntaan } from "@/lib/raportti";
import { samankaltaisetAlueet } from "@/lib/samankaltaiset";
import { alueenTuotot, HUONETYYPIT } from "@/lib/sijoitus";
import { desimaalina, euroa, euroaDesimaalilla, lukuna, osuus, prosentti } from "@/lib/muotoilu";

export function generateStaticParams() {
  return kaikkiAlueet().map((a) => ({ slug: slugify(a) }));
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const alue = alueSlugilla((await params).slug);
  if (!alue) return {};
  const k = haeKunta(alue.kunta);
  return {
    title: `${alue.pno} ${alue.nimi}, ${k.nimi} – asuntojen hinnat, asukkaat ja palvelut`,
    description: `Postinumeroalue ${alue.pno} ${alue.nimi} (${k.nimi}): neliöhintojen kehitys, tulotaso, ikärakenne, koulut, matka-ajat sekä melutiedot.`,
  };
}

const IKARYHMAT: [string, string[]][] = [
  ["0–6", ["0_2", "3_6"]],
  ["7–17", ["7_12", "13_15", "16_17"]],
  ["18–24", ["18_19", "20_24"]],
  ["25–34", ["25_29", "30_34"]],
  ["35–44", ["35_39", "40_44"]],
  ["45–54", ["45_49", "50_54"]],
  ["55–64", ["55_59", "60_64"]],
  ["65–74", ["65_69", "70_74"]],
  ["75+", ["75_79", "80_84", "85_"]],
];

// Kotitaloudet elämänvaiheittain, osuus kaikista talouksista. Paavon luokat ovat osin päällekkäisiä:
// aikuisten talouksiin (kaikki 18–64 v) kuuluvat myös nuoret yksinasuvat ja parit, ja eläkeikäisten talous
// (vähintään yksi 65+) voi olla myös lapsitalous. Siksi "muut työikäiset" lasketaan erotuksena.
const ELAMANVAIHEET: [string, (p: Paavo) => number | null][] = [
  ["Nuoret yksinasuvat (alle 35 v)", (p) => p.te_nuor],
  ["Nuoret parit ilman lapsia", (p) => p.te_eil_np],
  ["Muut työikäisten taloudet", (p) => (p.te_aik == null || p.te_nuor == null || p.te_eil_np == null ? null : p.te_aik - p.te_nuor - p.te_eil_np)],
  ["Lapsiperheet", (p) => p.te_laps],
  ["Eläkeikäisten taloudet (65+)", (p) => p.te_elak],
];

// Lapsiperheet lasten iän mukaan, osuus lapsiperheistä. Perhe kuuluu jokaiseen ryhmään, jonka ikäinen lapsi siinä on.
const LAPSIPERHEET: [string, (p: Paavo) => number | null][] = [
  ["Alle 3-vuotias lapsi", (p) => p.te_plap],
  ["Alle kouluikäinen (alle 7 v)", (p) => p.te_aklap],
  ["Kouluikäinen (7–12 v)", (p) => p.te_klap],
  ["Teini-ikäinen (13–17 v)", (p) => p.te_teini],
  ["Yksi vanhempi", (p) => p.te_yhlap],
];

function ryhmaOsuudet(alue: Paavo, kunta: Paavo, ryhmat: [string, (p: Paavo) => number | null][], kanta: (p: Paavo) => number | null): IkaRyhma[] {
  return ryhmat.map(([nimi, f]) => ({ nimi, alue: osuus(f(alue), kanta(alue)), vertailu: osuus(f(kunta), kanta(kunta)) }));
}

/** Salattuja tai epäjohdonmukaisia lukuja (pieni alue) ei piirretä. */
const kayttokelpoinen = (r: IkaRyhma[]) => r.every((x) => x.alue != null && x.alue >= 0);

function ikaOsuudet(p: Paavo) {
  return IKARYHMAT.map(([nimi, ryhmat]) => {
    const arvot = ryhmat.map((g) => p[`he_${g}`]);
    return { nimi, osuus: arvot.some((v) => v == null) ? null : osuus(arvot.reduce((s, v) => s! + v!, 0), p.he_vakiy) };
  });
}

const OSIOT = [
  ["lahella", "Lähiympäristö"],
  ["hinnat", "Hinnat"],
  ["vuokra-vai-oma", "Vuokra vai oma"],
  ["sijoittajalle", "Sijoittajalle"],
  ["liikenne", "Liikenne"],
  ["melu", "Melu"],
  ["kaavoitus", "Kaavoitus"],
  ["koulut", "Koulut", "koulut"],
  ["asukkaat", "Asukkaat"],
  ["samankaltaiset", "Samankaltaiset"],
] as const;

// params luetaan <Suspense>-rajan sisällä: listatut 389 aluetta prerenderöidään kokonaan, ja
// listaamattomalle polulle näytetään heti runko (Partial Prefetching, ks. Next.js ISR-ohje).
export default function AluePage({ params }: PageProps<"/[slug]">) {
  return (
    <>
      <Ylapalkki osiot={OSIOT} />
      <main className="mx-auto w-full max-w-[1040px] flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-12">
        <Suspense fallback={<p className="text-muted">Ladataan aluetta…</p>}>
          <AlueSisalto params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function AlueSisalto({ params }: Pick<PageProps<"/[slug]">, "params">) {
  const alue = alueSlugilla((await params).slug);
  if (!alue) notFound();
  const k = haeKunta(alue.kunta);
  const p = alue.paavo;

  const viimeisin = alue.hinnat.at(-1);
  const hinta = viimeisin ? kerrostaloHinta(viimeisin) : null;
  const kuntaHinta = k.hinnat.at(-1);
  const sarjat = hintaSarjat(alue);
  const suhde = suhdeKuntaan(hinta?.hinta, kuntaHinta?.kerrostalot, k.nimi);

  const elamanvaiheet = ryhmaOsuudet(p, k.paavo, ELAMANVAIHEET, (x) => x.te_taly);
  const lapsiperheet = ryhmaOsuudet(p, k.paavo, LAPSIPERHEET, (x) => x.te_laps);
  const asukasRivi = tiivistelmanAsukkaat(p, elamanvaiheet, k.nimi);
  const ikaAlue = ikaOsuudet(p);
  const ikaKunta = ikaOsuudet(k.paavo);
  const ryhmat: IkaRyhma[] = ikaAlue.map((r, i) => ({ nimi: r.nimi, alue: r.osuus, vertailu: ikaKunta[i].osuus }));

  const helsinki = { nimi: "Helsingin keskusta (Rautatientori)", lat: HELSINGIN_KESKUSTA.lat, lon: HELSINGIN_KESKUSTA.lon };
  const oletuskohteet = [
    helsinki,
    ...(alue.kunta !== "091"
      ? [{ nimi: `${k.nimi}, keskusta (${k.keskusta.kohde.split(",")[0]})`, lat: k.keskusta.lat, lon: k.keskusta.lon }]
      : []),
  ];

  const { arvo: hArvo, alateksti: hAlateksti } = alueenHinta(alue);
  const yhteenvetoHinta = { arvo: hArvo, alateksti: hAlateksti };
  const vuokraRivi = tiivistelmanVuokra(alue);
  const hintaLause = hinta && suhde ? `neliöhinta ${suhde}` : null;

  // Hintahistorian huippu (vain alueen oma sarja).
  const alueSarja = sarjat.filter((s): s is typeof s & { alue: number } => s.alue != null);
  const huippu = alueSarja.reduce<(typeof alueSarja)[number] | null>((m, s) => (!m || s.alue > m.alue ? s : m), null);
  const nyt = alueSarja.at(-1);
  const hintaJohdanto = hinta
    ? [
        huippu && nyt && huippu.vuosi !== nyt.vuosi
          ? `Kerrostaloasuntojen neliöhinta nousi huippuunsa ${euroa(huippu.alue)} vuonna ${huippu.vuosi} ja on sen jälkeen ${nyt.alue < huippu.alue ? "laskenut" : "noussut"} ${Math.abs(Math.round((nyt.alue / huippu.alue - 1) * 100))} %.`
          : `Kerrostaloasuntojen neliöhinta ${viimeisin!.vuosi} oli ${euroa(hinta.hinta)}, korkein koko aikasarjassa.`,
        suhde && `Taso on ${suhde} (${k.nimi} ${euroa(kuntaHinta?.kerrostalot)}).`,
      ]
        .filter(Boolean)
        .join(" ")
    : `Alueella on liian vähän kauppoja, jotta Tilastokeskus julkaisisi postinumerokohtaisen hinnan. Kunnan ${k.nimi} kerrostalojen keskihinta ${kuntaHinta?.vuosi} oli ${euroa(kuntaHinta?.kerrostalot)}/m².`;

  // Asukkaat: yliedustetuin ikäryhmä kuntaan verrattuna + kotitalouksien rakenne.
  const yliedustettu = ryhmat
    .filter((r) => r.alue != null && r.vertailu != null)
    .map((r) => ({ ...r, ero: r.alue! - r.vertailu! }))
    .sort((a, b) => b.ero - a.ero)[0];
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const asukasJohdanto = [
    `${lukuna(p.he_vakiy)} asukasta.`,
    yliedustettu && yliedustettu.ero >= 0.02 &&
      `Kuntaan verrattuna eniten on ${yliedustettu.nimi}-vuotiaita: ${pct(yliedustettu.alue!)} asukkaista (${k.nimi} ${pct(yliedustettu.vertailu!)}).`,
    p.te_yks != null && p.te_laps != null && p.te_taly &&
      `Talouksista ${prosentti(p.te_yks, p.te_taly)} on yksinasuvia ja ${prosentti(p.te_laps, p.te_taly)} lapsiperheitä (${k.nimi} ${prosentti(k.paavo.te_yks, k.paavo.te_taly)} ja ${prosentti(k.paavo.te_laps, k.paavo.te_taly)}).`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className="osiot">
      <header>
        <p className="kapiteeli text-accent">
          Alueraportti · {alue.nimi} {alue.pno} · {k.nimi}
        </p>
        <Suspense
          fallback={
            <h1 className="mt-3 font-serif text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.02em] sm:text-[4rem]">{alue.nimi}</h1>
          }
        >
          <Osoitepalkki keskipiste={alue.keskipiste} alueNimi={alue.nimi} hintaLause={hintaLause} keskusta={helsinki} />
        </Suspense>
        <Suspense fallback={<div className="mt-10 h-96 border-t-[3px] border-ink" />}>
          <Yhteenveto
            keskipiste={alue.keskipiste}
            hinta={yhteenvetoHinta}
            vuokra={vuokraRivi}
            asukkaat={asukasRivi}
            keskusta={helsinki}
            kunta={alue.kunta}
          />
        </Suspense>
      </header>

      <Osio id="lahella" otsikko="Lähiympäristö">
        <Suspense fallback={<p className="text-muted">Ladataan karttaa…</p>}>
          <Lahiymparisto keskipiste={alue.keskipiste} />
        </Suspense>
      </Osio>

      <Osio id="hinnat" otsikko="Hinnat">
        <Valilehdet
          ryhma="hinnat"
          valilehdet={[
            {
              avain: "omistus",
              nimi: "Omistusasunnot",
              sisalto: (
                <>
                  <p className="mb-5 max-w-[640px]">{hintaJohdanto}</p>
                  {sarjat.some((s) => s.alue != null) && <HintaKaavio data={sarjat} alueNimi={alue.nimi} kuntaNimi={k.nimi} />}
                  <HuoneHinnat alue={alue} />
                  <p className="mt-3 text-[13px] text-muted">
                    Vanhojen osakeasuntojen neliöhinnat. Kerrostalohinta on yksiöiden, kaksioiden ja kolmioiden keskiarvo
                    kauppamäärillä painotettuna. Omakotitaloja ei tilastoida postinumeroittain. Lähde: Tilastokeskus.
                  </p>
                </>
              ),
            },
            ...(alueenVuokrat(alue) ? [{ avain: "vuokrat", nimi: "Vuokra-asunnot", sisalto: <Vuokrat alue={alue} /> }] : []),
          ]}
        />
      </Osio>

      <VuokraVaiOmaOsio alue={alue} />

      <Sijoittajalle alue={alue} />

      <Osio id="liikenne" otsikko="Liikenne">
        <Suspense fallback={<p className="text-muted">Lasketaan reittejä…</p>}>
          <Liikenne keskipiste={alue.keskipiste} oletuskohteet={oletuskohteet} />
        </Suspense>
      </Osio>

      <Osio id="melu" otsikko="Melu">
        <Suspense fallback={<p className="text-muted">Ladataan melutietoja…</p>}>
          <MeluOsio keskipiste={alue.keskipiste} pno={alue.pno} kunta={alue.kunta} />
        </Suspense>
      </Osio>

      <Osio id="kaavoitus" otsikko="Kaavoitus ja rakentaminen">
        <Suspense fallback={<p className="text-muted">Ladataan kaavoitustietoja…</p>}>
          <KaavoitusOsio keskipiste={alue.keskipiste} pno={alue.pno} kunta={alue.kunta} />
        </Suspense>
      </Osio>

      <Suspense>
        <VainOsoitteelle keskipiste={alue.keskipiste}>
          <Osio id="taloyhtio" otsikko="Taloyhtiö ja rakennus">
            <RakennusTiedot keskipiste={alue.keskipiste} />
            <h3 className="mb-3 font-serif text-[1.375rem] font-semibold">Taloyhtiö</h3>
            <TaloyhtioOsio keskipiste={alue.keskipiste} pno={alue.pno} />
          </Osio>
        </VainOsoitteelle>
      </Suspense>

      <Piilotettava aihe="koulut">
        <Osio id="koulut" otsikko="Koulut">
          <Suspense fallback={<p className="text-muted">Haetaan kouluja…</p>}>
            <Koulut keskipiste={alue.keskipiste} />
          </Suspense>
        </Osio>
      </Piilotettava>

      <Osio id="asukkaat" otsikko="Asukkaat" johdanto={asukasJohdanto}>
        <VertailuTaulukko alue={p} kunta={k.paavo} alueNimi={alue.nimi} kuntaNimi={k.nimi} />
        <div className="mt-10">
          <Valilehdet
            ryhma="asukkaat"
            valilehdet={[
              { avain: "ika", nimi: "Ikärakenne", sisalto: <IkaKaavio ryhmat={ryhmat} alueNimi={alue.nimi} vertailuNimi={k.nimi} /> },
              ...(kayttokelpoinen(elamanvaiheet)
                ? [
                    {
                      avain: "elamanvaihe",
                      nimi: "Elämänvaihe",
                      sisalto: (
                        <IkaKaavio
                          ryhmat={elamanvaiheet}
                          alueNimi={alue.nimi}
                          vertailuNimi={k.nimi}
                          kuvaus="Kotitaloudet elämänvaiheittain, osuus kaikista talouksista"
                          yksikko="Osuus talouksista"
                          ryhmanNimi="Elämänvaihe"
                          leveaNimi
                        />
                      ),
                    },
                  ]
                : []),
              ...(kayttokelpoinen(lapsiperheet)
                ? [
                    {
                      avain: "lapsiperheet",
                      nimi: "Lapsiperheet",
                      sisalto: (
                        <>
                          <p className="mb-3 text-[15px] text-muted">
                            Osuus alueen {lukuna(p.te_laps)} lapsiperheestä lasten iän mukaan. Perhe, jossa on eri-ikäisiä
                            lapsia, kuuluu useaan ryhmään.
                          </p>
                          <IkaKaavio
                            ryhmat={lapsiperheet}
                            alueNimi={alue.nimi}
                            vertailuNimi={k.nimi}
                            kuvaus="Lapsiperheet lasten iän mukaan, osuus lapsiperheistä"
                            yksikko="Osuus lapsiperheistä"
                            ryhmanNimi="Perheessä on"
                            leveaNimi
                          />
                        </>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Lähde: Tilastokeskus, Paavo – postinumeroalueittainen avoin tieto {meta.paavo_vuosi}. Pienten alueiden
          tietoja on salattu tietosuojasyistä. Elämänvaiheen luokat ovat osin päällekkäisiä (esim. eläkeikäisen
          talous, jossa on lapsia), joten osuuksien summa voi ylittää hieman 100 %.
        </p>
      </Osio>

      <Osio
        id="samankaltaiset"
        otsikko="Samankaltaiset alueet"
        johdanto="Uudenmaan alueet, joiden asukkaat ja asuntokanta muistuttavat eniten tätä aluetta: tulotaso, ikä, koulutus, kotitaloudet, omistusasuminen, kerrostalojen osuus ja asukastiheys. Hinta ei vaikuta valintaan, joten listasta löytyy samanlaisia alueita eri hintatasoilla."
      >
        <Samankaltaiset alue={alue} />
      </Osio>
    </article>
  );
}

/** Numeroitu raporttiosio (numero CSS-laskurista, ks. .osiot): vasemmalla numero ja otsikko, oikealla sisältö. */
function Osio({ id, otsikko, johdanto, children }: { id: string; otsikko: string; johdanto?: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-otsikko`}
      className="mt-14 grid scroll-mt-28 gap-x-12 gap-y-5 sm:mt-16 sm:scroll-mt-16 md:grid-cols-[200px_minmax(0,1fr)]"
    >
      <div className="flex items-baseline gap-4 border-t border-ink pt-4 md:block md:border-0 md:pt-0">
        <p aria-hidden className="osio-nro font-serif text-[2.75rem] leading-none text-accent tabular" />
        <h2 id={`${id}-otsikko`} className="font-serif text-[1.875rem] leading-tight font-semibold md:mt-2">
          {otsikko}
        </h2>
      </div>
      <div className="min-w-0">
        {johdanto && <p className="mb-5 max-w-[640px]">{johdanto}</p>}
        {children}
      </div>
    </section>
  );
}

function HuoneHinnat({ alue }: { alue: Alue }) {
  const r = alue.hinnat.at(-1);
  if (!r) return null;
  const rivit = [
    ["Yksiöt", r.yksiot, r.yksiot_lkm],
    ["Kaksiot", r.kaksiot, r.kaksiot_lkm],
    ["Kolmiot+", r.kolmiot, r.kolmiot_lkm],
    ["Rivitalot", r.rivitalot, r.rivitalot_lkm],
  ] as const;
  if (rivit.every(([, h]) => h == null)) return null;
  return (
    <table className="mt-10 w-full max-w-md text-left text-[15px] tabular">
      <caption className="mb-2 text-left font-semibold">Neliöhinnat {r.vuosi} talotyypeittäin</caption>
      <tbody className="border-t border-ink">
        {rivit.map(([nimi, h, n]) => (
          <tr key={nimi} className="border-b border-grid">
            <th scope="row" className="py-2.5 text-left font-normal">
              {nimi}
            </th>
            <td className="py-2.5 text-right font-semibold">{h != null ? `${euroa(h)}/m²` : "–"}</td>
            <td className="py-2.5 text-right text-muted">{n != null ? `${n} kauppaa` : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tiivistelmän vuokrarivi: kaksion kuukausivuokra (suurimmat kaupungit) tai neliövuokra. */
function tiivistelmanVuokra(alue: Alue): TiivistelmaRivi | null {
  const v = alueenVuokrat(alue);
  if (!v) return null;
  const kaksio = v.alue.tyypit.kaksiot;
  const missa = v.alue.koodi === "MK01" ? "Uusimaa keskimäärin" : v.alue.koodi === "keh" ? "kehyskunnat keskimäärin" : v.alue.nimi;
  if (kaksio.kk_mediaani != null) return { arvo: `${euroa(kaksio.kk_mediaani)}/kk`, selite: `kaksion mediaanivuokra · ${missa}` };
  if (kaksio.vapaa != null) return { arvo: `${euroaDesimaalilla(kaksio.vapaa)}/m²`, selite: `kaksiot, vapaarahoitteiset · ${missa}` };
  return null;
}

// Tiivistelmän lyhyet nimet elämänvaiheille (samassa järjestyksessä kuin ELAMANVAIHEET).
const ELAMANVAIHE_LYHYT = ["Nuoria yksinasuvia", "Nuoria pareja", "Työikäisiä", "Lapsiperheitä", "Eläkeikäisiä"];

/** Tiivistelmän asukasrivi: elämänvaihe, jota alueella on eniten enemmän kuin kunnassa. */
function tiivistelmanAsukkaat(p: Paavo, vaiheet: IkaRyhma[], kuntaNimi: string): TiivistelmaRivi | null {
  if (p.he_vakiy == null) return null;
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const asukasta = `${lukuna(p.he_vakiy)} asukasta`;
  const erottuva = vaiheet
    .map((r, i) => ({ ...r, i, ero: r.alue != null && r.vertailu != null ? r.alue - r.vertailu : -1 }))
    .sort((a, b) => b.ero - a.ero)[0];
  if (!erottuva || erottuva.ero < 0.02) return { arvo: lukuna(p.he_vakiy), selite: "asukasta" };
  return {
    arvo: ELAMANVAIHE_LYHYT[erottuva.i],
    selite: `${pct(erottuva.alue!)} talouksista (${kuntaNimi} ${pct(erottuva.vertailu!)}) · ${asukasta}`,
    href: "#elamanvaihe",
  };
}

const neljannesTekstina = (q: string) => `${q.slice(5)}. neljännes ${q.slice(0, 4)}`;

/** Vuokrat huoneluvuittain vuokratilaston tarkimmalta alueelta, johon postinumero kuuluu. */
function Vuokrat({ alue }: { alue: Alue }) {
  const v = alueenVuokrat(alue);
  if (!v) return null;
  const { alue: va, vertailu } = v;
  const rivit = [
    ["Yksiöt", "yksiot"],
    ["Kaksiot", "kaksiot"],
    ["Kolmiot+", "kolmiot"],
  ] as const;
  const kk = rivit.some(([, t]) => va.tyypit[t].kk_mediaani != null);
  const muutos = va.tyypit.kaikki.vapaa_vuosimuutos;
  const neliovuokra = (t: VuokraTyyppi | undefined) => (t?.vapaa != null ? `${euroaDesimaalilla(t.vapaa)}/m²` : "–");

  return (
    <div>
      <p className="mb-4 max-w-[640px]">
        {va.postinumerot
          ? `Vuokria ei tilastoida postinumeroittain. ${alue.nimi} kuuluu vuokratilaston osa-alueeseen ${va.nimi} (${va.postinumerot} postinumeroaluetta).`
          : va.koodi === "keh"
            ? `Tilastokeskus julkaisee vuokrat vain suurimmille kaupungeille, joten luvut ovat kehyskuntien keskiarvoja (${va.kunnat?.join(", ")}).`
            : va.koodi === "MK01"
              ? "Tilastokeskus julkaisee vuokrat vain suurimmille kaupungeille, joten luvut ovat koko Uudenmaan keskiarvoja. Pääkaupunkiseudun vuokrat nostavat niitä selvästi."
              : `Vuokria ei tilastoida postinumeroittain, joten luvut ovat koko kunnan (${va.nimi}) keskiarvoja.`}
        {va.tyypit.kaikki.vapaa != null &&
          ` Vapaarahoitteisen vuokra-asunnon keskivuokra on ${euroaDesimaalilla(va.tyypit.kaikki.vapaa)}/m²`}
        {va.tyypit.kaikki.vapaa != null &&
          (muutos != null ? ` (${muutos >= 0 ? "+" : "−"}${desimaalina(Math.abs(muutos))} % vuodessa).` : ".")}
      </p>
      <table className="w-full text-left text-[15px] tabular">
        <caption className="sr-only">
          Vuokrat huoneluvuittain: {va.nimi}
          {vertailu ? ` ja ${vertailu.nimi}` : ""}
        </caption>
        <thead className="text-[13px] text-muted">
          <tr className="border-b border-ink">
            <th scope="col" className="py-2" />
            <th scope="col" className="py-2 pl-3 text-right font-bold text-ink">
              {va.nimi}
            </th>
            {kk && (
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                Kuukausivuokra
              </th>
            )}
            {vertailu && (
              <th scope="col" className="hidden py-2 pl-3 text-right font-medium sm:table-cell">
                {vertailu.nimi}
              </th>
            )}
            <th scope="col" className="hidden py-2 pl-3 text-right font-medium sm:table-cell">
              Valtion tukema
            </th>
          </tr>
        </thead>
        <tbody>
          {rivit.map(([nimi, t]) => {
            const r = va.tyypit[t];
            return (
              <tr key={t} className="border-b border-grid">
                <th scope="row" className="py-2.5 pr-2 text-left font-normal">
                  {nimi}
                </th>
                <td className="py-2.5 pl-3 text-right font-bold whitespace-nowrap">{neliovuokra(r)}</td>
                {kk && (
                  <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                    {r.kk_mediaani != null ? `${euroa(r.kk_mediaani)}/kk` : "–"}
                    {r.kk_alakvartiili != null && r.kk_ylakvartiili != null && (
                      <span className="block text-[13px] text-muted">
                        {lukuna(r.kk_alakvartiili)}–{euroa(r.kk_ylakvartiili)}
                      </span>
                    )}
                  </td>
                )}
                {vertailu && (
                  <td className="hidden py-2.5 pl-3 text-right whitespace-nowrap text-muted sm:table-cell">
                    {neliovuokra(vertailu.tyypit[t])}
                  </td>
                )}
                <td className="hidden py-2.5 pl-3 text-right whitespace-nowrap text-muted sm:table-cell">
                  {r.tuettu != null ? `${euroaDesimaalilla(r.tuettu)}/m²` : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[13px] text-muted">
        Keskineliövuokrat {neljannesTekstina(vuokraNeljannes)}, vapaarahoitteiset vuokra-asunnot ellei toisin mainita.
        {kk && " Kuukausivuokra on kokonaisvuokran mediaani, alla puolet vuokrista sijoittuu välille."} Lähde:
        Tilastokeskus, asuntojen vuokrat.
      </p>
    </div>
  );
}

const OLETUSALAT = { yksiot: 30, kaksiot: 50, kolmiot: 75 } as const;

/** "5,2 %" / "−1,4 %" osuudesta (0.052). */
const pros1 = (x: number | null, etumerkki = false) =>
  x == null ? "–" : `${etumerkki ? (x >= 0 ? "+" : "−") : ""}${desimaalina(Math.abs(x) * 100)} %`;

/** Vuokralla vai omistaen -vertailu alueen hinnoilla ja vuokrilla. */
function VuokraVaiOmaOsio({ alue }: { alue: Alue }) {
  const t = alueenTuotot(alue);
  const v = alueenVuokrat(alue);
  if (!t || !v) return null;
  const nimi = (tyyppi: string) => HUONETYYPIT.find(([a]) => a === tyyppi)![1].replace("+", "");
  return (
    <Osio
      id="vuokra-vai-oma"
      otsikko="Vuokralla vai omistaen"
      johdanto="Paljonko omistaminen vie rahaa kuukaudessa verrattuna vuokralla asumiseen ja kumpi kasvattaa varallisuutta enemmän, kun vuokralainen sijoittaa käsirahan ja kuukausittaisen erotuksen. Oletukset ovat alueen keskihintoja ja -vuokria – korjaa ne katsomasi asunnon luvuilla."
    >
      <VuokraVaiOma
        varaHinta={t.kuntaHinta}
        vuokramuutos={v.alue.tyypit.kaikki.vapaa_vuosimuutos}
        tyypit={t.tyypit.map((r) => ({
          avain: r.tyyppi,
          nimi: nimi(r.tyyppi),
          ala: OLETUSALAT[r.tyyppi],
          hinta: r.hinta,
          vuokra: r.vuokra,
          kkVuokra: v.alue.tyypit[r.tyyppi].kk_mediaani ?? null,
          hintamuutos: r.hintamuutos,
        }))}
      />
    </Osio>
  );
}

/** Bruttovuokratuotto huoneluvuittain ja tuottolaskuri. */
function Sijoittajalle({ alue }: { alue: Alue }) {
  const t = alueenTuotot(alue);
  if (!t) return null;
  const kaksio = t.tyypit.find((r) => r.tyyppi === "kaksiot")!;
  const paras = t.tyypit.filter((r) => r.tuotto != null).sort((a, b) => b.tuotto! - a.tuotto!)[0];
  const nimi = (tyyppi: string) => HUONETYYPIT.find(([a]) => a === tyyppi)![1];
  const adessiivi = { yksiot: "yksiöillä", kaksiot: "kaksioilla", kolmiot: "kolmioilla" } as const;
  const johdanto = [
    t.karkea && paras
      ? `Alueen omia vuokria ei tilastoida, joten tuotto on laskettu ${t.karkea === "uusimaa" ? "koko Uudenmaan" : "kehyskuntien"} keskivuokralla ja on todennäköisesti yläkanttiin. Tarkista vuokrataso alueen vuokrailmoituksista.`
      : kaksio.tuotto != null && kaksio.sijoitus != null
        ? `Kaksion bruttovuokratuotto on ${pros1(kaksio.tuotto)}, enemmän kuin ${Math.round(kaksio.sijoitus * 100)} %:lla Uudenmaan postinumeroalueista (mediaani ${pros1(kaksio.mediaani)}).`
        : paras
          ? `Paras bruttovuokratuotto on ${adessiivi[paras.tyyppi]}: ${pros1(paras.tuotto)} (Uudenmaan mediaani ${pros1(paras.mediaani)}).`
          : "Alueelta on liian vähän kauppoja, jotta tuoton voisi laskea huoneluvuittain. Laskurin oletuksena on kunnan keskihinta.",
    paras && kaksio.tuotto != null && paras.tyyppi !== "kaksiot" && `Paras tuotto on ${adessiivi[paras.tyyppi]} (${pros1(paras.tuotto)}).`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Osio id="sijoittajalle" otsikko="Sijoittajalle" johdanto={johdanto}>
      <table className="w-full text-left text-[15px] tabular">
        <caption className="sr-only">Bruttovuokratuotto huoneluvuittain</caption>
        <thead className="text-[13px] text-muted">
          <tr className="border-b border-ink">
            <th scope="col" className="py-2" />
            <th scope="col" className="py-2 pl-3 text-right font-medium">
              Neliöhinta
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">
              Vuokra
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-bold text-ink">
              Bruttotuotto
            </th>
            <th scope="col" className="hidden py-2 pl-3 text-right font-medium sm:table-cell">
              Uusimaa, mediaani
            </th>
            <th scope="col" className="hidden py-2 pl-3 text-right font-medium sm:table-cell">
              Hinta vuodessa, 5 v
            </th>
          </tr>
        </thead>
        <tbody>
          {t.tyypit.map((r) => (
            <tr key={r.tyyppi} className="border-b border-grid">
              <th scope="row" className="py-2.5 pr-2 text-left font-normal">
                {nimi(r.tyyppi)}
              </th>
              <td className="py-2.5 pl-3 text-right whitespace-nowrap">{r.hinta != null ? `${euroa(r.hinta)}/m²` : "–"}</td>
              <td className="py-2.5 pl-3 text-right whitespace-nowrap">{r.vuokra != null ? `${euroaDesimaalilla(r.vuokra)}/m²` : "–"}</td>
              <td className="py-2.5 pl-3 text-right font-bold whitespace-nowrap">{pros1(r.tuotto)}</td>
              <td className="hidden py-2.5 pl-3 text-right whitespace-nowrap text-muted sm:table-cell">{pros1(r.mediaani)}</td>
              <td className="hidden py-2.5 pl-3 text-right whitespace-nowrap text-muted sm:table-cell">{pros1(r.hintamuutos, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 mb-10 text-[13px] text-muted">
        Bruttotuotto = vuoden vuokrat / neliöhinta, ennen vastikkeita ja veroja. Neliöhinnat {t.vuosi} (vanhat osakeasunnot,
        postinumeroalue), vapaarahoitteiset vuokrat {neljannesTekstina(vuokraNeljannes)} ({t.vuokraAlue}). Hinnan muutos on
        keskimääräinen vuosimuutos viideltä vuodelta. Uudenmaan mediaanissa ovat mukana postinumeroalueet, joille Tilastokeskus
        julkaisee oman kaupungin vuokrat. Lähde: Tilastokeskus.
      </p>
      <Tuottolaskuri
        varaHinta={t.kuntaHinta}
        tyypit={t.tyypit.map((r) => ({ avain: r.tyyppi, nimi: nimi(r.tyyppi).replace("+", ""), ala: OLETUSALAT[r.tyyppi], hinta: r.hinta, vuokra: r.vuokra }))}
      />
    </Osio>
  );
}

/** Vertailulinkin parametri (sama muoto kuin useVertailu.ts: lat,lon,nimi). */
const vertailuKohde = (a: Alue) => `${a.keskipiste.lat.toFixed(5)},${a.keskipiste.lon.toFixed(5)},${a.pno} ${a.nimi}`;

function Samankaltaiset({ alue }: { alue: Alue }) {
  const alueet = samankaltaisetAlueet(alue);
  if (!alueet.length) return <p className="text-muted">Alueella on liian vähän asukkaita vertailuun.</p>;
  const oma = alueenHinta(alue);
  const rivit = [alue, ...alueet];
  return (
    <>
      <table className="w-full text-left text-[15px] tabular">
        <caption className="sr-only">Samankaltaiset alueet: neliöhinta, mediaanitulot, keski-ikä ja lapsitaloudet</caption>
        <thead className="text-[13px] text-muted">
          <tr className="border-b border-ink">
            <th scope="col" className="py-2 font-medium">
              Alue
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">
              Neliöhinta
            </th>
            <th scope="col" className="hidden py-2 pl-3 text-right font-medium sm:table-cell">
              Mediaanitulot
            </th>
            <th scope="col" className="hidden py-2 pl-3 text-right font-medium md:table-cell">
              Keski-ikä
            </th>
            <th scope="col" className="hidden py-2 pl-3 text-right font-medium md:table-cell">
              Lapsitaloudet
            </th>
            <th scope="col" className="py-2 pl-3">
              <span className="sr-only">Vertailu</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rivit.map((a) => {
            const tama = a.pno === alue.pno;
            const k = haeKunta(a.kunta);
            const h = alueenHinta(a);
            const ero = !tama && !h.kunnanKeskiarvo && !oma.kunnanKeskiarvo && h.euroa && oma.euroa ? muutos(h.euroa, oma.euroa) : null;
            return (
              <tr key={a.pno} className={`border-b border-grid ${tama ? "bg-grid" : ""}`}>
                <th scope="row" className="py-2.5 pr-2 pl-0 text-left font-normal">
                  {tama ? (
                    <span className="font-semibold">{a.nimi}</span>
                  ) : (
                    <Link href={`/${slugify(a)}`} className="font-semibold text-accent hover:underline">
                      {a.nimi}
                    </Link>
                  )}
                  <span className="block text-[13px] text-muted">
                    {a.pno} {k.nimi}
                    {tama && " · tämä alue"}
                  </span>
                </th>
                <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                  <span className={tama ? "font-semibold" : ""}>{h.euroa != null ? `${euroa(h.euroa)}/m²` : "–"}</span>
                  {(ero || h.kunnanKeskiarvo) && (
                    <span className="block text-[13px] text-muted">{h.kunnanKeskiarvo ? "kunnan keskiarvo" : ero}</span>
                  )}
                </td>
                <td className="hidden py-2.5 pl-3 text-right whitespace-nowrap sm:table-cell">{euroa(a.paavo.hr_mtu)}</td>
                <td className="hidden py-2.5 pl-3 text-right whitespace-nowrap md:table-cell">
                  {a.paavo.he_kika != null ? `${a.paavo.he_kika} v` : "–"}
                </td>
                <td className="hidden py-2.5 pl-3 text-right whitespace-nowrap md:table-cell">{prosentti(a.paavo.te_laps, a.paavo.te_taly)}</td>
                <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                  {!tama && (
                    <Link
                      href={`/vertailu?${new URLSearchParams([
                        ["o", vertailuKohde(alue)],
                        ["o", vertailuKohde(a)],
                      ])}`}
                      className="text-[13px] text-accent hover:underline"
                    >
                      Vertaa<span className="sr-only">: {alue.nimi} ja {a.nimi}</span>
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[13px] text-muted">
        Neliöhinnan muutos on suhteessa tähän alueeseen. Vertailu avaa alueiden keskipisteet rinnakkain. Lähde: Tilastokeskus, Paavo{" "}
        {meta.paavo_vuosi} ja osakeasuntojen hinnat. Mukana alueet, joilla on vähintään 200 asukasta.
      </p>
    </>
  );
}

function VertailuTaulukko({ alue, kunta, alueNimi, kuntaNimi }: { alue: Paavo; kunta: Paavo; alueNimi: string; kuntaNimi: string }) {
  const rivit: [string, (p: Paavo) => string][] = [
    ["Asukkaiden mediaanitulot", (p) => euroa(p.hr_mtu)],
    ["Talouksien mediaanitulot", (p) => euroa(p.tr_mtu)],
    ["Keski-ikä", (p) => (p.he_kika != null ? `${p.he_kika} v` : "–")],
    ["Ylempi korkeakoulututkinto (18+)", (p) => prosentti(p.ko_yl_kork, p.ko_ika18y)],
    ["Työttömät", (p) => prosentti(p.pt_tyott, p.pt_vakiy)],
    ["Lapsitaloudet", (p) => prosentti(p.te_laps, p.te_taly)],
    ["Yksinasuvat taloudet", (p) => prosentti(p.te_yks, p.te_taly)],
    ["Omistusasunnoissa", (p) => prosentti(p.te_omis_as, p.te_taly)],
    ["Kerrostaloasunnot", (p) => prosentti(p.ra_kt_as, p.ra_asunn)],
    ["Asuntojen keskikoko", (p) => (p.ra_as_kpa != null ? `${lukuna(Math.round(p.ra_as_kpa))} m²` : "–")],
  ];
  return (
    <table className="w-full text-left text-[15px] tabular">
      <caption className="sr-only">Asukkaat ja asuminen: {alueNimi}, {kuntaNimi} ja koko maa</caption>
      <thead className="text-[13px] text-muted">
        <tr className="border-b border-ink">
          <th scope="col" className="py-2" />
          <th scope="col" className="py-2 pl-3 text-right font-bold text-ink">
            {alueNimi}
          </th>
          <th scope="col" className="py-2 pl-3 text-right font-medium">
            {kuntaNimi}
          </th>
          <th scope="col" className="hidden py-2 pl-3 text-right font-medium sm:table-cell">
            Koko maa
          </th>
        </tr>
      </thead>
      <tbody>
        {rivit.map(([nimi, f]) => (
          <tr key={nimi} className="border-b border-grid">
            <th scope="row" className="py-2.5 pr-2 text-left font-normal">
              {nimi}
            </th>
            <td className="py-2.5 pl-3 text-right font-bold whitespace-nowrap">{f(alue)}</td>
            <td className="py-2.5 pl-3 text-right whitespace-nowrap text-muted">{f(kunta)}</td>
            <td className="hidden py-2.5 pl-3 text-right whitespace-nowrap text-muted sm:table-cell">{f(kokoMaa.paavo)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

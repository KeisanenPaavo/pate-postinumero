import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HintaKaavio } from "@/components/HintaKaavio";
import { IkaKaavio, type IkaRyhma } from "@/components/IkaKaavio";
import { Lahiymparisto } from "@/components/osoite/Lahiymparisto";
import { Koulut, Liikenne, MeluOsio, Osoitepalkki, Yhteenveto } from "@/components/osoite/Osiot";
import {
  HELSINGIN_KESKUSTA,
  alueSlugilla,
  hintaSarjat,
  kaikkiAlueet,
  kerrostaloHinta,
  kokoMaa,
  kunta as haeKunta,
  meta,
  slugify,
  type Alue,
  type Paavo,
} from "@/lib/data";
import { Ylapalkki } from "@/components/Ylapalkki";
import { euroa, genetiivi, lukuna, osuus, prosentti } from "@/lib/muotoilu";

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

function ikaOsuudet(p: Paavo) {
  return IKARYHMAT.map(([nimi, ryhmat]) => {
    const arvot = ryhmat.map((g) => p[`he_${g}`]);
    return { nimi, osuus: arvot.some((v) => v == null) ? null : osuus(arvot.reduce((s, v) => s! + v!, 0), p.he_vakiy) };
  });
}

const OSIOT = [
  ["lahella", "Lähiympäristö"],
  ["hinnat", "Hinnat"],
  ["liikenne", "Liikenne"],
  ["melu", "Melu"],
  ["koulut", "Koulut"],
  ["asukkaat", "Asukkaat"],
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

/** "+12 %" / "−15 %" */
const muutos = (uusi: number, vanha: number) => {
  const pct = Math.round((uusi / vanha - 1) * 100);
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)} %`;
};

/** Hinta suhteessa kuntaan: "8 % yli Helsingin keskitason" / "Helsingin keskitasoa". */
function suhdeKuntaan(arvo: number | null | undefined, vertailu: number | null | undefined, kuntaNimi: string) {
  if (arvo == null || !vertailu) return null;
  const pct = Math.round((arvo / vertailu - 1) * 100);
  if (Math.abs(pct) < 3) return `${genetiivi(kuntaNimi)} keskitasoa`;
  return `${Math.abs(pct)} % ${pct > 0 ? "yli" : "alle"} ${genetiivi(kuntaNimi)} keskitason`;
}

async function AlueSisalto({ params }: Pick<PageProps<"/[slug]">, "params">) {
  const alue = alueSlugilla((await params).slug);
  if (!alue) notFound();
  const k = haeKunta(alue.kunta);
  const p = alue.paavo;

  const viimeisin = alue.hinnat.at(-1);
  const hinta = viimeisin ? kerrostaloHinta(viimeisin) : null;
  const viiden = alue.hinnat.find((h) => h.vuosi === (viimeisin?.vuosi ?? 0) - 5);
  const hinta5 = viiden ? kerrostaloHinta(viiden) : null;
  const kuntaHinta = k.hinnat.at(-1);
  const sarjat = hintaSarjat(alue);
  const suhde = suhdeKuntaan(hinta?.hinta, kuntaHinta?.kerrostalot, k.nimi);

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

  const yhteenvetoHinta = hinta
    ? {
        arvo: `${euroa(hinta.hinta)}/m²`,
        alateksti: [suhde, hinta5 ? `${muutos(hinta.hinta, hinta5.hinta)} vuodesta ${viiden!.vuosi}` : `${hinta.lkm} kauppaa ${viimeisin!.vuosi}`]
          .filter(Boolean)
          .join(" · "),
      }
    : { arvo: `${euroa(kuntaHinta?.kerrostalot)}/m²`, alateksti: `${k.nimi} keskimäärin – alueelta liian vähän kauppoja` };
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
    <article>
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
          <Yhteenveto keskipiste={alue.keskipiste} hinta={yhteenvetoHinta} keskusta={helsinki} />
        </Suspense>
      </header>

      <Osio nro={1} id="lahella" otsikko="Lähiympäristö">
        <Suspense fallback={<p className="text-muted">Ladataan karttaa…</p>}>
          <Lahiymparisto keskipiste={alue.keskipiste} />
        </Suspense>
      </Osio>

      <Osio nro={2} id="hinnat" otsikko="Hinnat" johdanto={hintaJohdanto}>
        {sarjat.some((s) => s.alue != null) && <HintaKaavio data={sarjat} alueNimi={alue.nimi} kuntaNimi={k.nimi} />}
        <HuoneHinnat alue={alue} />
        <p className="mt-3 text-[13px] text-muted">
          Vanhojen osakeasuntojen neliöhinnat. Kerrostalohinta on yksiöiden, kaksioiden ja kolmioiden keskiarvo
          kauppamäärillä painotettuna. Omakotitaloja ei tilastoida postinumeroittain. Lähde: Tilastokeskus.
        </p>
      </Osio>

      <Osio nro={3} id="liikenne" otsikko="Liikenne">
        <Suspense fallback={<p className="text-muted">Lasketaan reittejä…</p>}>
          <Liikenne keskipiste={alue.keskipiste} oletuskohteet={oletuskohteet} />
        </Suspense>
      </Osio>

      <Osio nro={4} id="melu" otsikko="Melu">
        <Suspense fallback={<p className="text-muted">Ladataan melutietoja…</p>}>
          <MeluOsio keskipiste={alue.keskipiste} pno={alue.pno} kunta={alue.kunta} />
        </Suspense>
      </Osio>

      <Osio nro={5} id="koulut" otsikko="Koulut">
        <Suspense fallback={<p className="text-muted">Haetaan kouluja…</p>}>
          <Koulut keskipiste={alue.keskipiste} />
        </Suspense>
      </Osio>

      <Osio nro={6} id="asukkaat" otsikko="Asukkaat" johdanto={asukasJohdanto}>
        <VertailuTaulukko alue={p} kunta={k.paavo} alueNimi={alue.nimi} kuntaNimi={k.nimi} />
        <h3 className="mt-10 mb-3 font-semibold">Ikärakenne</h3>
        <IkaKaavio ryhmat={ryhmat} alueNimi={alue.nimi} vertailuNimi={k.nimi} />
        <p className="mt-3 text-[13px] text-muted">
          Lähde: Tilastokeskus, Paavo – postinumeroalueittainen avoin tieto {meta.paavo_vuosi}. Pienten alueiden
          tietoja on salattu tietosuojasyistä.
        </p>
      </Osio>
    </article>
  );
}

/** Numeroitu raporttiosio: vasemmalla numero ja otsikko, oikealla sisältö. */
function Osio({ nro, id, otsikko, johdanto, children }: { nro: number; id: string; otsikko: string; johdanto?: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-otsikko`}
      className="mt-14 grid scroll-mt-28 gap-x-12 gap-y-5 sm:mt-16 sm:scroll-mt-16 md:grid-cols-[200px_minmax(0,1fr)]"
    >
      <div className="flex items-baseline gap-4 border-t border-ink pt-4 md:block md:border-0 md:pt-0">
        <p aria-hidden className="font-serif text-[2.75rem] leading-none text-accent tabular">
          {String(nro).padStart(2, "0")}
        </p>
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

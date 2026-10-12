import Link from "next/link";
import { EtusivunHaku } from "@/components/EtusivunHaku";
import { Ylapalkki } from "@/components/Ylapalkki";
import { kaikkiAlueet, kerrostaloHinta, kunnatAlueineen, kunta, slugify } from "@/lib/data";
import { euroa } from "@/lib/muotoilu";

const ESIMERKIT = ["00530", "02100", "01300", "04400"];

// Samat osiot ja numerot kuin raporttisivulla.
const SISALTO = [
  ["Hinnat", "Neliöhinnat 15 vuoden ajalta kuntaan verrattuna"],
  ["Liikenne", "Matka-ajat keskustaan ja omiin kohteisiisi"],
  ["Melu", "Tie- ja raideliikenteen melu osoitteessa"],
  ["Koulut", "Lähimmät peruskoulut ja lukiot"],
  ["Asukkaat", "Tulot, ikärakenne ja asuminen"],
] as const;

export default function Etusivu() {
  const alueet = kaikkiAlueet();
  const hakuAlueet = alueet.map((a) => ({ pno: a.pno, nimi: a.nimi, kunta: kunta(a.kunta).nimi, slug: slugify(a) }));
  const kunnat = kunnatAlueineen();

  return (
    <>
      <Ylapalkki />
      <main className="mx-auto w-full max-w-[1040px] flex-1 px-4 pt-12 pb-16 sm:px-6 sm:pt-20">
        <section aria-labelledby="etusivu-otsikko" className="max-w-[760px]">
          <p className="kapiteeli text-accent">Alueraportti · Uusimaa</p>
          <h1 id="etusivu-otsikko" className="mt-3 font-serif text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.02em] text-balance sm:text-[4rem]">
            Tunne alue ennen kuin ostat
          </h1>
          <p className="mt-5 font-serif text-[1.375rem] leading-[1.35] text-ink-2 sm:text-[1.625rem]">
            Myynti-ilmoitus kertoo asunnosta. Raportti kertoo, millainen sen ympäristö on: hinnat, liikenne, melu, koulut ja
            asukkaat yhdellä haulla.
          </p>
          <div className="mt-8">
            <EtusivunHaku alueet={hakuAlueet} />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 text-[15px]">
            <span className="text-muted">Kokeile:</span>
            {ESIMERKIT.map((pno) => {
              const a = alueet.find((x) => x.pno === pno)!;
              return (
                <Link key={pno} href={`/${slugify(a)}`} className="linkki inline-flex min-h-11 items-center">
                  {a.nimi}, {kunta(a.kunta).nimi}
                </Link>
              );
            })}
          </p>
        </section>

        <section aria-labelledby="sisalto" className="mt-16 border-t-[3px] border-ink">
          <h2 id="sisalto" className="kapiteeli py-3">
            Raportin sisältö
          </h2>
          <ol className="grid border-t border-rule sm:grid-cols-5">
            {SISALTO.map(([otsikko, teksti], i) => (
              <li key={otsikko} className="flex gap-4 border-b border-rule py-4 sm:block sm:border-b-0 sm:py-5 sm:pr-5 sm:not-first:border-l sm:not-first:pl-5">
                <span aria-hidden className="font-serif text-[2rem] leading-none text-accent tabular">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block font-serif text-xl font-semibold sm:mt-2">{otsikko}</span>
                  <span className="block text-[15px] text-muted">{teksti}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="kunnat" className="mt-16 border-t-[3px] border-ink">
          <h2 id="kunnat" className="kapiteeli pt-3">
            Selaa alueita kunnittain
          </h2>
          <p className="mt-1 mb-4 text-[15px] text-muted">
            Uudenmaan 26 kuntaa ja {alueet.length} postinumeroaluetta. Hinta on kerrostalojen neliöhinta 2025.
          </p>
          <div className="grid gap-x-8 border-t border-rule sm:grid-cols-2 lg:grid-cols-3">
            {kunnat.map((k) => (
              <details key={k.kunta} className="group border-b border-rule">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2">
                  <span>
                    <span className="font-semibold">{k.nimi}</span> <span className="text-sm text-muted">{k.alueet.length} aluetta</span>
                  </span>
                  <span aria-hidden className="text-lg text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <ul className="pb-3 text-[15px]">
                  {k.alueet.map((a) => {
                    const h = a.hinnat.at(-1);
                    const hinta = h ? kerrostaloHinta(h) : null;
                    return (
                      <li key={a.pno}>
                        <Link href={`/${slugify(a)}`} className="group/a flex min-h-10 items-center justify-between gap-4 hover:bg-grid">
                          <span className="text-accent group-hover/a:underline">
                            {a.pno} {a.nimi}
                          </span>
                          <span className="tabular text-muted">{hinta ? `${euroa(hinta.hinta)}/m²` : ""}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

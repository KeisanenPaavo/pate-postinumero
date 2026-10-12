import type { Metadata } from "next";
import { Newsreader, Public_Sans } from "next/font/google";
import { meta } from "@/lib/data";
import { SIVUSTO } from "@/lib/sivusto";
import "./globals.css";

// Newsreader: otsikot ja isot luvut (optinen koko mukana, jotta isot otsikot piirtyvät tiukempina).
const newsreader = Newsreader({ subsets: ["latin"], axes: ["opsz"], variable: "--font-newsreader", display: "swap" });
// Public Sans: leipäteksti, taulukot ja käyttöliittymä.
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${SIVUSTO} – asuinalueen taustatiedot postinumerolla`, template: `%s | ${SIVUSTO}` },
  description:
    "Asuntokaupan taustatarkistus: alueen hintakehitys, asukkaat, koulut, matka-ajat sekä melutiedot yhdeltä sivulta. Uusimaa.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fi" className={`${newsreader.variable} ${publicSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <footer className="mx-auto w-full max-w-[1040px] px-4 pb-10 sm:px-6">
          <div className="space-y-1 border-t border-ink pt-3 text-[13px] text-muted">
            <p>
              <span className="font-semibold text-ink">Lähteet: </span>
              {meta.lahteet.join(" · ")}
            </p>
            <p>© Digitransit (reitit ja osoitehaku), CC BY 4.0 · Osoitedataa © OpenStreetMap contributors, ODbL</p>
            <p>Väylävirasto, Helsingin ja Espoon kaupungit: meluselvitykset 2022, CC BY 4.0</p>
            <p>Tiedot ovat suuntaa-antavia eivätkä korvaa kohdekohtaista selvitystä. Melutiedot perustuvat mallinnuksiin.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

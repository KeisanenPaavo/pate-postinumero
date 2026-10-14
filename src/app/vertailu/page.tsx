import type { Metadata } from "next";
import { Vertailu } from "@/components/vertailu/Vertailu";
import { Ylapalkki } from "@/components/Ylapalkki";
import { HELSINGIN_KESKUSTA } from "@/lib/data";

export const metadata: Metadata = {
  title: "Vertailu",
  description: "Vertaa kolmea osoitetta rinnakkain: neliöhinta, matka-ajat, kävelyajat pysäkille, kauppaan ja lähikouluun sekä liikennemelu.",
};

// Vertailtavat osoitteet ovat käyttäjän selaimessa (localStorage), joten sivu on staattinen runko ja tiedot haetaan selaimessa.
export default function VertailuSivu() {
  const keskusta = { nimi: "Helsingin keskusta (Rautatientori)", lat: HELSINGIN_KESKUSTA.lat, lon: HELSINGIN_KESKUSTA.lon };
  return (
    <>
      <Ylapalkki />
      <main className="mx-auto w-full max-w-[1040px] flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-12">
        <p className="kapiteeli text-accent">Vertailu · enintään 3 osoitetta</p>
        <h1 className="mt-3 font-serif text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.02em] text-balance sm:text-[4rem]">
          Osoitteet rinnakkain
        </h1>
        <p className="mt-5 max-w-[760px] font-serif text-[1.375rem] leading-[1.35] text-ink-2 sm:text-[1.625rem]">
          Hinta, matka-ajat, arjen kävelymatkat ja melu samassa taulukossa. Paras arvo on merkitty joka riville.
        </p>
        <div className="mt-10">
          <Vertailu keskusta={keskusta} />
        </div>
      </main>
    </>
  );
}

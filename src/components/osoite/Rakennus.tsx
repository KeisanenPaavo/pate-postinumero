"use client";

import type { Rakennus, Rakennuslupa, Rakennustiedot } from "@/lib/rakennus";
import { pisteParam, useJson, useOsoite, type Piste } from "./yhteiset";

/** Putkiremontti tehdään tyypillisesti tämän ikäisenä; tätä vanhemmille ilman tuoretta muutostyötä näytetään huomautus. */
const PUTKIREMONTTI_IKA = 40;
/** Muutostyölupa näin monen vuoden sisällä lasketaan "tuoreeksi". */
const TUORE_LUPA = 25;

const pvm = (iso: string) => {
  const [v, k, p] = iso.split("-");
  return `${+p}.${+k}.${v}`;
};

/**
 * Osoitteen rakennus: perustiedot ja rakennusluvat Ryhdistä, energialuokka energiatodistusrekisteristä. Rakennus tunnistetaan
 * osoitteesta, joten osio näkyy vain, kun sivulla on valittu osoite.
 */
export function RakennusTiedot({ keskipiste }: { keskipiste: Piste }) {
  const { osoite } = useOsoite(keskipiste);
  const tiedot = useJson<Rakennustiedot>(
    osoite ? `/api/rakennus?${new URLSearchParams({ p: pisteParam(osoite), osoite: osoite.nimi })}` : null,
  );
  const d = tiedot.data;
  if (!osoite) return null;

  return (
    <div className="mb-12">
      <h3 className="mb-3 font-serif text-[1.375rem] font-semibold">Rakennus</h3>
      {!d && !tiedot.virhe ? (
        <p className="text-muted">Haetaan rakennuksen tietoja…</p>
      ) : tiedot.virhe || !d ? (
        <p className="text-muted">Rakennuksen tietoja ei juuri nyt saatu Ryhti-palvelusta.</p>
      ) : !d.rakennukset.length ? (
        <p className="max-w-[640px]">Osoitteelle ei löytynyt rakennusta rakennus- ja huoneistorekisteristä.</p>
      ) : (
        <>
          {d.osuma === "lahin" && (
            <p className="mb-4 max-w-[640px] border-l-[3px] border-accent pl-3 text-[15px]">
              Osoitetta ei löytynyt rekisteristä sellaisenaan, joten tiedot ovat lähimmän rakennuksen ({d.rakennukset[0].osoitteet[0]}).
            </p>
          )}
          {d.rakennukset.length > 1 && (
            <p className="mb-4 max-w-[640px]">Osoitteessa on {d.rakennukset.length} rakennusta. Tarkista myynti-ilmoituksesta, missä asunto on.</p>
          )}
          {d.rakennukset.map((r) => (
            <Kortti key={r.prt} r={r} useita={d.rakennukset.length > 1} />
          ))}
        </>
      )}
      <p className="mt-2 max-w-[640px] text-[13px] text-muted">
        Rakennusluvista näkyy toimenpiteen tyyppi muttei sisältöä, ja vanhimmat luvat voivat puuttua rekisteristä. Energialuokka on
        laskennallinen eikä kerro todellisesta kulutuksesta. Lähteet: Suomen ympäristökeskus, Ryhti (CC BY 4.0) ja Varke,
        energiatodistusrekisteri.
      </p>
    </div>
  );
}

function Kortti({ r, useita }: { r: Rakennus; useita: boolean }) {
  const ika = r.valmistunut ? new Date().getFullYear() - r.valmistunut : null;
  const runko = [r.runko && `runko ${r.runko.toLowerCase()}`, r.julkisivu && `julkisivu ${r.julkisivu.toLowerCase()}`].filter(Boolean).join(", ");
  const lammitys = [r.lammonlahde, r.lammitys && r.lammitys !== "Vesikeskuslämmitys" && r.lammitys.toLowerCase()].filter(Boolean).join(", ");
  const e = r.energia;

  return (
    <div className="mb-8 max-w-[640px]">
      {useita && (
        <h4 className="mb-2 font-semibold">
          {r.osoitteet.join(" / ")}
          {r.tyyppi && <span className="ml-2 text-sm font-normal text-muted">{r.tyyppi.toLowerCase()}</span>}
        </h4>
      )}
      <table className="w-full text-left text-[15px]">
        <tbody className="border-t border-ink">
          {!useita && r.osoitteet.length > 1 && <Rivi otsikko="Rakennuksen osoitteet">{r.osoitteet.join(", ")}</Rivi>}
          {r.valmistunut && (
            <Rivi otsikko="Valmistunut">
              {r.valmistunut}
              {ika != null && <span className="text-muted"> · {ika} vuotta</span>}
              {r.suojeltu && <span className="block text-sm text-muted">suojeltu rakennus</span>}
            </Rivi>
          )}
          {(r.kerroksia || r.asuntoja) && (
            <Rivi otsikko="Koko">
              {[r.kerroksia && `${r.kerroksia} kerrosta`, r.asuntoja && `${r.asuntoja} asuntoa`, r.kerrosala && `${r.kerrosala.toLocaleString("fi-FI")} m² kerrosalaa`]
                .filter(Boolean)
                .join(" · ")}
            </Rivi>
          )}
          {runko && <Rivi otsikko="Rakenteet">{runko.charAt(0).toUpperCase() + runko.slice(1)}</Rivi>}
          {lammitys && <Rivi otsikko="Lämmitys">{lammitys}</Rivi>}
          <Rivi otsikko="Energialuokka">
            {e ? (
              <>
                <span className="inline-flex items-baseline gap-2">
                  <span
                    className={`inline-flex size-7 items-center justify-center font-serif text-lg font-semibold ${
                      "ABC".includes(e.luokka) ? "bg-good text-page" : "EFG".includes(e.luokka) ? "bg-accent text-on-accent" : "bg-ink text-page"
                    }`}
                  >
                    {e.luokka}
                  </span>
                  {e.eluku != null && <span>E-luku {e.eluku}</span>}
                </span>
                <span className="block text-sm text-muted">
                  {[
                    `laadittu ${pvm(e.laadittu)}, voimassa ${pvm(e.voimassa)} asti`,
                    e.versio === 2013 && "vanhemman (2013) laskentatavan luokka",
                    e.nimi && `kohde: ${e.nimi}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </>
            ) : (
              <span className="text-muted">Ei voimassa olevaa energiatodistusta rekisterissä</span>
            )}
          </Rivi>
          <Rivi otsikko="Rakennusluvat">
            <Luvat luvat={r.luvat} />
          </Rivi>
        </tbody>
      </table>
      <Remonttihuomio r={r} ika={ika} />
      {e?.suositukset && (
        <details className="mt-3">
          <summary className="linkki min-h-11 cursor-pointer">Energiatodistuksen korjaussuositukset</summary>
          <p className="mt-2 border-l-[3px] border-rule pl-4 text-[15px] whitespace-pre-line text-ink-2">{e.suositukset}</p>
        </details>
      )}
    </div>
  );
}

function Luvat({ luvat }: { luvat: Rakennuslupa[] }) {
  if (!luvat.length) return <span className="text-muted">Ei muutos- tai laajennuslupia rekisterissä</span>;
  return (
    <ul>
      {luvat.slice(0, 6).map((l, i) => (
        <li key={i}>
          <span className="tabular">{l.vuosi ?? "–"}</span> {l.toimenpide.toLowerCase()}
          <span className="text-muted">
            {l.tila === "valmis" ? (l.valmistunut && l.valmistunut !== l.vuosi ? ` · valmis ${l.valmistunut}` : " · valmis") : l.tila ? ` · ${l.tila}` : ""}
          </span>
        </li>
      ))}
      {luvat.length > 6 && <li className="text-muted">ja {luvat.length - 6} vanhempaa</li>}
    </ul>
  );
}

/** Tulkinta luvista: luvanvarainen muutostyö voi olla putki- tai julkisivuremontti, mutta sisältöä ei näe. */
function Remonttihuomio({ r, ika }: { r: Rakennus; ika: number | null }) {
  if (ika == null || ika < PUTKIREMONTTI_IKA) return null;
  const vuosi = new Date().getFullYear();
  const tuore = r.luvat.find(
    (l) => /muutostyö/i.test(l.toimenpide) && l.tila !== "rauennut" && l.vuosi != null && vuosi - l.vuosi <= TUORE_LUPA,
  );
  return (
    <p className="mt-3 border-l-[3px] border-accent pl-4 text-ink-2">
      {tuore ? (
        <>
          Talo on {ika} vuotta vanha, ja siihen on myönnetty muutostyölupa vuonna {tuore.vuosi}. Se voi olla putki-, julkisivu- tai
          ullakkoremontti, mutta luvasta ei näe sisältöä. Tarkista tehdyt remontit isännöitsijäntodistuksesta.
        </>
      ) : (
        <>
          Talo on {ika} vuotta vanha, eikä rekisterissä ole muutostyölupia {TUORE_LUPA} vuoteen. Putkiremontti tehdään tyypillisesti
          40–60 vuoden iässä. Selvitä isännöitsijäntodistuksesta ja kunnossapitotarveselvityksestä, onko se tehty tai suunnitteilla.
        </>
      )}
    </p>
  );
}

function Rivi({ otsikko, children }: { otsikko: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-rule align-top">
      <th scope="row" className="w-44 py-2.5 pr-3 font-semibold whitespace-nowrap">
        {otsikko}
      </th>
      <td className="py-2.5">{children}</td>
    </tr>
  );
}

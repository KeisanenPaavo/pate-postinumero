"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { etaisyys, pisteParam, useJson, useOsoite, type Kohde, type Piste } from "./yhteiset";

export type Taloyhtio = {
  nimi: string;
  ytunnus: string;
  perustettu: number | null;
  tila: string;
  osuma: "energiatodistus" | "nimi" | "osoite" | "haku";
  hoitaja: string | null;
  vuokranantaja: string | null;
  verkkosivu: string | null;
  osoite: string;
  metrit: number;
  samaTalo: boolean;
};

export const useTaloyhtiot = (osoite: Kohde | null, pno: string) =>
  useJson<Taloyhtio[]>(osoite ? `/api/taloyhtio?${new URLSearchParams({ p: pisteParam(osoite), osoite: osoite.nimi, pno })}` : null);

/** Näyttää osion vain, kun sivulla on valittu osoite (?p=…&osoite=…): taloyhtiö on talokohtainen tieto. */
export function VainOsoitteelle({ keskipiste, children }: { keskipiste: Piste; children: React.ReactNode }) {
  return useOsoite(keskipiste).osoite ? children : null;
}

/**
 * Taloyhtiön perustiedot PRH:sta: osoitteen oma yhtiö tarkemmin ja muut ~150 m säteellä listana. Jos omaa ei löydy,
 * lähin on paras arvaus – yhtiön nimi tai rekisteriosoite voi olla eri kadulla kuin asunnon osoite. Käyttäjä voi valita
 * oikean yhtiön listalta tai hakea sen itse; valinta on URL:ssa (?yhtio=Y-tunnus), joten se kulkee jaetun linkin mukana.
 */
export function TaloyhtioOsio({ keskipiste, pno }: { keskipiste: Piste; pno: string }) {
  const { osoite } = useOsoite(keskipiste);
  const { valittu, valitse } = useValittuYhtio();
  const tiedot = useTaloyhtiot(osoite, pno);
  const valinta = useJson<Taloyhtio[]>(valittu ? `/api/taloyhtio/haku?${new URLSearchParams({ q: valittu })}` : null);
  const d = tiedot.data;
  const kasin = valinta.data?.[0] ?? null;
  const omat = kasin ? [] : (d?.filter((t) => t.samaTalo) ?? []);
  // Ilman omaa osumaa lähin näytetään tarkemmin parhaana arvauksena.
  const esiin = kasin ? [] : omat.length ? omat : (d?.slice(0, 1) ?? []);
  const muut = d?.filter((t) => !esiin.includes(t) && t.ytunnus !== valittu) ?? [];

  return (
    <div>
      {valittu && (
        <div className="mb-6">
          {kasin ? (
            <>
              <p className="mb-5 max-w-[640px]">
                Valitsit taloyhtiön itse.{" "}
                <button type="button" onClick={() => valitse(null)} className="linkki min-h-11">
                  Palauta automaattinen tunnistus
                </button>
              </p>
              <Kortti t={kasin} merkinta="valittu käsin" />
            </>
          ) : (
            <p className="text-muted">{valinta.virhe || valinta.data ? `Taloyhtiötä ${valittu} ei löytynyt.` : "Haetaan valittua taloyhtiötä…"}</p>
          )}
        </div>
      )}
      {!d && !tiedot.virhe ? (
        <p className="text-muted">Haetaan taloyhtiöitä…</p>
      ) : tiedot.virhe || !d ? (
        <p className="text-muted">Taloyhtiön tietoja ei juuri nyt saatu PRH:n palvelusta.</p>
      ) : d.length === 0 ? (
        !valittu && (
          <p className="max-w-[640px]">
            Osoitteelle tai sen lähiosoitteille ei löytynyt taloyhtiötä PRH:n avoimesta datasta. Haku perustuu siihen, että yhtiön nimessä tai
            osoitteessa on katu ja talonumero, mutta monen yhtiön nimi on muu (esim. Asunto Oy Aurinkola). Tarkista yhtiön nimi
            myynti-ilmoituksesta ja hae se alta.
          </p>
        )
      ) : (
        <>
          {esiin.length > 0 && (
            <p className="mb-5 max-w-[640px]">
              {omat.length ? (
                <>
                  {omat.length === 1 ? "Osoitteen taloyhtiö" : `Osoitteeseen liittyy ${omat.length} taloyhtiötä`} kaupparekisterin mukaan.
                  {omat.some((t) => t.osuma === "osoite") && " Osa löytyi vain osoitteen perusteella – varmista, että yhtiö on oikea."}
                </>
              ) : (
                <>
                  Osoitteelle ei löytynyt omaa taloyhtiötä, mutta yhtiön nimi tai rekisteriosoite voi olla eri kadulla kuin asunnon osoite
                  (esim. kulmatalot). <strong className="font-semibold">Paras arvaus on lähin yhtiö</strong>, {esiin[0].nimi} ({etaisyys(Math.max(esiin[0].metrit, 10) / 1000)}).
                  Varmista yhtiön nimi myynti-ilmoituksesta.
                </>
              )}
            </p>
          )}
          {esiin.map((t) => (
            <Kortti
              key={t.ytunnus}
              t={t}
              merkinta={
                !t.samaTalo
                  ? `paras arvaus · ${t.osoite}`
                  : t.osuma === "energiatodistus"
                    ? "tunnistettu rakennuksen energiatodistuksesta"
                    : null
              }
            />
          ))}
          {muut.length > 0 && (
            <>
              <h3 className="mb-2 font-semibold">{omat.length || kasin ? "Muut taloyhtiöt lähellä" : "Muita vaihtoehtoja lähellä"}</h3>
              <ul className="mb-6 max-w-[640px] border-t border-ink">
                {muut.map((t) => (
                  <li key={t.ytunnus} className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5 text-[15px]">
                    <span className="min-w-0">
                      <a href={ytj(t.ytunnus)} target="_blank" rel="noopener" className="hover:text-accent hover:underline">
                        {t.nimi}
                      </a>
                      <span className="block text-sm text-muted">
                        {[t.osoite, t.perustettu && `rek. ${t.perustettu}`, t.vuokranantaja ?? t.hoitaja, t.tila !== "Rekisterissä" && t.tila]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-4">
                      <span className="font-semibold whitespace-nowrap tabular">{etaisyys(Math.max(t.metrit, 10) / 1000)}</span>
                      <ValitsePainike nimi={t.nimi} onClick={() => valitse(t.ytunnus)} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {osoite && <OmaHaku avoinna={!valittu && !!d && d.length === 0} onValitse={valitse} />}
      <p className="mt-2 max-w-[640px] text-[13px] text-muted">
        Osoitteen yhtiö tunnistetaan rakennuksen energiatodistuksen kohteen nimestä, jos todistus on, ja lähistön yhtiöt noin 150 metrin
        säteeltä nimen tai rekisteriosoitteen katuosoitteen perusteella. Rekisteröintivuosi on
        yleensä lähellä talon valmistumista. Vastikkeet, yhtiölainat, tontti ja korjaushistoria löytyvät isännöitsijäntodistuksesta, jonka saat
        myyjältä tai välittäjältä. Lähde: Patentti- ja rekisterihallitus, YTJ (CC BY 4.0).
      </p>
    </div>
  );
}

/** Käsin valittu taloyhtiö URL:sta (?yhtio=Y-tunnus) ja sen asettaminen; osoitteen vaihto pudottaa parametrin. */
function useValittuYhtio() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const arvo = params.get("yhtio");
  const valittu = arvo && /^\d{7}-\d$/.test(arvo) ? arvo : null;
  const valitse = (ytunnus: string | null) => {
    const uusi = new URLSearchParams(params);
    if (ytunnus) uusi.set("yhtio", ytunnus);
    else uusi.delete("yhtio");
    router.replace(`${pathname}?${uusi}#taloyhtio`, { scroll: false });
  };
  return { valittu, valitse };
}

function ValitsePainike({ nimi, onClick }: { nimi: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Valitse ${nimi}`} className="linkki min-h-11 text-sm">
      Valitse
    </button>
  );
}

/** Haku Y-tunnuksella tai nimellä, kun oikeaa yhtiötä ei ole listalla. */
function OmaHaku({ avoinna, onValitse }: { avoinna: boolean; onValitse: (ytunnus: string) => void }) {
  const [auki, setAuki] = useState(avoinna);
  const [teksti, setTeksti] = useState("");
  const [haku, setHaku] = useState<string | null>(null);
  const tulos = useJson<Taloyhtio[]>(haku ? `/api/taloyhtio/haku?${new URLSearchParams({ q: haku })}` : null);
  const id = useId();

  if (!auki && !avoinna)
    return (
      <button type="button" onClick={() => setAuki(true)} className="linkki mb-4 min-h-11">
        Oikea taloyhtiö puuttuu? Hae nimellä tai Y-tunnuksella
      </button>
    );

  return (
    <div className="mb-6 max-w-[640px]">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = teksti.trim();
          if (q.length >= 3) setHaku(q);
        }}
      >
        <label htmlFor={id} className="mb-1.5 block font-semibold">
          Hae taloyhtiötä
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            value={teksti}
            onChange={(e) => setTeksti(e.target.value)}
            placeholder="Esim. Asunto Oy Aurinkola tai 0118287-0"
            autoComplete="off"
            className="min-h-11 w-full min-w-0 border border-ink bg-page px-3"
          />
          <button type="submit" disabled={teksti.trim().length < 3} className="min-h-11 shrink-0 bg-ink px-4 font-semibold text-page disabled:opacity-40">
            Hae
          </button>
        </div>
        <p className="mt-1 text-[13px] text-muted">Nimi löytyy myynti-ilmoituksesta tai isännöitsijäntodistuksesta.</p>
      </form>
      {haku && (
        <div aria-live="polite" className="mt-3">
          {!tulos.data && !tulos.virhe ? (
            <p className="text-muted">Haetaan…</p>
          ) : tulos.virhe || !tulos.data ? (
            <p className="text-muted">Haku ei juuri nyt toimi. Yritä hetken päästä uudelleen.</p>
          ) : tulos.data.length === 0 ? (
            <p>Hakusanalla ”{haku}” ei löytynyt asunto-osakeyhtiötä. Kokeile pelkkää nimen erottuvaa osaa, esim. ”Aurinkola”.</p>
          ) : (
            <ul className="border-t border-ink">
              {tulos.data.map((t) => (
                <li key={t.ytunnus} className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5 text-[15px]">
                  <span className="min-w-0">
                    {t.nimi}
                    <span className="block text-sm text-muted">
                      {[t.ytunnus, t.osoite, t.perustettu && `rek. ${t.perustettu}`, t.tila !== "Rekisterissä" && t.tila].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <ValitsePainike
                    nimi={t.nimi}
                    onClick={() => {
                      onValitse(t.ytunnus);
                      setHaku(null);
                      setTeksti("");
                      setAuki(false);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const ytj = (ytunnus: string) => `https://tietopalvelu.ytj.fi/yritys/${ytunnus}`;

function Kortti({ t, merkinta }: { t: Taloyhtio; merkinta?: string | null }) {
  return (
    <div className="mb-6 max-w-[640px]">
      <h3 className="mb-2 font-semibold">
        {t.nimi}
        {merkinta && <span className="ml-2 text-sm font-normal text-muted">{merkinta}</span>}
      </h3>
      <table className="w-full text-left text-[15px]">
        <tbody className="border-t border-ink">
          <Rivi otsikko="Y-tunnus">
            <a href={ytj(t.ytunnus)} target="_blank" rel="noopener" className="underline hover:text-accent">
              {t.ytunnus}
            </a>
          </Rivi>
          {t.perustettu && <Rivi otsikko="Rekisteröity">{t.perustettu}</Rivi>}
          <Rivi otsikko="Tila">
            <span className={t.tila === "Rekisterissä" ? "" : "font-semibold text-accent"}>{t.tila}</span>
          </Rivi>
          {(t.vuokranantaja || t.hoitaja) && (
            <Rivi otsikko={t.vuokranantaja ? "Omistaja (arvio)" : "Isännöinti"}>
              {t.vuokranantaja ?? t.hoitaja}
              {t.vuokranantaja && t.hoitaja && <span className="block text-sm text-muted">yhteysosoite c/o {t.hoitaja}</span>}
            </Rivi>
          )}
          {t.verkkosivu && (
            <Rivi otsikko="Verkkosivu">
              <a href={t.verkkosivu} target="_blank" rel="noopener nofollow" className="underline hover:text-accent">
                {t.verkkosivu.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            </Rivi>
          )}
        </tbody>
      </table>
      {t.vuokranantaja && (
        <p className="mt-3 border-l-[3px] border-accent pl-4 text-ink-2">
          Yhtiön yhteystiedot ovat vuokranantajan ({t.vuokranantaja}). Talo on todennäköisesti kokonaan tai pääosin yhden omistajan
          vuokratalo, jolloin yhtiökokouksen päätökset ja remonttiaikataulut ratkaisee käytännössä se.
        </p>
      )}
      {t.tila !== "Rekisterissä" && (
        <p className="mt-3 border-l-[3px] border-accent pl-4 text-ink-2">
          Yhtiö on {t.tila.toLowerCase()}. Selvitä tilanne isännöitsijältä ennen ostopäätöstä.
        </p>
      )}
    </div>
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

"use client";

import { etaisyys, pisteParam, useJson, useOsoite, type Kohde, type Piste } from "./yhteiset";

export type Taloyhtio = {
  nimi: string;
  ytunnus: string;
  perustettu: number | null;
  tila: string;
  osuma: "nimi" | "osoite";
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
 * lähin on paras arvaus – yhtiön nimi tai rekisteriosoite voi olla eri kadulla kuin asunnon osoite.
 */
export function TaloyhtioOsio({ keskipiste, pno }: { keskipiste: Piste; pno: string }) {
  const { osoite } = useOsoite(keskipiste);
  const tiedot = useTaloyhtiot(osoite, pno);
  const d = tiedot.data;
  const omat = d?.filter((t) => t.samaTalo) ?? [];
  // Ilman omaa osumaa lähin näytetään tarkemmin parhaana arvauksena.
  const esiin = omat.length ? omat : d?.slice(0, 1) ?? [];
  const muut = d?.filter((t) => !esiin.includes(t)) ?? [];

  return (
    <div>
      {!d && !tiedot.virhe ? (
        <p className="text-muted">Haetaan taloyhtiöitä…</p>
      ) : tiedot.virhe || !d ? (
        <p className="text-muted">Taloyhtiön tietoja ei juuri nyt saatu PRH:n palvelusta.</p>
      ) : d.length === 0 ? (
        <p className="max-w-[640px]">
          Osoitteelle tai sen lähiosoitteille ei löytynyt taloyhtiötä PRH:n avoimesta datasta. Haku perustuu siihen, että yhtiön nimessä tai
          osoitteessa on katu ja talonumero, mutta monen yhtiön nimi on muu (esim. Asunto Oy Aurinkola). Tarkista yhtiön nimi
          myynti-ilmoituksesta ja hae se YTJ:stä.
        </p>
      ) : (
        <>
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
          {esiin.map((t) => (
            <Kortti key={t.ytunnus} t={t} arvaus={!t.samaTalo} />
          ))}
          {muut.length > 0 && (
            <>
              <h3 className="mb-2 font-semibold">{omat.length ? "Muut taloyhtiöt lähellä" : "Muita vaihtoehtoja lähellä"}</h3>
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
                    <span className="font-semibold whitespace-nowrap tabular">{etaisyys(Math.max(t.metrit, 10) / 1000)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <p className="mt-2 max-w-[640px] text-[13px] text-muted">
        Lähistön yhtiöt haetaan noin 150 metrin säteeltä nimen tai rekisteriosoitteen katuosoitteen perusteella. Rekisteröintivuosi on
        yleensä lähellä talon valmistumista. Vastikkeet, yhtiölainat, tontti ja korjaushistoria löytyvät isännöitsijäntodistuksesta, jonka saat
        myyjältä tai välittäjältä. Lähde: Patentti- ja rekisterihallitus, YTJ (CC BY 4.0).
      </p>
    </div>
  );
}

const ytj = (ytunnus: string) => `https://tietopalvelu.ytj.fi/yritys/${ytunnus}`;

function Kortti({ t, arvaus }: { t: Taloyhtio; arvaus: boolean }) {
  return (
    <div className="mb-6 max-w-[640px]">
      <h3 className="mb-2 font-semibold">
        {t.nimi}
        {arvaus && <span className="ml-2 text-sm font-normal text-muted">paras arvaus · {t.osoite}</span>}
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

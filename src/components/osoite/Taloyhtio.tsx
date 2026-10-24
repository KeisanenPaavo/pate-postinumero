"use client";

import { useJson, useOsoite, type Piste } from "./yhteiset";

export type Taloyhtio = {
  nimi: string;
  ytunnus: string;
  perustettu: number | null;
  tila: string;
  osuma: "nimi" | "osoite";
  hoitaja: string | null;
  vuokranantaja: string | null;
  verkkosivu: string | null;
};

export const useTaloyhtiot = (osoite: string | null, pno: string) =>
  useJson<Taloyhtio[]>(osoite ? `/api/taloyhtio?${new URLSearchParams({ osoite, pno })}` : null);

/** Näyttää osion vain, kun sivulla on valittu osoite (?p=…&osoite=…): taloyhtiö on talokohtainen tieto. */
export function VainOsoitteelle({ keskipiste, children }: { keskipiste: Piste; children: React.ReactNode }) {
  return useOsoite(keskipiste).osoite ? children : null;
}

/** Taloyhtiön perustiedot PRH:sta: nimi, Y-tunnus, perustamisvuosi, tila ja c/o-osoitteesta isännöitsijä tai vuokranantaja. */
export function TaloyhtioOsio({ keskipiste, pno }: { keskipiste: Piste; pno: string }) {
  const { osoite } = useOsoite(keskipiste);
  const tiedot = useTaloyhtiot(osoite?.nimi ?? null, pno);
  const d = tiedot.data;

  return (
    <div>
      {!d && !tiedot.virhe ? (
        <p className="text-muted">Haetaan taloyhtiötä…</p>
      ) : tiedot.virhe || !d ? (
        <p className="text-muted">Taloyhtiön tietoja ei juuri nyt saatu PRH:n palvelusta.</p>
      ) : d.length === 0 ? (
        <p className="max-w-[640px]">
          Osoitteelle ei löytynyt taloyhtiötä PRH:n avoimesta datasta. Haku perustuu siihen, että yhtiön nimessä tai osoitteessa on katu
          ja talonumero, mutta monen yhtiön nimi on muu (esim. Asunto Oy Aurinkola). Tarkista yhtiön nimi myynti-ilmoituksesta ja hae se
          YTJ:stä.
        </p>
      ) : (
        <>
          <p className="mb-5 max-w-[640px]">
            {d.length === 1 ? "Osoitteen taloyhtiö" : `Osoitteeseen liittyy ${d.length} taloyhtiötä`} kaupparekisterin mukaan.
            {d.some((t) => t.osuma === "osoite") && " Osa löytyi vain osoitteen perusteella – varmista, että yhtiö on oikea."}
          </p>
          {d.map((t) => (
            <div key={t.ytunnus} className="mb-6 max-w-[640px]">
              <h3 className="mb-2 font-semibold">{t.nimi}</h3>
              <table className="w-full text-left text-[15px]">
                <tbody className="border-t border-ink">
                  <Rivi otsikko="Y-tunnus">
                    <a href={`https://tietopalvelu.ytj.fi/yritys/${t.ytunnus}`} target="_blank" rel="noopener" className="underline hover:text-accent">
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
          ))}
        </>
      )}
      <p className="mt-2 max-w-[640px] text-[13px] text-muted">
        Rekisteröintivuosi on yleensä lähellä talon valmistumista. Vastikkeet, yhtiölainat, tontti ja korjaushistoria löytyvät
        isännöitsijäntodistuksesta, jonka saat myyjältä tai välittäjältä. Lähde: Patentti- ja rekisterihallitus, YTJ (CC BY 4.0).
      </p>
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

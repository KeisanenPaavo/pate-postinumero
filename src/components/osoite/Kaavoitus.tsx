"use client";

import { KAAVA_TASOT, Kartta } from "../Kartta";
import { etaisyys, pisteParam, useJson, useOsoite, type Piste } from "./yhteiset";

export type VireillaKaava = { tunnus: string; vaihe: string; pintaAla: number | null; metrit: number; alueella: boolean };
export type Katutyo = { kuvaus: string; osoite: string | null; alkaa: string | null; paattyy: string | null; metrit: number };
export type KaavoitusTiedot = {
  kunta: string;
  kaavat: VireillaKaava[];
  rakennuskielto: { selite: string; paattyy: string | null } | null;
  tyot: Katutyo[];
  lahde: string;
};

export const useKaavoitus = (lahto: Piste, kunta: string) => useJson<KaavoitusTiedot | null>(`/api/kaavoitus?p=${pisteParam(lahto)}&kunta=${kunta}`);

/** "2026-07-06" → "6.7.2026" */
export const pvm = (s: string | null) => {
  if (!s) return "";
  const [v, k, p] = s.slice(0, 10).split("-").map(Number);
  return `${p}.${k}.${v}`;
};

const ala = (m2: number | null) => (m2 == null ? "" : m2 >= 10_000 ? `${(m2 / 10_000).toFixed(1).replace(".", ",")} ha` : `${Math.round(m2 / 100) * 100} m²`);

/** Kaavoitus ja rakentaminen: vireillä olevat asemakaavat, rakennuskielto ja katutyöt (Helsinki); Espoosta karttataso. */
export function KaavoitusOsio({ keskipiste, pno, kunta }: { keskipiste: Piste; pno: string; kunta: string }) {
  const { osoite, lahto } = useOsoite(keskipiste);
  const tiedot = useKaavoitus(lahto, kunta);
  const d = tiedot.data;
  const mista = osoite ? "Osoitteen" : "Alueen keskipisteen";

  if (kunta !== "091" && kunta !== "049")
    return (
      <p className="max-w-[640px]">
        Tämä kunta ei julkaise vireillä olevia kaavoja tai rakennushankkeita avoimena rajapintana. Tarkista lähialueen kaavoitus kunnan
        kaavoituskatsauksesta tai karttapalvelusta ennen ostopäätöstä.
      </p>
    );

  return (
    <div>
      {kunta === "049" ? (
        <p className="mb-5 max-w-[640px]">
          Espoo julkaisee vireillä olevien asemakaavojen rajaukset vain karttatasona: kaavojen nimiä, vaiheita ja rakennuslupia ei ole saatavilla
          avoimena datana. Kartalta näet, onko osoitteen lähellä vireillä kaavamuutoksia.
        </p>
      ) : !d && !tiedot.virhe ? (
        <p className="mb-5 text-muted">Haetaan kaavoitustietoja…</p>
      ) : tiedot.virhe || !d ? (
        <p className="mb-5 text-muted">Kaavoitustietoja ei juuri nyt saatu. Kartalla näkyvät vireillä olevat kaavat.</p>
      ) : (
        <>
          <p className="mb-5 max-w-[640px]">
            <Tiivistys kaavat={d.kaavat.length} tyot={d.tyot.length} mista={mista} />
            {d.kaavat.some((k) => k.alueella) && ` ${osoite ? "Osoite" : "Alueen keskipiste"} on itse vireillä olevan kaavan alueella.`}
          </p>
          {d.rakennuskielto && (
            <div className="mb-6 max-w-[640px] border-l-[3px] border-accent pl-4">
              <p className="font-semibold">Rakennuskielto asemakaavan laatimiseksi{d.rakennuskielto.paattyy ? ` ${pvm(d.rakennuskielto.paattyy)} asti` : ""}</p>
              <p className="text-ink-2">
                {osoite ? "Osoite" : "Alueen keskipiste"} on alueella, jolle valmistellaan uutta asemakaavaa tai kaavamuutosta. Rakentamista ja
                muutostöitä rajoitetaan, kunnes kaava valmistuu. Kaavan sisällöstä kannattaa kysyä kaupungilta.
              </p>
              <p className="text-sm text-muted">{d.rakennuskielto.selite}</p>
            </div>
          )}

          {d.kaavat.length > 0 && (
            <>
              <h3 className="mb-2 font-semibold">Vireillä olevat asemakaavat</h3>
              <table className="mb-6 w-full max-w-[640px] text-left text-[15px]">
                <tbody className="border-t border-ink">
                  {d.kaavat.map((k) => (
                    <tr key={k.tunnus} className="border-b border-rule align-top">
                      <th scope="row" className="py-2.5 pr-3 font-semibold whitespace-nowrap">
                        Kaava {k.tunnus}
                      </th>
                      <td className="py-2.5 pr-3">
                        {k.vaihe}
                        {k.pintaAla ? <span className="block text-sm text-muted">{ala(k.pintaAla)}</span> : null}
                      </td>
                      <td className={`py-2.5 text-right whitespace-nowrap tabular ${k.alueella ? "font-semibold text-accent" : ""}`}>
                        {k.alueella ? "osoite alueella" : etaisyys(k.metrit / 1000)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {d.tyot.length > 0 && (
            <>
              <h3 className="mb-2 font-semibold">Katu- ja kaivutyöt lähellä</h3>
              <ul className="mb-6 max-w-[640px] border-t border-ink">
                {d.tyot.slice(0, 6).map((t, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5 text-[15px]">
                    <span className="min-w-0">
                      {t.kuvaus}
                      <span className="block text-sm text-muted">
                        {[t.osoite, t.alkaa || t.paattyy ? `${pvm(t.alkaa)}–${pvm(t.paattyy)}` : null].filter(Boolean).join(" · ")}
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
      <Kartta piste={lahto} onOsoite={!!osoite} pno={pno} kunta={kunta} tasot={KAAVA_TASOT} />
      <p className="mt-2 text-[13px] text-muted">
        {d ? `Lähde: ${d.lahde}.` : kunta === "049" ? "Lähde: Espoon kaupunki, vireillä olevat asemakaavat (karttataso)." : ""}
        {kunta === "091" && " Kaavan tunnuksella löydät kaavan tiedot Helsingin karttapalvelusta (kartta.hel.fi) ja kaupungin kaavoitussivuilta."}
      </p>
    </div>
  );
}

/** "Osoitteen lähellä on 2 vireillä olevaa asemakaavaa (500 m) ja 1 käynnissä oleva katu- tai kaivutyö (200 m)." */
function Tiivistys({ kaavat, tyot, mista }: { kaavat: number; tyot: number; mista: string }) {
  const kaavaOsa = kaavat ? `${kaavat} vireillä ${kaavat === 1 ? "oleva asemakaava" : "olevaa asemakaavaa"} 500 metrin säteellä` : null;
  const tyoOsa = tyot
    ? `${tyot} ${tyot === 1 ? "käynnissä oleva tai pian alkava katu- tai kaivutyö" : "käynnissä olevaa tai pian alkavaa katu- tai kaivutyötä"} 200 metrin säteellä`
    : null;
  if (!kaavaOsa && !tyoOsa)
    return <>{mista} lähellä ei ole vireillä olevia asemakaavoja (500 m) eikä käynnissä olevia katu- tai kaivutöitä (200 m).</>;
  return (
    <>
      {mista} lähellä on <strong className="font-semibold">{[kaavaOsa, tyoOsa].filter(Boolean).join(" ja ")}</strong>.
      {!kaavaOsa && " Vireillä olevia asemakaavoja ei ole 500 metrin säteellä."}
      {!tyoOsa && " Katu- tai kaivutöitä ei ole käynnissä 200 metrin säteellä."}
    </>
  );
}

import type { NextRequest } from "next/server";
import { lueKoordinaatti, virhe } from "@/lib/http";
import { osoitteetLahella, pyorista } from "@/lib/palvelut";
import { rakennuksetOsoitteessa } from "@/lib/rakennus";
import { taloyhtiotLahella } from "@/lib/taloyhtio";

// Osoitteen ja sen lähiosoitteiden taloyhtiöt PRH:n avoimesta datasta, apuna rakennuksen energiatodistuksen kohdenimi. ?p=lat,lon&osoite=Hämeentie 3, Helsinki&pno=00530
// Ensimmäinen haku käy läpi lähikatujen ja postinumeron yhtiöt (~3–5 s), sen jälkeen välimuistista.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const piste = lueKoordinaatti(request.nextUrl.searchParams.get("p"));
  const osoite = request.nextUrl.searchParams.get("osoite")?.trim() ?? "";
  const pno = request.nextUrl.searchParams.get("pno");
  if (!piste || osoite.length > 120 || (pno && !/^\d{5}$/.test(pno))) return virhe(400, "Virheellinen koordinaatti, osoite tai postinumero");
  try {
    // Lähiosoitteet ovat lisätietoa: jos Digitransit ei vastaa, haetaan pelkällä osoitteella.
    // Energiatodistukset tulevat samasta välimuistista kuin Rakennus-osion haku.
    const [lahella, rakennukset] = await Promise.all([
      osoitteetLahella(pyorista(piste)).catch(() => []),
      rakennuksetOsoitteessa(osoite, piste).catch(() => null),
    ]);
    const todistusnimet =
      rakennukset?.osuma === "osoite" ? rakennukset.rakennukset.flatMap((r) => (r.energia?.nimi ? [r.energia.nimi] : [])) : [];
    return Response.json(await taloyhtiotLahella(osoite, lahella, pno, todistusnimet));
  } catch {
    return virhe(502, "Taloyhtiön tietoja ei juuri nyt saatu");
  }
}

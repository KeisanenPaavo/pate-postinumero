import type { NextRequest } from "next/server";
import { lueKoordinaatti, virhe } from "@/lib/http";
import { osoitteetLahella, pyorista } from "@/lib/palvelut";
import { taloyhtiotLahella } from "@/lib/taloyhtio";

// Osoitteen ja sen lähiosoitteiden taloyhtiöt PRH:n avoimesta datasta. ?p=lat,lon&osoite=Hämeentie 3, Helsinki&pno=00530
// Ensimmäinen haku käy läpi lähikatujen ja postinumeron yhtiöt (~3–5 s), sen jälkeen välimuistista.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const piste = lueKoordinaatti(request.nextUrl.searchParams.get("p"));
  const osoite = request.nextUrl.searchParams.get("osoite")?.trim() ?? "";
  const pno = request.nextUrl.searchParams.get("pno");
  if (!piste || osoite.length > 120 || (pno && !/^\d{5}$/.test(pno))) return virhe(400, "Virheellinen koordinaatti, osoite tai postinumero");
  try {
    // Lähiosoitteet ovat lisätietoa: jos Digitransit ei vastaa, haetaan pelkällä osoitteella.
    const lahella = await osoitteetLahella(pyorista(piste)).catch(() => []);
    return Response.json(await taloyhtiotLahella(osoite, lahella, pno));
  } catch {
    return virhe(502, "Taloyhtiön tietoja ei juuri nyt saatu");
  }
}

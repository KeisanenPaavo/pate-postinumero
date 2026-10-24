import type { NextRequest } from "next/server";
import { virhe } from "@/lib/http";
import { taloyhtiot } from "@/lib/taloyhtio";

// Osoitteen taloyhtiö PRH:n avoimesta datasta. ?osoite=Hämeentie 3, Helsinki&pno=00530
// Ensimmäinen haku postinumerolla käy läpi enintään 5 sivua (~3 s), sen jälkeen välimuistista.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const osoite = request.nextUrl.searchParams.get("osoite")?.trim() ?? "";
  const pno = request.nextUrl.searchParams.get("pno");
  if (!osoite || osoite.length > 120 || (pno && !/^\d{5}$/.test(pno))) return virhe(400, "Virheellinen osoite tai postinumero");
  try {
    return Response.json(await taloyhtiot(osoite, pno));
  } catch {
    return virhe(502, "Taloyhtiön tietoja ei juuri nyt saatu");
  }
}

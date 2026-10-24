import type { NextRequest } from "next/server";
import { lueKoordinaatti, virhe } from "@/lib/http";
import { rakennuksetOsoitteessa } from "@/lib/rakennus";

// Osoitteen rakennukset, rakennusluvat ja energiatodistukset (Ryhti + energiatodistusrekisteri).
// ?p=lat,lon&osoite=Viides linja 18, Helsinki
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const piste = lueKoordinaatti(request.nextUrl.searchParams.get("p"));
  const osoite = request.nextUrl.searchParams.get("osoite")?.trim() ?? "";
  if (!piste || osoite.length > 120) return virhe(400, "Virheellinen koordinaatti tai osoite");
  try {
    return Response.json(await rakennuksetOsoitteessa(osoite, piste));
  } catch {
    return virhe(502, "Rakennuksen tietoja ei juuri nyt saatu");
  }
}

import type { NextRequest } from "next/server";
import { etaisyysKm, kavelyreitti, pyorista } from "@/lib/palvelut";
import { lueKoordinaatti, virhe } from "@/lib/http";

// Kävelyreitti asunnolta lähikohteeseen (Lähiympäristö-kartta). ?mista=lat,lon&minne=lat,lon
export async function GET(request: NextRequest) {
  const mista = lueKoordinaatti(request.nextUrl.searchParams.get("mista"));
  const minne = lueKoordinaatti(request.nextUrl.searchParams.get("minne"));
  if (!mista || !minne) return virhe(400, "Virheellinen koordinaatti");
  // Kartan kohteet ovat enintään muutaman kilometrin päässä; pidemmät pyynnöt hylätään.
  if (etaisyysKm(mista, minne) > 5) return virhe(400, "Kohde on liian kaukana kävelyreitille");
  try {
    const reitti = await kavelyreitti(pyorista(mista), pyorista(minne));
    return reitti ? Response.json(reitti) : virhe(404, "Kävelyreittiä ei löytynyt");
  } catch {
    return virhe(502, "Reittihaku ei juuri nyt toimi");
  }
}

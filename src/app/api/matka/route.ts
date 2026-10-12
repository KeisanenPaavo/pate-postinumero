import type { NextRequest } from "next/server";
import { etaisyysKm, matka, pyorista } from "@/lib/palvelut";
import { lueKoordinaatti, virhe } from "@/lib/http";

// Matka-ajat arkiaamuna klo 8: ?mista=lat,lon&minne=lat,lon
export async function GET(request: NextRequest) {
  const mista = lueKoordinaatti(request.nextUrl.searchParams.get("mista"));
  const minne = lueKoordinaatti(request.nextUrl.searchParams.get("minne"));
  if (!mista || !minne) return virhe(400, "Virheellinen koordinaatti");
  if (etaisyysKm(mista, minne) > 300) return virhe(400, "Kohde on liian kaukana");
  try {
    return Response.json(await matka(pyorista(mista), pyorista(minne)));
  } catch {
    return virhe(502, "Reitityspalvelu ei juuri nyt vastaa");
  }
}

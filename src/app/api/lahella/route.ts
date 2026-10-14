import type { NextRequest } from "next/server";
import { lahimmatJunaAsemat, lahimmatPalvelut, lahimmatPysakit, pyorista } from "@/lib/palvelut";
import { lueKoordinaatti, virhe } from "@/lib/http";

// Lähiympäristön kartta: lähimmät kaupat, päiväkodit, pysäkit (800 m, maaseudulla 2 km) ja juna-asemat (3 km). Koulut tulevat /api/piste-reitiltä.
// Pysäkkihaun virhe ei kaada vastausta – kaupat ja päiväkodit tulevat paikallisesta datasta.
export async function GET(request: NextRequest) {
  const piste = lueKoordinaatti(request.nextUrl.searchParams.get("p"));
  if (!piste) return virhe(400, "Virheellinen koordinaatti");
  const p = pyorista(piste);
  const [pysakit, junaAsemat] = await Promise.all([lahimmatPysakit(p).catch(() => null), lahimmatJunaAsemat(p).catch(() => null)]);
  return Response.json({ ...lahimmatPalvelut(p), pysakit: pysakit?.pysakit ?? null, pysakkiSade: pysakit?.sade ?? null, junaAsemat });
}

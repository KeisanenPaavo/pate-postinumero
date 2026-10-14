import type { NextRequest } from "next/server";
import { kaavoitus } from "@/lib/kaavoitus";
import { lueKoordinaatti, virhe } from "@/lib/http";
import { pyorista } from "@/lib/palvelut";

// Kaavoitus ja rakentaminen osoitteen lähellä. ?p=lat,lon&kunta=091
// Kunta tulee sivulta (postinumeroalueen kunta); vain Helsingiltä on avoin vektoriaineisto.
// Helsingin kaivuilmoitustaso vastaa välillä vasta ~30 s:ssa ensimmäisellä haulla (sen jälkeen välimuistista).
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const piste = lueKoordinaatti(request.nextUrl.searchParams.get("p"));
  const kunta = request.nextUrl.searchParams.get("kunta") ?? "";
  if (!piste || !/^\d{3}$/.test(kunta)) return virhe(400, "Virheellinen koordinaatti tai kunta");
  try {
    return Response.json(await kaavoitus(pyorista(piste), kunta));
  } catch {
    return virhe(502, "Kaavoitustietoja ei juuri nyt saatu");
  }
}

import type { NextRequest } from "next/server";
import { alueNumerolla, slugify } from "@/lib/data";
import { lahimmatKoulut, melu, postinumeroPisteelle, pyorista } from "@/lib/palvelut";
import { lueKoordinaatti, virhe } from "@/lib/http";

// Osoitekohtaiset tiedot: postinumero, melu ja lähimmät koulut.
// ?p=lat,lon            → kaikki
// ?p=lat,lon&vain=alue  → vain postinumero ja sivun slug (hakukentän ohjausta varten)
export async function GET(request: NextRequest) {
  const piste = lueKoordinaatti(request.nextUrl.searchParams.get("p"));
  if (!piste) return virhe(400, "Virheellinen koordinaatti");
  const p = pyorista(piste);

  const pno = await postinumeroPisteelle(p).catch(() => null);
  const alue = pno ? alueNumerolla(pno) : undefined;
  if (!alue) return Response.json({ pno, uusimaa: false });

  const perus = { pno, uusimaa: true, slug: slugify(alue) };
  if (request.nextUrl.searchParams.get("vain") === "alue") return Response.json(perus);

  const [m, k] = await Promise.allSettled([melu(p, alue.kunta), lahimmatKoulut(p)]);
  const arvo = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  return Response.json({ ...perus, melu: arvo(m), koulut: arvo(k) });
}

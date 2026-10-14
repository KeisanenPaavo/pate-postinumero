import type { NextRequest } from "next/server";
import { alueNumerolla, kunta, slugify } from "@/lib/data";
import { alueenHinta } from "@/lib/raportti";
import { lahimmatKoulut, melu, postinumeroPisteelle, pyorista } from "@/lib/palvelut";
import { lueKoordinaatti, virhe } from "@/lib/http";
import { oppilaaksiotto } from "@/lib/oppilaaksiotto";

// Osoitekohtaiset tiedot: postinumero, melu, lähimmät koulut ja oppilaaksiottoalueen lähikoulut.
// ?p=lat,lon            → kaikki
// ?p=lat,lon&vain=alue  → vain postinumero ja sivun slug (hakukentän ohjausta varten)
export async function GET(request: NextRequest) {
  const piste = lueKoordinaatti(request.nextUrl.searchParams.get("p"));
  if (!piste) return virhe(400, "Virheellinen koordinaatti");
  const p = pyorista(piste);

  const pno = await postinumeroPisteelle(p).catch(() => null);
  const alue = pno ? alueNumerolla(pno) : undefined;
  if (!alue) return Response.json({ pno, uusimaa: false });

  const perus = {
    pno,
    uusimaa: true,
    slug: slugify(alue),
    // Vertailusivua varten: alueen nimi, kunta ja neliöhinta samassa muodossa kuin raportin tiivistelmässä.
    alue: { nimi: alue.nimi, kunta: kunta(alue.kunta).nimi, hinta: alueenHinta(alue) },
  };
  if (request.nextUrl.searchParams.get("vain") === "alue") return Response.json(perus);

  const [m, k, o] = await Promise.allSettled([melu(p, alue.kunta), lahimmatKoulut(p), oppilaaksiotto(p, alue.kunta)]);
  const arvo = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  return Response.json({ ...perus, melu: arvo(m), koulut: arvo(k), oppilaaksiotto: arvo(o) });
}

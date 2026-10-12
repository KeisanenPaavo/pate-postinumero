import type { NextRequest } from "next/server";
import { haeOsoitteita } from "@/lib/palvelut";
import { virhe } from "@/lib/http";

// Osoitehaun autocomplete. Digitransit-avain pysyy palvelimella.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 100) return Response.json([]);
  try {
    return Response.json(await haeOsoitteita(q));
  } catch {
    return virhe(502, "Osoitehaku ei juuri nyt toimi");
  }
}

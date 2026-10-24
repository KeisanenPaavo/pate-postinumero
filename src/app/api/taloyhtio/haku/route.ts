import type { NextRequest } from "next/server";
import { virhe } from "@/lib/http";
import { haeTaloyhtio } from "@/lib/taloyhtio";

// Käyttäjän oma taloyhtiöhaku Y-tunnuksella tai nimellä. ?q=0118287-0 tai ?q=Ihantola
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 80) return virhe(400, "Hakusanan pituus 3–80 merkkiä");
  try {
    return Response.json(await haeTaloyhtio(q));
  } catch {
    return virhe(502, "Taloyhtiöhaku ei juuri nyt toimi");
  }
}

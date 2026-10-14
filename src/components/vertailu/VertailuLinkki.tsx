"use client";

import Link from "next/link";
import { useVertailu } from "./useVertailu";

/** Yläpalkin linkki vertailuun; näkyy vasta, kun vertailussa on osoitteita. */
export function VertailuLinkki() {
  const { kohteet } = useVertailu();
  if (!kohteet.length) return null;
  return (
    <Link href="/vertailu" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline">
      Vertailu ({kohteet.length})
    </Link>
  );
}

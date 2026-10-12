"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OsoiteHaku, type AlueValinta, type Osoite } from "./OsoiteHaku";

/** Etusivun haku: osoite → postinumeroalueen sivu osoitteen kanssa, alue → alueen sivu. */
export function EtusivunHaku({ alueet }: { alueet: AlueValinta[] }) {
  const router = useRouter();
  const [tila, setTila] = useState<{ teksti: string; virhe?: boolean } | null>(null);

  async function siirry(o: Osoite) {
    setTila({ teksti: "Haetaan aluetta…" });
    try {
      const p = `${o.lat.toFixed(5)},${o.lon.toFixed(5)}`;
      const res = await fetch(`/api/piste?p=${p}&vain=alue`);
      const data: { uusimaa: boolean; slug?: string } = await res.json();
      if (!data.uusimaa || !data.slug) {
        setTila({ teksti: "Osoite on Uudenmaan ulkopuolella. Palvelu kattaa toistaiseksi vain Uudenmaan.", virhe: true });
        return;
      }
      router.push(`/${data.slug}?p=${p}&osoite=${encodeURIComponent(o.nimi)}`);
    } catch {
      setTila({ teksti: "Alueen haku epäonnistui. Yritä uudelleen.", virhe: true });
    }
  }

  return (
    <div className="space-y-2">
      <OsoiteHaku
        onValitse={siirry}
        onValitseAlue={(a) => router.push(`/${a.slug}`)}
        alueet={alueet}
        label="Asunnon osoite, postinumero tai alue"
        placeholder="Esim. Fleminginkatu 1, 00530 tai Tapiola"
        iso
        autoFocus
      />
      {tila && (
        <p role="status" className={`text-sm ${tila.virhe ? "text-critical" : "text-ink-2"}`}>
          {tila.teksti}
        </p>
      )}
    </div>
  );
}

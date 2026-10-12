import "server-only";
import raw from "../../data/generated/uusimaa.json";

// Tiedoston muoto: scripts/etl/build-alueet.mjs

export type Paavo = Record<string, number | null>;

export type HintaRivi = {
  vuosi: number;
  yksiot: number | null;
  kaksiot: number | null;
  kolmiot: number | null;
  rivitalot: number | null;
  yksiot_lkm: number | null;
  kaksiot_lkm: number | null;
  kolmiot_lkm: number | null;
  rivitalot_lkm: number | null;
};

export type KuntaHinta = {
  vuosi: number;
  kaikki: number | null;
  rivitalot: number | null;
  kerrostalot: number | null;
  kaikki_lkm: number | null;
};

export type Piste = { lat: number; lon: number };

export type Alue = {
  pno: string;
  nimi: string;
  namn: string;
  kunta: string;
  keskipiste: Piste;
  hinnat: HintaRivi[];
  paavo: Paavo;
  paavo_aikasarja: { vuosi: number; he_vakiy: number | null; hr_mtu: number | null; he_kika: number | null }[];
};

export type Kunta = {
  kunta: string;
  nimi: string;
  keskusta: Piste & { nimi: string; kohde: string };
  hinnat: KuntaHinta[];
  paavo: Paavo;
};

type Data = {
  meta: { luotu: string; paavo_vuosi: number; hinnat_vuodet: [number, number]; lahteet: string[] };
  koko_maa: { paavo: Paavo };
  maakunta: { nimi: string; paavo: Paavo };
  kunnat: Record<string, Kunta>;
  alueet: Record<string, Alue>;
};

const data = raw as unknown as Data;

export const meta = data.meta;
export const kokoMaa = data.koko_maa;
export const maakunta = data.maakunta;

export const HELSINGIN_KESKUSTA = data.kunnat["091"].keskusta;

export function slugify(alue: Pick<Alue, "pno" | "nimi">) {
  const nimi = alue.nimi
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${alue.pno}-${nimi}`;
}

export function kaikkiAlueet(): Alue[] {
  return Object.values(data.alueet).sort((a, b) => a.pno.localeCompare(b.pno));
}

export function alueSlugilla(slug: string): Alue | undefined {
  const alue = data.alueet[slug.slice(0, 5)];
  return alue && slugify(alue) === slug ? alue : undefined;
}

export function alueNumerolla(pno: string): Alue | undefined {
  return data.alueet[pno];
}

export function kunta(kuntanro: string): Kunta {
  return data.kunnat[kuntanro];
}

export function kunnatAlueineen() {
  const alueet = kaikkiAlueet();
  return Object.values(data.kunnat)
    .sort((a, b) => a.nimi.localeCompare(b.nimi, "fi"))
    .map((k) => ({ ...k, alueet: alueet.filter((a) => a.kunta === k.kunta) }));
}

const TYYPIT = ["yksiot", "kaksiot", "kolmiot"] as const;

/**
 * Kerrostaloasuntojen neliöhinta, painotettuna kauppamäärillä niistä huonelukutyypeistä,
 * joille Tilastokeskus julkaisee hinnan. Palauttaa null, jos yhtään hintaa ei ole.
 */
export function kerrostaloHinta(r: HintaRivi): { hinta: number; lkm: number } | null {
  let summa = 0;
  let lkm = 0;
  for (const t of TYYPIT) {
    const h = r[t];
    const n = r[`${t}_lkm`];
    if (h != null && n != null && n > 0) {
      summa += h * n;
      lkm += n;
    }
  }
  return lkm ? { hinta: Math.round(summa / lkm), lkm } : null;
}

/** Postinumeron hinta-aikasarja (kerrostalot) ja kunnan vastaava vertailuksi. */
export function hintaSarjat(alue: Alue) {
  const k = kunta(alue.kunta);
  const vuodet = k.hinnat.map((h) => h.vuosi).filter((v) => v >= (alue.hinnat[0]?.vuosi ?? 2009));
  return vuodet.map((vuosi) => {
    const r = alue.hinnat.find((h) => h.vuosi === vuosi);
    return {
      vuosi,
      alue: r ? (kerrostaloHinta(r)?.hinta ?? null) : null,
      kunta: k.hinnat.find((h) => h.vuosi === vuosi)?.kerrostalot ?? null,
    };
  });
}

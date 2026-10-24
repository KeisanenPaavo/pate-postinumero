import raw from "../../data/config/kunnat.json";

// Kuntien nimet genetiivissä taloyhtiöiden nimien tulkintaan: "Asunto Oy Joensuun Kalevankatu 40-42" on joensuulainen
// yhtiö, vaikka sen rekisteriosoite (isännöitsijä) olisi Helsingissä. Kuntaluettelo: scripts/etl/kunnat.mjs.
//
// Genetiivi muodostetaan säännöillä ja astevaihtelulla (Turku → Turun, Lahti → Lahden, Hanko → Hangon). Säännöt tuottavat
// myös olemattomia muotoja ("Kotan"), mikä ei haittaa: ne eivät ole oikeita sanoja eivätkä osu yhtiöiden nimiin.

const { kunnat } = raw as { kunnat: { koodi: string; nimi: string; sv?: string }[] };

// Muodot, joita säännöt eivät tuota.
const POIKKEUKSET: Record<string, string[]> = {
  uusikaupunki: ["uudenkaupungin"],
  pihtipudas: ["pihtiputaan"],
  korsnäs: ["korsnäsin"],
};

// Vahva aste → heikko aste (pisin ensin).
const ASTEVAIHTELU: [string, string][] = [
  ["kk", "k"], ["pp", "p"], ["tt", "t"], ["nk", "ng"], ["mp", "mm"], ["lt", "ll"], ["rt", "rr"], ["nt", "nn"], ["ht", "hd"],
  ["lk", "l"], ["rk", "r"], ["hk", "h"], ["k", ""], ["t", "d"], ["p", "v"],
];

const heikko = (konsonantit: string) => {
  const [vahva, heikkoAste] = ASTEVAIHTELU.find(([v]) => konsonantit.endsWith(v)) ?? ["", ""];
  return vahva ? konsonantit.slice(0, -vahva.length) + heikkoAste : konsonantit;
};

/** Kunnan nimen mahdolliset genetiivimuodot pienillä kirjaimilla. */
export function genetiivit(nimi: string): string[] {
  const n = nimi.toLocaleLowerCase("fi");
  const muodot = new Set<string>(POIKKEUKSET[n] ?? []);
  if (n.endsWith("nen")) {
    // Kaustinen → Kaustisen, Kauniainen → Kauniaisten (monikko)
    muodot.add(`${n.slice(0, -3)}sen`).add(`${n.slice(0, -3)}sten`);
  } else if (n.endsWith("vesi")) {
    muodot.add(`${n.slice(0, -4)}veden`);
  } else if (/[aeiouyäö]s$/.test(n)) {
    // Kannus → Kannuksen, Varkaus → Varkauden
    muodot.add(`${n.slice(0, -1)}ksen`).add(`${n.slice(0, -1)}den`);
  } else {
    const m = n.match(/^(.*?)([^aeiouyäö]*)([aeiouyäö]+)$/);
    if (m) {
      const [, alku, konsonantit, vokaalit] = m;
      for (const k of [konsonantit, heikko(konsonantit)]) {
        muodot.add(`${alku}${k}${vokaalit}n`);
        // Lahti → Lahden, Seinäjoki → Seinäjoen; Tampere → Tampereen
        if (vokaalit === "i") muodot.add(`${alku}${k}en`);
        if (vokaalit === "e") muodot.add(`${alku}${k}een`);
      }
    }
  }
  return [...muodot];
}

const GENETIIVISTA = new Map<string, string>();
for (const k of kunnat) for (const g of genetiivit(k.nimi)) if (!GENETIIVISTA.has(g)) GENETIIVISTA.set(g, k.nimi);

/** Kunta, jonka genetiivi sana on ("joensuun" → "Joensuu"), tai null. */
export function kuntaGenetiivista(sana: string): string | null {
  return GENETIIVISTA.get(sana.toLocaleLowerCase("fi")) ?? null;
}

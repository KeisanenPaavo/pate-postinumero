const luku = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 });
const prosenttiF = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0, style: "percent" });

export const lukuna = (n: number | null | undefined) => (n == null ? "–" : luku.format(n));
export const euroa = (n: number | null | undefined) => (n == null ? "–" : `${luku.format(n)} €`);
export const prosentti = (osa: number | null | undefined, koko: number | null | undefined) =>
  osa == null || !koko ? "–" : prosenttiF.format(osa / koko);
export const osuus = (osa: number | null | undefined, koko: number | null | undefined) =>
  osa == null || !koko ? null : osa / koko;
export const minuuttia = (n: number | null | undefined) => (n == null ? "–" : `${n} min`);

// Uudenmaan kuntien genetiivit standfirst-virkkeisiin ("8 % yli Helsingin keskitason").
const GENETIIVI: Record<string, string> = {
  Askola: "Askolan", Espoo: "Espoon", Hanko: "Hangon", Helsinki: "Helsingin", Hyvinkää: "Hyvinkään", Inkoo: "Inkoon",
  Järvenpää: "Järvenpään", Karkkila: "Karkkilan", Kauniainen: "Kauniaisten", Kerava: "Keravan", Kirkkonummi: "Kirkkonummen",
  Lapinjärvi: "Lapinjärven", Lohja: "Lohjan", Loviisa: "Loviisan", Myrskylä: "Myrskylän", Mäntsälä: "Mäntsälän",
  Nurmijärvi: "Nurmijärven", Pornainen: "Pornaisten", Porvoo: "Porvoon", Pukkila: "Pukkilan", Raasepori: "Raaseporin",
  Sipoo: "Sipoon", Siuntio: "Siuntion", Tuusula: "Tuusulan", Vantaa: "Vantaan", Vihti: "Vihdin",
};
export const genetiivi = (kunta: string) => GENETIIVI[kunta] ?? `kunnan ${kunta}`;

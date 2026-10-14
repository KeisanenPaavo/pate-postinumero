// Lähiympäristön kartan kuvasymbolit (24×24, viiva currentColor). Samat merkit kartalla, selitteessä ja listoissa.
// Piirrokset: Lucide-ikonit (ISC-lisenssi, lucide.dev); metro HSL-tyyliin M-kirjaimena.

export type Ikoni = "asunto" | "kauppa" | "koulu" | "paivakoti" | "bussi" | "ratikka" | "metro" | "lautta" | "juna";

const PIIRROS: Record<Ikoni, string> = {
  asunto:
    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  kauppa:
    '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  koulu:
    '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  paivakoti:
    '<path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/>',
  bussi:
    '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  ratikka:
    '<rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h.01"/><path d="M16 15h.01"/>',
  metro: '<path d="M5 19V5.5l7 9 7-9V19" stroke-width="2.6"/>',
  lautta:
    '<path d="M12 10.189V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76"/><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  juna:
    '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>',
};

export const IKONI_NIMI: Record<Ikoni, string> = {
  asunto: "Asunto",
  kauppa: "Ruokakauppa",
  koulu: "Koulu",
  paivakoti: "Päiväkoti",
  bussi: "Bussipysäkki",
  ratikka: "Ratikkapysäkki",
  metro: "Metroasema",
  lautta: "Lauttalaituri",
  juna: "Juna-asema",
};

/** Merkin ryhmä: palvelut valkoisella pohjalla, joukkoliikenne mustalla, asunto korostusvärillä. */
export const ryhma = (i: Ikoni) => (i === "asunto" ? "asunto" : ["bussi", "ratikka", "metro", "lautta", "juna"].includes(i) ? "liikenne" : "palvelu");

export const ikoniKulkuneuvolle = (kulkuneuvo: string): Ikoni =>
  (({ ratikka: "ratikka", metro: "metro", lautta: "lautta", juna: "juna" }) as Record<string, Ikoni>)[kulkuneuvo] ?? "bussi";

/** Pyöreä merkki SVG-kuvakkeella HTML-merkkijonona (MapLibren merkkielementtiin ja Reactiin). */
export const symboliHtml = (i: Ikoni) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PIIRROS[i]}</svg>`;

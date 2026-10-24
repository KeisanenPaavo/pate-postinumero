import { describe, expect, it } from "vitest";
import { tuottolaskelma, type TuottoSyotteet } from "./Tuottolaskuri";

// Kallion yksiö, kuten laskuri selaimessa: 172 000 €, vuokra 1 200 €/kk, hoitovastike 135 €/kk, 70 % lainaa 3,5 %:lla 25 v.
const yksio: TuottoSyotteet = {
  myyntihinta: 172_000,
  yhtiolaina: 0,
  vuokra: 1200,
  hoitovastike: 135,
  rahoitusvastike: 0,
  tyhjatKuukaudet: 0.5,
  lainaosuus: 0.7,
  korko: 0.035,
  lainaAika: 25,
};

describe("tuottolaskelma", () => {
  it("laskee yksiön tuotot ja kassavirran", () => {
    const l = tuottolaskelma(yksio);
    expect(l.brutto).toBeCloseTo(0.0837, 4); // 14 400 / 172 000
    expect(l.netto).toBeCloseTo(0.0698, 4); // (13 800 − 1 620) / 174 580
    expect(l.pankkilaina).toBeCloseTo(120_400, 6);
    expect(l.era).toBeCloseTo(602.75, 2);
    expect(l.kassavirta).toBeCloseTo(412.25, 2); // 1 150 − 135 − 602,75
    expect(l.omaPaaoma).toBeCloseTo(54_180, 6); // 51 600 + 2 580 varainsiirtovero
    expect(l.lyhennykset).toBeCloseTo(3067.91, 2);
    expect(l.omanPaaomanTuotto).toBeCloseTo(0.1479, 4);
  });

  it("laskee varainsiirtoveron ja tuotot velattomasta hinnasta", () => {
    const l = tuottolaskelma({ ...yksio, myyntihinta: 150_000, yhtiolaina: 22_000, rahoitusvastike: 120 });
    expect(l.velaton).toBe(172_000);
    expect(l.vero).toBe(2580);
    expect(l.brutto).toBeCloseTo(0.0837, 4);
    // Pankkilaina myyntihinnasta, rahoitusvastike kuluna kassavirrassa.
    expect(l.pankkilaina).toBeCloseTo(105_000, 6);
    expect(l.kassavirta).toBeCloseTo(1150 - 135 - 120 - l.era, 6);
  });

  it("ei laske tuottoja ilman vuokraa tai hintaa", () => {
    expect(tuottolaskelma({ ...yksio, vuokra: 0 }).brutto).toBeNull();
    const ilmanHintaa = tuottolaskelma({ ...yksio, myyntihinta: 0 });
    expect(ilmanHintaa.brutto).toBeNull();
    expect(ilmanHintaa.omanPaaomanTuotto).toBeNull();
  });

  it("käteiskaupassa ei ole lainaa eikä lyhennyksiä", () => {
    const l = tuottolaskelma({ ...yksio, lainaosuus: 0 });
    expect(l.era).toBe(0);
    expect(l.lyhennykset).toBe(0);
    expect(l.omaPaaoma).toBeCloseTo(174_580, 6);
  });

  it("rajaa tyhjät kuukaudet ja lainaosuuden järkeviin rajoihin", () => {
    expect(tuottolaskelma({ ...yksio, tyhjatKuukaudet: 20 }).kassavirta).toBeCloseTo(-135 - tuottolaskelma(yksio).era, 6);
    expect(tuottolaskelma({ ...yksio, lainaosuus: 1.5 }).pankkilaina).toBe(172_000);
  });
});

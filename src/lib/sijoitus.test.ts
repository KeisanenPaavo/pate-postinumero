import { describe, expect, it } from "vitest";
import { alueNumerolla, kaikkiAlueet } from "./data";
import { alueenTuotot } from "./sijoitus";

// Testit nojaavat generoituun dataan, joten ne tarkistavat laskennan suhteita eivätkä tiettyjä lukuja (data päivittyy).

describe("alueenTuotot", () => {
  it("laskee bruttotuoton vuokrasta ja neliöhinnasta", () => {
    const t = alueenTuotot(alueNumerolla("00530")!)!;
    expect(t.karkea).toBeNull();
    for (const r of t.tyypit) {
      if (r.hinta == null || r.vuokra == null) continue;
      expect(r.tuotto).toBeCloseTo((r.vuokra * 12) / r.hinta, 10);
      expect(r.sijoitus).toBeGreaterThanOrEqual(0);
      expect(r.sijoitus).toBeLessThanOrEqual(1);
    }
  });

  it("merkitsee koko Uudenmaan vuokriin perustuvan tuoton karkeaksi eikä sijoita sitä vertailuun", () => {
    const t = alueenTuotot(alueNumerolla("10300")!)!;
    expect(t.karkea).toBe("uusimaa");
    expect(t.tyypit.every((r) => r.sijoitus === null)).toBe(true);
  });

  it("käyttää samaa Uudenmaan mediaania kaikilla alueilla", () => {
    const mediaanit = new Set(
      kaikkiAlueet()
        .map((a) => alueenTuotot(a)?.tyypit.find((r) => r.tyyppi === "kaksiot")?.mediaani)
        .filter((m) => m != null),
    );
    expect(mediaanit.size).toBe(1);
  });

  it("laskee hinnan vuosimuutoksen viideltä vuodelta", () => {
    const alue = alueNumerolla("00530")!;
    const viimeisin = alue.hinnat.at(-1)!;
    const vanha = alue.hinnat.find((h) => h.vuosi === viimeisin.vuosi - 5)!;
    const kaksio = alueenTuotot(alue)!.tyypit.find((r) => r.tyyppi === "kaksiot")!;
    expect(kaksio.hintamuutos).toBeCloseTo((viimeisin.kaksiot! / vanha.kaksiot!) ** (1 / 5) - 1, 10);
  });
});

import { describe, expect, it } from "vitest";
import alueet from "../../data/generated/uusimaa.json";
import { genetiivit, kuntaGenetiivista } from "./kunnat";

describe("genetiivit", () => {
  it.each([
    ["Helsinki", "helsingin"],
    ["Espoo", "espoon"],
    ["Vantaa", "vantaan"],
    ["Turku", "turun"],
    ["Lahti", "lahden"],
    ["Hanko", "hangon"],
    ["Joensuu", "joensuun"],
    ["Tampere", "tampereen"],
    ["Seinäjoki", "seinäjoen"],
    ["Lappeenranta", "lappeenrannan"],
    ["Kirkkonummi", "kirkkonummen"],
    ["Hämeenlinna", "hämeenlinnan"],
    ["Pori", "porin"],
    ["Kauniainen", "kauniaisten"],
    ["Kaustinen", "kaustisen"],
    ["Kiuruvesi", "kiuruveden"],
    ["Kannus", "kannuksen"],
    ["Varkaus", "varkauden"],
    ["Uusikaupunki", "uudenkaupungin"],
    ["Kristiinankaupunki", "kristiinankaupungin"],
  ])("%s → %s", (nimi, genetiivi) => {
    expect(genetiivit(nimi)).toContain(genetiivi);
  });
});

describe("kuntaGenetiivista", () => {
  it("tunnistaa kunnan genetiivistä kirjainkoosta riippumatta", () => {
    expect(kuntaGenetiivista("Joensuun")).toBe("Joensuu");
    expect(kuntaGenetiivista("TURUN")).toBe("Turku");
    expect(kuntaGenetiivista("helsingin")).toBe("Helsinki");
  });

  it("ei tunnista kaupunginosia eikä tavallisia sanoja", () => {
    for (const sana of ["kallion", "tapiolan", "tikkurilan", "asunto", "oy", "uusi", "vanha", "kalevankatu"]) {
      expect(kuntaGenetiivista(sana)).toBeNull();
    }
  });

  it("Uudenmaan postinumeroalueiden nimet eivät sekoitu toisiin kuntiin", () => {
    // Esim. "Asunto Oy Kallion Kalevankatu" ei saa hylkääntyä siksi, että "Kallion" näyttäisi kunnalta.
    const data = alueet as unknown as { alueet: Record<string, { nimi: string; kunta: string }>; kunnat: Record<string, { nimi: string }> };
    const sekaantuvat = Object.values(data.alueet).flatMap((a) =>
      a.nimi
        .split(/[\s-]+/)
        .map((sana) => ({ sana, kunta: kuntaGenetiivista(`${sana}n`) }))
        .filter((x) => x.kunta && x.kunta !== data.kunnat[a.kunta].nimi && x.kunta !== x.sana)
        .map((x) => `${a.nimi}: ${x.sana}n → ${x.kunta}`),
    );
    expect(sekaantuvat).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { jasennaOsoite, nimiOsuu, numerot, osoiteOsuu, todistuksenYhtio, ydinnimi, type Osoite } from "./taloyhtio";

describe("numerot", () => {
  it("purkaa välit ja luettelot", () => {
    expect(numerot("4-6")).toEqual([4, 5, 6]);
    expect(numerot("4–6")).toEqual([4, 5, 6]);
    expect(numerot("1, 3 ja 5")).toEqual([1, 3, 5]);
    expect(numerot("12 A")).toEqual([12]);
  });

  it("ei laajenna liian pitkiä tai takaperoisia välejä", () => {
    expect(numerot("1-99")).toEqual([1]);
    expect(numerot("8-2")).toEqual([8]);
  });
});

describe("jasennaOsoite", () => {
  it("erottaa kadun, numeron ja kunnan", () => {
    expect(jasennaOsoite("Hämeentie 3 A, Helsinki")).toEqual({ katu: "Hämeentie", nro: 3, kunta: "Helsinki" });
    expect(jasennaOsoite("Itäinen Papinkatu 5, Helsinki")).toEqual({ katu: "Itäinen Papinkatu", nro: 5, kunta: "Helsinki" });
  });

  it("palauttaa null ilman talonumeroa", () => {
    expect(jasennaOsoite("Kauppatori, Helsinki")).toBeNull();
  });
});

describe("nimiOsuu", () => {
  it("löytää kadun ja talonumeron yhtiön nimestä", () => {
    expect(nimiOsuu("Asunto Oy Fleminginkatu 4-6", "Fleminginkatu", 5, "Helsinki")).toBe(true);
    expect(nimiOsuu("Asunto Oy Itäinen Papinkatu 5", "Itäinen Papinkatu", 5, "Helsinki")).toBe(true);
  });

  it("ei osu eri talonumeroon tai numeron alkuosaan", () => {
    expect(nimiOsuu("Asunto Oy Fleminginkatu 4-6", "Fleminginkatu", 8, "Helsinki")).toBe(false);
    expect(nimiOsuu("Asunto Oy Kalevankatu 40", "Kalevankatu", 4, "Helsinki")).toBe(false);
  });

  it("ei osu toisen kunnan samannimiseen katuun", () => {
    expect(nimiOsuu("Asunto Oy Joensuun Kalevankatu 40-42", "Kalevankatu", 40, "Helsinki")).toBe(false);
    expect(nimiOsuu("Asunto Oy Turun Hämeentie 3", "Hämeentie", 3, "Helsinki")).toBe(false);
    expect(nimiOsuu("Asunto Oy Loimaan Papinkuja 2-4", "Papinkuja", 2, "Helsinki")).toBe(false);
  });

  it("hyväksyy oman kunnan ja kaupunginosan nimen", () => {
    expect(nimiOsuu("Asunto Oy Joensuun Kalevankatu 40-42", "Kalevankatu", 40, "Joensuu")).toBe(true);
    expect(nimiOsuu("Asunto Oy Helsingin Kalevankatu 36", "Kalevankatu", 36, "Helsinki")).toBe(true);
    expect(nimiOsuu("Asunto Oy Kallion Fleminginkatu 4", "Fleminginkatu", 4, "Helsinki")).toBe(true);
  });

  it("ei hyväksy toisen kunnan nimeä, kun talon kunta ei ole tiedossa", () => {
    expect(nimiOsuu("Asunto Oy Joensuun Kalevankatu 40-42", "Kalevankatu", 40, null)).toBe(false);
    expect(nimiOsuu("Asunto Oy Kalevankatu 40", "Kalevankatu", 40, null)).toBe(true);
  });

  it("ei tulkitse kadunnimessä olevaa kuntaa toiseksi kunnaksi", () => {
    expect(nimiOsuu("Asunto Oy Porvoonkatu 5", "Porvoonkatu", 5, "Helsinki")).toBe(true);
  });
});

describe("osoiteOsuu", () => {
  const talo = { katu: "Kalevankatu", nro: 35, pno: "00180", kunta: "Helsinki" };
  const osoite = (o: Partial<Osoite>): Osoite => ({ type: 1, street: "Kalevankatu", buildingNumber: "35", postCode: "00180", ...o });

  it("hyväksyy saman talon samalla postinumerolla tai kunnalla", () => {
    expect(osoiteOsuu(osoite({}), talo)).toBe(true);
    expect(osoiteOsuu(osoite({ postCode: "00100", postOffices: [{ city: "HELSINKI", languageCode: "1" }] }), talo)).toBe(true);
    expect(osoiteOsuu(osoite({ buildingNumber: "33-37" }), talo)).toBe(true);
  });

  it("ei osu toisen kunnan samannimiseen katuun", () => {
    expect(osoiteOsuu(osoite({ postCode: "80100", postOffices: [{ city: "JOENSUU", languageCode: "1" }] }), talo)).toBe(false);
  });

  it("ei osu isännöitsijän c/o-osoitteeseen eikä eri numeroon", () => {
    expect(osoiteOsuu(osoite({ co: "c/o Isännöinti Oy" }), talo)).toBe(false);
    expect(osoiteOsuu(osoite({ buildingNumber: "36" }), talo)).toBe(false);
  });

  it("vaatii tiedon talon seudusta", () => {
    expect(osoiteOsuu(osoite({}), { ...talo, pno: null, kunta: null })).toBe(false);
  });
});

describe("ydinnimi", () => {
  it("poistaa yhtiömuodon kaikissa kirjoitusasuissa", () => {
    expect(ydinnimi("As Oy Ihantola")).toBe("ihantola");
    expect(ydinnimi("Asunto Oy Ihantola")).toBe("ihantola");
    expect(ydinnimi("Asunto-Osakeyhtiö Vladimirinkatu 38")).toBe("vladimirinkatu 38");
    expect(ydinnimi("Bostads Ab Strandgatan 4")).toBe("strandgatan 4");
    expect(ydinnimi("Ihantola As Oy")).toBe("ihantola");
  });

  it("palauttaa null, jos nimi ei ole asunto-osakeyhtiö", () => {
    expect(ydinnimi("Kiinteistö Oy Ihantola")).toBeNull();
    expect(ydinnimi("8125 Espoon Asemasilta")).toBeNull();
  });
});

describe("todistuksenYhtio", () => {
  it.each([
    ["As Oy Ihantola", "As Oy Ihantola"],
    ["Asunto Oy Papinkuja 2 / talo 2", "Asunto Oy Papinkuja 2"],
    ["As Oy Malmin Kotiraitti - Rak H", "As Oy Malmin Kotiraitti"],
    ["As Oy Pasinpuisto, talo A-D", "As Oy Pasinpuisto"],
    ["As Oy Sudenkuoppa - Talo 5", "As Oy Sudenkuoppa"],
    ["Asunto Oy Kivikko talo B", "Asunto Oy Kivikko"],
    ["Asunto-Osakeyhtiö Vladimirinkatu 38", "Asunto-Osakeyhtiö Vladimirinkatu 38"],
  ])("%s → %s", (kohde, yhtio) => {
    expect(todistuksenYhtio(kohde)).toBe(yhtio);
  });

  it("ohittaa kohteet, jotka eivät ole taloyhtiöitä", () => {
    expect(todistuksenYhtio("8125 Espoon Asemasilta")).toBeNull();
  });
});

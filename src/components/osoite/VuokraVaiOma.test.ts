import { describe, expect, it } from "vitest";
import { simuloi } from "./VuokraVaiOma";

// Kallion kaksio laskurin oletuksilla (tarkistettu erillisellä Python-laskelmalla 24.10.2026).
const kaksio = {
  hinta: 274_000,
  vuokra: 1010,
  hoitovastike: 225,
  remonttivara: 50,
  omarahoitus: 0.15,
  korko: 0.035,
  lainaAika: 25,
  arvonnousu: 0.015,
  kulujenNousu: 0.02,
  tuotto: 0.05,
  vuotta: 10,
};

describe("simuloi", () => {
  it("laskee ensimmäisen vuoden kuukausikulut", () => {
    const r = simuloi(kaksio);
    expect(r.laina).toBeCloseTo(232_900, 6);
    expect(r.era).toBeCloseTo(1165.95, 2);
    expect(r.alkupanos).toBeCloseTo(45_210, 6); // 41 100 käsiraha + 4 110 varainsiirtovero
    expect(r.kk.korot).toBeCloseTo(671, 0);
    expect(r.kk.lyhennys).toBeCloseTo(495, 0);
    expect(r.kk.korot + r.kk.lyhennys).toBeCloseTo(r.era, 6);
    expect(r.kk.omistaminen).toBeCloseTo(1441, 0);
    expect(r.kk.vuokra).toBeCloseTo(1010, 6);
  });

  it("laskee varallisuuden vuosittain", () => {
    const r = simuloi(kaksio);
    expect(r.vuodet).toHaveLength(11);
    expect(r.vuodet[0]).toEqual({ vuosi: 0, omistaja: expect.closeTo(32_880, 0), vuokralainen: expect.closeTo(45_210, 0) });
    expect(r.vuodet[1].omistaja).toBeCloseTo(42_801, 0);
    expect(r.vuodet[1].vuokralainen).toBeCloseTo(52_759, 0);
    expect(r.vuodet[5].omistaja).toBeCloseTo(85_280, 0);
    expect(r.vuodet[5].vuokralainen).toBeCloseTo(84_991, 0);
    expect(r.vuodet[10].omistaja).toBeCloseTo(145_351, 0);
    expect(r.vuodet[10].vuokralainen).toBeCloseTo(130_374, 0);
    expect(r.ohitus).toBe(5);
  });

  it("vuokralainen voittaa, kun vuokra on halpa ja asuntojen hinnat laskevat", () => {
    const r = simuloi({ ...kaksio, vuokra: 700, arvonnousu: -0.02 });
    expect(r.vuodet.at(-1)!.vuokralainen).toBeGreaterThan(r.vuodet.at(-1)!.omistaja);
    expect(r.ohitus).toBeNull();
  });

  it("vastaa suljettua muotoa ilman korkoa, tuottoa ja nousuja", () => {
    // Käteiskauppa, ei korkoa eikä tuottoa: vuokralainen säästää alkupanoksen ja omistajan säästämän vuokran erotuksen.
    const s = { ...kaksio, omarahoitus: 1, korko: 0, arvonnousu: 0, kulujenNousu: 0, tuotto: 0, vuotta: 5 };
    const r = simuloi(s);
    expect(r.era).toBe(0);
    const omistajanSaasto = (s.vuokra - s.hoitovastike - s.remonttivara) * 12 * 5;
    expect(r.vuodet[5].omistaja).toBeCloseTo(s.hinta * 0.97 + omistajanSaasto, 6);
    expect(r.vuodet[5].vuokralainen).toBeCloseTo(s.hinta * 1.015, 6);
  });

  it("maksaa lainan pois laina-ajassa ja lopettaa lyhennykset", () => {
    const r = simuloi({ ...kaksio, lainaAika: 5, vuotta: 8 });
    // Lyhyen lainan erä on vuokraa suurempi, joten omistajalle ei kerry sijoituksia: 5 vuoden kohdalla varallisuus on
    // pelkkä velaton asunto myyntikulujen jälkeen.
    expect(r.vuodet[5].omistaja).toBeCloseTo(kaksio.hinta * 1.015 ** 5 * 0.97, 0);
    // Sen jälkeen omistaminen on vuokraa halvempaa, ja erotus kasvattaa omistajan varallisuutta asunnon arvoa nopeammin.
    expect(r.vuodet[8].omistaja).toBeGreaterThan(kaksio.hinta * 1.015 ** 8 * 0.97);
  });
});

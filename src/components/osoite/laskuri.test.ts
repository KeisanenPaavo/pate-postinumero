import { describe, expect, it } from "vitest";
import { kuukausiera, lue, pyorista } from "./laskuri";

describe("lue", () => {
  it("hyväksyy desimaalipilkun ja välilyönnit", () => {
    expect(lue("3,5")).toBe(3.5);
    expect(lue("274 000")).toBe(274000);
    expect(lue(" 12.25 ")).toBe(12.25);
  });

  it("palauttaa nollan virheellisestä syötteestä", () => {
    expect(lue("")).toBe(0);
    expect(lue("abc")).toBe(0);
  });
});

describe("pyorista", () => {
  it("pyöristää annettuun tarkkuuteen", () => {
    expect(pyorista(273_500, 1000)).toBe(274_000);
    expect(pyorista(1_004, 10)).toBe(1_000);
    expect(pyorista(227.5, 5)).toBe(230);
  });
});

describe("kuukausiera", () => {
  it("laskee annuiteettierän", () => {
    // 100 000 €, 3 %, 25 vuotta → 474,21 €/kk
    expect(kuukausiera(100_000, 0.03, 25)).toBeCloseTo(474.21, 2);
    expect(kuukausiera(232_900, 0.035, 25)).toBeCloseTo(1165.95, 2);
  });

  it("jakaa lainan tasan, kun korko on nolla", () => {
    expect(kuukausiera(120_000, 0, 10)).toBe(1000);
  });

  it("on nolla ilman lainaa tai laina-aikaa", () => {
    expect(kuukausiera(0, 0.03, 25)).toBe(0);
    expect(kuukausiera(100_000, 0.03, 0)).toBe(0);
  });

  it("maksaa lainan takaisin laina-ajassa", () => {
    const laina = 150_000;
    const korko = 0.04;
    const era = kuukausiera(laina, korko, 20);
    let saldo = laina;
    for (let kk = 0; kk < 20 * 12; kk++) saldo -= era - saldo * (korko / 12);
    expect(saldo).toBeCloseTo(0, 6);
  });
});

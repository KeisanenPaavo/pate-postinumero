import "server-only";
import { cacheLife } from "next/cache";
import type { Piste } from "./data";
import { jasennaOsoite } from "./taloyhtio";

// Rakennuksen tiedot pysyvän rakennustunnuksen (PRT) kautta:
// 1. Ryhti (Syke, rakennetun ympäristön tietojärjestelmä, CC BY 4.0): osoite → rakennus → rakennusluvat. OGC API Features.
// 2. Energiatodistusrekisteri (Varke): rekisterin julkisen haun rajapinta, haku rakennustunnuksella.
// Lähteet ja havainnot: docs/datan-saatavuus.md

const RYHTI = "https://paikkatiedot.ymparisto.fi/geoserver";
const ETR = "https://www.energiatodistusrekisteri.fi/api/public/energiatodistukset";

// Ryhdin koodistot (koodistot.suomi.fi, rytj). Arvot tulevat URI:na, jonka viimeinen osa on koodi.
const RAKENNUSLUOKKA: Record<string, string> = {
  "01": "Vapaa-ajan asuinrakennus", "02": "Muu rakennus", "03": "Talousrakennus", "04": "Saunarakennus", "05": "Pientalo",
  "06": "Kerrostalo", "07": "Julkinen rakennus",
};
const JULKISIVU: Record<string, string> = { "01": "Betoni", "02": "Tiili", "03": "Metallilevy", "04": "Kivi", "05": "Puu", "06": "Lasi", "99": "Muu" };
const RUNKO: Record<string, string> = { "01": "Betoni", "02": "Tiili", "03": "Teräs", "04": "Puu", "99": "Muu" };
const LAMMITYS: Record<string, string> = {
  "01": "Vesikeskuslämmitys", "02": "Ilmakeskuslämmitys", "03": "Sähkölämmitys", "04": "Uuni tai takka", "05": "Aurinkolämmitys",
  "06": "Ilmalämpöpumppu", "07": "Ei kiinteää lämmitystä", "99": "Muu",
};
const ENERGIANLAHDE: Record<string, string> = {
  "01": "Kaukolämpö", "02": "Kevyt polttoöljy", "03": "Raskas polttoöljy", "04": "Sähkö", "05": "Kaasu", "06": "Kivihiili", "07": "Puu",
  "08": "Turve", "09": "Maalämpö", "10": "Aurinkoenergia", "11": "Lämpöpumppu", "1101": "Maalämpöpumppu", "1102": "Ilmalämpöpumppu",
  "1103": "Poistoilmalämpöpumppu", "1104": "Ilma-vesilämpöpumppu", "99": "Muu",
};
const TOIMENPIDE: Record<string, string> = {
  "01": "Uudisrakennus", "02": "Laajennus", "03": "Peruskorjaukseen verrattava muutostyö", "04": "Muutostyö", "05": "Purkaminen",
  "06": "Osittainen purkaminen", "07": "Kaupunkikuvatoimenpide", "08": "Maisematyö", "09": "Rakennustietojen päivitys",
};
const LUVAN_TILA: Record<string, string> = { "1": "suunniteltu", "2": "aloitettu", "3": "keskeytetty", "4": "rauennut", "5": "valmis" };

const koodi = (uri: string | null | undefined, lista: Record<string, string>) => (uri ? (lista[uri.split("/").at(-1)!] ?? null) : null);
const vuosi = (pvm: string | null | undefined) => (pvm ? +pvm.slice(0, 4) : null);

export type Rakennuslupa = {
  /** Päätöksen vuosi. */
  vuosi: number | null;
  toimenpide: string;
  /** "valmis", "aloitettu", "rauennut" … */
  tila: string | null;
  valmistunut: number | null;
};

export type Energiatodistus = {
  id: number;
  /** Kohteen nimi todistuksessa, usein taloyhtiö ja talo ("As Oy Ihantola, talo A"). */
  nimi: string | null;
  luokka: string;
  eluku: number | null;
  laadittu: string;
  voimassa: string;
  /** Laatijan keskeiset suositukset energiatehokkuuden parantamiseksi. */
  suositukset: string | null;
  lammitys: string | null;
  ilmanvaihto: string | null;
  /** 2013 tai 2018 – luokkarajat eroavat versioiden välillä. */
  versio: number;
};

export type Rakennustiedot = {
  /** "osoite": rakennus löytyi haetulla osoitteella; "lahin": lähin osoitepiste, kun osoitetta ei tunnistettu. */
  osuma: "osoite" | "lahin" | null;
  rakennukset: Rakennus[];
};

export type Rakennus = {
  prt: string;
  osoitteet: string[];
  tyyppi: string | null;
  valmistunut: number | null;
  kerroksia: number | null;
  asuntoja: number | null;
  kerrosala: number | null;
  julkisivu: string | null;
  runko: string | null;
  lammitys: string | null;
  lammonlahde: string | null;
  suojeltu: boolean;
  luvat: Rakennuslupa[];
  energia: Energiatodistus | null;
};

type Feature<P> = { properties: P; geometry: { coordinates: [number, number] } | null };

type RyhtiOsoite = {
  building_key: string;
  address_fin: string | null;
  address_name_fin: string | null;
  number_part_of_address_number: number | null;
  postal_code: string | null;
};
type RyhtiRakennus = {
  building_key: string;
  permanent_building_identifier: string | null;
  completion_date: string | null;
  main_purpose: string | null;
  usage_status: string | null;
  demolition_date: string | null;
  facade_material: string | null;
  heating_method: string | null;
  heating_energy_source: string | null;
  material_of_load_bearing_structures: string | null;
  number_of_storeys: number | null;
  gross_floor_area: number | null;
  apartment_count: number | null;
  is_protected: boolean | null;
};
type RyhtiLupa = {
  permanent_building_identifier: string;
  permanent_permit_identifier: string | null;
  decision_date: string | null;
  construction_action_type: string | null;
  status_of_construction_action: string | null;
  completion_date: string | null;
};

async function ryhti<P>(polku: string, params: Record<string, string>): Promise<Feature<P>[]> {
  const url = `${RYHTI}/${polku}/items?${new URLSearchParams({ f: "json", limit: "200", ...params })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${res.status} Ryhti`);
  return ((await res.json()) as { features: Feature<P>[] }).features;
}

const lista = (arvot: string[]) => arvot.map((a) => `'${a.replace(/'/g, "''")}'`).join(",");

/** Osoitteet noin 150 m säteellä pisteestä. */
async function osoitteetLahella(lat: number, lon: number) {
  "use cache";
  cacheLife("days");
  const dLat = 0.0014;
  const dLon = 0.0028;
  return ryhti<RyhtiOsoite>("ryhti_building/ogc/features/v1/collections/open_address", {
    bbox: [lon - dLon, lat - dLat, lon + dLon, lat + dLat].join(","),
  });
}

async function rakennuksetAvaimilla(avaimet: string[]) {
  "use cache";
  cacheLife("days");
  return ryhti<RyhtiRakennus>("ryhti_building/ogc/features/v1/collections/open_building", {
    "filter-lang": "cql-text",
    filter: `building_key IN (${lista(avaimet)})`,
  });
}

async function luvatTunnuksilla(prt: string[]) {
  "use cache";
  cacheLife("days");
  return ryhti<RyhtiLupa>("ryhti_permit/ogc/features/v1/collections/open_permit_building", {
    "filter-lang": "cql-text",
    filter: `permanent_building_identifier IN (${lista(prt)})`,
  });
}

type EtrTodistus = {
  id: number;
  versio: number;
  allekirjoitusaika: string;
  "voimassaolo-paattymisaika": string;
  "korvaava-energiatodistus-id": number | null;
  perustiedot: { "nimi-fi": string | null; rakennustunnus: string | null; "keskeiset-suositukset-fi": string | null };
  tulokset: { "e-luku": number | null; "e-luokka": string | null };
  lahtotiedot: {
    ilmanvaihto?: { "kuvaus-fi": string | null } | null;
    lammitys?: { "lammitysmuoto-1"?: { "kuvaus-fi": string | null } | null } | null;
  };
};

/** Rakennuksen voimassa oleva (uusin, ei korvattu) energiatodistus tai null. */
async function energiatodistus(prt: string): Promise<Energiatodistus | null> {
  "use cache";
  cacheLife("days");
  const where = JSON.stringify([[["=", "energiatodistus.perustiedot.rakennustunnus", prt]]]);
  const res = await fetch(`${ETR}?where=${encodeURIComponent(where)}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${res.status} energiatodistusrekisteri`);
  const t = ((await res.json()) as EtrTodistus[])
    .filter((x) => !x["korvaava-energiatodistus-id"] && x.tulokset["e-luokka"])
    .sort((a, b) => b.allekirjoitusaika.localeCompare(a.allekirjoitusaika))[0];
  if (!t) return null;
  const teksti = (s: string | null | undefined) => s?.replace(/\s+$/, "").trim() || null;
  return {
    id: t.id,
    nimi: teksti(t.perustiedot["nimi-fi"]),
    luokka: t.tulokset["e-luokka"]!,
    eluku: t.tulokset["e-luku"],
    laadittu: t.allekirjoitusaika.slice(0, 10),
    voimassa: t["voimassaolo-paattymisaika"].slice(0, 10),
    suositukset: teksti(t.perustiedot["keskeiset-suositukset-fi"]),
    lammitys: teksti(t.lahtotiedot.lammitys?.["lammitysmuoto-1"]?.["kuvaus-fi"]),
    ilmanvaihto: teksti(t.lahtotiedot.ilmanvaihto?.["kuvaus-fi"]),
    versio: t.versio,
  };
}

const pieni = (s: string) => s.toLocaleLowerCase("fi").trim();
const etaisyys = (a: Piste, b: [number, number]) => {
  const dy = (a.lat - b[1]) * 111_320;
  const dx = (a.lon - b[0]) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

/**
 * Osoitteen rakennukset: ensin osoitteen katu ja numero Ryhdin osoitteista, muuten lähin osoitepiste (≤ 30 m).
 * Tyhjä lista = rakennusta ei tunnistettu. Heittää, jos Ryhti ei vastaa; energiatodistuksen virhe ei kaada hakua.
 */
export async function rakennuksetOsoitteessa(osoite: string, piste: Piste): Promise<Rakennustiedot> {
  const oma = jasennaOsoite(osoite);
  const lahella = await osoitteetLahella(+piste.lat.toFixed(4), +piste.lon.toFixed(4));
  let osuvat = oma
    ? lahella.filter((o) => pieni(o.properties.address_name_fin ?? "") === pieni(oma.katu) && o.properties.number_part_of_address_number === oma.nro)
    : [];
  const osuma = osuvat.length ? "osoite" : "lahin";
  if (!osuvat.length) {
    const lahin = lahella
      .filter((o) => o.geometry)
      .map((o) => ({ o, m: etaisyys(piste, o.geometry!.coordinates) }))
      .sort((a, b) => a.m - b.m)[0];
    if (lahin && lahin.m <= 30) osuvat = lahella.filter((o) => o.properties.address_fin === lahin.o.properties.address_fin);
  }
  const avaimet = [...new Set(osuvat.map((o) => o.properties.building_key))];
  if (!avaimet.length) return { osuma: null, rakennukset: [] };

  // Asuinrakennukset, jos osoitteessa on niitä; muuten piharakennukset (talous- ja saunarakennukset) pois, ellei ole muuta.
  const kaikki = (await rakennuksetAvaimilla(avaimet))
    .map((f) => f.properties)
    .filter((r) => r.permanent_building_identifier && !r.demolition_date);
  const asuin = kaikki.filter((r) => (r.apartment_count ?? 0) > 0);
  const paa = asuin.length ? asuin : kaikki.filter((r) => !["03", "04"].includes(r.main_purpose?.split("/").at(-1) ?? ""));
  const rakennukset = (paa.length ? paa : kaikki).slice(0, 6);
  if (!rakennukset.length) return { osuma: null, rakennukset: [] };

  const prt = rakennukset.map((r) => r.permanent_building_identifier!);
  const [luvat, todistukset] = await Promise.all([
    luvatTunnuksilla(prt).catch(() => [] as Feature<RyhtiLupa>[]),
    Promise.all(prt.map((t) => energiatodistus(t).catch(() => null))),
  ]);

  return { osuma, rakennukset: rakennukset.map((r, i): Rakennus => ({
    prt: r.permanent_building_identifier!,
    osoitteet: [...new Set(lahella.filter((o) => o.properties.building_key === r.building_key).map((o) => o.properties.address_fin!).filter(Boolean))],
    tyyppi: koodi(r.main_purpose, RAKENNUSLUOKKA),
    valmistunut: vuosi(r.completion_date),
    kerroksia: r.number_of_storeys,
    asuntoja: r.apartment_count,
    kerrosala: r.gross_floor_area,
    julkisivu: koodi(r.facade_material, JULKISIVU),
    runko: koodi(r.material_of_load_bearing_structures, RUNKO),
    lammitys: koodi(r.heating_method, LAMMITYS),
    lammonlahde: koodi(r.heating_energy_source, ENERGIANLAHDE),
    suojeltu: !!r.is_protected,
    luvat: luvat
      .map((l) => l.properties)
      .filter((l) => l.permanent_building_identifier === r.permanent_building_identifier)
      .filter((l, j, kaikki) => !l.permanent_permit_identifier || kaikki.findIndex((m) => m.permanent_permit_identifier === l.permanent_permit_identifier) === j)
      // Uudisrakennuslupa ja pelkät tietojen päivitykset eivät kerro korjauksista.
      .filter((l) => !/\/(01|09)$/.test(l.construction_action_type ?? ""))
      .map((l) => ({
        vuosi: vuosi(l.decision_date),
        toimenpide: koodi(l.construction_action_type, TOIMENPIDE) ?? "Muu toimenpide",
        tila: koodi(l.status_of_construction_action, LUVAN_TILA),
        valmistunut: vuosi(l.completion_date),
      }))
      .sort((a, b) => (b.vuosi ?? 0) - (a.vuosi ?? 0)),
    energia: todistukset[i],
  })) };
}

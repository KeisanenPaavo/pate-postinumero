import "server-only";
import { cacheLife } from "next/cache";
import raakaKoulut from "../../data/generated/koulut.json";
import raakaPalvelupisteet from "../../data/generated/palvelupisteet.json";
import type { Piste } from "./data";

// Muoto: scripts/etl/palvelupisteet.mjs – [lat, lon, nimi, tyyppi?]
const palvelupisteet = raakaPalvelupisteet as unknown as {
  kaupat: [number, number, string, "s" | "l"][];
  paivakodit: [number, number, string][];
};

// Reaaliaikaiset pistekyselyt ulkoisiin rajapintoihin. Kaikki tulokset välimuistitetaan
// pyöristetyillä koordinaateilla, jotta samaa osoitetta ei kysytä toistuvasti.
// Rajapinnat ja niiden havainnot: docs/datan-saatavuus.md

const DIGITRANSIT = "https://api.digitransit.fi";
const UA = { "User-Agent": "pate-postinumero/0.1" };

function digitransitHeaders() {
  const key = process.env.DIGITRANSIT_KEY;
  if (!key) throw new Error("DIGITRANSIT_KEY puuttuu");
  return { "digitransit-subscription-key": key };
}

async function getJson<T>(url: string, params: Record<string, string>, headers: Record<string, string> = UA): Promise<T> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} ${u.host}`);
  return res.json() as Promise<T>;
}

/** Pyöristää ~10 m tarkkuuteen välimuistiavainta varten. */
export const pyorista = (p: Piste): Piste => ({ lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4) });

const wfsPoint = <T>(base: string, typeName: string, propertyName: string, p: Piste) =>
  getJson<{ features: { properties: T }[] }>(base, {
    service: "WFS", version: "1.1.0", request: "GetFeature", typeName, propertyName,
    outputFormat: "application/json",
    cql_filter: `INTERSECTS(geom,SRID=4326;POINT(${p.lon} ${p.lat}))`,
  });

// --- Osoitehaku --------------------------------------------------------------

export type Osoite = { nimi: string; lat: number; lon: number };

// Uudenmaan rajaava suorakulmio (väljä) ja maakunnan tunniste Digitransitin (Pelias) aineistossa.
// Suorakulmio ulottuu mm. Lahteen ja Riihimäelle, joten varsinainen rajaus tehdään maakunnalla.
const UUSIMAA_BBOX = { minLon: 22.8, minLat: 59.7, maxLon: 26.7, maxLat: 61.0 };
const UUSIMAA_GID = "whosonfirst:region:85683067";

export async function haeOsoitteita(teksti: string): Promise<Osoite[]> {
  "use cache";
  cacheLife("days");
  const js = await getJson<{
    features: { geometry: { coordinates: [number, number] }; properties: { label: string; region?: string; region_gid?: string } }[];
  }>(
    `${DIGITRANSIT}/geocoding/v1/autocomplete`,
    {
      text: teksti, lang: "fi", layers: "address,street,venue", "boundary.gid": UUSIMAA_GID,
      "boundary.rect.min_lon": String(UUSIMAA_BBOX.minLon), "boundary.rect.min_lat": String(UUSIMAA_BBOX.minLat),
      "boundary.rect.max_lon": String(UUSIMAA_BBOX.maxLon), "boundary.rect.max_lat": String(UUSIMAA_BBOX.maxLat),
    },
    digitransitHeaders(),
  );
  // Sama osoite voi tulla useasta lähteestä (OSM, VRK) – näytetään kerran.
  const nahty = new Set<string>();
  return js.features
    // Varmistus: maakuntarajaus myös vastauksesta, jos rajapinta ohittaisi boundary.gid-parametrin.
    .filter((f) => f.properties.region_gid === UUSIMAA_GID || f.properties.region === "Uusimaa")
    .filter((f) => !nahty.has(f.properties.label) && nahty.add(f.properties.label))
    .slice(0, 8)
    .map((f) => ({ nimi: f.properties.label, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}

export async function postinumeroPisteelle(p: Piste): Promise<string | null> {
  "use cache";
  cacheLife("weeks");
  const js = await wfsPoint<{ posti_alue: string }>("https://geo.stat.fi/geoserver/postialue/wfs", "postialue:pno_2026", "posti_alue", p);
  return js.features[0]?.properties.posti_alue ?? null;
}

// --- Melu (Väylävirasto + Helsinki) ---------------------------------------------

const VAYLA = "https://avoinapi.vaylapilvi.fi/vaylatiedot/ows";
const HELSINKI = "https://kartta.hel.fi/ws/geoserver/avoindata/wfs";

export type Melu = {
  maantiet: { paiva: string | null; yo: string | null };
  rautatiet: { paiva: string | null; yo: string | null };
  /** Helsingin oma selvitys (kadut, raiteet yhteensä, päivä 7–22). undefined = ei katettu. */
  helsinkiYhteismelu?: string | null;
};

export async function melu(p: Piste, kuntanro: string): Promise<Melu> {
  "use cache";
  cacheLife("weeks");
  const vayla = (layer: string) =>
    wfsPoint<{ melu_db: string }>(VAYLA, layer, "melu_db", p).then((js) => js.features[0]?.properties.melu_db ?? null);
  const [mp, my, rp, ry, hki] = await Promise.all([
    vayla("tiestotiedot:melu_paiva_maankad_22"),
    vayla("tiestotiedot:melu_yo_maankad_22"),
    vayla("ratatiedot:melu_paiva_rautatiet_22"),
    vayla("ratatiedot:melu_yo_rautatiet_22"),
    kuntanro === "091"
      ? wfsPoint<{ db_lo: number; db_hi: number }>(HELSINKI, "avoindata:Meluselvitys_2022_Helsinki_yhteismelu_LAeg_7-22_NPM", "db_lo,db_hi", p).then(
          (js) => {
            const f = js.features[0]?.properties;
            return f ? `${f.db_lo}–${f.db_hi} dB` : null;
          },
        )
      : Promise.resolve(undefined),
  ]);
  return { maantiet: { paiva: mp, yo: my }, rautatiet: { paiva: rp, yo: ry }, helsinkiYhteismelu: hki };
}

// --- Koulut (oppilaitosrekisteri + pääkaupunkiseudun palvelukartta, scripts/etl/koulut.mjs) -----------

// Rekisterin sijainnit ovat osin pielessä (Espoo, Vantaa); ETL korjaa ne kaupunkien palvelukartasta.
export const oppilaitokset = (raakaKoulut as unknown as { koulut: [number, number, string, string][] }).koulut.map(([lat, lon, nimi, tyyppi]) => ({
  nimi,
  tyyppi,
  lat,
  lon,
}));

export function etaisyysKm(a: Piste, b: Piste) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Lähimmät koulut: 4 peruskoulua ja 2 lukiota etäisyysjärjestyksessä (lukiot eivät vie peruskoulujen paikkoja). */
export async function lahimmatKoulut(p: Piste) {
  const kaikki = oppilaitokset.map((o) => ({ ...o, km: etaisyysKm(p, o) })).sort((a, b) => a.km - b.km);
  const lukio = (o: { tyyppi: string }) => o.tyyppi === "Lukiot";
  return [...kaikki.filter((o) => !lukio(o)).slice(0, 4), ...kaikki.filter(lukio).slice(0, 2)].sort((a, b) => a.km - b.km);
}

// --- Matka-ajat (Digitransit) ----------------------------------------------------

export type Matka = { julkinen: number | null; vaihdot: number | null; reitti: string | null; pyora: number | null; kavely: number | null };

/** Seuraava arkipäivä klo 8.00 Suomen aikaa. */
function arkiaamu() {
  const d = new Date();
  do d.setDate(d.getDate() + 1);
  while ([0, 6].includes(d.getDay()));
  const date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });
  const offset = new Intl.DateTimeFormat("en", { timeZone: "Europe/Helsinki", timeZoneName: "longOffset" })
    .formatToParts(d)
    .find((x) => x.type === "timeZoneName")!
    .value.replace("GMT", "");
  return `${date}T08:00:00${offset || "+00:00"}`;
}

type Itinerary = { duration: number; legs: { mode: string; route: { shortName: string | null } | null }[] };

async function reitit(from: Piste, to: Piste, modes?: object): Promise<Itinerary[]> {
  const query = `query ($from: PlanLabeledLocationInput!, $to: PlanLabeledLocationInput!, $dt: PlanDateTimeInput, $modes: PlanModesInput) {
    planConnection(origin: $from, destination: $to, dateTime: $dt, modes: $modes, first: 3) {
      edges { node { duration legs { mode route { shortName } } } }
    }
  }`;
  const loc = (p: Piste) => ({ location: { coordinate: { latitude: p.lat, longitude: p.lon } } });
  const res = await fetch(`${DIGITRANSIT}/routing/v2/finland/gtfs/v1`, {
    method: "POST",
    headers: { ...digitransitHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { from: loc(from), to: loc(to), dt: { earliestDeparture: arkiaamu() }, modes } }),
    signal: AbortSignal.timeout(20_000),
  });
  const js = await res.json();
  if (!res.ok || js.errors) throw new Error(`Digitransit ${res.status}`);
  return (js.data.planConnection.edges as { node: Itinerary }[]).map((e) => e.node).sort((a, b) => a.duration - b.duration);
}

const KULKUNEUVO: Record<string, string> = { BUS: "bussi", TRAM: "ratikka", SUBWAY: "metro", RAIL: "juna", FERRY: "lautta" };

export async function matka(from: Piste, to: Piste): Promise<Matka> {
  "use cache";
  cacheLife("days");
  const [julkinen, pyora, kavely] = await Promise.all([
    reitit(from, to),
    reitit(from, to, { directOnly: true, direct: ["BICYCLE"] }),
    reitit(from, to, { directOnly: true, direct: ["WALK"] }),
  ]);
  const paras = julkinen[0];
  const kulkuneuvot = paras?.legs.filter((l) => l.mode !== "WALK") ?? [];
  const min = (s?: number) => (s == null ? null : Math.round(s / 60));
  return {
    julkinen: min(paras?.duration),
    vaihdot: paras ? Math.max(kulkuneuvot.length - 1, 0) : null,
    reitti: kulkuneuvot.map((l) => `${KULKUNEUVO[l.mode] ?? l.mode.toLowerCase()} ${l.route?.shortName ?? ""}`.trim()).join(" → ") || null,
    pyora: min(pyora[0]?.duration),
    kavely: min(kavely[0]?.duration),
  };
}

// --- Lähiympäristö: kaupat, päiväkodit (OSM, ETL) ja pysäkit (Digitransit) ---------------

type PalveluPiste = { nimi: string; lat: number; lon: number; km: number };

const lahimmat = <T extends Piste>(p: Piste, pisteet: T[], n: number) =>
  pisteet
    .map((x) => ({ ...x, km: etaisyysKm(p, x) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);

/** Lähimmät ruokakaupat ja päiväkodit esiladatusta OSM-otteesta (scripts/etl/palvelupisteet.mjs). */
export function lahimmatPalvelut(p: Piste): { kaupat: (PalveluPiste & { tyyppi: string })[]; paivakodit: PalveluPiste[] } {
  return {
    kaupat: lahimmat(
      p,
      palvelupisteet.kaupat.map(([lat, lon, nimi, t]) => ({ lat, lon, nimi, tyyppi: t === "s" ? "supermarket" : "lähikauppa" })),
      3,
    ),
    paivakodit: lahimmat(p, palvelupisteet.paivakodit.map(([lat, lon, nimi]) => ({ lat, lon, nimi })), 4),
  };
}

export type Pysakki = { nimi: string; lat: number; lon: number; metrit: number; kulkuneuvo: string; linjat: string[] };

/** Pysäkkihaun säde: taajamassa 800 m; jos sillä ei löydy yhtään pysäkkiä (maaseutu), haetaan 2 km säteeltä. */
export const PYSAKKISADE = { taajama: 800, maaseutu: 2000 } as const;

/** Lähimmät pysäkit ja käytetty hakusäde (m). */
export async function lahimmatPysakit(p: Piste): Promise<{ pysakit: Pysakki[]; sade: number }> {
  "use cache";
  cacheLife("days");
  const lahella = await pysakitSateella(p, PYSAKKISADE.taajama);
  if (lahella.length) return { pysakit: lahella, sade: PYSAKKISADE.taajama };
  return { pysakit: await pysakitSateella(p, PYSAKKISADE.maaseutu), sade: PYSAKKISADE.maaseutu };
}

/** Lähimmät pysäkit annetulla säteellä. Saman nimiset laiturit (kadun eri puolilla) yhdistetään. */
async function pysakitSateella(p: Piste, sade: number, n = 6): Promise<Pysakki[]> {
  const query = `query ($lat: Float!, $lon: Float!, $sade: Int!) {
    stopsByRadius(lat: $lat, lon: $lon, radius: $sade, first: 60) {
      edges { node { distance stop { name lat lon vehicleMode routes { shortName } } } }
    }
  }`;
  const res = await fetch(`${DIGITRANSIT}/routing/v2/finland/gtfs/v1`, {
    method: "POST",
    headers: { ...digitransitHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { lat: p.lat, lon: p.lon, sade } }),
    signal: AbortSignal.timeout(20_000),
  });
  const js = await res.json();
  if (!res.ok || js.errors) throw new Error(`Digitransit ${res.status}`);
  type Solmu = { distance: number; stop: { name: string; lat: number; lon: number; vehicleMode: string | null; routes: { shortName: string | null }[] } };
  const ryhmat = new Map<string, Pysakki>();
  for (const { node } of js.data.stopsByRadius.edges as { node: Solmu }[]) {
    const s = node.stop;
    if (s.vehicleMode === "RAIL") continue; // juna-asemat omana listanaan (lahimmatJunaAsemat)
    const kulkuneuvo = KULKUNEUVO[s.vehicleMode ?? ""] ?? "bussi";
    const avain = `${s.name}|${kulkuneuvo}`;
    const linjat = s.routes.map((r) => r.shortName).filter((x): x is string => !!x);
    const vanha = ryhmat.get(avain);
    if (!vanha) ryhmat.set(avain, { nimi: s.name, lat: s.lat, lon: s.lon, metrit: Math.round(node.distance), kulkuneuvo, linjat });
    else vanha.linjat.push(...linjat);
  }
  // Yölinjat (N-pääte) ja pysäkit ilman linjoja jätetään pois; linjat numerojärjestykseen.
  return [...ryhmat.values()]
    .map((r) => ({
      ...r,
      linjat: [...new Set(r.linjat.filter((l) => !/N$/.test(l)))].sort((a, b) => a.localeCompare(b, "fi", { numeric: true })),
    }))
    .filter((r) => r.linjat.length > 0)
    .sort((a, b) => a.metrit - b.metrit)
    .slice(0, n);
}

export type JunaAsema = { nimi: string; lat: number; lon: number; metrit: number; lahijunat: string[]; kaukojunat: boolean };

/**
 * Juna-asemat 3 km säteellä (enintään 3). Laiturit yhdistetään asemaksi; lähijunat näytetään
 * kirjaintunnuksina (A, I, K …), kauko- ja yöjunista (IC, S, PYO …) vain tieto, että niitä pysähtyy.
 */
export async function lahimmatJunaAsemat(p: Piste, n = 3): Promise<JunaAsema[]> {
  "use cache";
  cacheLife("days");
  // Haetaan asemia (STATION) eikä laitureita: nearest palauttaa enintään 20 kohdetta, ja suurten asemien
  // laiturit (Helsingissä ~20) veisivät muuten kaikki paikat ja seuraava asema (Pasila) jäisi pois.
  const query = `query ($lat: Float!, $lon: Float!) {
    nearest(lat: $lat, lon: $lon, maxDistance: 3000, filterByModes: [RAIL], filterByPlaceTypes: [STATION], first: 20) {
      edges { node { distance place { ... on Stop { name lat lon stops { routes { shortName } } } } } }
    }
  }`;
  const res = await fetch(`${DIGITRANSIT}/routing/v2/finland/gtfs/v1`, {
    method: "POST",
    headers: { ...digitransitHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { lat: p.lat, lon: p.lon } }),
    signal: AbortSignal.timeout(20_000),
  });
  const js = await res.json();
  if (!res.ok || js.errors) throw new Error(`Digitransit ${res.status}`);
  type Solmu = { distance: number; place: { name: string; lat: number; lon: number; stops: { routes: { shortName: string | null }[] }[] | null } };
  return (js.data.nearest.edges as { node: Solmu }[])
    .map(({ node }) => {
      const tunnukset = (node.place.stops ?? []).flatMap((st) => st.routes.map((r) => r.shortName ?? ""));
      return {
        nimi: node.place.name,
        lat: node.place.lat,
        lon: node.place.lon,
        metrit: Math.round(node.distance),
        lahijunat: [...new Set(tunnukset.filter((t) => /^[A-Z]$/.test(t)))].sort(),
        kaukojunat: tunnukset.some((t) => /^[A-Z]{1,3} ?\d+$/.test(t)),
      };
    })
    .sort((a, b) => a.metrit - b.metrit)
    .slice(0, n);
}

// --- Kävelyreitti (Lähiympäristö-kartta) ------------------------------------------------

export type Kavely = { minuutit: number; metrit: number; reitti: [number, number][] };

/** Googlen koodattu polyline (tarkkuus 5) → [[lon, lat], …] */
function puraPolyline(s: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lon = 0;
  const luku = () => {
    let tulos = 0, siirto = 0, b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      tulos |= (b & 0x1f) << siirto;
      siirto += 5;
    } while (b >= 0x20);
    return tulos & 1 ? ~(tulos >> 1) : tulos >> 1;
  };
  while (i < s.length) {
    lat += luku();
    lon += luku();
    out.push([lon / 1e5, lat / 1e5]);
  }
  return out;
}

/** Kävelyreitti, -aika ja -matka Digitransitista. null, jos reittiä ei löydy. */
export async function kavelyreitti(from: Piste, to: Piste): Promise<Kavely | null> {
  "use cache";
  cacheLife("days");
  const query = `query ($from: PlanLabeledLocationInput!, $to: PlanLabeledLocationInput!) {
    planConnection(origin: $from, destination: $to, modes: { directOnly: true, direct: [WALK] }, first: 1) {
      edges { node { duration legs { distance legGeometry { points } } } }
    }
  }`;
  const loc = (p: Piste) => ({ location: { coordinate: { latitude: p.lat, longitude: p.lon } } });
  const res = await fetch(`${DIGITRANSIT}/routing/v2/finland/gtfs/v1`, {
    method: "POST",
    headers: { ...digitransitHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { from: loc(from), to: loc(to) } }),
    signal: AbortSignal.timeout(20_000),
  });
  const js = await res.json();
  if (!res.ok || js.errors) throw new Error(`Digitransit ${res.status}`);
  const node = js.data.planConnection.edges[0]?.node as { duration: number; legs: { distance: number; legGeometry: { points: string } }[] } | undefined;
  if (!node) return null;
  return {
    minuutit: Math.max(1, Math.round(node.duration / 60)),
    metrit: Math.round(node.legs.reduce((s, l) => s + l.distance, 0)),
    reitti: node.legs.flatMap((l) => puraPolyline(l.legGeometry.points)),
  };
}

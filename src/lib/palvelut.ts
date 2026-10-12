import "server-only";
import { cacheLife } from "next/cache";
import type { Piste } from "./data";

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

// --- Koulut (Tilastokeskuksen oppilaitosrekisteri) ----------------------------------

type Oppilaitos = { nimi: string; tyyppi: string; lat: number; lon: number };

async function oppilaitokset(): Promise<Oppilaitos[]> {
  "use cache";
  cacheLife("weeks");
  const js = await getJson<{ features: { geometry: { coordinates: [number, number] }; properties: { onimi: string; oltyp_nimi: string } }[] }>(
    "https://geo.stat.fi/geoserver/wfs",
    {
      service: "WFS", version: "1.1.0", request: "GetFeature", typeName: "oppilaitokset:oppilaitokset",
      outputFormat: "application/json", srsName: "EPSG:4326", propertyName: "onimi,oltyp_nimi,geom",
      // GeoServer tulkitsee tämän bboxin järjestyksessä lon,lat (testattu).
      bbox: `${UUSIMAA_BBOX.minLon - 0.4},${UUSIMAA_BBOX.minLat - 0.2},${UUSIMAA_BBOX.maxLon + 0.4},${UUSIMAA_BBOX.maxLat + 0.2},EPSG:4326`,
    },
  );
  // Tyhjä vastaus on aina virhe (esim. väärä bbox) – heitetään, jottei sitä välimuistiteta viikoiksi.
  if (js.features.length < 100) throw new Error(`Oppilaitosrekisteri palautti vain ${js.features.length} koulua`);
  return js.features.map((f) => ({ nimi: f.properties.onimi, tyyppi: f.properties.oltyp_nimi, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}

export function etaisyysKm(a: Piste, b: Piste) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export async function lahimmatKoulut(p: Piste, n = 6) {
  return (await oppilaitokset())
    .map((o) => ({ ...o, km: etaisyysKm(p, o) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
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

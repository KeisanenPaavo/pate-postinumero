"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useId, useRef, useState } from "react";

type Piste = { lat: number; lon: number };

// Karttatasot haetaan suoraan lähteistä rasteritiiliksi (kaikki sallivat CORSin, testattu).
const VAYLA = "https://avoinapi.vaylapilvi.fi/vaylatiedot/ows";
const HELSINKI = "https://kartta.hel.fi/ws/geoserver/avoindata/wms";
const ESPOO = "https://kartat.espoo.fi/teklaogcweb/wms.ashx";

const wms = (base: string, layers: string) =>
  `${base}?service=WMS&version=1.3.0&request=GetMap&layers=${encodeURIComponent(layers)}&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true`;
const legenda = (base: string, layer: string) =>
  `${base}?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&layer=${encodeURIComponent(layer)}`;

type Taso = {
  id: string;
  nimi: string;
  kuvaus: string;
  tiilet: string;
  lahde: string;
  legenda?: string;
  /** Teksti selitteen tilalla, jos lähde ei tarjoa selitekuvaa. */
  eiSelitetta?: string;
  kunnat?: string[]; // näytetään vain näissä kunnissa
};

export const MELU_TASOT: Taso[] = [
  {
    id: "meluVayla",
    nimi: "Melu: maantiet ja radat",
    kuvaus: "Valtion maanteiden ja rautateiden melu päivällä (LAeq 7–22), EU-meluselvitys 2022.",
    tiilet: wms(VAYLA, "tiestotiedot:melu_paiva_maankad_22,ratatiedot:melu_paiva_rautatiet_22"),
    lahde: "© Väylävirasto",
    legenda: legenda(VAYLA, "tiestotiedot:melu_paiva_maankad_22"),
  },
  {
    id: "meluHelsinki",
    nimi: "Melu: Helsingin katuverkko",
    kuvaus: "Katujen, maanteiden ja raideliikenteen yhteismelu päivällä (LAeq 7–22), Helsingin meluselvitys 2022.",
    tiilet: wms(HELSINKI, "avoindata:Meluselvitys_2022_Helsinki_yhteismelu_LAeg_7-22_NPM"),
    lahde: "© Helsingin kaupunki",
    legenda: legenda(HELSINKI, "avoindata:Meluselvitys_2022_Helsinki_yhteismelu_LAeg_7-22_NPM"),
    kunnat: ["091"],
  },
  {
    id: "meluEspoo",
    nimi: "Melu: Espoon katuverkko",
    kuvaus:
      "Katujen ja maanteiden melu vuorokauden painotettuna keskiarvona (Lden), Espoon meluselvitys 2022. Asteikko ei ole suoraan vertailukelpoinen päiväajan LAeq-arvoihin.",
    tiilet: wms(ESPOO, "Espoo_tieliikenne Lden_EU (kadut ja maantiet)"),
    lahde: "© Espoon kaupunki",
    eiSelitetta: "Espoon palvelu ei tarjoa selitettä. Desibelirajat näkyvät Espoon omassa karttapalvelussa (kartat.espoo.fi).",
    kunnat: ["049"],
  },
];

// Kaavoitus ja rakentaminen (Kaavoitus-osio). Helsinki: vektori- ja WMS-aineisto avoimena; Espoo: vain WMS-kuva.
export const KAAVA_TASOT: Taso[] = [
  {
    id: "kaavaHki",
    nimi: "Vireillä olevat asemakaavat",
    kuvaus: "Helsingin vireillä olevien asemakaavojen ja asemakaavamuutosten rajaukset (kaavahakemisto).",
    tiilet: wms(HELSINKI, "avoindata:Kaavahakemisto_alue_kaava_vireilla"),
    lahde: "© Helsingin kaupunki",
    legenda: legenda(HELSINKI, "avoindata:Kaavahakemisto_alue_kaava_vireilla"),
    kunnat: ["091"],
  },
  {
    id: "kaivuHki",
    nimi: "Katu- ja kaivutyöt",
    kuvaus: "Kaivuilmoitusten työalueet (katu-, johto- ja kaapelityöt). Mukana myös päättyneitä töitä – ajankohdat listassa.",
    tiilet: wms(HELSINKI, "avoindata:Kaivuilmoitus_alue"),
    lahde: "© Helsingin kaupunki",
    legenda: legenda(HELSINKI, "avoindata:Kaivuilmoitus_alue"),
    kunnat: ["091"],
  },
  {
    id: "kaavaEspoo",
    nimi: "Vireillä olevat asemakaavat",
    kuvaus: "Espoon vireillä olevien asemakaavojen rajaukset.",
    tiilet: wms(ESPOO, "AsemakaavatVireillaOlevat"),
    lahde: "© Espoon kaupunki",
    eiSelitetta: "Espoon palvelu ei tarjoa selitettä eikä kaavojen tietoja avoimena datana. Kaavojen nimet ja vaiheet näkyvät Espoon omassa karttapalvelussa (kartat.espoo.fi).",
    kunnat: ["049"],
  },
];

/** GeoJSONin rajaava suorakulmio [[minLon, minLat], [maxLon, maxLat]]. */
function bbox(geojson: { features: { geometry: { coordinates: unknown } }[] }): [[number, number], [number, number]] | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  geojson.features.forEach((f) => walk(f.geometry.coordinates));
  return Number.isFinite(x0) ? [[x0, y0], [x1, y1]] : null;
}

const OVERLAY = "overlay";
const RAJA = "postinumeroalue";

/** Teeman väri CSS-muuttujasta (kartta piirtää omat värinsä canvakselle). */
const teemaVari = (nimi: string, varalla: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(nimi).trim() || varalla;

export function Kartta({
  piste,
  onOsoite,
  pno,
  kunta,
  tasot: kaikkiTasot = MELU_TASOT,
}: {
  piste: Piste;
  onOsoite: boolean;
  pno: string;
  kunta: string;
  tasot?: Taso[];
}) {
  const id = useId();
  const elementti = useRef<HTMLDivElement>(null);
  const kartta = useRef<MapLibreMap | null>(null);
  const merkki = useRef<Marker | null>(null);
  const [valmis, setValmis] = useState(false);
  const [virhe, setVirhe] = useState(false);
  const tasot = kaikkiTasot.filter((t) => !t.kunnat || t.kunnat.includes(kunta));
  const [valittu, setValittu] = useState(tasot[0].id);
  const taso = tasot.find((t) => t.id === valittu) ?? tasot[0];

  // Kartan luonti kerran. MapLibre ladataan vasta selaimessa.
  useEffect(() => {
    let poistettu = false;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (poistettu || !elementti.current) return;
        maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const tumma = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const map = new maplibre.Map({
          container: elementti.current,
          style: `https://tiles.openfreemap.org/styles/${tumma ? "dark" : "positron"}`,
          center: [piste.lon, piste.lat],
          zoom: onOsoite ? 15 : 13,
          cooperativeGestures: true,
          locale: {
            "CooperativeGesturesHandler.WindowsHelpText": "Zoomaa karttaa Ctrl + rullalla",
            "CooperativeGesturesHandler.MacHelpText": "Zoomaa karttaa ⌘ + rullalla",
            "CooperativeGesturesHandler.MobileHelpText": "Liikuta karttaa kahdella sormella",
          },
        });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        merkki.current = new maplibre.Marker({ color: teemaVari("--accent", "#b2361b") }).setLngLat([piste.lon, piste.lat]).addTo(map);
        map.on("load", () => setValmis(true));
        map.on("error", (e) => {
          // Yksittäisen tiilen virhe ei kaada karttaa; näytetään ilmoitus vain jos tyylikään ei lataudu.
          if (!map.isStyleLoaded() && !("sourceId" in e)) setVirhe(true);
        });
        kartta.current = map;
      } catch {
        setVirhe(true);
      }
    })();
    return () => {
      poistettu = true;
      kartta.current?.remove();
      kartta.current = null;
    };
    // Kartta luodaan vain kerran; sijainnin muutokset käsitellään alla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sijainnin vaihto (uusi osoite).
  useEffect(() => {
    const map = kartta.current;
    if (!map) return;
    merkki.current?.setLngLat([piste.lon, piste.lat]);
    map.easeTo({ center: [piste.lon, piste.lat], zoom: onOsoite ? 15 : map.getZoom() });
  }, [piste.lat, piste.lon, onOsoite]);

  // Postinumeroalueen raja.
  useEffect(() => {
    const map = kartta.current;
    if (!map || !valmis) return;
    let peruttu = false;
    const url = new URL("https://geo.stat.fi/geoserver/postialue/wfs");
    url.search = new URLSearchParams({
      service: "WFS", version: "1.1.0", request: "GetFeature", typeName: "postialue:pno_2026",
      outputFormat: "application/json", srsName: "EPSG:4326", propertyName: "geom",
      cql_filter: `posti_alue='${pno}'`,
    }).toString();
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((geojson) => {
        if (peruttu || !kartta.current) return;
        if (map.getSource(RAJA)) {
          map.removeLayer(RAJA);
          map.removeSource(RAJA);
        }
        map.addSource(RAJA, { type: "geojson", data: geojson, attribution: "Postinumeroalueet © Tilastokeskus" });
        map.addLayer({
          id: RAJA,
          type: "line",
          source: RAJA,
          paint: { "line-color": teemaVari("--ink", "#141414"), "line-width": 2, "line-dasharray": [2, 1] },
        });
        const rajat = bbox(geojson);
        if (!onOsoite && rajat) map.fitBounds(rajat, { padding: 24, duration: 0 });
      })
      .catch(() => {
        // Raja on lisätieto – kartta toimii ilman sitä.
      });
    return () => {
      peruttu = true;
    };
  }, [valmis, pno, onOsoite]);

  // Valittu melutaso. Lisätään karttatekstien alle, jotta paikannimet pysyvät luettavina.
  useEffect(() => {
    const map = kartta.current;
    if (!map || !valmis) return;
    if (map.getLayer(OVERLAY)) map.removeLayer(OVERLAY);
    if (map.getSource(OVERLAY)) map.removeSource(OVERLAY);
    map.addSource(OVERLAY, { type: "raster", tiles: [taso.tiilet], tileSize: 256, attribution: taso.lahde });
    const ensimmainenTeksti = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    map.addLayer({ id: OVERLAY, type: "raster", source: OVERLAY, paint: { "raster-opacity": 0.7 } }, ensimmainenTeksti);
  }, [valmis, taso.tiilet, taso.lahde]);

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap gap-2" aria-describedby={`${id}-kuvaus`}>
        <legend className="sr-only">Karttataso</legend>
        {tasot.map((t) => (
          <label
            key={t.id}
            className={`inline-flex min-h-11 cursor-pointer items-center border px-3 text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-accent ${
              t.id === taso.id ? "border-ink bg-ink text-page" : "border-rule text-ink-2 hover:border-ink"
            }`}
          >
            <input type="radio" name={`${id}-taso`} value={t.id} checked={t.id === taso.id} onChange={() => setValittu(t.id)} className="sr-only" />
            {t.nimi}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="relative h-80 overflow-hidden border border-ink sm:h-[28rem]">
          <div ref={elementti} className="h-full w-full" role="region" aria-label={`Kartta: ${taso.nimi}`} />
          {virhe && (
            <p className="absolute inset-0 flex items-center justify-center bg-surface text-sm text-ink-2">Karttaa ei voitu ladata.</p>
          )}
        </div>
        <div className="space-y-2 md:w-44">
          <p id={`${id}-kuvaus`} className="text-sm text-ink-2">
            {taso.kuvaus}
          </p>
          {taso.legenda ? (
            // Selitteet tulevat lähteiltä valmiina kuvina (valkoinen tausta).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={taso.legenda} alt={`Selite: ${taso.nimi}`} className="bg-white p-1.5" />
          ) : (
            taso.eiSelitetta && <p className="text-[13px] text-muted">{taso.eiSelitetta}</p>
          )}
          <p className="text-[13px] text-muted">
            <span className="mr-1 inline-block h-0.5 w-4 border-t-2 border-dashed border-ink align-middle" />
            Postinumeroalueen raja
          </p>
        </div>
      </div>
    </div>
  );
}


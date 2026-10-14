"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, Marker, Popup } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { IKONI_NIMI, ikoniKulkuneuvolle, ryhma, symboliHtml, type Ikoni } from "./symbolit";
import { etaisyys, useKavely, useLahella, useOsoite, usePisteTiedot, type Kavely, type Piste } from "./yhteiset";

type Laji = "kauppa" | "koulu" | "paivakoti" | "pysakki" | "juna";
type Kohde = Piste & {
  avain: string;
  laji: Laji;
  ikoni: Ikoni;
  nimi: string;
  /** Toinen rivi listassa, esim. "supermarket" tai "bussi 23, 502". */
  kuvaus: string | null;
  /** Linnuntie-etäisyys tekstinä. */
  lisa: string;
  metrit: number;
};
type Reitti = { data?: Kavely; virhe?: boolean };

const LAJIT: Record<Laji, { otsikko: string; ikoni: Ikoni }> = {
  kauppa: { otsikko: "Ruokakaupat", ikoni: "kauppa" },
  koulu: { otsikko: "Koulut", ikoni: "koulu" },
  paivakoti: { otsikko: "Päiväkodit", ikoni: "paivakoti" },
  pysakki: { otsikko: "Pysäkit", ikoni: "bussi" },
  juna: { otsikko: "Juna-asemat", ikoni: "juna" },
};

// Selitteen järjestys: asunto, palvelut, joukkoliikenne.
const IKONIJARJESTYS: Ikoni[] = ["asunto", "kauppa", "koulu", "paivakoti", "bussi", "ratikka", "metro", "lautta", "juna"];

const kavelyTeksti = (k: Kavely) => `Kävellen ${k.minuutit} min · ${etaisyys(k.metrit / 1000)}`;

/** Kuvasymboli pyöreässä merkissä (sama kartalla, selitteessä ja listoissa). */
function Symboli({ ikoni, pieni }: { ikoni: Ikoni; pieni?: boolean }) {
  return (
    <span
      aria-hidden
      className={`symboli symboli-${ryhma(ikoni)}${pieni ? " symboli-pieni" : ""}`}
      dangerouslySetInnerHTML={{ __html: symboliHtml(ikoni) }}
    />
  );
}

/**
 * Asunto ja sen lähipalvelut samalla kartalla: kaupat, koulut, päiväkodit, pysäkit ja juna-asemat.
 * Kohteen valinta (kartalta tai listasta) piirtää kävelyreitin ja näyttää kävelyajan.
 * Kartan alla samat kohteet listana (kartan saavutettava vastine).
 */
export function Lahiymparisto({ keskipiste }: { keskipiste: Piste }) {
  const { osoite, lahto } = useOsoite(keskipiste);
  const lahella = useLahella(lahto);
  const tiedot = usePisteTiedot(lahto);
  const [valittuAvain, setValittuAvain] = useState<string | null>(null);

  // Kartalle 3 lähintä peruskoulua ja lähin lukio (koko lista Koulut-osiossa).
  const kaikkiKoulut = tiedot.data?.koulut ?? [];
  const koulut = [...kaikkiKoulut.filter((k) => k.tyyppi !== "Lukiot").slice(0, 3), ...kaikkiKoulut.filter((k) => k.tyyppi === "Lukiot").slice(0, 1)].sort(
    (a, b) => a.km - b.km,
  );
  // Juna-asemat näytetään vain, jos niitä on 3 km säteellä.
  const junaAsemat = lahella.data?.junaAsemat ?? [];

  const kohde = (laji: Laji, ikoni: Ikoni, p: Piste & { nimi: string }, kuvaus: string | null, metrit: number): Kohde => ({
    lat: p.lat,
    lon: p.lon,
    nimi: p.nimi,
    avain: `${laji}:${p.nimi}:${p.lat},${p.lon}`,
    laji,
    ikoni,
    kuvaus,
    metrit,
    lisa: etaisyys(metrit / 1000),
  });
  const kohteet: Kohde[] = [
    ...(lahella.data?.kaupat ?? []).map((k) => kohde("kauppa", "kauppa", k, k.tyyppi, k.km * 1000)),
    ...koulut.map((k) => kohde("koulu", "koulu", k, k.tyyppi.toLowerCase().replace(/t$/, ""), k.km * 1000)),
    ...(lahella.data?.paivakodit ?? []).map((k) => kohde("paivakoti", "paivakoti", k, null, k.km * 1000)),
    ...(lahella.data?.pysakit ?? []).map((s) =>
      kohde("pysakki", ikoniKulkuneuvolle(s.kulkuneuvo), s, `${s.kulkuneuvo} ${s.linjat.slice(0, 5).join(", ")}${s.linjat.length > 5 ? " …" : ""}`, s.metrit),
    ),
    ...junaAsemat.map((a) =>
      kohde(
        "juna",
        "juna",
        a,
        [a.lahijunat.length ? `lähijunat ${a.lahijunat.join(", ")}` : null, a.kaukojunat ? "kaukojunia" : null].filter(Boolean).join(" · ") || null,
        a.metrit,
      ),
    ),
  ];

  // Valinta tallennetaan avaimena: kun osoite vaihtuu, vanhaa kohdetta ei enää löydy ja valinta purkautuu itsestään.
  const valittu = kohteet.find((k) => k.avain === valittuAvain) ?? null;
  const kavely = useKavely(lahto, valittu);
  const reitti: Reitti = { data: kavely.data, virhe: kavely.virhe };
  const valitse = (k: Kohde | null) => setValittuAvain(k && k.avain !== valittuAvain ? k.avain : null);

  const ladataan = !lahella.data && !lahella.virhe;
  const lista = (laji: Laji) => kohteet.filter((k) => k.laji === laji);

  return (
    <div>
      <p className="mb-5 max-w-[640px]">
        Lähimmät kaupat, koulut, päiväkodit ja pysäkit {osoite ? "osoitteesta" : "alueen keskeltä"}
        {junaAsemat.length > 0 && " sekä juna-asemat 3 km säteellä"}. Etäisyydet linnuntietä. Valitse kohde kartalta tai listasta,
        niin näet kävelyreitin ja -ajan.
      </p>
      <LahiKartta lahto={lahto} onOsoite={!!osoite} kohteet={kohteet} valittu={valittu} reitti={reitti} onValitse={valitse} />
      <p className="sr-only" aria-live="polite">
        {valittu && kavely.data ? `Kävelyreitti kohteeseen ${valittu.nimi}: ${kavely.data.minuutit} minuuttia, ${etaisyys(kavely.data.metrit / 1000)}.` : ""}
      </p>
      <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        <Lista laji="kauppa" kohteet={lista("kauppa")} valittu={valittu} reitti={reitti} onValitse={valitse} tila={ladataan ? "…" : lahella.virhe ? "Haku epäonnistui." : "Ei kauppoja lähellä."} />
        <Lista
          laji="pysakki"
          kohteet={lista("pysakki")}
          valittu={valittu}
          reitti={reitti}
          onValitse={valitse}
          rivinSymboli
          tila={ladataan ? "…" : lahella.data?.pysakit === null || lahella.virhe ? "Pysäkkihaku ei juuri nyt toimi." : "Ei pysäkkejä 800 metrin säteellä."}
        />
        <Lista
          laji="koulu"
          kohteet={lista("koulu")}
          valittu={valittu}
          reitti={reitti}
          onValitse={valitse}
          tila={tiedot.virhe ? "Haku epäonnistui." : tiedot.data ? "Ei kouluja lähellä." : "…"}
        />
        <Lista laji="paivakoti" kohteet={lista("paivakoti")} valittu={valittu} reitti={reitti} onValitse={valitse} tila={ladataan ? "…" : lahella.virhe ? "Haku epäonnistui." : "Ei päiväkoteja lähellä."} />
        {junaAsemat.length > 0 && <Lista laji="juna" kohteet={lista("juna")} valittu={valittu} reitti={reitti} onValitse={valitse} tila="" />}
      </div>
      <p className="mt-4 text-[13px] text-muted">
        Lähteet: kaupat ja päiväkodit © OpenStreetMap-tekijät (ODbL), koulut Tilastokeskuksen oppilaitosrekisteri ja pääkaupunkiseudun
        palvelukartta, pysäkit, linjat ja kävelyreitit Digitransit. OpenStreetMapista voi puuttua uusia tai pieniä kohteita.
      </p>
    </div>
  );
}

function Lista({
  laji,
  kohteet,
  valittu,
  reitti,
  onValitse,
  rivinSymboli,
  tila,
}: {
  laji: Laji;
  kohteet: Kohde[];
  valittu: Kohde | null;
  reitti: Reitti;
  onValitse: (k: Kohde) => void;
  /** Pysäkeillä kulkuneuvon symboli rivillä, koska samassa listassa on busseja, ratikoita ja metroja. */
  rivinSymboli?: boolean;
  tila: string;
}) {
  return (
    <section aria-label={LAJIT[laji].otsikko}>
      <h3 className="flex items-center gap-2 border-b border-ink pb-2 font-semibold">
        <Symboli ikoni={LAJIT[laji].ikoni} />
        {LAJIT[laji].otsikko}
      </h3>
      {kohteet.length ? (
        <ul>
          {kohteet.map((k) => {
            const on = valittu?.avain === k.avain;
            return (
              <li key={k.avain} className="border-b border-rule">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onValitse(k)}
                  className={`flex w-full items-baseline gap-4 py-2.5 text-left text-[15px] hover:bg-grid ${on ? "bg-grid" : ""}`}
                >
                  {rivinSymboli && (
                    <span className="self-center">
                      <Symboli ikoni={k.ikoni} pieni />
                      <span className="sr-only">{IKONI_NIMI[k.ikoni]}: </span>
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={on ? "font-semibold" : ""}>{k.nimi}</span>
                    {k.kuvaus && <span className="block text-sm text-muted">{k.kuvaus}</span>}
                    {on && (
                      <span className="block text-sm font-semibold text-accent">
                        {reitti.data ? kavelyTeksti(reitti.data) : reitti.virhe ? "Kävelyreittiä ei saatu." : "Haetaan kävelyreittiä…"}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold whitespace-nowrap tabular">{k.lisa}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-2.5 text-[15px] text-muted">{tila}</p>
      )}
    </section>
  );
}

const REITTI = "kavelyreitti";
const YLEIS_PADDING = { padding: { top: 36, right: 56, bottom: 44, left: 36 }, maxZoom: 16, duration: 0 };
const tyhjaReitti = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: [] as [number, number][] } };
const teemaVari = (nimi: string, varalla: string) => getComputedStyle(document.documentElement).getPropertyValue(nimi).trim() || varalla;

function LahiKartta({
  lahto,
  onOsoite,
  kohteet,
  valittu,
  reitti,
  onValitse,
}: {
  lahto: Piste;
  onOsoite: boolean;
  kohteet: Kohde[];
  valittu: Kohde | null;
  reitti: Reitti;
  onValitse: (k: Kohde | null) => void;
}) {
  const elementti = useRef<HTMLDivElement>(null);
  const kartta = useRef<MapLibreMap | null>(null);
  const kirjasto = useRef<typeof import("maplibre-gl") | null>(null);
  const asunto = useRef<Marker | null>(null);
  const merkit = useRef<Map<string, Marker>>(new Map());
  const ponnahdus = useRef<Popup | null>(null);
  const yleisnakyma = useRef<import("maplibre-gl").LngLatBounds | null>(null);
  // Merkkien klikkaus käsitellään DOM-tapahtumana; ref pitää käsittelijän ajan tasalla ilman merkkien uudelleenluontia.
  const valitseRef = useRef(onValitse);
  useEffect(() => {
    valitseRef.current = onValitse;
  });
  const [valmis, setValmis] = useState(false);
  const [virhe, setVirhe] = useState(false);

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
          center: [lahto.lon, lahto.lat],
          zoom: 15,
          cooperativeGestures: true,
          attributionControl: { compact: true },
          locale: {
            "CooperativeGesturesHandler.WindowsHelpText": "Zoomaa karttaa Ctrl + rullalla",
            "CooperativeGesturesHandler.MacHelpText": "Zoomaa karttaa ⌘ + rullalla",
            "CooperativeGesturesHandler.MobileHelpText": "Liikuta karttaa kahdella sormella",
          },
        });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          // Tiivis lähdeteksti alkaa auki ja peittäisi kartan alareunan merkit – suljetaan (i-painike avaa).
          const attrib = elementti.current?.querySelector(".maplibregl-ctrl-attrib");
          attrib?.classList.remove("maplibregl-compact-show");
          attrib?.removeAttribute("open");
          // Kävelyreitti: vaalea reunus + korostusvärinen viiva, karttatekstien alle.
          map.addSource(REITTI, { type: "geojson", data: tyhjaReitti });
          const teksti = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
          const viiva = { "line-join": "round", "line-cap": "round" } as const;
          map.addLayer({ id: `${REITTI}-reuna`, type: "line", source: REITTI, layout: viiva, paint: { "line-color": teemaVari("--page", "#ffffff"), "line-width": 9 } }, teksti);
          map.addLayer({ id: REITTI, type: "line", source: REITTI, layout: viiva, paint: { "line-color": teemaVari("--accent", "#b2361b"), "line-width": 4.5 } }, teksti);
          setValmis(true);
        });
        map.on("error", () => {
          if (!map.isStyleLoaded()) setVirhe(true);
        });
        kirjasto.current = maplibre;
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
    // Kartta luodaan vain kerran; sijainnin ja kohteiden muutokset käsitellään alla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Asunnon merkki ja lähikohteet. Näkymä rajataan niin, että kaikki mahtuvat kartalle.
  const avain = `${lahto.lat},${lahto.lon}|${kohteet.map((k) => k.avain).join(";")}`;
  useEffect(() => {
    const map = kartta.current;
    const maplibre = kirjasto.current;
    if (!map || !maplibre || !valmis) return;

    const merkki = (ikoni: Ikoni, nimi: string) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `symboli symboli-${ryhma(ikoni)} symboli-kartalla`;
      el.innerHTML = symboliHtml(ikoni);
      el.setAttribute("aria-label", nimi);
      return el;
    };

    // Lähikohteet ensin, asunto viimeisenä, jotta se piirtyy päällimmäiseksi.
    merkit.current.forEach((m) => m.remove());
    merkit.current = new Map(
      kohteet.map((k) => {
        const el = merkki(k.ikoni, `${IKONI_NIMI[k.ikoni]}: ${k.nimi}, ${k.lisa}. Näytä kävelyreitti.`);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          valitseRef.current(k);
        });
        return [k.avain, new maplibre.Marker({ element: el }).setLngLat([k.lon, k.lat]).addTo(map)];
      }),
    );

    const asuntoNimi = onOsoite ? "Asunto" : "Alueen keskipiste";
    asunto.current?.remove();
    asunto.current = new maplibre.Marker({ element: merkki("asunto", asuntoNimi) })
      .setLngLat([lahto.lon, lahto.lat])
      .setPopup(new maplibre.Popup({ offset: 20, closeButton: false }).setText(asuntoNimi))
      .addTo(map);

    // Näkymä rajataan lähikohteisiin. Yli 1,2 km päässä olevat juna-asemat ovat kartalla mutta rajauksen
    // ulkopuolella (näkyvät loitonnettaessa ja listassa) – muuten ne loitontaisivat kartan niin, että
    // asunnon lähimerkit kasautuisivat päällekkäin.
    const bounds = new maplibre.LngLatBounds([lahto.lon, lahto.lat], [lahto.lon, lahto.lat]);
    kohteet.filter((k) => k.laji !== "juna" || k.metrit <= 1200).forEach((k) => bounds.extend([k.lon, k.lat]));
    map.resize();
    yleisnakyma.current = bounds;
    map.fitBounds(bounds, YLEIS_PADDING);
    // avain kattaa lahto- ja kohteet-muutokset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valmis, avain, onOsoite]);

  // Valittu kohde: korostettu merkki, ponnahdusikkuna (nimi + kävelyaika) ja kävelyreitti.
  const reittiAvain = reitti.data ? reitti.data.reitti.length + ":" + reitti.data.metrit : reitti.virhe ? "virhe" : "";
  useEffect(() => {
    const map = kartta.current;
    const maplibre = kirjasto.current;
    if (!map || !maplibre || !valmis) return;

    merkit.current.forEach((m, k) => m.getElement().classList.toggle("symboli-valittu", k === valittu?.avain));
    (map.getSource(REITTI) as GeoJSONSource | undefined)?.setData(
      valittu && reitti.data ? { ...tyhjaReitti, geometry: { type: "LineString", coordinates: reitti.data.reitti } } : tyhjaReitti,
    );

    if (!valittu) {
      // Valinta purettu: takaisin kaikkien lähikohteiden näkymään.
      if (ponnahdus.current || map.getZoom() > 16.5) {
        ponnahdus.current?.remove();
        ponnahdus.current = null;
        if (yleisnakyma.current) map.fitBounds(yleisnakyma.current, { ...YLEIS_PADDING, duration: 400 });
      }
      return;
    }

    const sisalto = document.createElement("div");
    const nimi = document.createElement("strong");
    nimi.textContent = valittu.nimi;
    const rivi = document.createElement("div");
    rivi.textContent = reitti.data ? kavelyTeksti(reitti.data) : reitti.virhe ? "Kävelyreittiä ei saatu" : "Haetaan kävelyreittiä…";
    sisalto.append(nimi, rivi);

    // Ikkuna ankkuroidaan sille puolelle kohdetta, josta reitti ei tule: pohjoisessa olevalle kohteelle
    // ikkuna yläpuolelle (reitti tulee etelästä), etelässä olevalle alapuolelle.
    const anchor = valittu.lat >= lahto.lat ? "bottom" : "top";
    const vanha = ponnahdus.current;
    if (!vanha || vanha.options.anchor !== anchor) {
      ponnahdus.current = null; // ohjelmallinen poisto ei saa purkaa valintaa
      vanha?.remove();
      const p = new maplibre.Popup({ offset: 18, anchor, closeButton: true, closeOnClick: false, maxWidth: "260px" });
      // Käyttäjän sulkema ikkuna purkaa valinnan.
      p.on("close", () => {
        if (ponnahdus.current === p) {
          ponnahdus.current = null;
          valitseRef.current(null);
        }
      });
      ponnahdus.current = p;
    }
    const p = ponnahdus.current!;
    p.setLngLat([valittu.lon, valittu.lat]).setDOMContent(sisalto);
    if (!p.isOpen()) p.addTo(map);

    // Reitti näkyviin: zoomataan asuntoon ja reittiin, ja jätetään ponnahdusikkunan puolelle tilaa.
    if (reitti.data) {
      const rajat = new maplibre.LngLatBounds([lahto.lon, lahto.lat], [lahto.lon, lahto.lat]);
      reitti.data.reitti.forEach((c) => rajat.extend(c));
      // Ikkuna on ~200 px leveä ja keskitetty kohteeseen: sivuille puolet siitä, kapealla kartalla vähemmän.
      const ikkuna = 90;
      const sivu = Math.min(130, map.getContainer().clientWidth * 0.3);
      map.fitBounds(rajat, {
        padding: { top: anchor === "bottom" ? ikkuna : 50, bottom: anchor === "top" ? ikkuna : 50, left: sivu, right: sivu },
        maxZoom: 17,
        duration: 400,
      });
    }
    // Listasta valittaessa kartta voi olla ruudun ulkopuolella (mobiili) – vieritetään se näkyviin.
    const r = elementti.current?.getBoundingClientRect();
    if (r && (r.bottom < 80 || r.top > window.innerHeight - 80)) elementti.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valmis, valittu?.avain, reittiAvain]);

  return (
    <div>
      <div className="relative h-[24rem] overflow-hidden border border-ink sm:h-[30rem]">
        <div ref={elementti} className="h-full w-full" role="region" aria-label="Kartta: asunto ja lähipalvelut" />
        {virhe && <p className="absolute inset-0 flex items-center justify-center bg-surface text-sm text-ink-2">Karttaa ei voitu ladata.</p>}
      </div>
      <ul aria-label="Kartan selite" className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
        {/* Selitteessä vain kartalla näkyvät symbolit (esim. ratikka vain, jos lähellä on ratikkapysäkki). */}
        {IKONIJARJESTYS.filter((i) => i === "asunto" || kohteet.some((k) => k.ikoni === i)).map((i) => (
          <li key={i} className="flex items-center gap-1.5">
            <Symboli ikoni={i} pieni />
            {i === "asunto" && !onOsoite ? "Alueen keskipiste" : IKONI_NIMI[i]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-1 w-5 bg-accent" />
          Kävelyreitti valittuun kohteeseen
        </li>
      </ul>
    </div>
  );
}

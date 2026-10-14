# Vaihe 1: datan saatavuus (tarkistettu 12.10.2026)

Skriptit: `scripts/check/` — aja projektin juuresta.

| Osio | Lähde / rajapinta | Tila | Kattavuus |
|---|---|---|---|
| Hintakehitys | Tilastokeskus PxWeb `StatFin/ashi/13mu.px` (vuosi) ja `13mt.px` (neljännes), 2009– | ✅ | 1724 postinumeroa taulussa, 2025 hinta 793:lla (26 % kaikista alueista) — mutta **80 % väestöstä** asuu alueilla, joilla hinta on |
| Hinnat, fallback | `13mx.px` kunnittain | ✅ | käytetään kun postinumerolla ei hintaa |
| Paavo | PxWeb `Postinumeroalueittainen_avoin_tieto/uusin/12f7.px`, 107 muuttujaa, 2010–2024 | ✅ | 3018 aluetta; keskeiset muuttujat 94–100 % |
| Osoite → postinumero | geo.stat.fi WFS `postialue:pno_2026`, CQL `INTERSECTS(geom, POINT(lon lat))` | ✅ | koko maa |
| Melu (maantiet, radat) | Väylävirasto WFS `avoinapi.vaylapilvi.fi/vaylatiedot/ows`, tasot `melu_{paiva,yo}_{maankad,rautatiet}_22` | ✅ | valtion tiet ja radat, EU-selvitys 2022 |
| Melu (katuverkko) | Helsinki WFS `kartta.hel.fi/ws/geoserver/avoindata`, `Meluselvitys_2022_Helsinki_yhteismelu_LAeg_7-22_NPM` (`db_lo`, `db_hi`) | ✅ Helsinki | pistekysely toimii |
| Melu (Espoo) | Espoo WMS `kartat.espoo.fi/teklaogcweb/wms.ashx`, `Espoo_tieliikenne Lden_EU (kadut ja maantiet)` ym. | ⚠️ | vain karttakuva – tasot eivät tue GetFeatureInfoa → ei pistearvoa |
| Melu (Vantaa) | – | ⛔ | ei löytynyt avointa rajapintaa; selvitys 2022 vain PDF:nä |
| Koulut | Tilastokeskus WFS `oppilaitokset:oppilaitokset` (2025) + pääkaupunkiseudun palvelukartta `api.hel.fi/servicemap/v2`, ETL (`npm run data:koulut`) | ⚠️→✅ | 2501 koulua koko maassa — **ei päiväkoteja**. **Rekisterin koordinaatit osin pielessä** (14.10.2026): Uudellamaalla 51 koulua yli 1 km väärässä paikassa verrattuna OSM:ään, pahimmat Espoon koulut Turun seudulla (~135 km) ja Vantaan koulut 40–60 km. Korjaus: Helsingin, Espoon, Vantaan ja Kauniaisen kouluille sijainti palvelukartasta yksiselitteisellä nimiosumalla (64 korjattu, 34 puuttuvaa lisätty). Muualla Uudellamaalla rekisterin sijainti sellaisenaan. |
| Päiväkodit | OSM Overpass `amenity=kindergarten`, esiladattu ETL:ssä (`npm run data:palvelut`) | ✅ | 913 nimettyä päiväkotia (14.10.2026); Overpass kaatuilee → haetaan kerran, peilipalvelimet varalla |
| Ruokakaupat | OSM Overpass `shop=supermarket\|convenience`, sama ETL | ✅ | 762 kauppaa; huoltoasemamyymälät ja kioskit pois (brändi/nimi) |
| Pysäkit | Digitransit GraphQL `stopsByRadius` (800 m) | ✅ | koko Suomi; laiturit yhdistetään nimen ja kulkuneuvon mukaan, yölinjat pois |
| Geokoodaus | Digitransit `geocoding/v1/search` | ✅ | palauttaa myös postinumeron (täsmäsi polygonihakuun) |
| Matka-ajat | Digitransit GraphQL `routing/v2/finland/gtfs/v1`, `planConnection` | ✅ | koko Suomi: julkinen, pyörä, kävely |

## Havainnot

- **Hintojen postinumerorajat ovat vuoden 2022 rajat**, Paavo 2026 — 1723/1724 täsmää, eli ei käytännön ongelmaa.
- Hintataulussa ei ole "kaikki talotyypit" -riviä: yksiöt, kaksiot, kolmiot+, rivitalot erikseen. Omakotitaloja ei ole lainkaan.
- Salatut arvot tulevat `null`:na → käyttöliittymään "ei riittävästi kauppoja → näytetään kunnan luku".
- PxWeb-rajat (`?config`): 120 000 solua/kysely, 40 kyselyä/60 s, CORS sallittu.
- Paavo-tiedot päivittyvät tammikuussa, hinnat neljännesvuosittain.
- Väylän meluvyöhykkeet alkavat 40–45 dB (päivä); ei osumaa = alle alimman vyöhykkeen *tai* kartoittamaton alue.
- OSM:n `amenity=school` sisältää myös autokouluja ym. → virallinen oppilaitosrekisteri on parempi.

## Digitransit-havainnot (`scripts/check/digitransit.mjs`)

- Avain `.env`-tiedostossa (`DIGITRANSIT_KEY`), header `digitransit-subscription-key`.
- `planConnection` ottaa `PlanLabeledLocationInput!` -tyyppiset lähtö/kohde-muuttujat.
- **Geokooderi on sumea**: "Hervannan valtaväylä 10" → nro 100, "Kaivokatu 10, Kokkola" → Kalervonkatu 10. → Käyttöliittymässä autocomplete, josta käyttäjä valitsee; ei automaattista ensimmäistä osumaa.
- **Keskustalista on liian suppea**: Kokkolasta lähin keskusta oli Oulu (174 km). → Tarvitaan jokaisen kunnan keskustapiste (esim. OSM `place=city/town` kunnittain), ja oletuskohde = oman kunnan keskusta.
- Kävelyreittiä ei palaudu pitkille matkoille (~7 km) → näytetään kävely vain lyhyillä matkoilla.

Esimerkit, arkiaamu klo 8:
| Reitti | Julkinen | Pyörä |
|---|---|---|
| Kallio → Keilaniemi | 25 min (metro) | 32 min |
| Hervanta → Tampereen Keskustori | 27 min (ratikka 3) | 30 min |
| Mannerheimintie 100 → Rautatientori | 13 min | 12 min |

## Seuraavaksi

MVP rajattu Uudellemaalle (389 postinumeroa, 31 % väestöstä, hinta 93 %:lle asukkaista).
Kuntakeskukset: `data/config/keskustat.json` (26 kuntaa, geokoodattu ja tarkistettu postinumeroalueesta).

## Kartta (`src/components/Kartta.tsx`)

- Taustakartta: OpenFreeMap (`positron` / `dark`), ei API-avainta, © OpenMapTiles, OpenStreetMap.
- Tasot ladataan selaimessa suoraan lähteistä rasteritiilinä (`{bbox-epsg-3857}`), kaikki sallivat CORSin:
  - Väylä: WMS `melu_paiva_maankad_22` + `melu_paiva_rautatiet_22`, selite GetLegendGraphic.
  - Helsinki: WMS `Meluselvitys_2022_Helsinki_yhteismelu_LAeg_7-22_NPM`, selite GetLegendGraphic.
  - Espoo: WMS `Espoo_tieliikenne Lden_EU (kadut ja maantiet)` – GetLegendGraphic ei toimi, ei selitettä.
- Postinumeroalueen raja: geo.stat.fi WFS selaimesta (CORS sallittu, ~2 kt / alue).
- MapLibre 6 lataa workerinsa erillisestä tiedostosta → `scripts/kopioi-maplibre.mjs` kopioi sen `public/maplibre/`-kansioon (predev/prebuild).

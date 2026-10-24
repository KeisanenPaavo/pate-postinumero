# Aluetarkistus (työnimi)

Asuntokaupan taustatarkistus postinumerolla: alueen hintakehitys, asukkaat, koulut, matka-ajat sekä
melutiedot yhdeltä sivulta. MVP kattaa Uudenmaan (389 postinumeroaluetta).

## Käynnistys

```bash
cp .env.example .env      # lisää DIGITRANSIT_KEY (https://portal-api.digitransit.fi/)
npm install
npm run dev               # http://localhost:3000
npm test                  # yksikkötestit (Vitest): laskurit ja taloyhtiön nimilogiikka
```

## Data

| Komento | Mitä tekee |
|---|---|
| `npm run data` | Hakee hinnat ja Paavo-tiedot → `data/generated/uusimaa.json` (sivusto lukee tämän buildissa) |
| `npm run data:koulut` | Peruskoulut ja lukiot: oppilaitosrekisteri, sijainnit korjattu pääkaupunkiseudun palvelukartasta → `data/generated/koulut.json` |
| `npm run data:oppilasalueet` | Espoon oppilaaksiottoalueet → `data/generated/oppilasalueet-espoo.json` (Helsingin alueet haetaan ajonaikaisesti) |
| `npm run data:palvelut` | Hakee Uudenmaan ruokakaupat ja päiväkodit OpenStreetMapista → `data/generated/palvelupisteet.json` |
| `npm run data:keskustat` | Geokoodaa kuntakeskukset → `data/config/keskustat.json` |
| `npm run data:kunnat` | Suomen kuntien nimet taloyhtiöiden nimien tulkintaan → `data/config/kunnat.json` |
| `npm run tarkista:piste -- <lat> <lon>` | Testaa pistekyselyt (postinumero, melu, koulut) |

Hinnat päivittyvät neljännesvuosittain ja Paavo tammikuussa – aja `npm run data` ja rebuildaa.
Lähteet, rajapinnat ja kattavuus: [docs/datan-saatavuus.md](docs/datan-saatavuus.md).

## Rakenne

- `src/app/[slug]` – postinumerosivu, generoidaan staattisesti (esim. `/00530-kallio`). Osoitekohtaiset tiedot
  tulevat parametrista `?p=lat,lon&osoite=...`.
- `src/app/vertailu` – enintään 3 osoitteen vertailu rinnakkain (osoitteet tallentuvat selaimeen, tiedot samoista API-reiteistä).
- `src/app/api/{haku,piste,matka,lahella,kavely,kaavoitus,taloyhtio,rakennus}` – palvelinpuolen välityspalvelut (Digitransit-avain ei päädy selaimeen),
  tulokset välimuistitetaan `use cache` -funktioissa (`src/lib/palvelut.ts`).
- `src/lib/data.ts` – generoidun datan lukeminen ja tunnusluvut.

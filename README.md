# Aluetarkistus (työnimi)

Asuntokaupan taustatarkistus postinumerolla: alueen hintakehitys, asukkaat, koulut, matka-ajat sekä
melutiedot yhdeltä sivulta. MVP kattaa Uudenmaan (389 postinumeroaluetta).

## Käynnistys

```bash
cp .env.example .env      # lisää DIGITRANSIT_KEY (https://portal-api.digitransit.fi/)
npm install
npm run dev               # http://localhost:3000
```

## Data

| Komento | Mitä tekee |
|---|---|
| `npm run data` | Hakee hinnat ja Paavo-tiedot → `data/generated/uusimaa.json` (sivusto lukee tämän buildissa) |
| `npm run data:keskustat` | Geokoodaa kuntakeskukset → `data/config/keskustat.json` |
| `npm run tarkista:piste -- <lat> <lon>` | Testaa pistekyselyt (postinumero, melu, koulut) |

Hinnat päivittyvät neljännesvuosittain ja Paavo tammikuussa – aja `npm run data` ja rebuildaa.
Lähteet, rajapinnat ja kattavuus: [docs/datan-saatavuus.md](docs/datan-saatavuus.md).

## Rakenne

- `src/app/[slug]` – postinumerosivu, generoidaan staattisesti (esim. `/00530-kallio`). Osoitekohtaiset tiedot
  tulevat parametrista `?p=lat,lon&osoite=...`.
- `src/app/api/{haku,piste,matka}` – palvelinpuolen välityspalvelut (Digitransit-avain ei päädy selaimeen),
  tulokset välimuistitetaan `use cache` -funktioissa (`src/lib/palvelut.ts`).
- `src/lib/data.ts` – generoidun datan lukeminen ja tunnusluvut.

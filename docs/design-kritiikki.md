# Design Critique: Aluetarkistus (12.10.2026)

Arvioitu: etusivu ja postinumerosivu (`/00530-kallio?p=…&osoite=Fleminginkatu 1, Helsinki`), työpöytä 1280 px ja mobiili 375 px, vaalea ja tumma teema.
Käyttäjä: asunnon ostaja, joka on juuri nähnyt myynti-ilmoituksen ja haluaa tietää, millainen alue on.

## Overall Impression

Sisältö on vahvaa ja ulkoasu siisti, mutta sivu vastaa kysymykseen "millainen tämä *alue* on" eikä kysymykseen "millainen tämä *osoite* on". Haettu osoite näkyy vasta neljännellä näytöllisellä, ja käyttäjän pitää itse koota johtopäätökset numeroista ja lyhenteistä (dB, LAeq, Lden). Suurin mahdollisuus: osoitekeskeinen yhteenveto heti ylös, selkokieliset tulkinnat.

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| Haettu osoite ei näy sivun yläosassa – otsikko on postinumero. Käyttäjä ei ole varma, laskettiinko tiedot hänen osoitteelleen. | 🔴 Critical | Osoite pääotsikoksi, postinumeroalue alaotsikoksi. |
| Osoitekohtaiset tiedot (matka-aika, melu, koulut) ovat hintakaavion ja taulukon alla – ne ovat ostajalle tärkeimmät. | 🔴 Critical | Yhteenvetokortit heti otsikon alle: hinta, matka keskustaan, melu, lähin koulu. Jokaisesta linkki omaan osioonsa. |
| Etusivun haku on pieni, ja 26 kunnan avattava lista vie suurimman osan näkymästä. | 🔴 Critical | Iso keskitetty hakukenttä, esimerkkialueet yhdellä klikkauksella, kuntalista toissijaiseksi alas. |
| Haku hyväksyy vain katuosoitteen. "00530" tai "Kallio" ei löydä mitään. | 🟡 Moderate | Postinumerot ja aluenimet hakuehdotuksiin osoitteiden rinnalle. |
| Melukortti on tekninen ("alle 45 dB tai ei selvitetty" ×3, LAeq). Ostaja ei tiedä, onko 60–65 dB paljon. | 🟡 Moderate | Selkokielinen tuomio ("Meluisa – ylittää asuinalueiden ohjearvon"), tarkat dB-luvut avattavaan "Lisätiedot"-osioon. |
| Matka-ajan reitti näkyy pelkkänä numerona ("75"). | 🟡 Moderate | Kulkuneuvo näkyviin: "bussi 75", "metro M1", "juna A". |
| "Vaihda osoite" -kenttä on aina auki keskellä sivua ja näyttää toiselta hakukentältä. | 🟡 Moderate | Osoitteen vaihto otsikon yhteyteen "Vaihda"-painikkeen taakse. |
| Pitkä sivu ilman navigaatiota; mobiilissa ~8 näytöllistä. | 🟡 Moderate | Tahmea osiovalikko (Yhteenveto · Hinnat · Liikenne · Melu · Koulut · Asukkaat). |
| Tunnusluvuilta puuttuu tulkinta ("−15 %" – onko se paljon?). | 🟢 Minor | Lyhyt vertailulause: "laski 15 % vuodesta 2020". |
| Hintakaavion y-akselilla ei ole yksikköä. | 🟢 Minor | "€/m²" akselin otsikoksi. |

## Visual Hierarchy

- **What draws the eye first**: Postinumero "00530 Kallio" ja neljä tunnuslukua — osittain oikein, mutta käyttäjän osoite puuttuu kokonaan yläosasta.
- **Reading flow**: Otsikko → tunnusluvut → iso hintakaavio (vie koko näytön leveyden työpöydällä) → osoitekortti → matka-ajat → melu → kartta → koulut → asukkaat. Hintakaavio dominoi suhteessa painoarvoonsa.
- **Emphasis**: Hintakaavio korostuu liikaa; melu, liikenne ja koulut – ostajan "deal breakerit" – jäävät alas. Huomioitava-merkki melukortissa on hyvä, mutta muissa osioissa vastaavaa tuomiota ei ole.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Osiot | Osa sisällöstä on korteissa (osoite, melu), osa paljaana (matka-ajat, koulut, asukkaat). | Yhtenäinen osiorakenne: otsikko + lyhyt tulkinta + sisältö. |
| Tila-merkinnät | Status-ikoni + teksti vain melulla. | Sama tuomiomalli yhteenvetokortteihin. |
| Linkit / painikkeet | "+ Lisää oma kohde" ja "Poista" ovat pieniä tekstilinkkejä, karttatasot taas pillereitä. | Toiminnot painikkeiksi, kosketusalue ≥ 44 px. |

## Accessibility

- **Color contrast**: Leipäteksti ja otsikot läpäisevät. Muted-teksti `#6f6d68` vaalealla pohjalla ≈ 5:1 (OK). Kaavion sarjavärit + suorat tunnisteet + taulukkonäkymä → OK.
- **Touch targets**: "+ Lisää oma kohde", "Poista" ja "Näytä taulukkona" ~20 px korkeita mobiilissa → liian pieniä (tavoite 44 px).
- **Text readability**: Paljon 12 px tekstiä (lähteet, selitteet) – hyväksyttävää metatiedolle, mutta melukortin tulkintateksti ei saa olla pientä.

## What Works Well

- Rauhallinen, mainokseton ilme ja selkeä typografia; tumma teema on oikeasti suunniteltu.
- Hintakaavio on erinomainen: suorat arvotunnisteet, vertailu kuntaan, hover ja taulukkonäkymä.
- Ikärakenne-kaavio vertailumerkkeineen on nopea lukea.
- Lähteet ja rajoitukset kerrotaan rehellisesti.

## Priority Recommendations

1. **Osoitekeskeinen yläosa** — Osoite otsikoksi ja neljän kortin yhteenveto (hinta, matka keskustaan, melu, lähin koulu) heti alle. Vastaa ostajan kysymykseen 5 sekunnissa.
2. **Etusivun haku keskiöön** — Iso hakukenttä, joka löytää myös postinumerot ja aluenimet, sekä esimerkkialueet. Poistaa "mitä tähän pitäisi kirjoittaa" -kitkan.
3. **Selkokieliset tuomiot** — Melu, matka-ajat (kulkuneuvo näkyviin) ja tunnusluvut sanallisina tulkintoina; tekniset luvut lisätietoihin. Lisäksi tahmea osiovalikko pitkälle sivulle.

## Toteutettu 12.10.2026

- Osoitepalkki sivun yläosaan (osoite näkyvissä, "Vaihda osoite" -painike) ja neljän kortin yhteenveto: hinta, matka Helsingin keskustaan, melun selkokielinen tuomio, lähin peruskoulu. Mobiilissa 2×2.
- Tahmea osiovalikko (Hinnat · Liikenne · Melu · Koulut · Asukkaat) ja jokaiselle osiolle lyhyt sanallinen tulkinta.
- Etusivu: iso keskitetty haku, joka löytää osoitteet, postinumerot ja aluenimet; esimerkkialueet; "mitä saat" -kortit; kuntalista toissijaisena.
- Melu: "Hiljainen / Kohtalainen / Meluisa / Erittäin meluisa" + selitys, desibelit avattavissa.
- Matka-ajat korteiksi, kulkuneuvo näkyviin ("bussi 75", "metro M1").
- Kosketusalueet ≥ 44 px (painikkeet, avattavat osiot), SVG-ikonit, hakuehdotusten duplikaatit poistettu, ei osumia -viesti.
- Hintakaavioon yksikkö (€/m²) ja maksimileveys.

Korjattu: osoitehaku rajataan Uudenmaan maakuntaan (Digitransit `boundary.gid`), ja osoitteen vaihto raporttisivulla ohjaa osoitteen omalle postinumerosivulle.

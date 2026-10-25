# Muutokset

## 25.10.2026 – Työttömyysaste korjattu

- Alueraportin vertailutaulukon "Työttömät"-rivi oli työttömien osuus koko väestöstä (myös lapset ja eläkeläiset),
  joten se näytti noin puolet todellisesta. Rivi on nyt **työttömyysaste**: työttömät / (työlliset + työttömät).
  Esimerkiksi Espoo 5 % → 10 %, koko maa 6 % → 12 %.
- Taloyhtiöhaku ei enää ehdota toisen kunnan samannimisen kadun yhtiöitä.

## 24.10.2026 – Tietoturvapäivitys

- Next.js päivitetty 16.4.0 → 16.4.3 julkaistun tietoturvahaavoittuvuuden vuoksi. Ei toiminnallisia muutoksia.

## 24.10.2026 – Sijoittajille, vuokra vai oma, rakennus ja taloyhtiö

Alueraportti palvelee nyt myös sijoittajia ja auttaa vertaamaan omistamista vuokralla asumiseen. Osoitteelle haettu raportti
kertoo itse rakennuksesta ja tunnistaa taloyhtiön aiempaa useammin.

### Uutta

**Vuokralla vai omistaen** (uusi osio)
- Kuukausikulut ensimmäisenä vuonna: lainan korot, lyhennys, hoitovastike ja remonttivara vuokraa vastaan. Lyhennys
  näytetään erikseen, koska se kertyy omaan varallisuuteen.
- Varallisuus vertailuajan lopussa ja kaavio vuosittain, kun vuokralainen sijoittaa käsirahan ja kuukausittaisen
  erotuksen. Kertoo myös, minä vuonna omistaminen menee vuokralla asumisen edelle.
- Oletukset alueen hinnoista ja vuokrista; kaikki luvut (omarahoitus, korko, arvonnousu, asumiskulujen nousu,
  säästöjen tuotto, vertailuaika) ovat muokattavissa. Vertailukohtana alueen toteutunut hinta- ja vuokrakehitys.

**Sijoittajalle** (uusi osio)
- Bruttovuokratuotto yksiöille, kaksioille ja kolmioille sekä vertailu Uudenmaan postinumeroalueiden mediaaniin ja
  hinnan muutos viideltä vuodelta.
- Tuottolaskuri: brutto- ja nettovuokratuotto, kassavirta kuukaudessa ja oman pääoman tuotto. Hinta ja vuokra
  esitäytetään alueen luvuilla.
- Alueilla, joille vuokratilasto on vain koko Uudenmaan tai kehyskuntien keskiarvo, tuotto merkitään
  suuntaa-antavaksi eikä niitä käytetä vertailussa.

**Taloyhtiö ja rakennus** (laajennettu osio, näkyy kun osoite on valittu)
- Rakennuksen valmistumisvuosi, koko, rakenteet ja lämmitys.
- Energialuokka, E-luku ja energiatodistuksen laatijan korjaussuositukset.
- Rakennusluvat (muutostyöt, laajennukset) vuosineen ja huomio putkiremontista yli 40-vuotiaille taloille.
- Taloyhtiö tunnistetaan myös rakennuksen energiatodistuksen nimestä, joten löytyvät myös yhtiöt, joiden nimessä ei ole
  talon osoitetta (esim. Viides linja 18 → As Oy Ihantola).
- Taloyhtiöitä haetaan myös osoitteen lähistöltä (~150 m); jos omaa ei löydy, lähin näytetään parhaana arvauksena.
- Oikean taloyhtiön voi valita lähilistalta tai hakea nimellä tai Y-tunnuksella. Valinta tallentuu linkkiin, joten se
  näkyy myös jaetussa raportissa.

### Uudet tietolähteet

- Suomen ympäristökeskus, Ryhti: rakennukset ja rakennusluvat (CC BY 4.0).
- Varke, energiatodistusrekisteri: energiatodistukset (julkinen haku).

### Tunnetut rajoitukset

- Rakennusluvista näkyy vain toimenpiteen tyyppi, ei sisältöä: "muutostyö" voi olla putkiremontti tai jotain muuta.
  Vanhimmat luvat voivat puuttua rekisteristä.
- Vuokria ei tilastoida postinumeroittain, joten tuotot ja vuokra vai oma -vertailu perustuvat vuokratilaston
  alueen keskiarvoihin.
- Laskurit eivät huomioi veroja eivätkä taloyhtiön isoja remontteja. Hoitovastikkeen (4,5 €/m²) ja remonttivaran
  (1 €/m²) oletukset ovat arvioita.
- Pien- ja paritalojen energiatodistukset eivät ole julkisia.

# Nezavisni gradovi polazišta i odredišta — provjera

Implementirano: isti par polja bez obaveznog globalnog grada. Svaki endpoint pamti svoj grad; početno koristi grad profila. Pomoćni izbor grada je uz polje. Unosi „Zenica, Crkvice“ i „Crkvice, Zenica“ prepoznaju grad i mijenjaju samo njegovu pretragu. Grad/naselje kao približno područje zahtijeva pomjeranje pina i spremnu kartu prije potvrde.

Poznati javni centri regiona su u malom shared JSON-u. Drugi gradovi provjeravaju se i keširaju preko postojećeg Photona, uz Nominatim fallback za eksplicitne zahtjeve. Samostalni nepoznati grad uz drugi aktivni grad može, ako Photon nije konfigurisan, zahtijevati pomoćni izbor „Promijeni grad“; nema globalnog širenja običnih ulica bez provjere. Nova funkcija ne traži GPS.

Kad se grad eksplicitno promijeni, prethodne koordinate ne mogu zadržati pretragu u starom gradu. Gradovi u API odgovorima prikazuju se latinicom. Duži Photon upiti prihvataju i gradska naselja, jasno označena kao približna područja, uz isti city/country/50km filter. Novi cache ključ `places-v2` sprječava da stari prazni street-only odgovori skrivaju naselja 30 dana; kratki prefiksi ostaju strogo ulice.

Provjere:

- 261 unit/API test prolazi; uključeno šest novih resolver testova, oba redoslijeda grada kroz lokacijske endpointove, city-only rezultat i cache regresija.
- Dva nova browser scenarija prolaze: Sarajevo/Zenica, oba redoslijeda unosa, nezavisna izmjena, zamjena endpointova, čuvanje i ponovno učitavanje oba grada; city-only zahtijeva pomjeranje pina.
- Postojeći kompletan route-audit tok prolazi: objava, pretraga, zahtjev, dvosmjerni chat, prihvatanje, spremnost i završetak.
- Oba help/privacy browser scenarija prolaze na četiri jezika; build i diff check prolaze.
- Nezavisan pregled nije našao blokere nakon ispravke cache ključa; svih devet street-suggestion testova prolazi.

Sve simulacije koriste izoliranu lokalnu bazu, sintetičke račune i provider odgovore. Ne tvrde terenski potvrđene ceste ili mjesta za zaustavljanje. Nema promjene vozačeve trase ili automatskog skretanja s autoputa.

# USPUT: prijedlog jednostavnijeg dogovora o susretu

Ovo je razrađen prijedlog za sljedeću iteraciju, a ne tvrdnja da su chat, dijeljenje GPS-a i pregovaranje već implementirani. Trenutna aplikacija povezuje vožnju s mjestima susreta koja je vozač odobrio, uz proračun hodanja putnika.

Usaglašeni smjer: gradska baza i učenje tačaka rade u pozadini. Običan korisnik bira gdje će se naći, bez obaveznog imenovanja tačke, popunjavanja gradskog kataloga ili ocjenjivanja svake lokacije. Detaljan unos ostaje opcija. Sljedeći odjeljci opisuju cilj naredne iteracije; ovo pojednostavljenje još zahtijeva promjene ugovaranja vožnje i algoritma.

## Provjereno stanje — 22.10.2026.

Tabela razlikuje postojeći kod od preostalih prijedloga iz ovog dokumenta. Odnosi se na granu `feat/pulse-app`; dostupnost na testnoj web-adresi provjerava se zasebno nakon objave. Ovaj pregled ne odobrava implementaciju preostalih funkcija.

| Dio prijedloga                                                    | Stanje              | Dokaz i granica trenutne izvedbe                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unos grada, ulice i potvrda pina, četiri jezika                   | Implementirano      | `app/src/StreetPicker.tsx`, `LocationScope.tsx`, `i18n.ts`, `app/server/street-suggestions.mjs`, `geocoding.mjs`. Grad iz profila je početni izbor; nema stalnog praćenja lokacije.                                                             |
| Automatsko oblikovanje trase kroz mjesta susreta                  | Implementirano      | `app/src/Home.tsx` (`updateRoutePreview`), `MeetingStopsEditor.tsx`, `app/server/meeting-stops.mjs` (`previewMeetingRoute`). Dodavanje, pomjeranje i redoslijed mjesta pokreću novi proračun; objava traži potvrdu aktualne trase i mjesta.     |
| Zasebni prolazni pinovi koji samo određuju trasu                  | Djelimično          | Trasa se može mijenjati preko mjesta za stajanje. Poseban prolazni pin, odvojen od odobrenja za zaustavljanje, još ne postoji u unosu ni ugovoru ponude.                                                                                        |
| Jednostavan unos mjesta bez obaveznog naziva                      | Implementirano      | `MeetingStopsEditor.tsx` i `meeting-stops.mjs`: neimenovano mjesto dobija redni broj; prilaz i strana su dodatna polja. Neimenovano mjesto se ne predlaže gradskoj bazi.                                                                        |
| Putnički početni/završni pin i hodanje 5/10/15 minuta             | Implementirano      | `Home.tsx`, `Rides.tsx`, `meeting-stops.mjs` (`matchMeetingStops`). Hodanje se provjerava stvarnom pješačkom rutom na oba kraja; dogovor koristi vozačeve odobrene tačke, ne putnikov kućni pin.                                                |
| Tri grupe rezultata i putnikov novi alternativni pin              | Djelimično          | Postoje poredak provjerenih ponuda, upozorenje kada proračun nije dostupan i izbor postojećih vozačevih tačaka u `Rides.tsx`. Nema tri predložene grupe ni slanja nove tačke izvan vozačevih odobrenih mjesta.                                  |
| Zahtjev, prihvatanje, više slobodnih mjesta i dijeljenje troškova | Implementirano      | `Rides.tsx`, `CostSharingBadge.tsx`, `app/server/api.mjs`, `schema.sql`: 1–7 putničkih mjesta, pojedinačno prihvatanje, transakcijska provjera kapaciteta. Slanje zahtjeva nije prihvatanje; nema naplate u aplikaciji.                         |
| Verzije prijedloga, protuprijedlog i nova obostrana potvrda       | Nije implementirano | Postoji potpisani pregled vozačeve trase prije objave i snimak prihvaćenih mjesta; to nije verzionisano pregovaranje. `api.mjs` podržava zahtjev/prihvatanje/odbijanje/spremnost/završetak/otkazivanje, bez stanja „Čeka putnika“ za novi pin.  |
| Kratki chat i brzi odgovori uz zahtjev                            | Nije implementirano | U `types.ts`, `schema.sql` i `api.mjs` nema ugovora, pohrane ni API-ja za razgovor.                                                                                                                                                             |
| „Na mjestu sam“ na Početnoj                                       | Implementirano      | `app/src/UpcomingRide.tsx`, `Home.tsx`, `api.mjs`: putnik ručno javlja spremnost za sljedeći aktivni prihvaćen dogovor. To nije automatska potvrda susreta.                                                                                     |
| Privatne profilne i fotografije auta, mali krug i povećanje       | Implementirano      | `Photos.tsx`, `AvatarPhotoContext.tsx`, `RideVehiclePhoto.tsx`, `UpcomingRide.tsx`, `Rides.tsx`, `app/server/photos.mjs`. Vlasnik upravlja slikom u Profilu; saputnik pristupa poslije prihvatanja aktivnog dogovora. Nema provjere identiteta. |
| Automatsko preuzimanje posebne fotografije susreta kao profilne   | Djelimično          | Ista postojeća privatna profilna koristi se za profil, vlastiti avatar i prepoznavanje. Zaseban unos „fotografije susreta“ s pravilom automatskog postavljanja samo kada profilna nedostaje još ne postoji.                                     |
| Obavijest o prihvatanju i dobrovoljni push                        | Implementirano      | `Notifications.tsx`, `app/server/notifications.mjs`, `web-push.mjs`, `app/public/sw.js`. Push je po uređaju, šifrovan, bez imena i privatnih adresa u tekstu; dostava zavisi od podrške preglednika.                                            |
| Ručni završetak po putniku, historija i ponavljanje ponude        | Implementirano      | `Rides.tsx`, `Home.tsx`, `api.mjs`: završetak/otkazivanje, zadržane stare ponude i nova ponuda iz „Ponovi vožnju“. Stari zahtjevi i dogovori se ne kopiraju.                                                                                    |
| Privatne sačuvane putničke pretrage                               | Implementirano      | `SavedSearches.tsx`, `saved-searches.ts`, `app/server/saved-searches.mjs`: vezane za račun, ponovno korištenje s izabranim datumom i uklanjanje.                                                                                                |
| Gradski katalog, povratne informacije i uredničko spajanje        | Implementirano      | `MeetingAdmin.tsx`, `MeetingFeedback.tsx`, `app/server/meeting-catalog.mjs`: prijedlozi i aktivacija, aliasi, ručno spajanje i poništavanje, povratne informacije učesnika završene vožnje za korištenu katalošku tačku.                        |
| Tiho automatsko učenje i grupisanje uspješnih susreta             | Nije implementirano | Postoje kataloški prijedlozi uz trasu, statistika povratnih informacija završenih vožnji i ručno spajanje. Nema pozadinskog automatskog grupisanja proizvoljnih dogovorenih pinova niti automatske aktivacije javne tačke.                      |
| Dobrovoljno dijeljenje trenutnog GPS-a                            | Nije implementirano | Nema vremenskog prozora, sesije dijeljenja ni GPS toka između učesnika. Trenutni server izričito isključuje geolokacijsku dozvolu u `Permissions-Policy`.                                                                                       |
| Bluetooth, jednokratni kod ili QR za potvrdu susreta              | Nije implementirano | Trenutni `ready` je ručna izjava putnika. Nema Bluetooth postupka, koda ni QR ugovora.                                                                                                                                                          |
| Recenzije osoba s 1–5 zvjezdica                                   | Nije implementirano | Postoje samo povratne informacije za gradska mjesta (`MeetingFeedback.tsx`, `meeting_point_feedback`), ne ocjene vozača ili putnika.                                                                                                            |

Upute za trenutni tok su u [UPUTE-ZA-KORISTENJE.md](UPUTE-ZA-KORISTENJE.md), a provjeren opis obrade podataka i otvorena pravna pitanja u [PRIVATNOST.md](PRIVATNOST.md). Odjeljci 1–7 ispod ostaju prijedlog ciljnog ponašanja; nisu lista završenih funkcija.

## 1. Vozač potvrđuje trasu

Vozač unosi polazište i cilj. Aplikacija prikaže preporučenu cestovnu trasu. OSRM trenutno optimizira vrijeme putovanja; to ne treba nazivati najkraćom trasom po kilometrima.

Na karti vozač može dodati ili povući prolazni pin i proračunati novu trasu. Prolazni pin samo određuje kuda se vozi. Mjesto susreta zasebno određuje gdje je vozač spreman stati. Prolazak nekom ulicom nije dozvola za zaustavljanje u toj ulici.

Aplikacija može ponuditi nekoliko dobrih mjesta uz trasu. Vozač može prihvatiti prijedlog ili dodati/pomjeriti svoj pin, bez uređivanja gradske baze. Naziv je opcionalan; sistem može prikazati najbliži orijentir ili „Mjesto susreta 1“. Napomena o prilazu/strani ulice dostupna je kada treba. Vozač potvrđuje da na dogovorenom mjestu može stati; učestalost korištenja nije dokaz da je stajanje zakonito ili praktično.

Ponuda čuva potvrđenu trasu, redoslijed stajanja i broj slobodnih putničkih mjesta. Ponuda s tri mjesta ostaje dostupna dok ima slobodnog kapaciteta.

## 2. Putnik bira i predlaže

Putnikov početni i završni pin služe za računanje hodanja. Nisu automatski mjesta na kojima vozač staje i ne trebaju postati javne kućne adrese.

Putnik prvo dobije tri grupe: „Odgovara“, „Možda ti odgovara“ i „Podudaranje nije provjereno“. Svaka ponuda navodi hodanje na oba kraja, vrijeme susreta i konkretno odstupanje. Izbor 5/10/15 minuta ostaje putnikov uslov za tu pretragu.

Na otvorenoj ponudi putnik može odabrati postojeće vozačevo mjesto ili kliknuti „Predloži drugo mjesto“. Pin može postaviti uz stvarnu trasu, u smjeru vožnje, između ulaska i izlaska. Aplikacija provjerava stvarni pješački pristup i cestovno odstupanje. Udaljenost od linije u vazduhu nije dokaz da putnik može preći rijeku ili autocestu.

„Uz trasu“ nije dovoljno za automatsko prihvatanje: svaki novi prijedlog odobrava vozač. Ako proračun nedostaje, ponuda ostaje jasno označena kao neprovjerena.

## 3. Dogovor bez nesporazuma

Zahtjev ima verziju prijedloga: ulazni pin, izlazni pin, naziv/prilaz, procijenjeno vrijeme susreta i potpis verzije vozačeve trase.

- Putnik šalje prijedlog. Stanje: **Čeka vozača**.
- Vozač prihvata isti prijedlog: **Dogovoreno**; rezervira se jedno mjesto i šalje obavijest putniku.
- Vozač pomjeri pin: to je novi prijedlog, **Čeka putnika**. Prikaže se razlika u hodanju i vremenu. Putnik prihvata ili odbija.
- Izmjena poslije dogovora traži novu potvrdu. Stari dogovor ostaje vidljiv do prihvatanja zamjene ili eksplicitnog otkazivanja.

Istovremeno prihvatanje dva zahtjeva ne smije prepuniti automobil: provjera kapaciteta i potvrda moraju biti jedna transakcija. Prijedlog koji putnik još razmatra ne rezervira mjesto beskonačno; prikazuje se rok ili se mjesto konačno provjeri pri prihvatanju. Dupla prihvatanja, ponovljeni klik i zakašnjela potvrda ne smiju proizvesti dva dogovora.

Ako bi novi pin promijenio trasu i vrijeme već prihvaćenim putnicima, ne pomjeramo ih prešutno: ponovni proračun pokaže posljedice i traži potvrdu pogođenih putnika. U prvoj verziji jednostavnije je prijedloge ograničiti na postojeću trasu, bez njenog mijenjanja.

## 4. Kratke poruke

Preporuka je mali razgovor vezan isključivo za zahtjev, a ne opći društveni chat. Brzi odgovori: „Može ovdje“, „Predloži drugo mjesto“, „Ne mogu stati“, „Na drugoj strani ulice“, uz kratku vlastitu poruku. Time se pokriva „Kod Alte?“ / „Ima kamera — može ulaz na parking?“.

Poruka sama ne mijenja dogovoreni pin. Promjena ide kroz prijedlog i obostranu potvrdu. Razgovor vide samo učesnici tog zahtjeva, uz prijavu/zabranu kontakta i određen rok čuvanja. Ne šaljemo sadržaj privatne poruke na zaključani ekran.

## 5. Pronalaženje na dan vožnje

„Na mjestu sam“ već je na početnom ekranu za prihvaćenu vožnju. Uz njega treba biti kartica: naziv susreta, pin, vrijeme, vozačevo ime, fotografija za prepoznavanje i mali prikaz vozila. Fotografija za prepoznavanje može postati profilna ako profilne još nema; već postojeća profilna ostaje korisnikov izbor.

Grad iz profila je početni grad pretrage. IP adresa je slaba procjena zbog mobilnih mreža i VPN-a. GPS se može ponuditi na izričit klik, bez automatskog stalnog praćenja.

Za kasniju iteraciju predlažemo opcionalno dijeljenje trenutne lokacije samo s prihvaćenim saputnikom i samo tokom kratkog dogovorenog vremenskog prozora. Na ekranu su vidljivi kome se dijeli lokacija, kada ističe i dugme „Prekini“. Prekid/istek/otkazivanje/završetak ukidaju dijeljenje. Web aplikacija ne može obećati stalni GPS kada je zatvorena.

GPS blizina i Bluetooth nisu pouzdana potvrda da su ljudi u istom autu. Web Bluetooth nije široko podržan na iPhoneu. Za početak: vozač i putnik ručno potvrde susret; po potrebi kratki jednokratni kod ili QR smanjuje zamjenu osoba. Automatska blizina može biti pomoćni signal, nikad jedini dokaz.

## 6. Završetak i ocjene

Svaki prihvaćeni putnik ima vlastiti završetak/otkazivanje. Završena ponuda ostaje u vozačevoj historiji i može poslužiti za novu ponudu s novim datumom — postojeći dogovori se ne kopiraju.

Ocjenu osobe dopuštamo samo učesnicima završene stvarne vožnje, jednom po dogovoru: 1–5 zvjezdica i kratke oznake, npr. „Tačan dolazak“, „Lako smo se našli“, „Ugodna vožnja“. Demo vožnje ne grade javnu reputaciju. Ocjena susreta je zasebna od ocjene osobe; postojeće povratne informacije za gradske tačke ne treba miješati s recenzijama vozača.

## 7. Gradska baza koja raste

Učenje polazi od stvarno potvrđenih, uspješno završenih susreta. Korisniku ne postavljamo novi zadatak „definiraj gradsku tačku“. Sistem u pozadini grupiše upotrebe istog mjesta, računa pouzdanost prema broju nezavisnih dogovora, svježini potvrda i iskustvu susreta, pa dobre kandidate kasnije nudi na odgovarajućim putanjama. Jedno ponavljanje ili nekoliko demo vožnji ne gradi javnu reputaciju tačke. Ručna ocjena mjesta i uređivanje kataloga ostaju napredne opcije.

Privatni polazni i završni pinovi ne postaju gradske tačke. Dogovoreni pin koriste učesnici tog dogovora. Tačan privatni pin ili korisnikov naziv ne objavljuje se automatski drugim korisnicima; javni prijedlozi trebaju odvojenu provjeru javnog mjesta. Postojeći izbor dijeljenja javnih mjesta ostaje pod dodatnim postavkama dok taj model ne bude implementiran.

Sličan naziv („Alta“, „Kod Alte“) i blizina daju kandidate za automatsko grupisanje, uz čuvanje smjera i strane ulice. Dvije strane ceste, parking i tramvajska stanica mogu biti nekoliko metara udaljeni, a imati potpuno drugačiji prilaz. Kao prijedlog biramo stvarno korišten pin, umjesto aritmetičkog centra koji bi mogao završiti nasred ceste. Nejasna spajanja ostaju uredniku; čuvaju se aliasi i stari ID vodi na aktivnu tačku.

Servisni meni može uvoziti početne tačke po gradovima kao kandidate za pregled. Deset nasumičnih POI-ja nije deset pogodnih mjesta za zaustavljanje; početne tačke treba lokalno provjeriti prije aktivacije.

## Preporučeni redoslijed

1. Pouzdan i fleksibilan unos ulice/pina, četiri jezika i čitljiva karta.
2. Interaktivno oblikovanje trase, odvojeno od mjesta za stajanje.
3. Prijedlog/protuprijedlog mjesta susreta s obostranom potvrdom i kapacitetom.
4. Kratke poruke uz zahtjev.
5. Ručna potvrda susreta/završetka i ocjene; GPS tek kao dobrovoljna pomoć.

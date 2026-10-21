# USPUT Pulse

Prva povezana razvojna beta: uvodni ekran, email prijava i registracija, pripremljena Google OAuth prijava, glavni ekran, objava/pretraga vožnji, zahtjev i obostrani dogovor, spremnost, završetak/otkazivanje, moje vožnje i profil.

## Lokalno

Node.js 24 (koristi ugrađeni `node:sqlite`), npm.

```bash
cd /workspace/USPUT/app
npm ci --cache /tmp/usput-npm-cache
npm run build
npm start
```

Server sluša `127.0.0.1:8787`. `.data/usput.sqlite` je trajna lokalna baza i ne ide u Git. Proces treba ponovo pokrenuti nakon novog zadatka ili promjene serverskih varijabli. Za frontend hot reload: u drugom terminalu `npx vite --host 127.0.0.1`; Vite preusmjerava API na port 8787.

Alternativne lokalne postavke: `PORT`, `HOST` i `USPUT_DATA_DIR`. Ne izlagati razvojni server s probnim računima javno bez zasebne odluke. Izvornu dokumentaciju i mockupe potraži u roditeljskom folderu; app ih ne mijenja.

## Provjere

```bash
npm test
npm run build
python tests/browser.py
```

Browser test treba Python Playwright i `/usr/bin/chromium` (dostupni u cloud okruženju). Testira stvarne probne račune. Koristiti **posebnu lokalnu bazu i server**, ne stvarne podatke:

```bash
PORT=8788 USPUT_DATA_DIR=/tmp/usput-pulse-e2e node server/local.mjs
# U drugom terminalu:
USPUT_TEST_URL=http://127.0.0.1:8788 python tests/real-browser.py
```

Za čiste ponovljene browser testove kreiraj novu privremenu bazu; postojeće ponude drugih testnih korisnika mogu uticati na odabir rezultata. Testove ne pokretati na javnoj instanci.

## Cloudflare Worker i D1 — testna objava

Isti API i SQL rade na Cloudflare Workeru preko D1 bindinga `DB`. `wrangler.jsonc` je vezan za zasebnu USPUT D1 bazu `usput-db`, napravljenu za ovu beta verziju. Ne koristiti tuđe projektne baze. Testna adresa: https://usput-pulse.salemko.workers.dev. Objavljeno 20.10.2026. na zahtjev korisnika za web test; bez Google OAuth podataka.

Lokalna provjera D1 runtime-a:

```bash
XDG_CONFIG_HOME=/tmp/usput-config WRANGLER_SEND_METRICS=false npx wrangler d1 migrations apply DB --local
XDG_CONFIG_HOME=/tmp/usput-config WRANGLER_SEND_METRICS=false npx wrangler dev --local --ip 127.0.0.1 --port 8789
```

Provjera pakovanja, BEZ objave:

```bash
XDG_CONFIG_HOME=/tmp/usput-config WRANGLER_SEND_METRICS=false npm run deploy:check
```

Nova ažuriranja testnog Workera: nakon builda i testova koristiti `wrangler deploy` samo kada je objava u korisnikovom obimu zahtjeva. D1 migracije primjenjivati samo na ovu USPUT bazu. Google OAuth i eventualna vlastita domena podešavaju se zasebno. Lokalni Node SQLite i lokalni D1 su odvojeni razvojni podaci i ne sele se automatski u produkciju.

## Prijava i privatnost

Lozinke: PBKDF2-SHA256, 100.000 iteracija, slučajni salt. Sesije: slučajni token, SHA256 hash u bazi, HttpOnly/SameSite=Lax kolačić, Secure na HTTPS, 14 dana. Promjene traže isti Origin, JSON i ograničenu veličinu. Auth pokušaji ograničeni po IP-u i emailu. Sesije i zastarjeli OAuth tokovi se čiste pri novim prijavama. Beta ne potvrđuje email ni telefon i ne tvrdi da je identitet provjeren.

Google OAuth koristi server-side razmjenu koda, PKCE i jednokratni state vezan za HttpOnly kolačić. Novi korisnik mora potvrditi punoljetnost/pravila. Koraci: [GOOGLE-PRIJAVA.md](GOOGLE-PRIJAVA.md). Bez OAuth podataka dugme daje jasnu poruku, ne simulira prijavu.

## Demo

Anonimni demo ulaz je uklonjen. Za ulazak u aplikaciju potrebna je prijava/registracija; postojeća važeća sesija se obnavlja. Stara demo oznaka u localStorage ne daje pristup aplikaciji. Izvorni demo modul ostaje razvojni materijal i nije put za ulazak u objavljenu aplikaciju.

## Potvrđene vožnje, obavijesti i ponavljanje

Prihvaćen zahtjev ima globalni popup, animirani palac i pulsirajući zeleni prsten.
Vlasnički D1 inbox i atomska oznaka prikaza sprečavaju ponavljanje po karticama;
otkazani, završeni i istekli dogovori se ne prikazuju kao aktivne potvrde.
Promjena računa u drugoj kartici osvježava identitet i uklanja stari nacrt.

U profilu **Obavijesti → Uključi obavijesti** uključuje standardni Web Push.
Za iPhone je potreban iOS16.4+ i dodavanje USPUT-a na početni ekran. Privatni
VAPID ključ je Worker secret `VAPID_PRIVATE_JWK`, javni je `VAPID_PUBLIC_KEY`.
Generator `node scripts/create-push-keys.mjs /tmp/usput-push-keys.json` zapisuje
ključ u novu privatnu datoteku i ne ispisuje tajni ključ. Ne mijenjati postojeći
ključ bez plana za ponovno prijavljivanje pretplata. Pretplate su vezane za
sesiju i gase se odjavom/istekom. Poruke su šifrirane, a zaključani ekran nema
adrese. Worker ponavlja privremeno neuspjele dostave najviše pet puta. Cron za
dostavu radi svake minute; čišćenje ostaje dnevno. Mreža, postavke telefona i
podrška preglednika utiču na pravovremenost dostave.

Glavni ekran prikazuje **Na mjestu sam** uz sljedeći potvrđeni putnikov dogovor.
Vozač pri objavi bira1–7 slobodnih putničkih mjesta. Svaki putnik rezerviše jedno;
prihvatanje, spremnost, otkazivanje i završetak vode se posebno. Popunjena ili
započeta vožnja zatvara prijem novih putnika. Postojeće ponude imaju jedno mjesto.
Završena ponuda ostaje u historiji, a **Ponovi vožnju** otvara novi budući nacrt
s istim redoslijedom tačaka; objava traži nov pregled i potvrdu trase.

Naziv mjesta susreta je opcionalan: valjan pin dobija automatski broj. Takve
neimenovane tačke se ne predlažu gradskoj bazi. Geokoder daje latinični prikaz
novih i ranije keširanih prijedloga i strukturirani pokušaj za pune adrese.

Provjere: `npm test`, `npm run build`, `python tests/notifications-browser.py --real-api`,
`python tests/home-ready-capacity-browser.py` i `python tests/street-search-corrections-browser.py`.
Push test provjerava stvarni Chromium service worker i ponašanje bez otvorenog
prozora uz simuliranu dostavu; fizički telefon i stvarni push-provider nisu dio
automatizovanog testa.

## Rute i mape

Beta katalog ima 17 sarajevskih područja/orijentira/probnih mjesta; pretraga je po nazivu i podržava unos bez dijakritike. Bez cestovnog servisa traži isti polazak/izlazak, datum i vremenski prozor ±60 minuta. Jedno mjesto po ponudi. Vozač prihvata zahtjev; slanje zahtjeva nije potvrđena vožnja. SQL transakcije i jedinstveni indeks sprečavaju dva potvrđena putnika. Uz OSRM radi cestovno spajanje opisano niže. Procjena pješačkog puta i GPS izbor pina još nisu povezani. Nema GPS praćenja.

Mapa koristi Leaflet i standardne OpenStreetMap raster pločice bez API ključa, zajedničke za pregled rute i pomjeranje pina. CARTO Positron je uklonjen nakon što je u pregledniku vratio sliku „API KEY REQUIRED”; zamjenske pločice u browser testu nisu otkrile taj vanjski uslov. Nazivi objekata su ugrađeni u OSM pločice; selektivno uklanjanje labela zahtijeva provjeren drugi izvor ili vektorsku podlogu. Atribucija OSM ostaje vidljiva. Stvarna geometrija rute prikazuje se punom crnom linijom; bez nje spojna linija/skica nije cestovna ruta. Nema masovnog preuzimanja ili offline cache-a. Za širu produkciju poštovati [OSM tile pravila](https://operations.osmfoundation.org/policies/tiles/) i procijeniti odgovarajući servis ili hosting; nema garantovanog SLA. Browser test koristi zamjenske pločice i ne dokazuje dostupnost vanjskog tile servisa.

## Granice beta verzije

Nije odobrena za organizaciju stvarnih vožnji. Prije stvarne alfe trebaju provjerena mjesta susreta, moderacija/prijave i podrška, završna privatnost/uslovi, lokalna pravna i osiguravajuća provjera. Obavijesti su trenutno osvježavanje otvorenog ekrana svakih 15 sekundi, ne push/SMS. Nema naplate, automatske lokacije, proizvoljnog geokodiranja, oporavka lozinke mailom ili javnog obećanja sigurnosti.

## Katalog i sačuvano vozilo

Profil i tok vozača imaju pretraživanje marke/modela, boju i ručni unos. Jedno vozilo po profilu. Model se briše kada promijeniš marku; nova ponuda koristi vozilo vlasnika i trajno čuva opis iz trenutka objave. Kasnija promjena vozila ne mijenja postojeći dogovor. Tablice nisu dio ove dorade. Za fotografije vidi niže.

Katalog je build-time snapshot `@meterapp/vehicle-db@2.19.1`, putnička vozila i MPV: 640 marki, 20.576 različitih naziva modela. Nije obećanje potpunog globalnog pokrića, zato postoji ručni unos. Nema vanjskog API poziva, API ključa ili troška po upitu. Paket je samo dev dependency, ne šalje se cijeli browseru. Izvori i licence su u `public/vehicle-catalog-notices.txt`. Osvježavanje: `npm run catalog:build`, zatim pregled diff-a i testovi; server i public snapshot moraju biti isti.

D1 migracija `0002_vehicles.sql` je aditivna i primjenjuje se prije objave novog Workera. Lokalni Node runner kreira tabelu pri sljedećem startu. Novi browser testovi: `python tests/vehicle-browser.py` i `python tests/catalog-fallback-browser.py`. Backend suite ima 35 testova.

Google Client ID je usklađen u wrangler vars; `keep_vars: true` čuva dashboard varijable pri objavama. Client secret ostaje isključivo šifrovani Worker binding, nikad u ovom repozitoriju. Metapodaci potvrđuju konfiguraciju; stvarnu Google prijavu još mora potvrditi testni korisnik kroz preglednik.


### Privatne fotografije i cestovno spajanje

Profilna fotografija: WebP do 320×320 i 50 KiB. Fotografija auta: do 960 px i 150 KiB. Slika se ponovo kodira u pregledniku; izvorna fotografija, EXIF, GPS, XMP i profil boje se ne šalju. Animacija i dodatni metapodaci odbijaju se na serveru. Fotografije su opcionalne u beta verziji; nisu verifikacija identiteta.

`PHOTOS` je privatni R2 bucket `usput-photos` u EU jurisdikciji, bez javnih URL-ova. D1 čuva samo metapodatke. Vlasnik može vidjeti svoju sliku; saputnik tek nakon prihvaćenog dogovora, dok je dogovor aktivan, najduže do 24 sata nakon polaska. Otkazivanje/završetak ukida API pristup. Zamjena/brisanje uklanja staru sliku; dnevni cron u 03:00 UTC čisti prekinute uploade. Odgovori koriste `private, no-store`. Već preuzetu kopiju/screenshot nije moguće povući. Demo slike ostaju u lokalnom pregledniku.

`OSRM_URL` uključuje cestovnu matricu za beta katalog mjesta u Sarajevu. Lokalno je opcionalan; bez njega radi pretraga istih mjesta. Matrica se čuva 24 sata u D1; neuspjeh se pamti minutu. Atomska D1 rezervacija sprječava paralelne upstream pozive pri praznom kešu. Procjene su bez saobraćaja uživo. Spajanje poredi vozačev put sa putem preko ulaska/izlaska putnika, odbija suprotan smjer, nedostupne tačke, cestovne snapove dalje od 200 m, dodatak preko 10 minuta ili preko max(3 min, 50% izvornog trajanja), te vrijeme susreta izvan ±60 min. Izabrana mjesta i procjene ostaju uz zahtjev u `booking_routes`.

Beta koristi javni OSRM/FOSSGIS demo za razumno nekomercijalno testiranje. Nema SLA i nije obećanje trajno besplatne infrastrukture. Prije komercijalnog ili većeg javnog lansiranja zamijeniti endpoint vlastitim OSRM servisom ili pružaocem s odgovarajućim uslovima. [Uslovi demo servisa](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server). Šalju se isključivo koordinate javnih probnih mjesta, bez korisničkog identiteta. Karta je označena skica; linija nije cestovna navigacija niti potvrda da je sigurno stati.

Provjere: `npm test`, `npm run build`, `USPUT_TEST_URL=http://127.0.0.1:8788 python tests/photo-browser.py` i `tests/real-browser.py`. Testovi rutiranja koriste kontrolisanu matricu; nisu dokaz dostupnosti javnog OSRM servisa.

Za test spajanja u pregledniku pokreni `node tests/routing-fixture.mjs`, zatim u drugom terminalu `PORT=8789 USPUT_DATA_DIR=/tmp/usput-road-e2e OSRM_URL=http://127.0.0.1:8790/ node server/local.mjs`, pa `python tests/routing-browser.py`. Fixture je isključivo sintetički testni servis i nikad se ne koristi na Cloudflareu.


## Jezici, kalendar i preciznost lokacija

BHS i ENG prekidač je dostupan prije i nakon prijave. Izbor se pamti u pregledniku ako je storage dostupan; promjena jezika ne mijenja podatke forme, ID mjesta, marku/model ili pohranjenu boju vozila. `src/locales/en.json` sadrži prevode, `i18n.ts` pruža reaktivni jezik i formatiranje; server poruke se prevode pri prikazu.

Datum je uvijek `dd.MM.yyyy`, sedmica počinje ponedjeljkom, vrijeme je 00–23. Vlastiti pristupačni date/time popoveri zamjenjuju nepouzdani prozirni native picker. API i baza zadržavaju ISO datum i `HH:mm`. Dodano: `tests/calendar-browser.py`, `tests/language-auth-browser.py`, `tests/place-browser.py`.

Bistrik, Alifakovac (pretraga prihvata i Alfakovac), Baščaršija, Logavina, Katedrala, Kovačići i Širokača su nova područja/orijentiri. Njihove koordinate su približne orijentacione tačke, nisu potvrđeni pinovi za ukrcavanje. Katedrala je označena kao pješačka zona. Grad i zemlja su metapodaci, a Sarajevo ostaje ograničenje testne pokrivenosti. Za regiju, GPS/ručni pin, stvarni pješački put i izbor 5/10/15 minuta vidi `../docs/superpowers/specs/2026-10-20-location-meeting-design.md`; taj dio je razrađen prijedlog, ne aktivan pješački filter.

## Kerim za probu pretrage

Na zahtjev vlasnika dodan je `Kerim (demo)`, izmišljeni profil bez lozinke i mogućnosti prijave, s crvenim Volkswagen Golfom 5. U objavljenoj beta bazi ima 365 ponuda Baščaršija → Ilidža, svaki dan uključujući vikende, od 21.10.2026. do 20.10.2027. u 07:30 po vremenu Sarajeva. Svaka ponuda jasno je označena DEMO / TEST. Nema automatskog prihvatanja zahtjeva.

Reproduktivni SQL generator: `node scripts/seed-kerim.mjs /tmp/kerim.sql`. Generiše narednih godinu dana od sutra, koristi DST-aware `departureMs` i stabilne ID-eve; ponovno pokretanje ne duplira ponude niti resetuje postojeće dogovore. Generator nije javni API i ne mijenja ograničenje obične objave na 90 dana. SQL primjenjivati samo na izričito odabranu testnu beta bazu.

Senad i Vesna imaju dodatne izmišljene ponude od 22.10.2026. do 21.10.2027, svaki dan u 07:30 po vremenu Sarajeva:

- **Senad (demo)**: Aleja lipa → Obala Kulina bana, bijela Škoda Kamiq, preko demo tačke Skenderija.
- **Vesna (demo)**: Ante Babića → Obala Kulina bana, zlatni MINI Cooper, preko demo tačaka Nedžarići, Čengić Vila i Skenderija.

Generator `node scripts/seed-demo-drivers.mjs /tmp/usput-demo.sql [YYYY-MM-DD]` pravi SQL bez izvršavanja; datum je opcionalni današnji Sarajevo datum. Ulični pinovi su provjereni preko OSM/Nominatim, a trase i vremena između imenovanih tačaka preko cestovnog servisa. `ensureDemoMeetingStops` dopunjava samo otvorene demo ponude bez postojeće rezervacije. Testne tačke nemaju javni catalogue ID i ne pune gradsku bazu niti povratne ocjene. Približan pin ne potvrđuje da se tu smije stati.

Prijavljeni putnik koji je poslao zahtjev na jednu od ove tri demo ponude vidi **„Simuliraj prihvatanje“**. `POST /api/bookings/:id/simulate-accept` provjerava vlasnika zahtjeva i tačan spoj unaprijed zadanog vozača/ID-a ponude; oznaka u opisu nije dovoljna. Koristi istu atomsku potvrdu jednog mjesta kao vozačevo prihvatanje i odbija ostale zahtjeve. Nema automatskog prihvatanja ni simulacije stvarnih ponuda. Prihvaćenu demo vožnju putnik može otkazati uobičajenim dugmetom da ponovo oslobodi mjesto.

Prsten oko slike i statusni kvadrat prate stvarno stanje rezervacije: čekanje rotira, prihvaćen/spreman zahtjev dobija zeleni puls i palac gore. Otkazani, odbijeni i završeni dogovori nemaju taj status. BHS/ENG i smanjene animacije su podržani. Provjere: `npm test` i, nakon builda, `python tests/driver-request-status-browser.py`; browser koristi privremenu lokalnu bazu i sintetički servis ruta, bez produkcijskih naloga.

## Dijeljenje troškova

Pri objavi vozač može uključiti „Očekujem dijeljenje troškova”. Checkbox je podrazumijevano isključen; postojeće ponude, uključujući Kerimove testne vožnje, imaju `false`. API prihvata samo boolean i čuva flag uz ponudu (`rides.cost_sharing`, migracija `0005_cost_sharing.sql`). Putnik vidi Da/Ne na kartici i detaljima u BHS/ENG. Dogovor o iznosu i načinu podjele je izvan aplikacije; USPUT ovim dodatkom ne obračunava i ne provodi plaćanje. Globalne tvrdnje da su sve vožnje besplatne uklonjene su iz interfejsa.

Provjera: API testovi pokrivaju izostavljen/false/true i neispravne tipove; `tests/cost-sharing-browser.py` pokriva checkbox, objavu, trajnost nakon reloada i ENG prikaz.

## Ulice, pinovi i koridor trase

Novi glavni unos je ulica, približan broj i grad. Korisnik eksplicitno pretražuje adresu i potvrđuje/pomjera pin, ili ručno unosi pin bez geokodera. Stara beta mjesta ostaju u zatvorenom pomoćnom odjeljku radi postojećih testnih ponuda. Za objavu sa uličnim pinovima vozač prvo pregleda i potvrdi stvarnu izračunatu trasu. Potvrđena trasa i lokacije ostaju snapshot ponude (`0006_street_locations.sql`).

Putnik bira5/10/15 minuta hodanja pri svakoj pretrazi. Engine projektuje tačke na stvarnu poliliniju i provjerava redoslijed ulaska/izlaska, koridor do500m za kandidate susreta, cestovni dodatak vozaču i stvarni pješački proračun do/od predloženih pinova. Biraju se konačni kandidati duž trase, pa dostupnost podataka i izvora za stajanje ograničava pokrivenost; rezultat nije dokaz da je pronađena svaka teoretska tačka u kontinuiranom prostoru. Limit hodanja važi zasebno na oba kraja. Nema pretvaranja vazdušne udaljenosti u tvrdnju o stvarnom pješačkom putu. Mjesta nisu verifikovana kao zakonita/sigurna za zaustavljanje; oba učesnika potvrđuju susret postojećim zahtjevom/prihvatanjem.

Cestovne/pješačke putanje dolaze od OpenRouteService ako postoji tajni binding, inače od javnihOSRM endpointa. Geokoder je Nominatim; šalju se adresa i grad, bez korisničkog imena/emaila. Eksplicitne pretrage i rutiranje su keširani i globalno ograničeni na1upstreamzahtjev/1,1s. Nedostupnost se prikazuje kao nepotpuna pretraga, bez tihog proglašavanja ruta nepodudarnim. Stanje servisa je u `routing_health`. Upute: [ROUTING-SETUP.md](ROUTING-SETUP.md).

Provjere: `npm test` i `npm run build`; `node tests/street-fixture-server.mjs` + `python tests/street-browser.py` dokazuju tok adresa/pin→potvrda trase→usputni segment→hodanje→obostrani dogovor na kontrolisanim podacima. Ne dokazuju dostupnost javnog geokodera/rutera. Nova ulična beta je kompatibilna s ranijim Kerimovim ponudama. Oznake troškova su NE u zelenom krugu i DA u crnom s bijelim slovima.

## Grad korisnika i lokacija telefona

Registracija emailom i novi Google račun traže grad/mjesto (`0007_user_city.sql`). Grad se vraća samo u vlastitom profilu i može se uređivati; postojeći računi ostaju važeći i mogu ga dopuniti. Pretraga ulica počinje gradom iz profila, a grad se može privremeno promijeniti za drugo polazište/odredište. To ne mijenja već potvrđene pinove.

Dugme „Koristi moju lokaciju” je privremeno uklonjeno; browser geolocation je isključen kroz Permissions-Policy. Grad se bira ručno. Kod starijih računa bez grada koristi se grad već odabranog polazišta ako je poznat; korisnik može unijeti i kompletnu adresu „ulica, grad”. Geokoder prihvata kratke nazive (najmanje 3 znaka). Filter provjerava i općinu/administrativni grad, kako ulice u npr. Novom Gradu Sarajevo ne bi bile odbačene zbog različitog naziva lokalne jedinice. Cache verzija je promijenjena da se ranije prazne pretrage ne vraćaju još 30 dana.

Nominatim se poziva samo na eksplicitnu pretragu, bez autocomplete upita na svaki znak. `tests/city-browser.py` pokriva ručni grad, starije račune, kratke nazive, punu adresu bez posebnog grada i odsustvo GPS dugmeta. Vanjski geocoder u testovima je sintetički fixture; test ne dokazuje dostupnost javnog servisa. Tipografija je lokalno posluženi Nunito, regular 400 za osnovni tekst, naslovi i nazivi polja ExtraBold 800.

## Fleksibilna pretraga ulica, četiri jezika i Positron

`POST /api/locations/suggest` koristi Photon (`PHOTON_URL`) za automatske prijedloge nakon pauze od 650 ms, već od jednog slova. Rezultati su ograničeni gradom, geografskim okvirom i metapodacima; prekratki nazivi daju stvarne početne podudarnosti. Photon podržava nepotpun i približan unos. Ako nema rezultata, pokušava se lista po prva dva slova, jasno označena kao alternativa. Prijedlog ne potvrđuje kućni broj niti mjesto za zaustavljanje: korisnik bira rezultat i provjerava pin. Oba redoslijeda „Sarajevo, Aleja lipa“ i „Aleja lipa, Sarajevo“ prihvaćaju se.

Photon javni servis nema SLA i dopušta razumno korištenje; globalni upstream limit i dijeljeni cache ograničavaju pozive. Za veći promet predvidjeti vlastitu Photon instancu ili servis za autocomplete. Nominatim ostaje samo eksplicitna rezervna pretraga preko povećala; ne šalju mu se automatski upiti tokom tipkanja. Ni jednom servisu ne šalje se korisnikovo ime/email. Pin se uvijek potvrđuje na karti; postojeći potvrđeni pin ne traži ponovno geokodiranje. Ćirilični nazivi iz geokodera i predmemorije transliteriraju se u latinicu, bez pomjeranja koordinata ili promjene ID-a.

Jezici su Bosanski, Srpski (latinica), Hrvatski i English. Preference ostaju u `usput-language`, a raniji `bhs` znači Bosanski. Promjena jezika ne resetira datum, rutu ili prijavu. Datumi su dan.mjesec.godina, sedmica/tjedan počinje ponedjeljkom, vrijeme ima 24 sata. Push preferenca koristi dodatni `display_language` (`0013_push_display_language.sql`) bez prepisivanja postojećih pretplata, sesija i dostava.

Ruta i modal pina koriste isti lokalni vektorski stil `public/maps/usput-positron.json`: Positron s USPUT paletom, manje natpisa i prioritetnim latiničnim nazivima. MapLibre preko Leafleta zadržava zumiranje, povlačenje pina i postojeće putanje. OpenFreeMap javni vektorski podaci ne traže API ključ. Podaci/atribucija: OpenStreetMap, OpenMapTiles i OpenFreeMap; porijeklo i licence dizajna dostupni su uz mapu na `/maps/LICENSE.txt`. Stil je verzioniran lokalno; ne koristi se CARTO raster koji je ranije vraćao „API KEY REQUIRED“. Ako se vektorska podloga ne učita, aplikacija pokazuje grešku; ručni pin traži učitanu podlogu i stvarno pomjeranje prije potvrde.

Provjere: `npm test`, `npm run build`, `python tests/street-search-corrections-browser.py`, `python tests/commute-corrections-browser.py`, `python tests/home-ready-capacity-browser.py` i `python tests/notifications-browser.py --real-api`. Browser provjere koriste stvarni MapLibre renderer i mali sintetički vektorski tile za interakcije; ne dokazuju dostupnost javnog OpenFreeMap servisa ili izgled stvarnih sarajevskih podataka. Objavljeni Photon/Nominatim rezultat provjerava se zasebnim smoke testom. Fizički iPhone i dostava kroz Appleov push servis nisu potvrđeni ovim testovima.

Razrađen tok interaktivne trase, prijedloga/protuprijedloga susreta, kratkih poruka, dobrovoljnog GPS-a i ocjena je u [prijedlogu sljedeće iteracije](../docs/2026-10-21-meeting-proposals.md). To je dizajn za raspravu; chat, automatska potvrda susreta i stalni GPS ovim promjenama nisu uvedeni.

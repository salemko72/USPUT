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

Browser test treba Python Playwright i `/usr/bin/chromium` (dostupni u cloud okruženju). Testira odvojeni demo. Za stvarne račune koristiti **posebnu lokalnu bazu i server**, ne stvarne podatke:

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

„Isprobaj demo” koristi izmišljene profile, zasebno lokalno stanje u pregledniku i označeno simuliranje potvrde vozača. Ne pravi stvarne korisnike ni ponude u bazi. Reset je u profilu. Demo ne dokazuje stvarni matching, OAuth, GPS ili sigurnost osobe.

## Rute i mape

Deset probnih mjesta susreta u Sarajevu, isti polazak/izlazak, datum i vremenski prozor ±60 minuta. Jedno mjesto po ponudi. Vozač prihvata zahtjev; slanje zahtjeva nije potvrđena vožnja. SQL transakcije i jedinstveni indeks sprečavaju dva potvrđena putnika. Ovo je diskretno spajanje mjesta, ne cestovno rutiranje ili procjena hoda. Nema GPS praćenja.

Podrazumijevano se prikazuje jasno označena skica. Dugme „Mapa” uključuje Leaflet i OpenStreetMap sa atribucijom. Prikazana spojna linija NIJE cestovna ruta. OSM standardni tile servis ima [pravila korištenja](https://operations.osmfoundation.org/policies/tiles/), bez garancije/SLA; nema unaprijed skinutih pločica, offline cache-a ili masovnog preuzimanja. Za širu produkciju procijeniti odgovarajući tile servis ili hosting; Leafletova besplatna licenca ne znači neograničen besplatan servis.

## Granice beta verzije

Nije odobrena za organizaciju stvarnih vožnji. Prije stvarne alfe trebaju provjerena mjesta susreta, moderacija/prijave i podrška, završna privatnost/uslovi, lokalna pravna i osiguravajuća provjera. Obavijesti su trenutno osvježavanje otvorenog ekrana svakih 15 sekundi, ne push/SMS. Nema naplate, automatske lokacije, proizvoljnog geokodiranja, oporavka lozinke mailom ili javnog obećanja sigurnosti.

## Katalog i sačuvano vozilo

Profil i tok vozača imaju pretraživanje marke/modela, boju i ručni unos. Jedno vozilo po profilu. Model se briše kada promijeniš marku; nova ponuda koristi vozilo vlasnika i trajno čuva opis iz trenutka objave. Kasnija promjena vozila ne mijenja postojeći dogovor. Tablice i fotografije nisu dio ove dorade.

Katalog je build-time snapshot `@meterapp/vehicle-db@2.19.1`, putnička vozila i MPV: 640 marki, 20.576 različitih naziva modela. Nije obećanje potpunog globalnog pokrića, zato postoji ručni unos. Nema vanjskog API poziva, API ključa ili troška po upitu. Paket je samo dev dependency, ne šalje se cijeli browseru. Izvori i licence su u `public/vehicle-catalog-notices.txt`. Osvježavanje: `npm run catalog:build`, zatim pregled diff-a i testovi; server i public snapshot moraju biti isti.

D1 migracija `0002_vehicles.sql` je aditivna i primjenjuje se prije objave novog Workera. Lokalni Node runner kreira tabelu pri sljedećem startu. Novi browser testovi: `python tests/vehicle-browser.py` i `python tests/catalog-fallback-browser.py`. Backend suite sada ima 21 test.

Google Client ID je usklađen u wrangler vars; `keep_vars: true` čuva dashboard varijable pri objavama. Client secret ostaje isključivo šifrovani Worker binding, nikad u ovom repozitoriju. Metapodaci potvrđuju konfiguraciju; stvarnu Google prijavu još mora potvrditi testni korisnik kroz preglednik.


### Privatne fotografije i cestovno spajanje

Profilna fotografija: WebP do 320×320 i 50 KiB. Fotografija auta: do 960 px i 150 KiB. Slika se ponovo kodira u pregledniku; izvorna fotografija, EXIF, GPS, XMP i profil boje se ne šalju. Animacija i dodatni metapodaci odbijaju se na serveru. Fotografije su opcionalne u beta verziji; nisu verifikacija identiteta.

`PHOTOS` je privatni R2 bucket `usput-photos` u EU jurisdikciji, bez javnih URL-ova. D1 čuva samo metapodatke. Vlasnik može vidjeti svoju sliku; saputnik tek nakon prihvaćenog dogovora, dok je dogovor aktivan, najduže do 24 sata nakon polaska. Otkazivanje/završetak ukida API pristup. Zamjena/brisanje uklanja staru sliku; dnevni cron u 03:00 UTC čisti prekinute uploade. Odgovori koriste `private, no-store`. Već preuzetu kopiju/screenshot nije moguće povući. Demo slike ostaju u lokalnom pregledniku.

`OSRM_URL` uključuje cestovnu matricu za deset probnih mjesta u Sarajevu. Lokalno je opcionalan; bez njega radi pretraga istih mjesta. Matrica se čuva 24 sata u D1; neuspjeh se pamti minutu. Atomska D1 rezervacija sprječava paralelne upstream pozive pri praznom kešu. Procjene su bez saobraćaja uživo. Spajanje poredi vozačev put sa putem preko ulaska/izlaska putnika, odbija suprotan smjer, nedostupne tačke, cestovne snapove dalje od 200 m, dodatak preko 10 minuta ili preko max(3 min, 50% izvornog trajanja), te vrijeme susreta izvan ±60 min. Izabrana mjesta i procjene ostaju uz zahtjev u `booking_routes`.

Beta koristi javni OSRM/FOSSGIS demo za razumno nekomercijalno testiranje. Nema SLA i nije obećanje trajno besplatne infrastrukture. Prije komercijalnog ili većeg javnog lansiranja zamijeniti endpoint vlastitim OSRM servisom ili pružaocem s odgovarajućim uslovima. [Uslovi demo servisa](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server). Šalju se isključivo koordinate javnih probnih mjesta, bez korisničkog identiteta. Karta je označena skica; linija nije cestovna navigacija niti potvrda da je sigurno stati.

Provjere: `npm test`, `npm run build`, `USPUT_TEST_URL=http://127.0.0.1:8788 python tests/photo-browser.py` i `tests/real-browser.py`. Testovi rutiranja koriste kontrolisanu matricu; nisu dokaz dostupnosti javnog OSRM servisa.

Za test spajanja u pregledniku pokreni `node tests/routing-fixture.mjs`, zatim u drugom terminalu `PORT=8789 USPUT_DATA_DIR=/tmp/usput-road-e2e OSRM_URL=http://127.0.0.1:8790/ node server/local.mjs`, pa `python tests/routing-browser.py`. Fixture je isključivo sintetički testni servis i nikad se ne koristi na Cloudflareu.

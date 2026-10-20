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

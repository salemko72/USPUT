# USPUT — simulacija putanja, susreta i komunikacije

Datum: 24.10.2026. Baza aplikacije: `f2ef363`, grana `feat/pulse-app`.

## Metoda i granice provjere

Stvarni React UI i API pokrenuti su lokalno s izoliranom SQLite bazom i odvojenim računima vozača/putnika. Karta, cestovni i pješački servis koriste determinističke testne odgovore. Nisu korišteni stvarni korisnici, stvarne ponude ni javni routing servisi. Provjera dokazuje ponašanje aplikacije za zadanu geometriju i odgovore servisa, a ne tačnost stvarnih ulica, saobraćaja, pješačkih prilaza ili legalnost zaustavljanja.

Algoritamski sweep poziva stvarni `proposalMatch`. Simulirani pješački servis koristi 1,2 m/s osim posebno zadatih trajanja i prepreka. Rezultati su u priloženom JSON-u; „PONUDA“ znači kandidat koji još čeka dogovor, ne automatski prihvaćena vožnja.

## Rezultati toka

- Svih 229 postojećih unit/API testova prolazi, uključujući mjesta, kapacitet, dvostruke ponude, verzije prijedloga, privatnost chata i utrku prihvatanja s novim pinom.
- `route-shape-browser.py`: tri scenarija prolaze — korekcije trase, razdvajanje prolaznih tačaka od susreta, ponovno korištenje trase i mobilni prikaz.
- `inline-meeting-browser.py`: prolazi dodavanje, odustajanje, potvrda i izmjena pina na postojećoj mapi, bez drugog popupa, na telefonu i desktopu.
- `passenger-discussion-browser.py`: prolazi pomjeranje putnikovog ulaza, slanje, poruka, vozačev drugi prijedlog i putnikova potvrda tačne nove verzije.
- `route-audit-browser.py`: prolazi cijeli trenutni tok: objava vozačeve rute s mjestom susreta; putnička pretraga od 25% do 75% iste trase; nalazak vozača; prijedlog ulaza; mini chat u oba smjera; prihvatanje i popup; „Na mjestu sam“; završetak; odbijanje nove poruke nakon završetka. Prijem vozačeve poruke provjerava se i bez ručnog osvježavanja putnikove stranice.

### Zabilježene prepreke u samim testovima

Stariji `meeting-flow-browser.py` nije prošao: traži raniji korak „Uredi mjesta susreta“ prije nove faze potvrđivanja trase. To je zastarjela automatizacija; taj stari scenarij nije proglašen uspješnim. Novi `route-audit-browser.py` provjerava sadašnji glavni tok. Pri njegovoj izradi trebalo je pravilno zatvoriti namjerni popup prihvatanja prije klika na „Na mjestu sam“; nakon toga tok prolazi.

## Stvarne tolerancije

| Provjera | Trenutno pravilo / opažanje |
|---|---|
| Vrijeme | Vrijeme dolaska vozača do predloženog ulaza može odstupati do ±60 minuta od traženog vremena. Tačno 60 minuta prolazi; 60 minuta i 1 sekunda ne prolazi. Nema posebnog praga od 15 minuta za „Odgovara“. |
| Hodanje | Izbor 5, 10 ili 15 minuta je čvrst limit na svakom kraju zasebno. Trajanja 300/600/900 sekundi prolaze; 301/601/901 ne prolaze. Nije ukupni zbir oba hodanja. |
| Udaljenost adrese | Nema jedinstvenog radijusa od 500 m. Brzi filter je `walkMinutes × 120 m` zračnom linijom (600/1200/1800 m), zatim odlučuje stvarni pješački proračun u minutama. |
| Primjer udaljenosti | U simulaciji pri 1,2 m/s, 500 m prilaza uz limit 10 minuta prolazi. Oko 720 m je granično i zavisi od zaokruživanja koordinata; znatno više ne prolazi. To nije univerzalna brzina stvarnog routing servisa. |
| Ručni pin susreta | Mora biti unutar približno 50 m od vozačeve trase. 49 m prolazi; 51/100/500 m ne prolaze. Matematički tačnih 50 m u sweepu odbijeno je zbog numeričke preciznosti; API dodatno zaokružuje koordinate. |
| Pravac i redoslijed | Ulazak mora biti prije izlaska po redoslijedu putanje. Obrnuti smjer i ista tačka ne prolaze. |
| Prepreke | 60 m zračne udaljenosti uz 1800 m pješačkog obilaska ne prolazi s limitom 15 minuta. |
| Dostupnost servisa | Nedostupan pješački servis vraća neprovjeren proračun, a ne potvrđen match. Neprohodna ruta odbacuje kandidata. UI upozorava da rezultati mogu biti nepotpuni. |
| Vrijeme do ulaza | Putnik mora moći stići pješke do planiranog vremena susreta. |
| Vozačevo skretanje | Prijedlog susreta ne mijenja potvrđenu trasu i iskazuje 0 dodatnih minuta vožnje. Lokacija unutar 50 m još uvijek zahtijeva vozačevu procjenu prilaza i stajanja. |
| Mini chat | Poruka do 280 znakova; samo učesnici dogovora. Tekst ne predstavlja potvrdu pina. Osvježavanje poruka je svakih 10 s; detalji zahtjeva svakih 15 s. Završetak/otkazivanje onemogućuje novo slanje. |

## Potvrđeni nedostaci i preporučeni prioriteti

1. **Nedostaje razvrstavanje rezultata.** Trenutni UI prikazuje jednu listu „Vožnje za tebe · ±60 min“. Ranije dogovorene grupe „Odgovara“, „Možda ti odgovara“ i „Podudaranje nije provjereno“ nisu u sadašnjem toku. Limit hodanja se ne proširuje za bliske alternativne ponude: npr. 10 min i 1 s potpuno ispada umjesto da se ponudi uz objašnjenje. Predloženo: zasebno definisati osnovni match i fleksibilne alternative, uz vidljivo vremensko i pješačko odstupanje.
2. **Povratak istom cestom može dati lažno negativan rezultat.** Na trasi 0→6 km→0 putnik 4 km→2 km ima valjanu vožnju na povratku. Automatski prijedlog uzima najbližu projekciju, pri jednakim udaljenostima prvi prolazak; izlazak tada izgleda prije ulaska pa ponuda nestaje. Fiksne odobrene tačke već imaju testove za petlje, ali novi tok automatskih prijedloga ne razmatra sve prolaze. Predloženo: kandidatne projekcije i odabir para po redoslijedu i vremenu cijele trase.
3. **Granice ovise o preciznosti.** Koordinate se zaokružuju, a prostorne granice porede strogo. Jasno definisati malu tehničku toleranciju na 50 m, bez širenja poslovnog radijusa; pješačko vrijeme ne predstavljati preciznijim od procjene servisa.
4. **Prvi najbliži geometrijski pin nije uvijek najpristupačniji.** Simulacija s preprekom ispravno odbacuje nepodesan prijedlog. Za poboljšanje pretrage vrijedi razmatrati više obližnjih projekcija/prilaza. Ovo dodatno poboljšanje nije potvrđeno terenskim testom.

## Ponavljanje provjere

Iz direktorija `app`:

```sh
npm test
node tests/route-matching-audit.mjs /tmp/usput-matching-audit.json
USPUT_TEST_ASSETS_DIR="$PWD/dist" python tests/route-audit-browser.py
USPUT_TEST_ASSETS_DIR="$PWD/dist" python tests/passenger-discussion-browser.py
USPUT_TEST_ASSETS_DIR="$PWD/dist" python tests/inline-meeting-browser.py
USPUT_TEST_ASSETS_DIR="$PWD/dist" python tests/route-shape-browser.py
```

Za frontend izmjene prije browser provjere pokrenuti `npm run build`. Za novi pokret bez zadane putanje helper može sam napraviti zaseban build. Ovaj audit ne mijenja produkcijska pravila niti podatke.

# Fleksibilne ponude i povratne trase — provjera

Implementacija nakon odobrenog prijedloga; prethodni audit je `2026-10-24-route-simulation.md`. Rad se odnosi na prve dvije korekcije: razvrstavanje ponuda i ponovljene prolaze trase.

## Pravila

- **Odgovara:** susret od traženog vremena do 15 min kasnije i oba hodanja unutar originalnog izbora 5/10/15 min.
- **Možda ti odgovara:** do ±30 min i najviše 5 dodatnih minuta hodanja na svakom kraju. Kartica navodi vremensko odstupanje i prekoračenje hodanja.
- **Dodatne ponude:** provjereni kandidati s većim vremenskim odstupanjem, do ±60 min, otvaraju se kroz „Prikaži još ponuda“.
- **Podudaranje nije provjereno:** bliska ruta bez pouzdanog proračuna prikazuje se odvojeno. Zahtjev se ne može poslati bez uspješnog proračuna; server ga ponovo provjerava.

Originalni izbor hodanja se čuva. Interna fleksibilna rezerva primjenjuje se jednako u pretrazi, detaljima, pregledu pina, zahtjevu i vozačevom protuprijedlogu. Ne mijenja se vozačeva geometrija ni pravilo ručnog pina uz trasu.

## Povratni prolazi

Engine zadržava lokalne projekcije kroz različite prolaze istom cestom. Pješačke rute računa po kandidatu, umjesto po svakom paru. Svaki par mora imati stvarno veći položaj i vrijeme izlaska od ulaska. Ne može prihvatiti ulazak i izlazak u istom trenutku na srednjem prolazu petlje.

Reproducirani stari propust 0→6 km→0 / putnik 4 km→2 km sada daje valjanu ponudu. Test s tri prolaza istim pinom potvrđuje pozitivno trajanje od 20 min umjesto ranijeg pogrešnog rezultata 0 min. Podudarni kasniji prolaz ima prednost nad ranijim koji zahtijeva prilagodbu.

## Dokazi

- Puna Node/API testna grupa: **252 prolaze**, bez neuspjeha.
- `flexible-matching-browser.py`: dvije provjere prolaze — grupe i otvaranje dodatnih ponuda; dodatno hodanje ostaje isto i nakon slanja zahtjeva.
- `route-audit-browser.py`: prolazi cijeli tok stvarnog lokalnog API-ja: kreiranje vozačeve trase, pretraga njenog srednjeg dijela, zahtjev, poruke u oba smjera, prihvatanje/popup, potvrda dolaska i završetak.
- `passenger-discussion-browser.py`: prolazi pomjeranje ulaza na mapi, slanje, vozačev protuprijedlog i potvrda njegove tačne verzije.
- Nezavisan pregled našao je i zatvorio grešku parova sa istim položajem/vremenom; fokusirana ponovna provjera nema preostalih Important/Critical blokera.
- Provjere kalendara na telefonu/desktopu i obje help/privacy provjere na četiri jezika prolaze.
- Build i Wrangler dry-run uspješni. Browser koristi lokalnu bazu, sintetičke račune, kartu i putne servise; nema tvrdnje o terenski potvrđenoj sigurnosti stajanja ili saobraćaju.
- Ponovljen algoritamski sweep sadrži 39 scenarija u `2026-10-25-flexible-route-simulation.json`. Npr. hodanje 601 s uz izbor 10 min sada je `maybe`, a ±60 min pripada dodatnim ponudama.

Mobilna provjera otkrila je i da fiksna navigacija zaklanja donji red kalendara za 26.10. Otvoreni kalendar sada dobija sloj iznad navigacije samo dok je otvoren; browser provjera bira datum normalnim klikom, bez prisilnog klika.

Za ponavljanje: `npm test`, zatim `npm run build` i `USPUT_TEST_ASSETS_DIR="$PWD/dist" python tests/flexible-matching-browser.py` iz `app`; ostali browser scenariji koriste isti obrazac. `node tests/route-matching-audit.mjs /tmp/flexible-audit.json` ponavlja sweep.

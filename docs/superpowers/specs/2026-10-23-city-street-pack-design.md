# Prvi korak: mjerenje sarajevskog paketa ulica

Dogovor od 23.10.2026: lokalna pretraga ulica bez baze kućnih brojeva, Sarajevo kao početna proba, bez nove pretplate. Ovaj korak je istraživačka proba podataka i brzine, bez izmjena objavljene aplikacije, dogovora ili produkcijske baze.

## Pristupi i izbor

1. Cache odgovora Photon/Nominatim: najmanje promjena, ali nova pretraga i dalje zavisi od vanjskog servisa.
2. Vlastiti gradski paket iz OSM izvoda: početna priprema podataka, zatim lokalne sugestije bez API poziva. **Preporučeni i prihvaćeni smjer za ovu probu.**
3. Puni evropski geokoder: znatno veći obim podataka i održavanja; za ovu probu nepotreban.

## Šta mjerimo

- Javne nazive ulica, alternativne nazive, izvorne OSM way ID-eve i geometriju odvojenu po segmentima.
- Broj izvornih segmenata i različitih naziva; veličinu JSON-a i gzip paketa; vrijeme parsiranja i lokalne pretrage.
- Latinicu, unos bez dijakritike, početna slova i približne nazive; stabilnost na dugim i nepovezanim segmentima.
- Kućni brojevi, zgrade, osobe, privatni pinovi i korisnički dogovori ne ulaze u paket. Brojevi koji su dio stvarnog naziva ulice ostaju sačuvani.

Početni geografski okvir probe je `[18.20, 43.75, 18.55, 43.95]` (zapad, jug, istok, sjever). To je pravougaono sarajevsko testno područje koje uključuje Ilidžu i istočni dio aglomeracije, **nije službena administrativna granica Sarajeva**. Geometrija na rubu se odsijeca; odvojeni segmenti se ne povezuju izmišljenom pravom linijom. Izbor područja je tehnička polazna odluka ove probe.

Izvor: namjenski OSM izvod BBBike-a za Sarajevo, odnosno Geofabrik izvod BiH ako gradski izvod nije dostupan ili ne pokriva okvir. Ne koristimo masovne pretrage javnog geokodera. Uz paket idu izvor, datum izvoda kada je poznat, SHA-256, datum obrade, ODbL-1.0 i atribucija OpenStreetMap saradnicima. Puni izvod ne ide u Git.

## Granice

Približna geometrija služi pretrazi i orijentaciji; nije navigacijski graf niti dokaz mjesta gdje se smije stati. Ne spajamo istoimene ulice u jednu neprekinutu liniju. Prije korisničke integracije treba razriješiti njihove lokalne oznake i izbor dijela duge ulice. Naziv ne zamjenjuje potvrđeni pin.

Sintetički uzorak može dokazati ponašanje alata, ali ne dokazuje pokrivenost grada, stvarnu veličinu paketa ili brzinu na telefonu. Rezultati na računaru označavaju se odvojeno od mjerenja fizičkog telefona.

## Mrežni preduslov

Sadašnja mrežna pravila razvojnog okruženja dopuštaju projektni GitHub, Cloudflare API i testni Worker, ali blokiraju `download.bbbike.org`. Za legalno preuzimanje izvoda potreban je pristup `download.bbbike.org` i rezervnom `download.geofabrik.de`, uz zadržavanje postojećih odobrenih domena. Bez izvoda nema tvrdnje o izmjerenoj veličini sarajevskog paketa.

## Ishod koraka

Izvještaj s porijeklom podataka, granicom pokrivenosti, brojem ulica, veličinom i brzinom na testnom uređaju. Tek poslije stvarnog mjerenja slijedi poseban korak integracije u aplikaciju, uz vanjski fallback za grad bez lokalnog paketa. Hosting rutiranja i navigacija ostaju zasebni kasniji koraci.

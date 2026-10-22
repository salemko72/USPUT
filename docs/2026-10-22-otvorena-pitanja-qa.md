# USPUT — Q/A o servisima i otvorenim odlukama

Pregled od 22.10.2026. Odgovori razlikuju trenutni kod, već dogovoreni smjer i preporuke za raspravu. Novi GPS tok, pregovaranje i chat nisu uvedeni pisanjem ovog dokumenta. Detaljan status implementacije je u [brainstormingu](2026-10-21-meeting-proposals.md#provjereno-stanje--22102026).

Za svoje odgovore otvori [formular za dogovor](https://usput-pulse.salemko.workers.dev/forms/odluke.html). Nema unaprijed odabranih odgovora; može se popuniti djelimično. Nacrt ostaje u lokalnoj pohrani istog preglednika na istom uređaju dok se ne uklone podaci stranice. Dugme **Preuzmi odgovore (.txt)** priprema datoteku za slanje u razgovor; alternativno se tekst može prikazati i kopirati. Formular ne šalje odgovore serveru i ne mijenja postavke aplikacije.

## Karta, adrese i proračun ruta

### 1. Šta tačno dobijamo besplatno i gdje su limiti?

Koristimo odvojene usluge za prikaz karte, pronalaženje adrese i računanje puta. Positron određuje izgled podloge; njegova boja ne mijenja kvotu pretrage ili rutiranja.

| Usluga | Uloga u USPUT-u | Objavljeni limit i praktična granica |
| --- | --- | --- |
| **OpenFreeMap** | Vektorska podloga karte | Službeni projekt navodi da javna instanca nema limit pregleda ili zahtjeva, registraciju ni API ključ. Ne pruža pretragu adresa, proračun ruta ili navigaciju. Besplatan pristup nije ugovorena garancija dostupnosti. [Izvor](https://github.com/hyperknot/openfreemap#readme). |
| **Nominatim — javni OSMF server** | Eksplicitna rezervna pretraga adrese i približan naziv ulice uz pin | Apsolutni maksimum **1 zahtjev u sekundi za cijelu aplikaciju**, zbirno za sve korisnike. Autocomplete je zabranjen. Potrebni su prepoznatljiv User-Agent, atribucija i mogućnost promjene servisa; cache je preporučen, a za dopuštene manje masovne poslove obavezan. Dugotrajni/periodični masovni poslovi imaju dodatni limit **4 upita u minuti**. To nije režim za naše obične pojedinačne pretrage. [Pravila](https://operations.osmfoundation.org/policies/nominatim/), [službeni izvor teksta](https://github.com/openstreetmap/owg-website/blob/master/policies/nominatim.md). |
| **Photon — javni demo server** | Sugestije tokom tipkanja, približni nazivi i greške u unosu | Nema objavljene fiksne numeričke kvote u README-u. Dopušta razumno korištenje; intenzivno korištenje može biti usporeno ili blokirano. Izričito nema garancije dostupnosti i može se mijenjati bez najave. [Izvor](https://github.com/komoot/photon#demo-server). |
| **OSRM preko FOSSGIS-a** | Cestovne i pješačke rute | Objavljena pravila: najviše **1 zahtjev u sekundi**, bez intenzivne upotrebe i masovnog preuzimanja. Postoje dodatni uslovi o istovremenim vezama, atribuciji, kontaktu i komercijalnoj upotrebi. Upozorenje za `table`/`trip` navodi da se svaki element tabele računa kao zahtjev; jedan veliki HTTP poziv nije zaobilaženje kvote. [Sažetak pružaoca](https://github.com/fossgis-routing-server/ansible_openstreetmap.de/blob/master/roles/osrm/files/about.md), [upozorenje o kvoti](https://github.com/fossgis-routing-server/ansible_openstreetmap.de/blob/master/roles/osrm/files/429.html), [puna pravila](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/). |

Broj upita nije isto što i broj korisnika. Jedna putnička pretraga može tražiti više pješačkih ruta za više kandidata, a jedna mapa učitava više pločica. Nema univerzalne granice „besplatno do X korisnika“.

Ovo su pravila konkretnih javnih instanci. OpenStreetMap podaci i otvoreni OSRM/Photon/Nominatim softver mogu se koristiti uz njihove licence na vlastitoj infrastrukturi ili kod drugog pružaoca; tada vrijede uslovi tog hostinga. Nije riječ o jednoj zajedničkoj pretplati „za mape“.

### 2. Koje limite smo sami postavili u aplikaciji?

U trenutnom kodu Nominatim, Photon i proračuni ruta dijele jedan serverski red koji dopušta početak novog vanjskog upita približno svakih **1,1 sekundu**. Ako je uključen OpenRouteService ključ, razmak je **1,6 sekundi**. To je naša zaštita, a ne objavljena zajednička kvota tih kompanija. Učitavanje OpenFreeMap podloge ne prolazi kroz taj red.

Postoje i odvojeni limiti po korisniku, u prozoru od 15 minuta:

| Radnja | Trenutni interni limit |
| --- | --- |
| Sugestije ulica | 90 zahtjeva |
| Eksplicitna pretraga adrese i određivanje grada | 20 zahtjeva, zajednički budžet |
| Naziv ulice uz pin | 120 zahtjeva |
| Pregled/proračun vozačeve trase | 120 zahtjeva |
| Putnička pretraga s proračunom hodanja | 20 zahtjeva |

Ovi brojači obuhvataju zahtjeve našem API-ju i kada rezultat dođe iz cachea. Broj vanjskih poziva može biti manji zahvaljujući cacheu ili veći po jednoj pretrazi kada treba provjeriti više kandidata. Adrese i sugestije se pozitivno keširaju do 30 dana, rute do sedam dana; neuspjeli vanjski pozivi obično jednu minutu. Sugestije čekaju pauzu od 650 ms u tipkanju, a izmjene trase 400 ms prije automatskog proračuna.

**Preporuka:** za rast razdvojiti redove prema stvarnom pružaocu, uz poštivanje njegovih pravila. Time se sprječava da naziv ulice nepotrebno usporava proračun hodanja. Samo povećavanje broja dozvoljenih upita ne stvara dodatni kapacitet javnog servisa.

### 3. Zašto to postaje problem baš ujutro?

Ljudi će tražiti vožnju u isto vrijeme. Ako deset istovremenih pretraga traži po četiri nove, nekeširane rute, to je 40 vanjskih upita. Uz naš razmak od 1,1 sekundu treba približno 44 sekunde samo za raspoređivanje takvog opterećenja, prije dodatnog čekanja na mrežu. Ovo je ilustracija, ne izmjeren kapacitet niti tvrdnja da svaka pretraga pravi četiri upita.

Trenutna putnička pretraga ima ukupni budžet od približno 18 sekundi za rutiranje. Zato bi dio takvih zahtjeva završio s nepotpunim proračunom ranije. Cache pomaže ponovljenim rutama, ali nove lokacije i istovremene izmjene pinova ostaju opterećenje. Postojeći kod bilježi posljednje stanje servisa; još nemamo mjerenje koje dokazuje kapacitet jutarnje špice.

**Preporuka:** mjeriti trajanje pretrage, udio pogotka u cacheu, broj vanjskih upita, HTTP 429 i neuspjele proračune. Test opterećenja raditi na kontrolisanom servisu ili uz dogovor s pružaocem, bez bombardovanja javnih demo servera.

### 4. Smijemo li ove javne servise koristiti kada aplikacija poraste ili počne zarađivati?

Za svaki servis važe druga pravila. FOSSGIS-ova objavljena puna pravila posebno ograničavaju komercijalno korištenje na ponude u kojima servis nije bitan dio proizvoda, te isključuju stranice s velikim prometom. Rutiranje je USPUT-u važna funkcija; poštivanje jednog upita u sekundi samo po sebi ne rješava taj uslov. [Službeni izvor pravila](https://github.com/fossgis-routing-server/fossgis-webseite/blob/master/content/arbeitsgruppen/osm-server/nutzungsbedingungen.md).

**Preporuka:** javne demo instance tretirati kao zavisnost razvojne bete s probnim/javnim lokacijama. Za širu upotrebu izabrati ugovoren servis ili vlastiti regionalni engine, s provjerenim uslovima za naš model. To ne zahtijeva promjenu Positron izgleda. Otvorena odluka je budžet i očekivani obim, a ne obećanje da je javni demo trajno raspoloživ.

### 5. Imamo li rezervni servis i koliko bi prelazak koštao?

Kod podržava OpenRouteService za cestovne i pješačke putanje kada postoji odgovarajući tajni ključ. Provjerom postavki objavljenog USPUT Workera 22.10.2026. potvrđeni su OSRM/FOSSGIS endpointi i odsustvo tog ključa: **trenutno je odabran OSRM/FOSSGIS**. To je provjera konfiguracije, a ne mjerenje dostupnosti ili brzine servisa.

Izbor konfiguracijom **nije automatski prelazak na drugi servis kada prvi padne**. OpenRouteService besplatne i plaćene kvote treba pročitati u važećem planu konkretnog računa; ovdje ih ne navodimo kao provjerene. [Postojeće upute](../app/ROUTING-SETUP.md).

Trenutno nema odabranog plaćenog paketa ni proračuna potrošnje. Cijena zavisi od broja pretraga, kandidata, proračuna hodanja, izmjena trase i udjela ponovljenih upita. Vlastiti engine uklanja tuđu kvotu po pozivu, ali traži server, ažuriranje podataka i održavanje.

**Preporuka:** zadržati OpenFreeMap dok zadovoljava potrebe; prvo planirati pouzdanu pretragu adresa i rutiranje. Nakon mjerenja uporediti cijenu servisa i regionalnog hostinga. Potrebni su mjesečni budžet, alarm potrošnje i ponašanje pri dostizanju limita. Zamjenski pružalac mora biti dozvoljen njegovim uslovima; rotiranje javnih servera radi zaobilaženja kvota nije rješenje.

### 6. Znači li „imamo rutu na mapi“ da imamo navigaciju?

Trenutno imamo prikaz trase, procjene vremena i proračun hodanja do odobrenih tačaka. Nemamo vlastitu navigaciju skretanje po skretanje, saobraćaj uživo ili neprekidan rad GPS-a u pozadini. OSRM procjena nije obećano vrijeme dolaska u jutarnjoj gužvi. Plaćeni servis također treba provjeriti za konkretne funkcije; naziv „navigation API“ ne garantuje da su sve uključene.

**Preporuka:** USPUT prvo vodi dogovor o susretu. Za navigaciju možemo ponuditi otvaranje vanjske aplikacije, uz provjeru da podržava dogovorene tačke i njihov redoslijed. Trasa koju vanjska navigacija promijeni ne smije prešutno promijeniti dogovor putnika i vozača.

### 7. Šta ako nema adrese, podloge ili pouzdanog proračuna?

Nepronađena ulica, nedostupan server i stvarno neprohodna ruta tri su različita ishoda. Ako Photon nema rezultat, eksplicitna pretraga može koristiti Nominatim; ručni pin ostaje alternativa kada je karta učitana. Ako nema pouzdane cestovne/pješačke trase, aplikacija ne treba prikazati pretpostavku kao provjereno podudaranje. Bez učitane podloge ne potvrđujemo naslijepo nov ručni pin.

**Preporuka:** dovršiti tri grupe rezultata iz brainstorminga. Postojeći dogovor ostaje vidljiv uz posljednji potvrđeni pin i vrijeme; nova procjena ne prepisuje dogovor. Izostanak servisa prikazati konkretnom porukom i dozvoliti ponovni pokušaj. Puni offline tok dogovora trenutno nije implementiran.

## Tačke, vrijeme i dogovor

### 8. Može li se tačnost adrese potpuno riješiti boljim API-jem?

Drugi servis može poboljšati pokrivenost, ali naziv ulice bez broja često predstavlja dugu ulicu, a geokoder može vratiti njen približan centar. Apple autofill i stari/alternativni nazivi također daju različite zapise. Zato je potvrđeni pin važniji od tekstualnog naziva. Prikaz ulice uz pin je približan i ne dokazuje kućni broj.

**Već dogovoreno:** fleksibilne sugestije u odabranom gradu, latinica u prikazu geokodera, prihvatanje oba redoslijeda grada i ulice i ručna potvrda pina. Naziv mjesta susreta nije obavezan. **Preporuka:** pratiti stvarne neuspjele pretrage bez prikupljanja suvišnih privatnih adresa, pa ciljano popravljati pokrivenost i sinonime.

### 9. Da li 500 metara oko trase garantuje dobru vožnju?

Krug ili koridor je početni filter. Rijeka, ograda, nadvožnjak i pogrešna strana ceste mogu onemogućiti susret i na maloj udaljenosti. Redoslijed ulaska i izlaska i smjer vozača moraju odgovarati stvarnoj trasi. Putnikovo hodanje 5/10/15 minuta vrijedi provjeriti pješačkim putem na oba kraja, a ne samo vazdušnom udaljenošću.

Trenutni glavni tok provjerava već ponuđene vozačeve tačke; ne prihvata bilo koji novi putnikov pin duž cijele trase. **Preporuka:** za prvu verziju pregovaranja dopustiti nove prijedloge uz postojeću trasu, uz provjeru pristupa i potvrdu vozača. Složenija skretanja uvoditi kada možemo pokazati posljedice svim već prihvaćenim putnicima.

### 10. Ko odlučuje gdje je dozvoljeno i praktično stati?

Mapa i popularnost tačke nisu potvrda da se na njoj smije stati. Algoritam može predložiti mjesto; vozač mora moći pomjeriti pin i potvrditi prilaz/stranu. Prolazni pin koji samo skreće trasu treba odvojiti od mjesta gdje se prima putnik.

**Već dogovoreno:** korisnik ne popunjava gradski katalog kao uslov vožnje. **Preporuka:** zadržati minimalni tok „predloži → pogledaj pin → potvrdi“, a dodatne opise i katalog ponuditi tek kada trebaju.

### 11. Šta kada vozač pomjeri putnikov prijedlog?

To je novi prijedlog koji putnik mora prihvatiti. Obje strane trebaju vidjeti isti pin, vrijeme, prilaz i verziju dogovora. Poruka „može kod Alte“ sama ne mijenja pin niti rezervaciju. Ako izmjena utiče na već dogovorene putnike, treba pokazati promjenu i njima.

**Preporuka:** prvo dovršiti prijedlog/protuprijedlog i obostranu potvrdu; zatim kratak razgovor vezan za zahtjev. Do tada trenutni izbor postojećih vozačevih tačaka ostaje granica proizvoda. Taj novi tok još nije implementiran.

### 12. Koliko kašnjenja prihvatamo i šta tačno znači vrijeme pretrage?

Treba razlikovati polazak vozača, vrijeme susreta i putnikov rok dolaska na cilj. U sadašnjem proračunu glavni filter dopušta susret unutar približno **±60 minuta** od traženog vremena. Ranija ideja „Odgovara — do 15 minuta poslije“ još nije to pravilo u kodu, niti je razjašnjeno da li se odnosi na susret ili dolazak na posao.

**Preporuka za odluku:** osnovno vrijeme nazvati „Željeno vrijeme susreta“, a krajnji rok dolaska na posao ponuditi kao dodatni uslov. Putnik bira koliko može ranije/kasnije; oznaka „Odgovara“ poštuje taj izbor, a „Možda ti odgovara“ navodi konkretno odstupanje. Posebno treba dogovoriti koliko vozač čeka putnika na dan vožnje. Poređenje dana uvijek ostaje u lokalnoj vremenskoj zoni vožnje.

### 13. Mogu li više putnika i otkazivanje pokvariti ostale dogovore?

Objava već dopušta 1–7 putničkih mjesta i pojedinačna prihvatanja uz provjeru kapaciteta. Novi prijedlog ne smije rezervisati mjesto bez roka niti promijeniti trasu drugih putnika bez potvrde. Otkazivanje jednog putnika ne znači otkazivanje cijele vožnje; izlazak jednog ne znači završetak za sve.

**Preporuka:** u prvoj verziji rezervisati mjesto za prihvaćeni ulazak/izlazak, bez složene ponovne prodaje istog sjedišta kasnije na istoj trasi. Za vozačevo otkazivanje ili nedolazak treba jasno obavijestiti pogođene putnike i ponuditi ponovnu pretragu. Pravilo čekanja i postupak kod nedolaska ostaju otvorene odluke, uz mogućnost osporavanja; izostanak GPS-a nije dokaz nedolaska.

### 14. Trebamo li mali chat?

Kratki razgovor pomaže kod prilaza i prepoznavanja. Otvara i pitanja neželjenog kontakta, prijave i čuvanja poruka. Cijeli društveni chat nije potreban za dogovor o vožnji.

**Preporuka:** brzi odgovori i kratka poruka samo uz konkretan zahtjev, s prijavom problema i blokiranjem budućeg kontakta. Promjena dogovora i dalje ide kroz potvrdu pina. Sadržaj poruke ne prikazivati na zaključanom ekranu. Odrediti rok čuvanja i postupak kada već postoji aktivan dogovor, a jedan učesnik blokira drugog. Chat i taj postupak još ne postoje.

## GPS, podaci i pouzdanost

### 15. Mogu li vozač i putnik vidjeti lokaciju jedno drugoga samo tokom usluge?

**Da, to je novi dogovoreni smjer brainstorminga. Još nije implementiran.** Dijeljenje uključuje svako za sebe, uz dozvolu uređaja. Dostupno je samo učesnicima prihvaćenog dogovora, neposredno oko susreta i tokom aktivne usluge. Svako može prekinuti. Završetak, otkazivanje ili istek ukidaju serverski pristup; vožnja prihvaćena za sutra ne otkriva današnju lokaciju. Putnik ne vidi lokacije drugih putnika.

**Otvorene tehničke odluke:** početak i maksimalno trajanje prozora, učestalost slanja i granica nakon koje se pozicija označava zastarjelom. Početna preporuka je slati uzastopne GPS pozicije kroz naš privatni kanal, uz vrijeme i preciznost, bez historije kretanja. Za svako osvježenje tačke na karti ne treba ponovo zvati geokoder ili računati cijelu rutu. GPS razmjena ima vlastite troškove i limite, odvojene od OpenFreeMap podloge.

### 16. Hoće li GPS i obavijesti raditi kada je telefon zaključan ili aplikacija zatvorena?

Web Push može stići bez otvorenog prozora na podržanim uređajima; na iPhoneu postoje uslovi verzije sistema i instalacije na početni ekran. To ne daje web aplikaciji neprekidan GPS u pozadini. Preglednik ili sistem mogu pauzirati lokaciju, ograničiti rad i odgoditi obavijest. Trenutni server čak isključuje browser geolokaciju kroz `Permissions-Policy`; uvođenje dijeljenja zahtijeva svjesnu promjenu i stvarno testiranje telefona.

**Preporuka:** pokazivati posljednje osvježenje, dozvoliti običan susret preko pina i „Na mjestu sam“ i provjeravati stvarno stanje dogovora nakon otvaranja. Ako trajni rad GPS-a u pozadini postane nužan uslov, zasebno procijeniti nativnu aplikaciju, dozvole i bateriju. Ne obećavati taj rad na osnovu testa u desktop pregledniku.

### 17. Može li GPS ili Bluetooth automatski dokazati da su se našli?

Blizina dva telefona ne znači da su osobe u istom autu. GPS može odstupati, Bluetooth ima ograničenu podršku, a signal može nedostajati. Potvrda „Na mjestu sam“ je korisnikova izjava.

**Preporuka:** ručna potvrda susreta i završetka; po potrebi jednokratni kod kao pomoć protiv zamjene osoba. Automatska blizina služi kao signal za prijedlog radnje, bez automatskog završavanja vožnje ili kažnjavanja korisnika.

### 18. Smijemo li privatne lokacije slati besplatnim geokoderima i čuvati ih neograničeno?

Lokacije mogu otkriti dom, posao i svakodnevnu rutinu i kada uz njih nema imena. Nominatimova javna pravila izričito traže da se ne šalju lični ili povjerljivi podaci. Samo uklanjanje emaila nije dovoljan zaključak da je bilo koja privatna adresa pogodna za slanje javnom servisu. Periodično obrnuto geokodiranje svakog GPS koraka nije plan za ovaj servis.

**Preporuka:** razvojnu probu držati na probnim i javnim lokacijama. Za stvarnu upotrebu privatnih polaznih tačaka odabrati obradu i pružaoca čiji uslovi to pokrivaju, uz jasno objašnjenje korisniku. Odrediti rokove čuvanja i brisanje računa, povezanih podataka i kopija. Trenutno postoji 30-dnevna sesija; to nije rok brisanja računa ili lokacija. Detalji otvorenih stavki su u [privatnosti](PRIVATNOST.md).

### 19. Može li baza sama učiti gradske tačke bez komplikovanja korisniku?

**Već dogovoreno:** može se razvijati u pozadini iz uspješnih susreta, bez obaveznog naziva i uređivanja kataloga za svakog korisnika. „Alta“ i „kod Alte“ mogu biti isti kandidat, ali suprotne strane ceste ili ulazi ne moraju biti isto mjesto.

**Preporuka:** grupisati po geolokaciji, prilazu i smjeru, uz naziv kao dodatni signal. Uvažavati nezavisne stvarne dogovore i svježinu; demo podaci ne grade reputaciju. Privatni pin i sirovi GPS trag ne postaju automatski javna tačka. Postoje katalog i ručno spajanje; automatsko grupisanje i objavljivanje pouzdanih kandidata tek treba razviti. Javna objava treba provjeru da je mjesto javno i prikladno, čak i kada je često korišteno.

### 20. Jesu li fotografija, Google račun i zvjezdice dovoljni za povjerenje?

Fotografija auta pomaže prepoznavanju, a profilna susretu. Ne dokazuju identitet, vlasništvo vozila ili vozačku dozvolu. Google prijava također nije takva provjera. Ocjene osoba još ne postoje; sadašnje povratne informacije odnose se na gradske tačke.

**Preporuka:** tačno navesti šta je provjereno, uvesti prijavu problema i podršku prije stvarne probe. Recenzije vezati za završenu stvarnu vožnju, odvojiti ih od ocjene tačke i omogućiti osporavanje zloupotrebe. Kod dijeljenja troškova unaprijed razjasniti očekivanje i iznos; prije naplate ili šire stvarne usluge provjeriti lokalna pravila i osiguranje. Aplikacija trenutno nema naplatu.

### 21. Kako spriječiti da aplikacija postane prekomplikovana?

Osnovni put treba ostati kratak: putnik izabere rutu/vrijeme i hodanje, vidi razumljive ponude, dogovori pin i dobije potvrdu. Vozač potvrdi stvarnu trasu, mjesta i kapacitet. Katalog, naziv tačke, napomene i tehničke postavke ne trebaju biti obavezni koraci.

**Preporuka:** nove funkcije provjeravati na maloj grupi stvarnih korisnika kada se otvori dogovorena proba, uz praćenje gdje odustaju i koliko traje dogovor. Prije širenja potvrditi tok na fizičkim iPhone/Android uređajima, ponašanje pri gubitku mreže i dostupnost ponuda u odabranom gradu. Prazna ponuda i kvar pretrage moraju imati različite poruke.

## Odluke koje prvo trebamo donijeti

1. Očekivani broj istovremenih jutarnjih pretraga i mjesečni budžet za adrese/rute; prema tome izbor pružaoca ili vlastitog regionalnog enginea.
2. Značenje traženog vremena, dozvoljeno ranije/kasnije i koliko se čeka kod susreta.
3. Prva verzija pregovaranja: novi pin uz postojeću trasu, obostrana potvrda i kratak razgovor uz zahtjev.
4. Vremenski prozor dobrovoljnog dijeljenja geopozicije i šta korisnik vidi kada ažuriranja prestanu.
5. Podrška, prijava problema i rokovi čuvanja/brisanja prije stvarne probe.

## Osnova i granice ove provjere

Pregledan je trenutni kod grane `feat/pulse-app`, polazni commit `a11862a`: [izbor servisa i cache](../app/server/route-provider.mjs), [API limiti i budžet pretrage](../app/server/api.mjs), [sugestije](../app/server/street-suggestions.mjs), [eksplicitna pretraga](../app/server/geocoding.mjs), [nazivi uz pin](../app/server/meeting-address.mjs), [spajanje preko mjesta susreta](../app/server/meeting-stops.mjs), [geolokacijska politika](../app/server/worker.mjs) i [konfiguracija](../app/wrangler.jsonc). Stari modul matrice `routing.mjs` ostaje u repozitoriju i testovima, ali ga trenutni API ne poziva; ne pripisujemo mu promet aktivne pretrage.

Pravila su čitana iz službenih projektnih repozitorija. Izvor FOSSGIS sažetka/429 poruke je commit `7a9da28`, a izvor punih pravila njihovog web-repozitorija `fda997a`; prije ugovaranja stvarne upotrebe treba potvrditi da javno objavljene pune stranice još odgovaraju tim izvorima. Direktno učitavanje dijela javnih domena blokira mrežna politika ovog razvojnog okruženja. To nije dokaz da su servisi nedostupni korisnicima aplikacije. Nije proveden test opterećenja, mjerenje stvarnog SLA-a, provjera računa plaćenih pružalaca ili pravna revizija.

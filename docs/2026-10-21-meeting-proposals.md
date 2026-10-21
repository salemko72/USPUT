# USPUT: prijedlog jednostavnijeg dogovora o susretu

Ovo je razrađen prijedlog za sljedeću iteraciju, a ne tvrdnja da su chat, dijeljenje GPS-a i pregovaranje već implementirani. Trenutna aplikacija povezuje vožnju s mjestima susreta koja je vozač odobrio, uz proračun hodanja putnika.

Usaglašeni smjer: gradska baza i učenje tačaka rade u pozadini. Običan korisnik bira gdje će se naći, bez obaveznog imenovanja tačke, popunjavanja gradskog kataloga ili ocjenjivanja svake lokacije. Detaljan unos ostaje opcija. Sljedeći odjeljci opisuju cilj naredne iteracije; ovo pojednostavljenje još zahtijeva promjene ugovaranja vožnje i algoritma.

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

# Lokacije i susreti u USPUT-u — razrada

Cilj korisnika: regija i svi gradovi, bez vezivanja proizvoda za sarajevska naselja. Sarajevo s deset javnih mjesta ostaje ograničenje trenutne bete, ne dugoročni podatkovni model. Mjesta nose koordinate, grad i zemlju; ID i naziv naselja nisu osnova cestovnog algoritma.

Potvrđeno: putnik pri svakoj pretrazi bira 5 / 10 / 15 minuta hodanja. Ne uvoditi skriveni podrazumijevani izbor. Lokacija uređaja isključivo na korisnikov klik i dozvolu; alternativa je ručni pin/adresa. Ne pratiti u pozadini i ne otkrivati početni pin javno.

Preporuka toka: moja lokacija ili ručni pin → željeno odredište → izbor hodanja → prijedlozi vožnji s mjestom ulaska i izlaska. Vozač zada početak/cilj/vrijeme, opcionalno vlastitu stvarnu trasu; cestovni engine računa njegov koridor. Algoritam traži javna mjesta uz koridor, provjerava pješački put od putnika i stvarno dodatno vrijeme vozača. Najbliži pin zračnom linijom nije dovoljan zbog rijeka, ograda i brzih cesta. Prikazati hodanje, procijenjen dolazak vozača i dodatne minute; jasno odvojiti od gužve uživo.

Opcije:
1. Samo ručna mjesta: najmanje vanjskih zavisnosti, nepraktično za regiju i slabije pronalaženje usputnih susreta.
2. Preporučeno: dobrovoljna trenutna lokacija/ručni pin + provjeren katalog mjesta za zaustavljanje + pješačko i cestovno rutiranje. Kontrolisan prijedlog, lakša privatnost.
3. Bilo koji presjek rute i radijusa hodanja: najveća pokrivenost, ali može predlagati nedozvoljena/nepristupačna mjesta i zahtijeva znatno više verifikacije podataka.

Predloženo mjesto nije obećanje sigurnog/zakonitog stajanja. Mjesta ne birati automatski na kolovozu ili tramvajskoj stanici samo zbog blizine. Obje osobe moraju prihvatiti isti javni pin; kod odbijenog GPS-a zadržati ručni izbor. Trajne početne lokacije/kućne adrese nisu potrebne za ovu fazu.

Za buduću implementaciju još treba odabrati pokrivenost i uslove geokodiranja, izvora mjesta za stajanje i pješačkog enginea. OSRM driving matrica deset mjesta trenutne bete ne računa pješačke puteve; broj 5/10/15 ne predstavljati kao aktivan filter dok takav proračun nije povezan.

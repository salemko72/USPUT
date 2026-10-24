# USPUT — privatnost u razvojnoj beta verziji

Ovaj tekst opisuje trenutni kod razvojne bete, provjeren 22.10.2026. Stvarna proba vožnji još nije otvorena. Aplikacija je za punoljetne osobe; koristi probne podatke i lokacije. Isti sažeti sadržaj dostupan je pri registraciji i u **Profil → Privatnost i beta pravila**, na četiri jezika.

## Račun i sesija

Cloudflare D1 baza čuva ime, grad, email, podatke vozila, ponude i njihove trase i mjesta susreta, zahtjeve, dogovore, sačuvane pretrage, obavijesti i povratne informacije za gradska mjesta. Čuva i tehničke zapise potrebne za prijavu, ograničavanje zahtjeva i privremene proračune.

Za email prijavu lozinka je hashirana s nasumičnom solju pomoću PBKDF2-SHA256; ne čuva se kao čitljiv tekst. Sesijski kolačić je HttpOnly, SameSite=Lax i Secure na HTTPS-u. Sesija ističe nakon **30 dana**; odjava uklanja trenutnu sesiju. Taj rok nije rok čuvanja računa, ponuda ili dogovora.

Ako odabereš Google prijavu, aplikacija koristi Googleov identifikator računa, potvrđeni email i ime iz profila. To nije provjera identiteta za organizaciju vožnji. Obična email registracija trenutno nema potvrđivanje emaila. Jezik aplikacije pamti se u lokalnoj pohrani preglednika.

Izvori: `app/server/api.mjs` (`newSession`, Google prijava i registracija), `app/server/schema.sql`, `app/src/i18n.ts`.

## Ko vidi šta

Email nije prikazan saputnicima. Prijavljeni korisnici mogu vidjeti ime vozača i objavljenu ponudu: trasu, mjesta susreta, vrijeme, vozilo, slobodna mjesta, izbor dijeljenja troškova i napomenu. Zahtjeve i dogovore vide njihovi učesnici.

Sačuvane pretrage i putnikovi početni i završni pinovi su privatni. Saputnik dobija dogovorene tačke ulaska i izlaska koje je vozač odobrio i procjene dogovora. Imenovano javno mjesto šalje se gradskoj bazi samo uz odabir dijeljenja, a urednik odlučuje o aktivaciji. Povratne informacije za korištena mjesta iz kataloga dostupne su nakon završene vožnje; ne predstavljaju ocjene osoba.

Izvori: `app/server/api.mjs` (`rideView`, `/my-rides`), `app/server/meeting-stops.mjs` (`matchMeetingStops`), `app/server/saved-searches.mjs`, `app/server/meeting-catalog.mjs`.

## Opcionalne fotografije

Fotografije su privatne i opcionalne. Preglednik priprema malu WebP kopiju i uklanja originalne GPS, EXIF, XMP i ostale dodatne metapodatke. Server dodatno provjerava sadržaj, veličinu i dimenzije. Izvorna fotografija se ne šalje.

Profilna slika je do 320 × 320 piksela i 50 KiB; fotografija auta do 960 piksela po većoj strani i 150 KiB. Kopije su u privatnom Cloudflare R2 skladištu s EU jurisdikcijom; D1 čuva njihove metapodatke i pravila pristupa. To ne znači da je svim ostalim podacima ili vanjskim servisima ugovoreno čuvanje samo u EU.

Vlasnik vidi svoju sliku u Profilu. Fotografija auta prikazuje se prijavljenim korisnicima uz aktivnu buduću ponudu, prije prihvatanja. Saputnik fotografiji osobe dobija pristup tek nakon potvrde aktivnog dogovora, najduže do 24 sata nakon polaska. Otkazivanje ili završetak ukida pristup preko tog dogovora. Zamjena ili uklanjanje slike opoziva stari pristup i pokreće uklanjanje stare kopije iz skladišta; čišćenje se ponavlja ako prvi pokušaj ne uspije. Već preuzetu kopiju ili snimak ekrana nije moguće povući. Fotografije nisu provjera identiteta ili vlasništva vozila.

Izvori: `app/src/photo-client.ts`, `app/server/photos.mjs`, `app/wrangler.jsonc` (`PHOTOS`, `jurisdiction: "eu"`).

## Ulice, rute i karta

Za pretragu ulica, određivanje grada i naziva uz pin server šalje servisima **Photon** i **Nominatim** tekst pretrage, grad ili potrebne koordinate, zavisno od upita. Pronalaženje najbliže ulice uz odabrani pin koristi koordinate tog pina. Servisu **OSRM** šalju se koordinate cestovnih i pješačkih ruta bez korisnikovog imena ili emaila. Upiti i rezultati mogu privremeno ostati u serverskom cacheu; to uključuje lokacijske podatke potrebne za proračun.

Karta koristi **OpenFreeMap** vektorske pločice i fontove. Preglednik ih učitava direktno, pa taj servis prima korisnikovu IP adresu i uobičajene mrežne podatke. OpenStreetMap je izvor geografskih podataka; to nije tvrdnja da se trenutna podloga učitava s rasterskog `tile.openstreetmap.org` servisa. Dostupnost i tačnost vanjskih servisa nisu zagarantovane.

Izvori: `app/server/geocoding.mjs`, `app/server/street-suggestions.mjs`, `app/server/meeting-address.mjs`, `app/server/route-provider.mjs`, `app/server/meeting-stops.mjs`, `app/src/MeetingPointLabel.tsx`, `app/src/map-style.ts`, `app/public/maps/usput-positron.json`, `app/wrangler.jsonc`.

## Dobrovoljne push obavijesti

Obavijesti u aplikaciji dostupne su bez dozvole za push. Push se uključuje zasebno za uređaj u Profilu. D1 čuva adresu pretplate, tehničke ključeve, jezik, vezu s računom/sesijom i stanje dostave.

Šifrovana obavijest o prihvatanju prolazi kroz push servis preglednika ili uređaja. Njen tekst ne sadrži imena, privatne adrese ni pinove; otvaranje vodi u aplikaciju koja ponovo provjerava pristup dogovoru. Push možeš isključiti u Profilu. Odjava uklanja pretplate vezane za tu sesiju. Prihvatanje dozvole ne garantuje dostavu na svakom uređaju.

Izvori: `app/src/Notifications.tsx`, `app/server/notifications.mjs`, `app/server/web-push.mjs`, `app/public/sw.js`.

## Uklanjanje i granice bete

Svoje fotografije i sačuvane pretrage uklanjaš u aplikaciji. Za uklanjanje probnog računa obrati se administratoru projekta; samostalno brisanje računa trenutno nije dostupno u korisničkom interfejsu. Ne navodimo izmišljeni endpoint, pravni kontakt ili garantovani rok brisanja.

Trenutna aplikacija nema stalno GPS praćenje, Bluetooth potvrđivanje susreta, privatni chat, naplatu u aplikaciji ni provjeru identiteta. Ručno **Na mjestu sam** mijenja stanje dogovora; nije dokaz fizičke blizine. Aktivna web aplikacija koristi serverske probne račune; nije lokalni demo čiji svi podaci ostaju samo u pregledniku.

## Otvorena pitanja prije stvarne probe

Ovo je tehnički opis bete, a ne dovršena pravna politika. Prije stvarne probe treba utvrditi i objaviti:

- ko je odgovorna osoba ili pravni subjekt koji upravlja podacima i kako ga kontaktirati;
- svrhe i pravne osnove obrade, prava korisnika i postupak zahtjeva;
- rokove čuvanja računa, lokacija, ponuda, dogovora, povratnih informacija, obavijesti, tehničkih zapisa i sigurnosnih kopija;
- potpun postupak i rokove brisanja, uključujući povezana skladišta i sigurnosne kopije;
- uslove vanjskih pružalaca, lokacije obrade i eventualne prenose podataka;
- završna beta pravila, podršku i uslove otvaranja stvarne probe.

Ovaj dokument ne tvrdi da su ta pitanja već riješena ili da je provedena pravna provjera usklađenosti.

## Prijave nedolaska
Učesnik potvrđenog dogovora može prijaviti nedolazak druge osobe od 10 minuta do 24 sata nakon susreta. Čuvaju se dogovor, identitet prijavitelja, prijavljena uloga i vrijeme prijave, dostupno učesnicima tog dogovora. To je navod učesnika, bez automatskog bodovanja ili kazne; obje strane mogu prijaviti svoju verziju. Trenutno nema automatskog roka brisanja ovih zapisa, niti javnog prikaza prijava.

## Poruke i prijedlozi susreta
D1 čuva tekst poruka, pošiljaoca, vrijeme, trenutnu verziju predloženog mjesta i privatne ulazne podatke potrebne za ponovni pješački obračun. Samo vozač i putnik tog zahtjeva mogu čitati poruke i prijedloge; izvorne privatne adrese nisu prikazane drugoj strani. Poruka nije saglasnost za pin. Trenutno nema automatskog brisanja poruka niti samostalnog brisanja razgovora. Otkazivanje zatvara slanje; čitanje vlastite historije ostaje dostupno. Predloženi pinovi ne ulaze automatski u javni gradski katalog.

## Dobrovoljna lokacija tokom dogovora
Izbor automatskog GPS-a je dobrovoljan pri registraciji ili na vrhu profila i pamti se na računu (`gps_auto`, početno bez pristanka). GPS preporučujemo radi lakšeg susreta, bez unaprijed označenog pristanka. Mjerenje pri davanju dozvole ne šalje se serveru. Isključivanje u profilu atomski ukida sva postojeća dijeljenja i sprečava kasna automatska uključivanja. Svako posebno dozvoljava GPS samo svom vozaču/putniku konkretnog prihvaćenog dogovora od pet minuta prije `pickupAt` do završetka ili otkazivanja, najduže šest sati. Putnici ne vide jedni druge. Prihvatanje za sutra ne otkriva današnju lokaciju. Za svako uključivanje koristi se novi token koji sprečava zakašnjela slanja prethodne sesije. Odjava ukida korisnikova aktivna dijeljenja.

U D1 se čuva samo posljednja lokacija, preciznost, vrijeme mjerenja i prijema, uz kratku dozvolu dijeljenja. Nema historije kretanja, lokalnog trajnog pohranjivanja GPS-a, gradske baze ili obračuna rute pri GPS promjeni. Dozvola ističe nakon 60 sekundi bez obnove, fix nakon 90 sekundi, a minutno čišćenje uklanja istekle zapise. Završetak/otkazivanje odmah ukida API pristup i pokreće uklanjanje. Opoziv na lošoj mreži može čekati istek dozvole; prethodno primljenu kopiju nije moguće povući.

Prikupljanje se zaustavlja kada aplikacija ode u pozadinu ili se zatvori. Web GPS, posebno Safari, ne garantuje rad u pozadini; po povratku se nastavlja ako je korisnik izabrao automatsko dijeljenje u profilu, dozvola preglednika još vrijedi i dogovor je unutar svog perioda. GPS nije potvrda susreta, identiteta ili dozvoljenog zaustavljanja.

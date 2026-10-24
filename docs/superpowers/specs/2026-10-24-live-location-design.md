# Dobrovoljna lokacija tokom dogovora

Korisnik je odobrio implementaciju dogovorenog GPS toka: svaki učesnik zasebno uključuje svoju lokaciju od pet minuta prije stvarnog `match.pickupAt` do završetka ili otkazivanja vlastitog dogovora. Prihvatanje za sutra ne otkriva današnji GPS. Razrada prati odobreni brainstorming; nema novog kruga potvrđivanja.

Pristup je samo između vozača i putnika konkretnog prihvaćenog/spremnog dogovora, bez prisile da druga strana dijeli svoju lokaciju. Vozač može dijeliti s više putnika zasebno; putnici ne vide jedni druge. Originalni dogovoreni pin ostaje nezavisan od lokacija.

Odabrano: Browser Geolocation + vlastiti API/D1, bez plaćenih servisa, rutiranja ili geokodiranja pri GPS osvježavanju. Ne uvodimo native aplikaciju niti obećavamo rad zatvorene web aplikacije. Globalni React provider održava jednu GPS pretplatu tokom navigacije, šalje najviše jednom u 15 sekundi po aktivnom dogovoru i prikazuje prekid dijeljenja na svim ekranima.

Čuva se samo posljednji fix, bez historije i bez lokalnog trajnog spremanja. Prikaz do 30 sekundi je svjež; 30–90 sekundi je jasno označen starijim. Iznad 90 sekundi nema pina. Sesija dijeljenja ima 60 sekundi obnovljivog trajanja; promjena kartice u pozadinu prekida prikupljanje i šalje opoziv koliko mreža dozvoli. Završetak/otkazivanje odmah ukidaju čitanje i pisanje na serveru; redovno čišćenje uklanja preostale redove. Failsafe: najviše šest sati od susreta ako niko ne završi dogovor. To je implementacijska zaštita, ne odluka o automatskom završetku vožnje.

Svako uključivanje dobija novi token. Slanje i automatsko gašenje moraju odgovarati tokenu kako kasni zahtjev prethodne sesije ne bi vratio dijeljenje ili ugasio novu sesiju. GPS bilježi preciznost, vrijeme mjerenja i vrijeme prijema na serveru; odbija stare, buduće, neispravne i prevelike vrijednosti. Backend radi vremenske i učesničke provjere pri svakom zahtjevu i unutar SQL mutacije.

UI koristi postojeću kartu u detaljima, uz različite boje, preciznost i starost. GPS sloj ne mijenja rutu niti resetuje zum pri svakom fixu. Dugme približava aktivne lokacije na zahtjev. Četiri jezika; upute i privatnost opisuju stvarne granice web GPS-a.

Asinhroni pokušaji uključivanja imaju zaseban identitet; zastarjeli odgovori ne instaliraju niti gase novu GPS pretplatu. Server pri uključivanju uspoređuje očekivani prethodni token, tako da kasni stari zahtjev ne može zamijeniti novu sesiju. Samo trenutni pokušaj može jednom obnoviti stanje i ponoviti sukobljeno uključivanje.

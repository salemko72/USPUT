# Dobrovoljni GPS u profilu i simboli učesnika

Korisnik je odobrio trajni izbor GPS-a u profilu: preporučena opcija pri registraciji i na vrhu profila, bez unaprijed uključenog pristanka. Novi/neriješeni izbor nudi „Uključi GPS“ i „Ne želim automatsko dijeljenje“. Preglednik traži dozvolu na izričit klik; mjerenje postavljanja se odbacuje. Registracija ne zavisi od GPS-a.

Jasna poruka: GPS se dijeli samo s učesnikom dogovorene vožnje, od pet minuta prije susreta do završetka/otkazivanja, uz postojeći šest-satni failsafe. Izvan tog prozora nema automatskog prikupljanja. U pozadini se prikupljanje pauzira; po povratku se nastavlja prema sačuvanom izboru, ako preglednik potvrdi dozvolu. Bez mogućnosti potvrđivanja dozvole nema automatskog poziva koji bi izazvao novi prompt.

Izbor se čuva na računu, ne samo u pregledniku. Stari računi imaju neriješen izbor. Isključivanje u profilu atomski uklanja sve korisnikove sesije; SQL provjerava sačuvan pristanak i pri kasnom automatskom uključivanju. Globalni provider otkriva samo vlastite dogovore u vremenskom prozoru i radi na svim ekranima. Ručno zaustavljanje pauzira taj dogovor do kraja trenutne sesije aplikacije, a operativni prekid zbog mreže/GPS-a dopušta novi pokušaj. Ručno dijeljenje za jedan dogovor ostaje dostupno uz izričit klik.

Na GPS sloju vozača označava automobil, putnika osoba. Vlastita lokacija je plava, druga zelena, starija siva; pin susreta ostaje odvojen. Putnici nikad ne vide druge putnike. Koristi se postojeći GPS/API, bez dodatnih servisa ili povijesti kretanja.

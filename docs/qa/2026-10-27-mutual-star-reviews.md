# Obostrane javne ocjene — provjera

Implementirano po dogovoru: 1–5 zvjezdica, bez komentara, jedna nepromjenjiva
ocjena po učesniku završenog dogovora, rok 14 dana. Ocjene su vidljive drugim
prijavljenim korisnicima kada obje strane predaju ili istekne rok. Posebni
prosjeci i broj ocjena za vozača i putnika. Nijedan demo rezultat nije izmišljen.

Sažetak je uz ime vozača u rezultatima, detaljima, listi vožnji, kartici na
početnoj, razgovoru, prikazu GPS učesnika i kartici za prepoznavanje. Vlastiti
profil prikazuje obje uloge; vozač vidi putnički sažetak uz zahtjev.
Bez podataka: „Još nema ocjena“; mrežna greška ima zasebnu poruku, ne lažnu nulu.

Dokazi 27.10.2026:
- `npm run build`: prolazi.
- `npm test`: 275/275 prolazi; 10 novih API/SQLite testova.
- `USPUT_TEST_ASSETS_DIR=... python tests/reviews-browser.py`: 1/1 prolazi,
  stvarni lokalni API, dva izolovana računa i sintetičke ceste/karta.
- Browser: završetak preko dugmeta; izbor zvjezdica; prva ocjena ostaje privatna;
  druga objavljuje obje; čuvanje nakon reload-a; prosjek u detaljima, trips,
  rezultatima i vlastitom profilu; nema horizontalnog preliva na 390px;
  mrežna greška ne predstavlja se kao „nema ocjena“.
- Nezavisni reviewer našao je mogućnost skrivanja ocjene kada vozač otkaže
  preostale putnike nakon završetka jednog dogovora. Dva nova testa prvo pala,
  zatim prošla: završeni dogovor čuva pravo ocjenjivanja i javni sažetak bez
  obzira na kasnije otkazivanje preostalog dijela ponude. Otkazani putnici
  ne mogu ocjenjivati. Ostatak provjere nije našao važne probleme.

Operativno: migracija0019 dodaje tabele `trip_reviews` i `trip_review_windows`.
Za stare završene dogovore rok se računa od polaska; za nove od zabilježenog
završetka, ne prije polaska. Povratak u prozor osvježava ocjene; prikaz se
periodično osvježava, nije real-time websocket. Nema SMS/identitet verifikacije
u ovom koraku. Zvjezdice nisu provjera identiteta niti garancija sigurnosti.

Objavljeno: beta Worker `38ac30c7-1655-4624-a097-f69c05b3f575`; migracija0019
uspješno primijenjena na udaljenu beta bazu. Implementacija commit `0d6f248`.

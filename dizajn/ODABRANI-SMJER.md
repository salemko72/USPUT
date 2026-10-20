# USPUT — odabrani vizuelni smjer

Odluka korisnika: 20.10.2026. Odabran je drugi, kontrastni smjer **USPUT Pulse**.

## Sačuvane reference
- `02-USPUT-Pulse-original.png`: primarna vizuelna referenca, tri ekrana.
- `01-USPUT-Float-original.png`: alternativni prijedlog, sačuvan za poređenje.
Originali se čuvaju bez prepisivanja. Buduće verzije dobivaju nova imena.

## Izričiti zahtjevi korisnika
- Traži preciznu izradu prema mockupu, bez površne interpretacije.
- Ilustracija na uvodnom ekranu: bez džamija i sahat-kula; aplikacija je za region i šire.
- Zadržati prirodu, ali dodati više urbanog okruženja. Gradsko putovanje na posao, ne dominantno međugradsko putovanje nalik BlaBlaCaru.
- Izgled i mogućnosti stvarne mape zavise od odabranog besplatnog mapnog rješenja; dekorativni mockup nije obećanje prikaza koji engine podržava.

## Referenca za kasniju implementaciju
Čuvati limeta/crni kontrast, hijerarhiju velike tipografije, zaobljene lebdeće kartice, razmake i proporcije. Primjeri profila, vozila, vremena i ruta su ilustrativni.
Prije odabira mapnog rješenja provjeriti licencu, atribuciju, limite besplatnog korištenja, geokodiranje i rutiranje zasebno; besplatna biblioteka sama ne znači besplatne mapne servise.

## Status
Odabran vizuelni smjer. Dorada ilustracije i implementacija još nisu urađene. Ove odluke ne predstavljaju odobrenje za objavu aplikacije.

## Implementacija — 20.10.2026.
Prva Pulse beta je izrađena u `app/`: splash, email auth, pripremljeni Google OAuth, glavni ekran, tok putnika/vozača, ponude i dogovori. Nova urbanija ilustracija bez vjerskih objekata sačuvana je kao `03-USPUT-Pulse-urban-hero.png`; web asset je u `app/public/urban-hero.webp`.
Stvarni snimci aplikacije su u `pulse-implementacija/`. Originalni Float i Pulse mockupi ostaju neizmijenjeni. Mapa je označena skica s opcionalnim OSM pregledom, ne navigacija. Stvarna Google prijava čeka OAuth podatke. Nije urađena javna objava niti odobrena stvarna proba vožnji.

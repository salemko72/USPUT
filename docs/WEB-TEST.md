# USPUT web test — 20.10.2026.

Korisnik je zatražio web test. Objavljena je zasebna USPUT beta, bez izmjena drugih Cloudflare projekata.

- Adresa: https://usput-pulse.salemko.workers.dev
- Worker: `usput-pulse`
- Prva objavljena verzija: `eac85720-9b4d-4ba9-aa81-73d8ed8e63d3`
- D1: `usput-db`, ID `72c9853b-fd62-4dc0-a393-e8408a4934bc`, regija EEUR
- Migracija `0001_initial.sql` primijenjena na novu bazu. Nema uvezenih lokalnih naloga ili demo podataka.
- Cloudflare domena bez dodatne vlastite domene. Workers preview URL-ovi isključeni. `X-Robots-Tag: noindex, nofollow`.
- Google OAuth još nije povezan; email registracija i demo kod su dostupni u objavljenoj verziji.

Wrangler je potvrdio asset upload, Worker deploy i triggers. 18/18 lokalnih testova prolazi; raniji puni browser tok prošao je na lokalnom Node/SQLite i lokalnom Worker/D1 runtimeu.

Granica provjere: javna adresa iz radnog okruženja vraća proxy grešku `Tunnel connection failed: 403 Forbidden`, ne odgovor aplikacije. Host je dodat u nacrt mrežnih postavki uz očuvanje `api.cloudflare.com`; draft save nije primjena pravila. Javna funkcionalna provjera ostaje nepotvrđena dok je mrežno pravilo ne propusti ili korisnik ne provjeri stranicu iz svog preglednika. Ne zaobilaziti proxy.

Za ručni pregled: demo → pretraga → ponuda → zahtjev → označena simulacija potvrde → spremnost. Probni računi bez privatnih podataka; beta nije za organizaciju stvarnih vožnji.

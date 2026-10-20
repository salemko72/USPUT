# Uključivanje cestovnog i pješačkog enginea

USPUT podržava OpenRouteService za cestovne i pješačke putanje. Pripremljen je i javni OSRM/FOSSGIS za ograničeno testiranje; taj javni servis nema garanciju dostupnosti. Postojeći negativni OSRM keš dokazao je da ranija beta nije mogla pouzdano spajati usputne segmente. Kontrolisani testovi nisu dokaz da javni servis trenutno radi.

1. Otvori službeni [OpenRouteService portal](https://openrouteservice.org/dev/#/home). Kreiraj račun i API ključ nazvan USPUT. Provjeri važeći besplatni plan, dnevne/minutne kvote i uslove prije korištenja. Aplikacija kešira odgovore; ne obećava neograničeno besplatno rutiranje.
2. Otvori [USPUT Worker postavke](https://dash.cloudflare.com/21db5c0516fc09fed9e4b49aed03f06d/workers/services/view/usput-pulse/production/settings).
3. U **Runtime variables and secrets → Add variable** dodaj tip **Secret**, naziv **OPENROUTESERVICE_API_KEY**, a u vrijednost zalijepi ključ. Sačuvaj/primijeni izmjenu.
4. Ključ se ne upisuje u GitHub, frontend, `wrangler.vars` ili razgovor. Ovo je ključ servisa za putanje, odvojen od Cloudflare deploy tokena i Google prijave. `keep_vars: true` čuva tajne pri objavi.
5. Probaj ulicu i pin, izaberi5/10/15 minuta, pa Kerimov usputni segment. D1 tabela `routing_health` bilježi samo stanje servisa i nesenzitivnu grešku. Pozitivna provjera `driving` i `foot` mora biti potvrđena stvarnim korištenjem prije tvrdnje da je živi servis provjeren.

Nominatim je opcionalna pretraga adresa, pokreće se isključivo dugmetom ili Enterom, ne automatski pri kucanju. Bez tog servisa možeš unijeti ulicu i grad, pa ručno pomjeriti pin na karti. Ručni pin mora biti pomjeren i karta učitana prije potvrde.

Za lokalni razvoj ključ je varijabla procesa, nikad datoteka koja se commituje. Testovi koriste sintetički server `tests/street-fixture-server.mjs`, nikad produkcijske ključeve ili stvarne korisničke adrese.

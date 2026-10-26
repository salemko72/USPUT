# Privremeni rok cijele demo aplikacije

Na zahtjev vlasnika, beta radi dva kalendarska mjeseca od 26.10.2026.
Zatvara se **26.12.2026. u 00:00 Europe/Sarajevo** (25.12.2026. 23:00 UTC).
Rok je zajednički za sve korisnike, ne računa se od pojedinačne registracije.

`DEMO_EXPIRES_AT` u `app/wrangler.jsonc` uključuje ograničenje. Bez te varijable
ograničenje ne postoji. Ne primjenjuje se na stvarne korisnike produkcijske
verzije nakon uklanjanja postavke.

Server odbija API i pristup stranicama/assetima nakon isteka (410, no-store).
Otvorena aplikacija provjerava server svake minute i pri povratku u prozor,
prikazuje završni ekran i uklanja aktivni prikaz/GPS provider. API odgovor
također odmah aktivira završni ekran. Pozadinska push dostava staje, a postojeći
poslovi čišćenja ostaju aktivni. Podaci se ne brišu ovim ograničenjem.
Lokalno je rok opcionalan: `DEMO_EXPIRES_AT=... npm start`.

## OBAVEZNO PRIJE PRAVE VERZIJE

- Ukloniti `DEMO_EXPIRES_AT` iz Wrangler konfiguracije **i iz udaljenih Worker
  varijabli**. `keep_vars: true` znači da samo brisanje lokalnog reda nije dovoljno.
- Ponovo objaviti Worker; `/api/demo-status` mora vratiti `expiresAt: null` i
  `expired: false`. Provjeriti pristup aplikaciji i nakon nekadašnjeg demo roka.
- Zasebno pregledati/ukloniti izmišljene vozače, demo podatke i simulacijska dugmad.
- Podsjetnik za vlasnika: 26.11.2026. u 09:00 Europe/Sarajevo. Datoteka kalendara
  je pripremljena u razgovoru; automatski podsjetnik nije zakazan servisom.

# Google prijava — povezivanje novog projekta

Kod za Google OAuth prijavu je pripremljen, ali se stvarna prijava ne može provjeriti bez tvog Google OAuth klijenta. Email/lozinka i demo rade nezavisno.

1. Otvori https://console.cloud.google.com/projectcreate i napravi projekt `USPUT` (ili odaberi novi zaseban projekt).
2. Otvori https://console.cloud.google.com/auth/overview i klikni **Get started** ako se traži inicijalna postavka.
3. U **Branding** postavi naziv aplikacije `USPUT` i svoj kontakt email. U **Audience** odaberi **External**, ostavi **Testing** i dodaj svoj Google email među testne korisnike.
4. **Data Access**: samo osnovni podaci `openid`, email i profile. Ne tražiti Gmail, Drive, Calendar ili druge pristupe.
5. **Clients → Create client → Web application**. Naziv `USPUT web beta`.
6. Za lokalni razvoj dodaj origin koji zaista koristiš, npr. `http://localhost:8787`, i tačan redirect URI `http://localhost:8787/api/auth/google/callback`. Ako koristiš `127.0.0.1`, registruj njegovu odgovarajuću adresu zasebno.
7. Za Cloudflare objavu, tek kada znamo stvarnu adresu aplikacije, dodaj njen HTTPS origin i `https://STVARNA-ADRESA/api/auth/google/callback`. Nemoj unositi primjer doslovno. Origin i callback moraju biti isti kao adresa na kojoj otvaraš aplikaciju.
8. **Client ID** ide u običnu serversku varijablu `GOOGLE_CLIENT_ID`. **Client secret** ide u sigurnu serversku varijablu `GOOGLE_CLIENT_SECRET`; ne slati u chat, ne stavljati u VITE_ varijable, frontend ili GitHub.

## Pokretanje ovdje

Lokalni Node server čita ove dvije varijable iz okruženja pri pokretanju. Nakon dodavanja restartovati server. Mrežni pristup servera treba dozvoliti `oauth2.googleapis.com` i `openidconnect.googleapis.com`. Browser preusmjerava na `accounts.google.com`. Tajni client secret šalje se samo token endpointu `oauth2.googleapis.com`.

Cloudflare Worker: postaviti Client ID kroz Workers Settings/Variables, a secret kroz Workers Settings/Secrets ili `wrangler secret put GOOGLE_CLIENT_SECRET`. Tajna je vezana za konkretni USPUT Worker, nikada za frontend.

## Provjera

Klik na „Nastavi s Googleom” treba otvoriti Google, vratiti aplikaciju i, za novi račun, zatražiti potvrdu punoljetnosti i pravila. Postojeći Google račun treba dobiti HttpOnly sesiju. Otkazivanje na Googleu ne smije napraviti račun. Ako već postoji email/lozinka račun s istim emailom, koristi tu prijavu; automatsko povezivanje tih računa još nije uključeno.

Prije javne produkcije završiti Google branding/consent zahtjeve i objaviti stvarne uslove i politiku privatnosti. U testing režimu pristup imaju samo uneseni testni korisnici.

## Sadašnja testna web adresa

Za Google Web client unesi:

- **Authorized JavaScript origins:** `https://usput-pulse.salemko.workers.dev`
- **Authorized redirect URIs:** `https://usput-pulse.salemko.workers.dev/api/auth/google/callback`

Ako je Publishing status **Testing**, u Audience / Test users dodaj svoj Google email. To je dovoljno za probnu prijavu osnovnim profilom; ne treba sada objavljivati Google aplikaciju svim korisnicima.

Ne trebaš programirati. Napravi Google projekt i Web client kroz navedene ekrane; Client ID i Client secret unose se sigurno u postavke USPUT Workera, ne u chat.

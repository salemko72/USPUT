# Plan: GPS izbor u profilu

- [x] Testovi: trajni pristanak, početno isključenje, opseg otkrivanja dogovora, gašenje i utrka s kasnim uključivanjem.
- [x] Migracija 0018, zapis izbora za registraciju/Google i profil, atomski opoziv, automatski API SQL guard.
- [x] Preporučena dobrovoljna ponuda u registraciji i na vrhu profila; jasna poruka kada GPS radi i prestaje.
- [x] Globalno automatsko uključivanje samo u prozoru, pauziranje u pozadini, ručno zaustavljanje i odvojeni oporavak.
- [x] Automobil/osoba na GPS mapi, prijevodi i ažurirane upute/privatnost.
- [x] Završne provjere preglednika i nezavisan pregled.
- [x] Migracija 0018 i objava beta verzije.

Provjera: `npm test` 229/229; build i Wrangler dry-run uspješni; svih sedam GPS browser scenarija i oba help/privacy scenarija (četiri jezika) prolaze. Fokusirani nezavisni pregled nema preostalih blokera nakon popravki potvrde dozvole i odvajanja ručne pauze od operativnog prekida. Browser provjera koristi lokalne sintetičke račune i uređaje.

Objavljeno na `https://usput-pulse.salemko.workers.dev/`, Worker verzija `ca4b68e4-88c6-4cf3-9fb3-8e7b013c602c`.

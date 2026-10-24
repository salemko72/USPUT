# Virtualne probe podudaranja — 24. 10. 2026.

Reproducibilni testovi: `cd app && node --test tests/matching-scenarios.test.mjs tests/corridor.test.mjs`.
Koriste stvarni algoritam aplikacije, privremenu bazu i sintetičke odgovore pješačkog servisa. Ne koriste javne servise, stvarne korisnike ili stvarne vožnje. Nisu potvrda kvaliteta OSM podataka, stvarnog pješačkog pristupa ili dozvoljenog zaustavljanja.

| Proba | Očekivanje |
|---|---|
| Putnikov segment unutar duže vozačeve trase | Ponuda preko odobrenih tačaka |
| Obrnuti smjer | Bez podudaranja |
| Ulazak i izlazak na istoj tački | Bez podudaranja |
| 300 m hodanja pri 5 minuta | Podudaranje uz sintetičku brzinu 1,2 m/s |
| 500 m hodanja pri 5 / 10 minuta | Odbijeno / ponuđeno |
| Udaljeno naselje | Bez podudaranja |
| 60 m zračne udaljenosti, ali 30 puta duži prilaz zbog prepreke | Odbijeno; pješačko vrijeme odlučuje |
| Trasa prolazi pored putnika, ali nema odobrenih usputnih tačaka | Bez podudaranja u sadašnjem modelu |
| Susret odstupa 15 minuta | Fleksibilni kandidat |
| Odstupanje tačno 60 minuta / više od 60 minuta | Kandidat / odbijeno |
| Pješački servis nedostupan | Nepouzdan proračun, nikad potvrđeno podudaranje |
| Pješački servis vraća neprohodnu putanju | Bez podudaranja |
| Ručno izabrane tačke obrnutim redoslijedom | Odbijeno |
| Nepodržan limit hodanja ili isti početak i cilj putnika | Odbijeno |
| Rotacija cijelog grada u osam smjerova | Ista pravila za pravilan i obrnut smjer |
| U-trasa i zatvoreni krug | Odlučuje redoslijed tačaka, ne pravac početak–cilj |

Postojeći testovi `corridor.test.mjs` dodatno pokrivaju Sarajevo, Marijin Dvor–Nedžarići, Koševo i smjer u krivini.

## Nalazi i granice

1. Sadašnji sistem spaja preko vozačevih odobrenih mjesta. Sama blizina geometriji trase ne stvara novo mjesto susreta. To može sakriti korisnu ponudu ako vozač ima samo početak i kraj. Sljedeća iteracija je prijedlog putnikovog pina i izričita saglasnost vozača.
2. Prozor pretrage je do ±60 minuta od traženog susreta. Rezultat nije obećanje da je vrijeme unutar korisnikovih strožih želja; klasifikacija rezultata je zaseban sloj.
3. Pješačka dostupnost je važnija od kruga na karti. Mostovi, ograde, podvožnjaci i pogrešna strana ceste zahtijevaju stvarnu terensku probu.
4. U ovim testovima nema saobraćajne gužve ni GPS praćenja. Za terensku probu predlažemo najmanje deset stvarnih parova putanja u Sarajevu, uz zapis očekivanih tačaka i vremena hodanja, pa isti skup u gradu s nelinearnim ulicama.

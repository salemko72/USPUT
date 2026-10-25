# Fleksibilne ponude i povratne putanje

Korisnik je odobrio prethodni prijedlog i prvi korak: razvrstavanje ponuda i ispravku povratnih putanja. Ostali koraci (tri vidljiva prijedloga ulaza, novi statusi slanja poruka) ostaju zasebna iteracija.

Ponude unutar hodanja i susret od željenog vremena do 15 min kasnije su „Odgovara“. „Možda ti odgovara“ dopušta do ±30 min i do 5 min više hodanja na svakom kraju; navodi konkretan razlog. Provjerene ponude izvan ±30 min, do ±60 min, su iza „Prikaži još ponuda“. Bliska ruta bez pouzdanog proračuna je „Podudaranje nije provjereno“ i nema potvrđen match niti slanje bez uspješnog proračuna.

Originalni izbor hodanja (5/10/15) se ne mijenja. Samo tok prijedloga dopušta internu rezervu od 5 min; isti limit i klasifikacija vrijede pri pretrazi, detaljima, pomjeranju pina, slanju i protuprijedlogu. Poslovno pravilo ±60 min i granica 50 m za ručni pin ostaju. Nema skretanja vozačeve trase.

Engine razmatra lokalne projekcije kroz sve prolaze trase i bira valjan uređeni par po dostupnosti hodanja, vremenu i kvaliteti podudaranja. Ne zaključuje smjer iz krajnjih tačaka niti koristi samo prvi najbliži prolaz. Geometrija vozača ostaje ista.

Pristup: proširiti postojeći match modul opcijom fleksibilnog hodanja, centralizirati klasifikaciju i dodati lokalne projicirane prolaze; ne praviti drugi engine niti povećavati korisnikov izbor u pretrazi. UI prikazuje grupe i konkretna odstupanja, uključujući dodatne ponude na izričit klik. Četiri jezika i ažurirane upute.

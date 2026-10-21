# Mjesta susreta i svakodnevne pretrage

Vozač unosi svoj put. Pregled počinje polazištem, jednim praznim poljem za mjesto susreta, dugmetom za dodatne tačke i završnim odredištem. Vozač imenuje i po potrebi pomjera mjesta na kojima može primiti ili ostaviti putnika. Nakon svake izmjene treba ponovo proračunati trasu kroz te tačke i potvrditi je prije objave. Mapa podržava +/−, točkić i zumiranje prstima, te dugme za prikaz cijele trase. Uređivanje naziva tačke zadržava izabrani zum i položaj. Putnik bira koliko može hodati: 5, 10 ili 15 minuta. Njegova adresa ili pin služi za računanje hodanja, a dogovor prikazuje vozačeve potvrđene tačke. Pretraga ne dodaje privatnu adresu u vozačev put.

Nove putničke pretrage automatski se čuvaju na računu. Početna stranica prikazuje „Nova vožnja” pa sačuvane kartice u dvije kolone. Datum je vidljiv iznad sačuvanih kartica. Kartica učitava isti put i vrijeme za odabrani datum; povratak iz pretrage i otvaranje druge kartice zadržavaju taj datum. Kružni X uklanja karticu. Fotografija lica koristi se i kao vlastita profilna fotografija, iz istog privatnog kompresovanog fajla.

## Servisni meni

Otvara se kroz Profil → Servisni meni, ili `/#meeting-admin`. Pristup ima samo Googleom povezan račun čiji je email u Worker secretu `ADMIN_EMAILS` (više adresa razdvojiti zarezom). Prazna lista nikome ne daje pristup. Ne unositi lične adrese administratora u javni repozitorij.

Urednik bira grad, dodaje ili popravlja naziv, pin, prilaz, stranu ulice i alternativne nazive. Nova korisnička mjesta i JSON uvoz su kandidati za pregled. Tek aktivirana mjesta ulaze u gradske prijedloge. Pregled blizine ne potvrđuje dozvoljeno zaustavljanje; vozač i dalje provjerava prilaz i konačnu trasu.

Opcija uvoza prima listu do 30 kandidata. Primjer formata (izmišljeni naziv, koordinate samo za prikaz formata):

```json
[
  {
    "city": "Sarajevo",
    "name": "Naziv javnog parkinga",
    "lat": 43.855,
    "lng": 18.407,
    "approach": "Ulaz sa bočne ulice",
    "side": "parking",
    "aliases": ["Kraći naziv parkinga"]
  }
]
```

Nijedan grad nema unaprijed izmišljena provjerena mjesta. Bazu punimo kroz urednički unos i izričito odobrene prijedloge vozača. Kerimove demo tačke su posebno označene, nisu unesene u zajedničku bazu i ne stvaraju ocjene korištenja.

## Duplikati i iskustva

Slični nazivi (npr. „Alta” i „kod Alte”) i blizina pomažu prepoznati duplikate. Automatsko povezivanje traži isti grad, udaljenost do 20 metara, podudaranje naziva i izričito isti prilaz i stranu. Ne usrednjava pinove. Nejasni parovi čekaju urednika; ručno spajanje do 40 metara ima historiju i mogućnost vraćanja. Suprotne strane ili različiti prilazi ostaju odvojeni. Objavljene vožnje i već dogovorene tačke zadržavaju svoje snimke.

Nakon završene vožnje vozač i putnik mogu ocijeniti samo mjesta iz tog dogovora. Promjena ocjene ažurira prethodnu ocjenu, a ne stvara nove glasove. Urednik vidi broj različitih učesnika, pozitivna i negativna iskustva i novije korištenje. To pomaže održavanju baze; nije pravna potvrda da je stajanje dozvoljeno.

## Provjera i objava

`npm test` pokreće API, privatnost, preglede trase, hodanje, duplikate, ocjene i sačuvane pretrage. `npm run build` pravi web aplikaciju. `python tests/meeting-flow-browser.py` podiže zasebnu lokalnu bazu i provjerava mobilni tok s izmišljenim korisnicima, sintetičkim geokoderom/rutama i zamjenskim pločicama mape. Taj test ne dokazuje dostupnost stvarnih vanjskih servisa.

Za Worker primijeniti D1 migracije 0008–0010 prije objave. Postojeće rezervacije se ne mijenjaju.

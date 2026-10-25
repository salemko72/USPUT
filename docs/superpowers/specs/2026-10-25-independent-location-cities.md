# Dva jednostavna polja za lokacije iz različitih gradova

Korisnik je odobrio isti unos polazišta/odredišta bez obaveznog dodatnog izbora grada. Svako polje nezavisno koristi grad odabrane lokacije ili grad profila kao početnu pretpostavku. Sitna pomoć „Pretražujemo {city} · Promijeni“ otvara samo lokalni izbor grada za to polje. Nema GPS upita za ovu funkciju.

Unos „Zenica, Crkvice“ i „Crkvice, Zenica“ mora prepoznati eksplicitni grad i odbaciti koordinate prethodnog grada kao pristranost. Poznati regionalni gradovi prepoznaju se lokalno; drugi se provjeravaju preko postojećeg geokodera/autocomplete servisa i cachea. Običan naziv ulice ostaje ograničen trenutnim gradom. Ime ulice samo po sebi nije dozvola za globalnu pretragu.

Unos samog grada nudi grad kao približno područje. Korisnik zatim mora pomjeriti i potvrditi pin prije korištenja kao precizne lokacije. Izbor jednog grada ne briše drugi endpoint. Zamjena i učitavanje sačuvane rute koriste gradove spremljene u lokacijama. Nazivi i gradovi ostaju vidljivi u sugestijama, uz postojeće latinično prikazivanje.

Nema automatskog skretanja s autoputa niti novih pravila za međugradske meeting pointe u ovoj promjeni.

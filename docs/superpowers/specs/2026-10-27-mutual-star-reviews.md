# Obostrane ocjene saputnika

Dogovor s vlasnikom: javne zvjezdice uz svako predstavljanje vozača, prosjek i
broj ocjena, bez komentara. Bez ocjena: „Još nema ocjena“. Vozačke i putničke
ocjene odvojene. Ocjenjuju isključivo učesnici završene vožnje, jednom po
konkretnom dogovoru. Vidljivost kada oba učesnika ocijene ili po isteku 14 dana.
Demo ocjene ne ulaze u stvarnu reputaciju. Provjera identiteta nije dio ovog koraka.

Implementacijske odluke: nepromjenjive ocjene 1–5; rok predaje 14 dana od
završetka, ne ranije od polaska. Novim završecima zabilježiti serversko vrijeme;
za stare završene dogovore koristiti polazak kao početak roka. Otkazane,
odbijene, nezavršene, tuđe i izmišljene demo vožnje ne mogu se ocjenjivati.
Svaki putnik ocjenjuje svog vozača i vozač svakog svog putnika; nema ocjena
između putnika. GPS ili dodavanje fotografije ne dokazuju izvršenje vožnje.

Arhitektura: odvojeni review API i SQL tabele, javni sažetak dostupan prijavljenim
korisnicima kao postojeće ponude; komponenta sažetka uz svaki prikaz vozača,
formular nakon završetka u detaljima i među završenim dogovorima. Server određuje
cilj/ulogu iz dogovora, ne iz korisničkog unosa. Dvostruka predaja ima SQL unique
zaštitu. Skrivena pojedinačna ocjena nikad ne ulazi u javni sažetak prije objave.

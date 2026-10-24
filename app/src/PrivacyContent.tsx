import { t } from "./i18n";
import "./information-content.css";

export function PrivacyContent() {
  return (
    <div className="information-content">
      <p>
        {t(
          "USPUT je razvojna beta za punoljetne osobe, namijenjena testiranju. Stvarna proba vožnji još nije otvorena. Koristi testne podatke i lokacije.",
        )}
      </p>
      <p>
        {t(
          "GPS je dobrovoljan i dostupan samo vozaču i putniku prihvaćenog dogovora, od pet minuta prije susreta do završetka ili otkazivanja, najduže šest sati. Putnici ne vide druge putnike. Čuva se samo posljednja lokacija i procijenjena preciznost, bez historije kretanja. Dozvola dijeljenja ističe nakon 60 sekundi bez obnove, a mjerenje nakon 90 sekundi; istekli zapisi se redovno uklanjaju. Lokacija se ne koristi za gradski katalog, rutiranje ili reklame.",
        )}
      </p>
      <p>
        {t(
          "Automatski GPS zahtijeva tvoj dobrovoljni izbor pri registraciji ili u profilu i dozvolu preglednika. Pri postavljanju dozvole mjerenje se odbacuje i ne šalje serveru. Dijeljenje počinje samo u periodu prihvaćenog dogovora dok je aplikacija otvorena. Odlazak u pozadinu ga pauzira; povratak ga nastavlja prema tvom izboru u profilu. Isključivanje u profilu odmah opoziva sve tvoje sesije. Bez mreže server ukida pristup po isteku kratke dozvole. GPS ne dokazuje susret ni identitet.",
        )}
      </p>
      <h3>{t("Račun i prijava")}</h3>
      <p>
        {t(
          "Podaci probnog računa čuvaju se na serveru u Cloudflare D1 bazi: ime, grad, email, vozilo, ponude, zahtjevi, dogovori i sačuvane pretrage. Lozinka se čuva kao hash sa solju, a prijava koristi HttpOnly sesijski kolačić koji ističe nakon 30 dana. Ako izabereš Google prijavu, koristimo Googleov identifikator računa, potvrđeni email i ime iz profila.",
        )}
      </p>
      <p>
        {t(
          "Poruke, verzije prijedloga mjesta i privatni ulazni podaci proračuna čuvaju se u D1 bazi uz dogovor. Poruke i prijedloge vide samo njegova dva učesnika; početne privatne adrese se ne prikazuju drugoj strani. Trenutno nema automatskog brisanja razgovora.",
        )}
      </p>
      <h3>{t("Ko vidi rutu i dogovor")}</h3>
      <p>
        {t(
          "Email nije prikazan saputnicima. Prijavljeni korisnici mogu vidjeti ime vozača i objavljenu ponudu, uključujući trasu, mjesta susreta, vozilo i napomenu. Zahtjeve i dogovore vide njihovi učesnici. Sačuvane pretrage i putnikovi početni i završni pinovi su privatni; za susret se koristi dogovorena tačka koju je vozač odobrio. Imenovano javno mjesto šalje se gradskoj bazi samo uz izbor dijeljenja, a urednik odlučuje o aktivaciji.",
        )}
      </p>
      <h3>{t("Fotografije za prepoznavanje")}</h3>
      <p>
        {t(
          "Fotografiju auta uz aktivnu buduću ponudu vide prijavljeni korisnici. Fotografije osoba dostupne su saputniku samo uz aktivan potvrđen dogovor, do 24 sata nakon polaska. Slike su opcionalne, kompresovane i bez izvornih GPS metapodataka, u privatnom Cloudflare R2 skladištu u EU.",
        )}
      </p>
      <h3>{t("Pretraga ulica, rute i karta")}</h3>
      <p>
        {t(
          "Za pretragu ulica, određivanje grada i naziva uz pin server šalje servisima Photon i Nominatim tekst pretrage, odabrani grad ili potrebne koordinate, zavisno od upita. OSRM servisu šalje koordinate za cestovne i pješačke rute, bez tvog imena ili emaila. Proračuni i upiti mogu se privremeno čuvati u serverskom cacheu. Kada otvoriš kartu, preglednik učitava OpenFreeMap vektorske pločice i fontove; taj servis prima tvoju IP adresu i uobičajene mrežne podatke.",
        )}
      </p>
      <h3>{t("Dobrovoljne push obavijesti")}</h3>
      <p>
        {t(
          "Push uključuješ zasebno za uređaj. Čuvamo adresu pretplate, tehničke ključeve i jezik obavijesti. Šifrovana obavijest o prihvatanju prolazi kroz push servis tvog preglednika ili uređaja; njen tekst ne sadrži imena, adrese ni privatne pinove. Push možeš isključiti u Profilu. Obavijesti u aplikaciji dostupne su i bez pusha.",
        )}
      </p>
      <h3>{t("Tvoj izbor u beta verziji")}</h3>
      <p>
        {t(
          "Nema stalnog GPS praćenja izvan aktivnog dobrovoljnog dijeljenja, Bluetooth potvrđivanja susreta, naplate u aplikaciji ni provjere identiteta. Fotografije i sačuvane pretrage uklanjaš u aplikaciji. Za uklanjanje probnog računa obrati se administratoru projekta.",
        )}
      </p>
    </div>
  );
}

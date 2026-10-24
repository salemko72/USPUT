import { t } from "./i18n";
import "./information-content.css";

export function HelpContent() {
  return (
    <div className="information-content">
      <p>
        {t(
          "USPUT je razvojna beta za punoljetne osobe. Ove upute opisuju trenutnu probnu verziju; stvarna proba vožnji još nije otvorena.",
        )}
      </p>
      <p>
        {t(
          "Kratke poruke uz zahtjev vide samo putnik i vozač tog dogovora. Poruka ne potvrđuje vožnju niti pomjera pin. Piši do 280 znakova; razgovor se zatvara otkazivanjem ili završetkom, najkasnije 24 sata nakon polaska.",
        )}
      </p>
      <p>
        {t(
          "Otkazane vožnje su na dnu liste i nakon tri dana se sklanjaju iz glavnog prikaza. Historija dogovora i prijave nedolaska ostaju u bazi.",
        )}
      </p>
      <p>
        {t(
          "GPS možeš dobrovoljno uključiti pri registraciji ili u profilu. Preporučujemo ga za lakši susret. Ako pristaneš, dijeljenje se automatski uključuje od pet minuta prije prihvaćenog susreta i traje do završetka ili otkazivanja, najduže šest sati. Izvan tog perioda nema prikupljanja. Isključivanje u profilu odmah ukida sva tvoja dijeljenja; prekidač tokom vožnje pauzira samo trenutni dogovor.",
        )}
      </p>
      <p>
        {t(
          "Svaka osoba zasebno daje dozvolu. Možeš vidjeti saputnika i bez dijeljenja svoje lokacije. Automobil označava vozača, a osoba putnika. Stariji pin je siv i nestaje nakon 90 sekundi. U pozadini ili na zaključanom telefonu GPS se pauzira. Povratkom se automatski nastavlja samo ako je opcija uključena u profilu i dogovor još traje; ručno prekinuto dijeljenje ostaje pauzirano tokom ove sesije aplikacije.",
        )}
      </p>
      <details open>
        <summary>{t("Putnik: od pretrage do dogovora")}</summary>
        <p>
          {t(
            "Na Početnoj odaberi da tražiš vožnju, grad, polazište i odredište, datum i vrijeme. Odaberi ulicu iz prijedloga i provjeri pin na karti. Tvoji početni i završni pinovi služe za računanje hodanja; mjesto ulaska ili izlaska je tačka koju je vozač odobrio.",
          )}
        </p>
        <p>
          {t(
            "Vozač ne može objaviti dvije aktivne ponude za isti datum i vrijeme. Upozorenje vodi na postojeću vožnju.",
          )}
        </p>
        <p>
          {t(
            "Od 10 minuta do 24 sata nakon dogovorenog susreta možeš prijaviti da druga osoba nije došla. Prijava se čuva uz dogovor i nije automatska presuda ni kazna. Druga strana može također podnijeti prijavu.",
          )}
        </p>
        <p>
          {t(
            "Odaberi 5, 10 ili 15 minuta hodanja. Predloži ulazak na mapi, pregledaj hodanje i pošalji zahtjev. Izlazak je opcionalan; ako ga ne biraš, ostaje okvirni prijedlog uz odredište. Vozač prihvata predloženi pin ili šalje novi, koji ti ponovo potvrđuješ.",
          )}
        </p>
      </details>
      <details>
        <summary>{t("Vozač: ruta i mjesta susreta")}</summary>
        <p>
          {t(
            "U Profilu dodaj marku, model i boju vozila. Na Početnoj odaberi da nudiš vožnju, unesi polazište, odredište, datum i vrijeme, broj slobodnih putničkih mjesta i želiš li dijeliti troškove. USPUT ne obrađuje plaćanja.",
          )}
        </p>
        <p>
          {t(
            "Prvo oblikuj i potvrdi trasu pomoću bijelih prolaznih tačaka. Zatim dodaj mjesta susreta uz tu trasu. Prolazne tačke nisu mjesta ulaska putnika; naziv mjesta susreta nije obavezan. Na kraju potvrdi gdje možeš stati. Vremena susreta su procjene duž odabrane trase, bez podataka o gužvi.",
          )}
        </p>
        <p>
          {t(
            "Trasa i vremena su procjene bez podataka o gužvi. Pin ili prijedlog na karti nije potvrda da je zaustavljanje dozvoljeno. Zahtjeve prihvataš u detaljima vožnje; ponuda ostaje dostupna dok ima slobodnih mjesta.",
          )}
        </p>
      </details>
      <details>
        <summary>{t("Na dan vožnje")}</summary>
        <p>
          {t(
            "Nakon prihvatanja, detalje dogovora otvori iz Vožnji. Putniku se sljedeća dogovorena vožnja prikazuje i na Početnoj, uz dugme „Na mjestu sam“. Pritisni ga tek kada dođeš na dogovoreni pin; time ručno javljaš vozaču da si tu.",
          )}
        </p>
        <p>
          {t(
            "Fotografiju auta vidiš i na ponuđenim vožnjama, prije dogovora. Fotografije osoba dostupne su saputnicima tek uz aktivan potvrđen dogovor.",
          )}
        </p>
      </details>
      <details>
        <summary>{t("Završetak i ponavljanje")}</summary>
        <p>
          {t(
            "Vozač u detaljima ručno označava završetak za svakog prihvaćenog putnika. Ako dogovor otpada, otkaži ga u aplikaciji. Završene i otkazane ponude ostaju u tvojoj historiji: „Ponovi vožnju“ pripremi novu ponudu, a ti provjeri datum, trasu i mjesta. Stari dogovori se ne kopiraju.",
          )}
        </p>
        <p>
          {t(
            "Putničke pretrage se čuvaju na Početnoj. Odaberi sačuvanu rutu i datum da ponovo tražiš vožnju. Sačuvanu pretragu možeš ukloniti; vidiš je samo ti.",
          )}
        </p>
      </details>
      <details>
        <summary>{t("Obavijesti o prihvatanju")}</summary>
        <p>
          {t(
            "Kada vozač prihvati zahtjev, putnik dobija obavijest u aplikaciji. U Profilu možeš uključiti i push obavijesti za ovaj uređaj. Na iPhoneu i iPadu potreban je iOS 16.4 ili noviji: u Safariju odaberi Dijeli → Dodaj na početni ekran, otvori USPUT odatle i uključi obavijesti. Dostava zavisi od uređaja i preglednika; stanje dogovora provjeri u aplikaciji.",
          )}
        </p>
      </details>
      <details>
        <summary>{t("Zajednička mjesta susreta")}</summary>
        <p>
          {t(
            "Dijeljenje imenovanih javnih mjesta u gradsku bazu je dodatna opcija pri objavi. Prijedlog pregleda urednik prije aktivacije. Privatni početni i završni pinovi putnika ne postaju javne gradske tačke. Nakon završene vožnje možeš dati povratnu informaciju za korišteno mjesto iz kataloga; to nije ocjena vozača ili putnika.",
          )}
        </p>
      </details>
    </div>
  );
}

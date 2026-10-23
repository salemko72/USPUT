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
      <details open>
        <summary>{t("Putnik: od pretrage do dogovora")}</summary>
        <p>
          {t(
            "Na Početnoj odaberi da tražiš vožnju, grad, polazište i odredište, datum i vrijeme. Odaberi ulicu iz prijedloga i provjeri pin na karti. Tvoji početni i završni pinovi služe za računanje hodanja; mjesto ulaska ili izlaska je tačka koju je vozač odobrio.",
          )}
        </p>
        <p>
          {t(
            "Odaberi 5, 10 ili 15 minuta hodanja na svakom kraju. U ponudi provjeri dogovorena mjesta, procijenjeno hodanje i vrijeme susreta. Možeš birati između vozačevih ponuđenih tačaka. Zahtjev čeka dok ga vozač ne prihvati; slanje zahtjeva još nije potvrda mjesta u autu.",
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
            "Ako je vozač dodao fotografiju auta, poslije potvrde dogovora vidiš je u malom krugu uz vozilo; dodir je povećava. Profilnu i fotografiju vozila dodaješ ili uklanjaš u Profilu. Fotografije služe lakšem prepoznavanju i nisu provjera identiteta.",
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

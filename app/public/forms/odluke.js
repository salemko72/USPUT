"use strict";

(() => {
  const storageKey = "usput-project-qa-v1";
  const generic = [
    "Slažem se s preporukom",
    "Želim izmjenu — pišem ispod",
    "Trebamo još razgovarati",
  ];
  const groups = [
    {
      id: "services",
      title: "1. Servisi, kapacitet i troškovi",
      first: 1,
      last: 7,
    },
    {
      id: "agreement",
      title: "2. Tačke susreta, vrijeme i dogovor",
      first: 8,
      last: 14,
    },
    {
      id: "location",
      title: "3. GPS, podaci i povjerenje",
      first: 15,
      last: 21,
    },
  ];
  const questions = [
    {
      title: "Kako koristiti besplatne servise u beti?",
      fact: "OpenFreeMap nema objavljenu kvotu pregleda. Pretraga adresa i rutiranje su zasebni servisi s ograničenjima.",
      proposal:
        "Zadržati OpenFreeMap; javne servise adresa i ruta koristiti za kontrolisanu razvojnu betu, uz pripremu pouzdanije opcije za rast.",
      choices: [
        "Besplatni za malu betu, pouzdaniji servis prije širenja",
        "Ugovoreni servis za adrese i rute već sada",
        "Trebamo još razgovarati",
      ],
    },
    {
      title: "Ko odlučuje o tehničkim limitima?",
      fact: "Sada novi vanjski upiti dijele razmak od približno 1,1 sekundu. To može usporiti istovremene korisnike.",
      proposal:
        "Izmjeriti potrebe i odvojiti redove pružalaca prema njihovim pravilima, bez prebacivanja tehničkih postavki običnim korisnicima.",
      choices: [
        "Tehnički prijedlog prepuštam tebi, uz poštivanje budžeta",
        "Želim prvo pregled mjerenja i prijedloga",
        "Trebamo još razgovarati",
      ],
    },
    {
      title: "Kako provjeriti jutarnju špicu?",
      fact: "Više novih pješačkih proračuna po pretrazi može brzo popuniti kapacitet. Stvarna jutarnja špica još nije izmjerena.",
      proposal:
        "Prvo simulirati opterećenje na kontrolisanom servisu, a zatim pratiti malu betu. Ne opterećivati javne demo servere testom.",
    },
    {
      title: "Kada pripremiti infrastrukturu za rast?",
      fact: "Objavljena pravila FOSSGIS-a ograničavaju intenzivnu i određenu komercijalnu upotrebu. Besplatna beta nije trajna garancija servisa.",
      proposal:
        "Prije šire stvarne upotrebe odabrati uslugu ili regionalni hosting s odgovarajućim uslovima.",
    },
    {
      title: "Kako izabrati pouzdaniji servis?",
      fact: "Kod podržava OpenRouteService kao konfiguracijsku opciju, ali ključ nije podešen i nemamo automatski rezervni servis.",
      proposal:
        "Prema budžetu i mjerenjima uporediti ugovoreni API i vlastiti regionalni engine; predvidjeti alarm potrošnje i ponašanje pri padu servisa.",
      choices: [
        "Prvo uporedi cijenu i pouzdanost opcija",
        "Prednost dajem ugovorenom servisu",
        "Prednost dajem vlastitom regionalnom engineu",
        "Trebamo još razgovarati",
      ],
    },
    {
      title: "Treba li USPUT imati vlastitu navigaciju?",
      fact: "Sada imamo trasu i procjene, bez saobraćaja uživo ili navigacije skretanje po skretanje.",
      proposal:
        "Za početak ponuditi otvaranje vanjske navigacije uz dogovorene tačke, bez tihog mijenjanja dogovora.",
      choices: [
        "Za početak vanjska navigacija",
        "Vlastitu navigaciju razmotriti kasnije",
        "Vlastita navigacija mi je prioritet",
        "Trebamo još razgovarati",
      ],
    },
    {
      title: "Šta prikazati kada proračun nije pouzdan?",
      fact: "Nepostojeća ulica, nedostupan servis i neprohodna ruta su različiti ishodi.",
      proposal:
        "Jasno razlikovati odgovarajuće, približne i neprovjerene ponude. Sačuvati postojeći dogovor i ponuditi ponovni pokušaj.",
    },
    {
      title: "Kako potvrđujemo adresu i pin?",
      fact: "Već smo dogovorili fleksibilne sugestije u odabranom gradu, latinični prikaz i opcionalan naziv mjesta susreta.",
      proposal:
        "Potvrđeni pin ostaje glavni podatak; naziv ulice je pomoć, bez pretvaranja približne adrese u potvrđen kućni broj.",
    },
    {
      title: "Koliko slobode dati novom putnikovom pinu?",
      fact: "Blizina trase ne garantuje pješački pristup, odgovarajući smjer ili mogućnost zaustavljanja. Hodanje ostaje 5/10/15 minuta.",
      proposal:
        "U prvoj verziji putnik predlaže novo mjesto uz postojeću trasu, a vozač odobrava. Veća skretanja dolaze kasnije.",
      choices: [
        "Prvo novi pin uz postojeću trasu",
        "Želim odmah i prijedloge skretanja trase",
        "Trebamo još razgovarati",
      ],
    },
    {
      title: "Ko potvrđuje da se na tački može stati?",
      fact: "Algoritam i popularnost mjesta ne dokazuju da je zaustavljanje praktično ili dozvoljeno.",
      proposal:
        "Aplikacija predlaže, vozač koriguje i potvrđuje. Prolazni pin za oblikovanje trase odvojiti od mjesta za stajanje.",
    },
    {
      title: "Kako potvrđujemo pomjereno mjesto susreta?",
      fact: "Novi pin može promijeniti putnikovo hodanje i vrijeme. Chat poruka sama ne mijenja dogovor.",
      proposal:
        "Vozačev protuprijedlog ponovo potvrđuje putnik. Obje strane vide isti pin, vrijeme i verziju dogovora.",
    },
    {
      title: "Šta znači vrijeme koje putnik unosi?",
      fact: "Kod trenutno traži susret unutar približno ±60 minuta. Ranija ideja odstupanja od 15 minuta još nije isto pravilo u aplikaciji.",
      proposal:
        "Osnovno vrijeme je željeno vrijeme susreta; rok dolaska na posao je dodatni uslov. U komentaru napiši koliko ranije/kasnije dopuštamo i koliko se čeka na mjestu.",
      choices: [
        "Osnovno je vrijeme susreta; rok dolaska je dodatni uslov",
        "Osnovno je rok dolaska na cilj",
        "Želim oba obavezno",
        "Trebamo još razgovarati",
      ],
    },
    {
      title: "Kako postupati s više putnika i otkazivanjem?",
      fact: "Već postoje 1–7 mjesta i zasebni dogovori. Otkazivanje jednog putnika ne znači otkazivanje za sve.",
      proposal:
        "Za početak bez ponovne prodaje istog sjedišta kasnije na istoj trasi. Jasno obavijestiti pogođene putnike; pravilo čekanja i nedolaska posebno dogovoriti.",
    },
    {
      title: "Kakav razgovor treba uz zahtjev?",
      fact: "Kratke poruke olakšavaju dogovor o prilazu. Chat još nije implementiran.",
      proposal:
        "Brzi odgovori i kratak tekst samo uz zahtjev, uz prijavu problema. Promjena pina traži zasebnu potvrdu.",
      choices: [
        "Brzi odgovori i kratke vlastite poruke",
        "Samo brzi ponuđeni odgovori",
        "Za sada bez chata",
        "Trebamo još razgovarati",
      ],
    },
    {
      title: "Kada se uključuje međusobna geopozicija?",
      fact: "Već si predložio da se putnik i vozač vide samo tokom usluge. Ovo je plan, još nije uključena funkcija.",
      proposal:
        "Dobrovoljno dijeljenje neposredno oko susreta i tokom aktivne vožnje. Prekid na završetku, otkazivanju ili isteku; bez lokacija drugih putnika. U komentaru predloži koliko minuta prije susreta počinje i maksimalno trajanje.",
    },
    {
      title: "Šta očekujemo kad je aplikacija zatvorena?",
      fact: "Web Push i stalni GPS nisu ista stvar. iPhone može pauzirati lokaciju u pozadini, čak i kada obavijesti rade.",
      proposal:
        "Za web jasno pokazati svježinu lokacije i zadržati pin/ručno javljanje. Nativnu aplikaciju razmotriti ako je neprekidan GPS u pozadini obavezan.",
      choices: [
        "Za betu prihvatam ograničenja web aplikacije",
        "Pouzdan GPS u pozadini je obavezan — procijeniti nativnu aplikaciju",
        "Trebamo još razgovarati",
      ],
    },
    {
      title: "Kako potvrđujemo da su se ljudi našli?",
      fact: "GPS blizina i Bluetooth sami ne dokazuju da su osobe u istom autu.",
      proposal:
        "Ručna potvrda susreta i završetka; po potrebi jednokratni kod. Blizina samo pomaže, bez automatskog kažnjavanja.",
      choices: [
        "Za početak ručna potvrda",
        "Ručna potvrda i jednokratni kod",
        "Trebamo još razgovarati",
      ],
    },
    {
      title: "Kako obrađujemo privatne adrese i podatke?",
      fact: "Privatni pinovi mogu otkriti dom i posao. Javni Nominatim traži da se ne šalju lični ili povjerljivi podaci.",
      proposal:
        "Razvojna proba koristi probne/javne lokacije. Prije stvarne upotrebe odabrati odgovarajuću obradu i rokove čuvanja/brisanja; ne slati svaki GPS korak geokoderu.",
    },
    {
      title: "Kako gradske tačke uče u pozadini?",
      fact: "Već smo dogovorili jednostavan unos bez obaveznog kataloga. Automatsko grupisanje tek treba razviti.",
      proposal:
        "Učiti iz stvarnih uspješnih susreta, uz smjer i prilaz. Slični nazivi i blizina daju kandidate; privatni pinovi i demo podaci ne postaju automatski javne tačke.",
    },
    {
      title: "Šta nam treba za povjerenje i podršku?",
      fact: "Fotografija i Google prijava nisu provjera identiteta. Ocjene osoba, prijava problema i naplata nisu uvedene tim funkcijama.",
      proposal:
        "Prije stvarne probe podrška i prijava problema, jasni uslovi troškova; kasnije ocjene samo završenih stvarnih vožnji. Provjeriti lokalna pravila i osiguranje.",
    },
    {
      title: "Šta ti je prvi prioritet za sljedeću iteraciju?",
      fact: "Osnovni tok treba ostati kratak. Katalog, opisi i napredne postavke ne trebaju postati obavezni koraci.",
      proposal:
        "Najprije pouzdan unos i dogovor o tački, zatim kratke poruke i međusobna lokacija. Sve provjeriti na fizičkim telefonima.",
      choices: [
        "Pouzdana pretraga i jednostavan dogovor o tački",
        "Kratke poruke uz zahtjev",
        "Međusobna geopozicija",
        "Drugo — pišem prioritet ispod",
      ],
    },
  ];
  const form = document.querySelector("#answers");
  const container = document.querySelector("#questions");
  const saveState = document.querySelector("#save-state");
  const exportStatus = document.querySelector("#export-status");
  const contextFields = ["budget", "people", "cities", "notes"];
  const text = (tag, value, className) => {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  };

  for (const group of groups) {
    const section = document.createElement("section");
    section.id = group.id;
    section.className = "question-group";
    const heading = text("h2", group.title);
    heading.id = `${group.id}-title`;
    section.setAttribute("aria-labelledby", heading.id);
    section.append(heading);
    const grid = document.createElement("div");
    grid.className = "question-grid";
    for (let id = group.first; id <= group.last; id++) {
      const q = questions[id - 1];
      const fieldset = document.createElement("fieldset");
      fieldset.append(
        text("legend", `${id}. ${q.title}`),
        text("p", q.fact, "fact"),
      );
      const proposal = document.createElement("p");
      proposal.className = "recommendation";
      proposal.append(
        text("strong", "Preporučeni smjer"),
        document.createTextNode(q.proposal),
      );
      fieldset.append(proposal);
      const choices = document.createElement("div");
      choices.className = "choices";
      (q.choices || generic).forEach((choice, index) => {
        const label = document.createElement("label");
        label.className = "choice";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `q${id}`;
        radio.value = String(index);
        label.append(radio, text("span", choice));
        choices.append(label);
      });
      const commentLabel = text(
        "label",
        "Tvoja izmjena, brojka ili komentar (opcionalno)",
        "comment-label",
      );
      commentLabel.htmlFor = `comment-${id}`;
      const comment = document.createElement("textarea");
      comment.id = `comment-${id}`;
      comment.name = `comment${id}`;
      comment.rows = 2;
      comment.maxLength = 2000;
      fieldset.append(choices, commentLabel, comment);
      grid.append(fieldset);
    }
    section.append(grid);
    container.append(section);
  }

  function readAnswers() {
    const data = new FormData(form);
    return {
      schema: "usput-project-qa-v1",
      context: Object.fromEntries(
        contextFields.map((key) => [key, String(data.get(key) || "")]),
      ),
      questions: questions.map((q, index) => {
        const id = index + 1;
        const selected = data.get(`q${id}`);
        return {
          id,
          selected: selected === null ? null : Number(selected),
          comment: String(data.get(`comment${id}`) || ""),
        };
      }),
    };
  }

  function updateProgress(data) {
    const count = data.questions.filter(
      (q) => q.selected !== null || q.comment.trim(),
    ).length;
    document.querySelector("#progress").textContent =
      `Odgovoreno ${count} / ${questions.length}`;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved?.schema === storageKey && Array.isArray(saved.questions)) {
      for (const key of contextFields) {
        if (typeof saved.context?.[key] === "string") {
          const input = form.elements.namedItem(key);
          input.value = saved.context[key].slice(0, input.maxLength);
        }
      }
      for (const answer of saved.questions) {
        if (
          !Number.isInteger(answer.id) ||
          answer.id < 1 ||
          answer.id > questions.length
        )
          continue;
        const choices = questions[answer.id - 1].choices || generic;
        if (
          Number.isInteger(answer.selected) &&
          answer.selected >= 0 &&
          answer.selected < choices.length
        ) {
          form.querySelector(
            `input[name="q${answer.id}"][value="${answer.selected}"]`,
          ).checked = true;
        }
        if (typeof answer.comment === "string")
          form.elements.namedItem(`comment${answer.id}`).value =
            answer.comment.slice(0, 2000);
      }
      saveState.textContent = "Vraćeni su tvoji sačuvani odgovori.";
    }
  } catch {
    saveState.textContent =
      "Lokalno čuvanje nije dostupno. Preuzmi odgovore prije izlaska.";
  }
  updateProgress(readAnswers());

  form.addEventListener("input", () => {
    const data = readAnswers();
    updateProgress(data);
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      saveState.textContent = "Sačuvano u ovom pregledniku. Još nije poslano.";
    } catch {
      saveState.textContent =
        "Nije sačuvano lokalno. Preuzmi odgovore prije izlaska.";
    }
    if (!document.querySelector("#text-preview").hidden) renderPreview(false);
  });
  form.addEventListener("submit", (event) => event.preventDefault());

  function exportText() {
    const answers = readAnswers();
    const lines = [
      "USPUT — ODGOVORI NA FORMULAR",
      "Verzija: usput-project-qa-v1",
      `Pripremljeno: ${new Date().toLocaleString("bs-BA")}`,
      "Q/A: https://github.com/salemko72/USPUT/blob/feat/pulse-app/docs/2026-10-22-otvorena-pitanja-qa.md",
      "",
      `Mjesečni budžet za adrese i rute (€): ${answers.context.budget || "Bez odgovora"}`,
      `Ljudi u jutarnjoj špici: ${answers.context.people || "Bez odgovora"}`,
      `Gradovi prve probe: ${answers.context.cities || "Bez odgovora"}`,
      "",
    ];
    for (const answer of answers.questions) {
      const q = questions[answer.id - 1];
      const choices = q.choices || generic;
      lines.push(
        `${answer.id}. ${q.title}`,
        `Preporučeni smjer: ${q.proposal}`,
        `Odgovor: ${answer.selected === null ? "Bez odabranog odgovora" : choices[answer.selected]}`,
        `Komentar: ${answer.comment || "Bez komentara"}`,
        "",
      );
    }
    lines.push(
      "DODATNI KOMENTAR",
      answers.context.notes || "Bez komentara",
      "",
      "Neodgovorena pitanja nisu potvrda preporuke. Odgovori opisuju odluke za raspravu; ne tvrde da su funkcije implementirane.",
    );
    return lines.join("\n");
  }

  function renderPreview(focus) {
    document.querySelector("#text-preview").hidden = false;
    const output = document.querySelector("#export-text");
    output.value = exportText();
    if (focus) {
      output.focus();
      output.select();
    }
  }
  document
    .querySelector("#preview")
    .addEventListener("click", () => renderPreview(true));
  document.querySelector("#download").addEventListener("click", () => {
    const content = exportText();
    const blob = new Blob(["\uFEFF", content], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `USPUT-odgovori-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    exportStatus.textContent =
      "U preuzimanjima potraži USPUT-odgovori…txt i priloži datoteku u naš razgovor. Ako preuzimanje ne radi, koristi Prikaži tekst → Kopiraj tekst.";
  });
  document.querySelector("#copy").addEventListener("click", async () => {
    const content = exportText();
    try {
      await navigator.clipboard.writeText(content);
      exportStatus.textContent =
        "Tekst je kopiran. Zalijepi ga u naš razgovor.";
    } catch {
      renderPreview(true);
      exportStatus.textContent =
        "Tekst je označen. Odaberi Kopiraj u pregledniku i zalijepi ga u naš razgovor.";
    }
  });
})();

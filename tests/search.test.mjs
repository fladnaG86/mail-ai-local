/**
 * Test della ricerca (blocco B), funzioni pure (node --test): interpretazione
 * dei prefissi in stile Outlook, anteprima con il termine evidenziato, ricerca
 * sui dati in memoria (percorso browser), evidenziazione nell'anteprima e testi
 * dell'intestazione dei risultati. Il disegno è verificato con le prove visive
 * (`?view=ricerca`), non qui.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analizzaQuery,
  termineEvidenza,
  anteprima,
  cercaNeiMessaggi,
  daRigaRicercaKernel,
  intestazioneRicerca,
  testoNessunRisultato,
  evidenzia,
  ANTEPRIMA_MAX,
  LIMITE_RICERCA,
} from "../src/views/search.js";

// Messaggi di esempio in memoria (forma dei `sampleMessages` del browser).
const MESSAGGI = [
  {
    id: 1,
    from: "Luca Bianchi",
    subject: "Piano manutenzione Q4",
    date: "lun 12/10/26, 17:26",
    seen: false,
    flagged: true,
    has_attachments: false,
    categories: ["Lavoro"],
    completed: false,
    body: [
      "Mario,",
      "per il piano Q4 servono gli interventi su VED e Beta.",
      "Il fermo impianto è previsto la prima settimana di dicembre.",
    ],
  },
  {
    id: 2,
    from: "BETA - Industrial Services",
    subject: "Nuovo dato inserito nel form contatti",
    date: "lun 12/10/26, 16:37",
    seen: true,
    flagged: false,
    has_attachments: true,
    categories: [],
    completed: false,
  },
  {
    id: 3,
    from: "marco.ferrari@esempiogroup.it",
    subject: "Prenotazione ritiro AMAZON DHL",
    date: "lun 12/10/26, 16:20",
    seen: false,
    flagged: false,
    has_attachments: true,
    categories: ["Fornitori"],
    completed: false,
  },
];

test("i prefissi in stile Outlook separano filtri e testo libero", () => {
  const q = analizzaQuery("da:luca oggetto:piano con:allegato non:letto manutenzione");
  assert.equal(q.da, "luca");
  assert.equal(q.oggetto, "piano");
  assert.equal(q.conAllegato, true);
  assert.equal(q.nonLetto, true);
  assert.equal(q.testo, "manutenzione");
});

test("un prefisso sconosciuto resta testo libero", () => {
  const q = analizzaQuery("con:tutto Deleghe");
  assert.equal(q.conAllegato, false);
  assert.equal(q.testo, "con:tutto Deleghe");
});

test("il termine da evidenziare è la prima parola libera", () => {
  assert.equal(termineEvidenza("da:luca piano Q4"), "piano");
  assert.equal(termineEvidenza("oggetto:capannone"), "capannone");
  assert.equal(termineEvidenza(""), "");
});

test("l'anteprima evidenzia il termine fra virgolette", () => {
  const corpo = "per il piano Q4 servono gli interventi su VED e Beta";
  const a = anteprima(corpo, "Piano manutenzione Q4", "piano");
  assert.ok(a.includes("«piano»"), `anteprima: ${a}`);
  assert.ok(a.length <= ANTEPRIMA_MAX + 20, `anteprima troppo lunga: ${a}`);
});

test("l'anteprima ripiega sull'oggetto quando il corpo non contiene il termine", () => {
  const a = anteprima("corpo senza la parola", "Riunione Q4", "riunione");
  assert.ok(a.includes("«Riunione»"), `anteprima: ${a}`);
});

test("l'anteprima tronca i testi lunghi con i puntini", () => {
  const lungo = "x".repeat(500);
  const a = anteprima(lungo, "", "");
  assert.ok(a.endsWith("…"), "deve finire con i puntini");
  assert.ok(a.length <= ANTEPRIMA_MAX + 1);
});

test("l'evidenziazione racchiude il termine in <mark> senza distinzione di maiuscole", () => {
  assert.equal(
    evidenzia("il piano di manutenzione", "piano"),
    'il <mark class="search-hit">piano</mark> di manutenzione',
  );
  assert.equal(
    evidenzia("Piano Q4", "piano"),
    '<mark class="search-hit">Piano</mark> Q4',
  );
});

test("l'evidenziazione mette in fuga l'HTML e non inventa marcature senza termine", () => {
  assert.equal(
    evidenzia("ciao <mondo>", "mondo"),
    'ciao &lt;<mark class="search-hit">mondo</mark>&gt;',
  );
  assert.equal(evidenzia("ciao <mondo>", ""), "ciao &lt;mondo&gt;");
});

test("l'intestazione dei risultati e il caso vuoto hanno il testo atteso", () => {
  assert.equal(intestazioneRicerca("piano", 3), "Risultati per «piano»: 3");
  assert.equal(intestazioneRicerca("  piano  ", 0), "Risultati per «piano»: 0");
  assert.equal(testoNessunRisultato("zzz"), "Nessun risultato per «zzz»");
});

test("la ricerca in memoria trova per parola nel corpo", () => {
  const esito = cercaNeiMessaggi(MESSAGGI, "impianto");
  assert.equal(esito.nota, null);
  assert.equal(esito.risultati.length, 1);
  assert.equal(esito.risultati[0].id, 1);
  assert.ok(esito.risultati[0].anteprima.includes("«impianto»"));
});

test("la ricerca in memoria trova per parola nell'oggetto e nel mittente", () => {
  assert.equal(cercaNeiMessaggi(MESSAGGI, "prenotazione").risultati.length, 1);
  // "beta" compare due volte: nel corpo del primo e nel mittente del secondo.
  assert.equal(cercaNeiMessaggi(MESSAGGI, "beta").risultati.length, 2);
});

test("una parola assente dà una lista vuota, non un errore", () => {
  const esito = cercaNeiMessaggi(MESSAGGI, "inesistentezzz");
  assert.deepEqual(esito.risultati, []);
  assert.equal(esito.nota, null);
});

test("i prefissi filtrano la ricerca in memoria", () => {
  assert.equal(cercaNeiMessaggi(MESSAGGI, "non:letto").risultati.length, 2);
  assert.equal(cercaNeiMessaggi(MESSAGGI, "con:allegato").risultati.length, 2);
  assert.equal(cercaNeiMessaggi(MESSAGGI, "da:beta").risultati.length, 1);
  assert.equal(cercaNeiMessaggi(MESSAGGI, "da:marco oggetto:amazon").risultati.length, 1);
});

test("il limite dei risultati viene rispettato", () => {
  assert.equal(cercaNeiMessaggi(MESSAGGI, "a", LIMITE_RICERCA).risultati.length, 3);
  assert.equal(cercaNeiMessaggi(MESSAGGI, "a", 1).risultati.length, 1);
});

test("daRigaRicercaKernel adatta la riga del kernel alla forma della lista", () => {
  const m = daRigaRicercaKernel({
    folder: "INBOX",
    uid: "42",
    oggetto: "Piano Q4",
    mittente: "Luca <a@b.it>",
    data: "2026-10-12T15:26:00Z",
    anteprima: "il «piano» di manutenzione",
    nonLetto: true,
    allegati: true,
    contrassegnato: false,
    completato: true,
    categorie: ["Lavoro"],
    timestamp: 1_760_000_000,
  });
  assert.equal(m.uid, "42");
  assert.equal(m.from, "Luca <a@b.it>");
  assert.equal(m.subject, "Piano Q4");
  assert.equal(m.seen, false, "nonLetto invertito in seen");
  assert.equal(m.has_attachments, true);
  assert.equal(m.completed, true);
  assert.deepEqual(m.categories, ["Lavoro"]);
  assert.match(m.date, /^\w{3} \d{2}\/\d{2}\/\d{2}, \d{2}:\d{2}$/);
});

test("daRigaRicercaKernel porta la casella di provenienza", () => {
  // La ricerca attraversa le caselle: senza l'account nella riga, un'azione su
  // un risultato in vista aggregata non sa da dove pescare e si ferma.
  const m = daRigaRicercaKernel({
    account: "mario.rossi@esempiogroup.it",
    folder: "INBOX",
    uid: "42",
    oggetto: "Piano Q4",
    mittente: "Luca <a@b.it>",
    data: "2026-10-12T15:26:00Z",
    anteprima: "",
    nonLetto: false,
    allegati: false,
    contrassegnato: false,
    completato: false,
    categorie: [],
    timestamp: 1_760_000_000,
  });
  assert.equal(m.account, "mario.rossi@esempiogroup.it");
  assert.equal(m.folder, "INBOX");
});

test("una riga del kernel senza campi non rompe la forma della lista", () => {
  const m = daRigaRicercaKernel({
    folder: "Archivio",
    uid: "7",
    oggetto: null,
    mittente: null,
    data: "2026-01-01T00:00:00Z",
    anteprima: "",
    nonLetto: false,
    allegati: false,
    contrassegnato: false,
    completato: false,
    categorie: null,
    timestamp: 1_767_225_600,
  });
  assert.equal(m.from, "(mittente sconosciuto)");
  assert.equal(m.subject, "(nessun oggetto)");
  assert.equal(m.seen, true);
  assert.deepEqual(m.categories, []);
  // Stringa vuota, mai `undefined`: `accountDi` distingue «campo assente» (usa
  // la selezione attiva) da «casella nota», e `undefined` non è né l'uno né
  // l'altro.
  assert.equal(m.account, "");
});

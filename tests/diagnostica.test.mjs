// Test della diagnostica della connessione (blocco M): la formattazione dei
// passi per la finestra e per gli appunti, e i consigli in italiano associati a
// ciascun tipo di errore. Funzioni pure, nessun DOM: girano con
// `node --test tests/*.mjs`.
//
// Nessuna credenziale reale: i testi qui sotto sono risposte di server scritte a
// mano, come quelle che il kernel riporta.

import test from "node:test";
import assert from "node:assert/strict";

import {
  consiglioDiagnostica,
  formattaPassi,
  iconaPasso,
  testoDiagnostica,
} from "../src/views/account.js";

/// I passi della ricezione come li restituisce il kernel quando l'accesso è
/// rifiutato: è il caso che l'utente deve poter capire da solo.
const ESITO_IMAP = {
  protocollo: "IMAP",
  passi: [
    { passo: "nome server", esito: "ok", dettaglio: "imaps.esempiohost.it → 192.0.2.42" },
    {
      passo: "connessione",
      esito: "ok",
      dettaglio: "connessione TCP aperta con 192.0.2.42:993 (imaps.esempiohost.it:993)",
    },
    {
      passo: "certificato",
      esito: "ok",
      dettaglio: "certificato valido: soggetto «CN=*.esempiohost.it», valido fino al 13 Feb 2026",
    },
    {
      passo: "saluto del server",
      esito: "ok",
      dettaglio: "* OK [CAPABILITY IMAP4rev1] Dovecot ready.",
    },
    {
      passo: "accesso",
      esito: "errore",
      dettaglio: "il server ha rifiutato l'accesso: NO [AUTHENTICATIONFAILED] Authentication failed.",
    },
  ],
  interrotto: true,
  riepilogo:
    "La diagnostica si ferma al passo 5 (accesso): il server ha rifiutato l'accesso: NO [AUTHENTICATIONFAILED] Authentication failed.",
};

test("l'icona del passo è ✓ se riuscito e ✗ in ogni altro caso", () => {
  assert.equal(iconaPasso("ok"), "✓");
  assert.equal(iconaPasso("errore"), "✗");
  assert.equal(iconaPasso(undefined), "✗");
  assert.equal(iconaPasso(""), "✗");
});

test("formattaPassi conserva l'ordine e mette il consiglio solo sui fallimenti", () => {
  const righe = formattaPassi(ESITO_IMAP.passi);
  assert.equal(righe.length, 5);
  assert.deepEqual(
    righe.map((r) => r.passo),
    ["nome server", "connessione", "certificato", "saluto del server", "accesso"],
  );
  assert.deepEqual(
    righe.map((r) => r.icona),
    ["✓", "✓", "✓", "✓", "✗"],
  );
  assert.deepEqual(
    righe.map((r) => r.esito),
    ["ok", "ok", "ok", "ok", "errore"],
  );
  // Il testo del server resta intatto: è quello che l'utente deve poter incollare.
  assert.equal(righe[0].dettaglio, "imaps.esempiohost.it → 192.0.2.42");
  assert.equal(righe[4].dettaglio, ESITO_IMAP.passi[4].dettaglio);
  // Il consiglio compare solo sul passo fallito.
  assert.deepEqual(
    righe.map((r) => (r.consiglio ? "consiglio" : "")),
    ["", "", "", "", "consiglio"],
  );
});

test("formattaPassi regge un elenco vuoto o assente", () => {
  assert.deepEqual(formattaPassi(), []);
  assert.deepEqual(formattaPassi([]), []);
  assert.deepEqual(formattaPassi(null), []);
});

test("il consiglio sul nome server parla di come si scrive l'indirizzo", () => {
  const c = consiglioDiagnostica("nome server", "non è stato possibile risolvere il nome «imaps.x.invalid»");
  assert.match(c, /imaps\.esempiohost\.it/);
  assert.match(c, /Internet/);
});

test("il consiglio sulla connessione nomina le porte", () => {
  const c = consiglioDiagnostica("connessione", "connessione a imaps.esempiohost.it:993 non riuscita: Connection refused");
  assert.match(c, /993/);
  assert.match(c, /465/);
  assert.match(c, /firewall/i);
});

test("il certificato scaduto rimanda all'assistenza, non alla password", () => {
  const c = consiglioDiagnostica("certificato", "il certificato è scaduto il 13 Feb 2026");
  assert.match(c, /scaduto/i);
  assert.match(c, /assistenza/i);
  assert.match(c, /non dipende dalla tua password/i);
});

test("un certificato non accettato fa controllare la casella SSL", () => {
  const c = consiglioDiagnostica(
    "certificato",
    "handshake TLS con imaps.esempiohost.it non riuscito: certificate verify failed",
  );
  assert.match(c, /SSL/);
  assert.match(c, /orologio/i);
});

test("il saluto inatteso fa controllare porta e cifratura", () => {
  const c = consiglioDiagnostica("saluto del server", "il server non ha salutato come previsto: 220 ok");
  assert.match(c, /STARTTLS/);
  assert.match(c, /993/);
});

test("un accesso rifiutato fa verificare il nome utente e la password", () => {
  const c = consiglioDiagnostica(
    "accesso",
    "il server ha rifiutato l'accesso: NO [AUTHENTICATIONFAILED] Authentication failed.",
  );
  assert.match(c, /nome utente/i);
  assert.match(c, /indirizzo completo/);
  assert.match(c, /Esempio Host/);
});

test("un rifiuto SMTP (535) riceve lo stesso consiglio di un rifiuto IMAP", () => {
  const imap = consiglioDiagnostica("accesso", "NO [AUTHENTICATIONFAILED] Authentication failed.");
  const smtp = consiglioDiagnostica(
    "accesso",
    "il server ha rifiutato l'accesso: 535 5.7.8 Authentication credentials invalid",
  );
  assert.equal(smtp, imap);
});

test("la password assente dal Portachiavi è un caso distinto e si spiega", () => {
  const c = consiglioDiagnostica(
    "accesso",
    "nessuna password nel Portachiavi di macOS per questo account: aprila dalla finestra Account e salvala",
  );
  assert.match(c, /password salvata/i);
  assert.match(c, /Portachiavi/);
});

test("le cartelle mancanti sono un disservizio del server, non dell'account", () => {
  const c = consiglioDiagnostica("cartelle", "il server non ha elencato nessuna cartella");
  assert.match(c, /disservizio|temporaneo/i);
});

test("ogni passo in errore ha un consiglio, e nessun consiglio è gergo grezzo", () => {
  const passi = [
    "nome server",
    "connessione",
    "certificato",
    "saluto del server",
    "accesso",
    "cartelle",
    "un passo mai visto",
  ];
  for (const p of passi) {
    const c = consiglioDiagnostica(p, "");
    assert.ok(c.length > 40, `consiglio troppo corto per «${p}»: ${c}`);
    assert.doesNotMatch(c, /std::io::Error|E0277|unwrap|panic|Err\(/);
  }
});

test("testoDiagnostica prepara il testo da incollare: intestazione, passi, consigli, riepilogo", () => {
  const testo = testoDiagnostica([ESITO_IMAP]);
  assert.match(testo, /Prova della connessione — IMAP/);
  assert.match(testo, /✓ nome server: imaps\.esempiohost\.it → 192\.0\.2\.42/);
  assert.match(testo, /✗ accesso: il server ha rifiutato l'accesso: NO \[AUTHENTICATIONFAILED\]/);
  assert.match(testo, /→ Il server ha rifiutato utente o password/);
  assert.match(testo, /Risultato: La diagnostica si ferma al passo 5 \(accesso\)/);
  // Un passo riuscito non porta con sé nessun consiglio.
  assert.doesNotMatch(testo, /→ .*nome server/);
});

test("testoDiagnostica mette i due blocchi (ricezione e invio) uno dopo l'altro", () => {
  const invio = {
    protocollo: "SMTP",
    passi: [{ passo: "connessione", esito: "errore", dettaglio: "connessione a smtps.esempiohost.it:465 non riuscita" }],
    interrotto: true,
    riepilogo: "La diagnostica si ferma al passo 1 (connessione): connessione a smtps.esempiohost.it:465 non riuscita",
  };
  const testo = testoDiagnostica([ESITO_IMAP, invio]);
  assert.match(testo, /Prova della connessione — IMAP/);
  assert.match(testo, /Prova della connessione — SMTP/);
  assert.ok(
    testo.indexOf("— IMAP") < testo.indexOf("— SMTP"),
    "l'ordine dei blocchi è quello dei passi: la ricezione prima dell'invio",
  );
  assert.match(testo, /\n\n/, "i blocchi sono separati da una riga vuota");
});

test("testoDiagnostica non inventa nulla e regge gli ingressi vuoti", () => {
  assert.equal(testoDiagnostica([]), "");
  assert.equal(testoDiagnostica(), "");
  assert.equal(testoDiagnostica([null, undefined]), "");
  // Il segnaposto con cui il kernel nasconde la password resta quello: il testo
  // da incollare non la contiene, perché non la contiene il passo.
  const testo = testoDiagnostica([
    {
      protocollo: "IMAP",
      passi: [{ passo: "accesso", esito: "errore", dettaglio: "rifiutato per ••••••" }],
      interrotto: true,
      riepilogo: "si ferma al passo 1 (accesso)",
    },
  ]);
  assert.match(testo, /••••••/);
});

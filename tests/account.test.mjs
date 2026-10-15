// Test della finestra Account: mappatura dei campi verso il kernel e validazione.
// Funzioni pure, nessun DOM: girano con `node --test tests/*.mjs`.

import test from "node:test";
import assert from "node:assert/strict";

import { creaAccountDaCampi, erroriAccount, testoElencoVuoto } from "../src/views/account.js";

const campiValidi = {
  description: "Posta di lavoro",
  fullName: "Mario Rossi",
  email: "mario.rossi@esempiogroup.it",
  username: "mario.rossi@esempiogroup.it",
  password: "segreta",
  imapHost: "imaps.esempiohost.it",
  imapPort: "993",
  imapSsl: true,
  smtpHost: "smtps.esempiohost.it",
  smtpPort: "465",
  smtpSsl: true,
};

test("i campi diventano l'account atteso dal kernel (camelCase, porte numeriche)", () => {
  const { account, password } = creaAccountDaCampi(campiValidi);
  assert.equal(account.email, "mario.rossi@esempiogroup.it");
  assert.equal(account.fullName, "Mario Rossi");
  assert.equal(account.imapHost, "imaps.esempiohost.it");
  assert.equal(account.imapPort, 993);
  assert.equal(account.imapSsl, true);
  assert.equal(account.smtpHost, "smtps.esempiohost.it");
  assert.equal(account.smtpPort, 465);
  assert.equal(password, "segreta");
});

test("l'identificativo dell'account è l'indirizzo email", () => {
  const { account } = creaAccountDaCampi(campiValidi);
  assert.equal(account.id, "mario.rossi@esempiogroup.it");
});

test("la descrizione vuota ricade sull'indirizzo email", () => {
  const { account } = creaAccountDaCampi({ ...campiValidi, description: "  " });
  assert.equal(account.description, "mario.rossi@esempiogroup.it");
});

test("una porta non numerica diventa 0 (e viene segnalata dalla validazione)", () => {
  const campi = { ...campiValidi, imapPort: "abc" };
  assert.equal(creaAccountDaCampi(campi).account.imapPort, 0);
  assert.ok(erroriAccount(campi).some((e) => e.includes("arrivo")));
});

test("un modulo completo e valido non produce errori", () => {
  assert.deepEqual(erroriAccount(campiValidi), []);
});

test("email non valida, host mancanti e porta fuori intervallo sono segnalati", () => {
  const errori = erroriAccount({
    ...campiValidi,
    email: "non-una-email",
    username: "",
    imapHost: "",
    imapPort: "70000",
  });
  assert.ok(errori.some((e) => e.includes("email")));
  assert.ok(errori.some((e) => e.includes("Nome utente")));
  assert.ok(errori.some((e) => e.includes("arrivo")));
  assert.ok(errori.some((e) => e.includes("Porta di posta in arrivo")));
});

test("la password si può non richiedere (modifica di un account già salvato)", () => {
  const campi = { ...campiValidi, password: "" };
  assert.ok(erroriAccount(campi, { richiediPassword: true }).some((e) => e.includes("Password")));
  assert.deepEqual(erroriAccount(campi, { richiediPassword: false }), []);
});

// ---------------------------------------------------------------------------
// Testo dell'elenco vuoto (primo avvio)
// ---------------------------------------------------------------------------

test("a elenco vuoto il testo rimanda al pulsante «Nuovo account»", () => {
  // Caso normale: la finestra si apre senza caselle e il modulo è chiuso.
  // Si dice dove sta il pulsante, e va detto con l'etichetta che ha davvero.
  const testo = testoElencoVuoto({ primoAvvio: false });
  assert.match(testo, /Nessun account configurato/);
  assert.match(testo, /Nuovo account/, "deve indicare il pulsante da premere");
});

test("al primo avvio il testo non rimanda a un pulsante già premuto", () => {
  // All'avvio la finestra si apre da sé **col modulo già pronto**: dire
  // «Aggiungine uno con ＋ Nuovo account» sarebbe un'istruzione per un'azione
  // già avvenuta, e il pulsante è ridondante.
  const testo = testoElencoVuoto({ primoAvvio: true });
  assert.match(testo, /Nessun account configurato/);
  assert.doesNotMatch(
    testo,
    /Aggiungine uno/,
    "al primo avvio non si deve invitare a premere «Nuovo account»: il modulo è già aperto",
  );
  assert.match(testo, /compila|inserisci/i, "si indica invece cosa fare nel modulo aperto");
});

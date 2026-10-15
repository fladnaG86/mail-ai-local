// Test del blocco J — più caselle (funzioni pure, `node --test tests/*.mjs`).
// Coprono: l'albero della barra laterale raggruppato per account (con Preferiti e
// conteggi dei non letti), lo stato attivo (account + cartella), le etichette del
// riferimento, il testo della conferma di eliminazione e il riepilogo per account
// di «Invia e ricevi» su tutte le caselle.

import test from "node:test";
import assert from "node:assert/strict";

import {
  alberoCartelle,
  eAttivo,
  nonLettiDi,
  nonLettiAggregato,
  etichettaAccountAttivo,
  etichettaCartellaAttiva,
  testoConfermaEliminaAccount,
  riepilogoSyncTutti,
  nomeAccount,
  TUTTI_GLI_ACCOUNT,
  POSTA_IN_ARRIVO,
  NUOVO_ACCOUNT,
  CARTELLA_POSTA_IN_ARRIVO,
} from "../src/views/cartelle-account.js";
import { righeAccount, creaAccountDaCampi } from "../src/views/account.js";

/** Due caselle di prova, come le restituisce `cartelle_elenco`. */
function gruppi() {
  return [
    {
      account: "lavoro@example.it",
      email: "lavoro@example.it",
      descrizione: "Posta di lavoro",
      predefinito: true,
      cartelle: [
        { nome: "INBOX", preferita: false, nonLetti: 3 },
        { nome: "Bozze", preferita: false, nonLetti: 0 },
        { nome: "Piano manutenzione", preferita: true, nonLetti: 1 },
      ],
    },
    {
      account: "personale@example.it",
      email: "personale@example.it",
      descrizione: "Casella personale",
      predefinito: false,
      cartelle: [
        { nome: "INBOX", preferita: false, nonLetti: 2 },
        { nome: "Posta inviata", preferita: false, nonLetti: 0 },
      ],
    },
  ];
}

test("le etichette sono quelle del riferimento", () => {
  assert.equal(TUTTI_GLI_ACCOUNT, "Tutti gli account");
  assert.equal(POSTA_IN_ARRIVO, "Posta in arrivo");
  assert.equal(NUOVO_ACCOUNT, "Nuovo account");
  assert.equal(CARTELLA_POSTA_IN_ARRIVO, "INBOX");
});

test("l'albero mette «Tutti gli account» in cima, con la Posta in arrivo aggregata", () => {
  const nodi = alberoCartelle(gruppi(), { accountAperti: new Set() });
  assert.equal(nodi[0].kind, "group");
  assert.equal(nodi[0].nome, "Tutti gli account");
  assert.equal(nodi[0].open, true, "«Tutti gli account» resta sempre aperto");
  assert.equal(nodi[1].kind, "child");
  assert.equal(nodi[1].nome, "Posta in arrivo");
  assert.equal(nodi[1].account, "", "il nodo aggregato non è di una casella");
  assert.equal(nodi[1].nonLetti, 5, "3 + 2 non letti nelle Posta in arrivo delle caselle");
  assert.equal(nodi[0].nonLetti, 6, "il nodo «Tutti gli account» conta tutto (4 + 2)");
});

test("ogni casella è un nodo con le sue cartelle, preferiti in alto", () => {
  const nodi = alberoCartelle(gruppi(), {
    accountAperti: new Set(["lavoro@example.it"]),
  });
  const lavoro = nodi.find((n) => n.kind === "group" && n.account === "lavoro@example.it");
  assert.ok(lavoro, "il nodo della casella c'è");
  assert.equal(lavoro.open, true);
  assert.equal(lavoro.predefinito, true, "la casella predefinita è segnalata");
  assert.equal(lavoro.nome, "lavoro@example.it");

  // Le sue cartelle seguono, con i Preferiti (★) in alto e i conteggi della cache.
  const figli = nodi.filter((n) => n.kind === "child" && n.account === "lavoro@example.it");
  assert.deepEqual(
    figli.map((f) => f.nome),
    ["Piano manutenzione", "INBOX", "Bozze"],
    "il preferito ★ sta in alto dentro il suo account",
  );
  assert.equal(figli[0].preferita, true);
  assert.equal(figli[0].nonLetti, 1);
  assert.equal(figli[1].nonLetti, 3, "i non letti della cache si mostrano");

  // La casella chiusa non mostra le sue cartelle.
  const personale = nodi.find((n) => n.kind === "group" && n.account === "personale@example.it");
  assert.equal(personale.open, false);
  assert.equal(
    nodi.filter((n) => n.kind === "child" && n.account === "personale@example.it").length,
    0,
  );
});

test("i conteggi dei non letti si sommano per casella e in tutto", () => {
  const g = gruppi();
  assert.equal(nonLettiDi(g[0]), 4, "3 + 1");
  assert.equal(nonLettiDi(g[1]), 2);
  assert.equal(nonLettiAggregato(g, "INBOX"), 5);
  assert.equal(nonLettiAggregato(g, "Bozze"), 0);
});

test("lo stato attivo è la coppia account + cartella", () => {
  assert.ok(eAttivo({ kind: "child", account: "a@x", cartella: "INBOX" }, { account: "a@x", cartella: "INBOX" }));
  assert.ok(!eAttivo({ kind: "child", account: "a@x", cartella: "INBOX" }, { account: "b@x", cartella: "INBOX" }));
  assert.ok(!eAttivo({ kind: "child", account: "a@x", cartella: "Bozze" }, { account: "a@x", cartella: "INBOX" }));
  // Il nodo aggregato copre la sola Posta in arrivo di «Tutti gli account».
  assert.ok(eAttivo({ kind: "child", account: "", cartella: null }, { account: "", cartella: "INBOX" }));
  assert.ok(!eAttivo({ kind: "child", account: "", cartella: null }, { account: "", cartella: "Bozze" }));
  // Un nodo di gruppo non è mai attivo.
  assert.ok(!eAttivo({ kind: "group", account: "a@x" }, { account: "a@x", cartella: "INBOX" }));
});

test("l'albero segna attiva la cartella della selezione", () => {
  const nodi = alberoCartelle(gruppi(), {
    accountAperti: new Set(["lavoro@example.it", "personale@example.it"]),
    selezione: { account: "personale@example.it", cartella: "INBOX" },
  });
  const attivi = nodi.filter((n) => n.attivo);
  assert.equal(attivi.length, 1, "una sola voce attiva");
  assert.equal(attivi[0].account, "personale@example.it");
  assert.equal(attivi[0].cartella, "INBOX");
});

test("la barra di stato dice l'account attivo, o «Tutti gli account»", () => {
  const g = gruppi();
  assert.equal(etichettaAccountAttivo(g, { account: "" }), "Tutti gli account");
  assert.equal(etichettaAccountAttivo(g, {}), "Tutti gli account");
  assert.equal(etichettaAccountAttivo(g, { account: "lavoro@example.it" }), "lavoro@example.it");
  assert.equal(etichettaCartellaAttiva({ cartella: "INBOX" }), "Posta in arrivo");
  assert.equal(etichettaCartellaAttiva({ cartella: "Bozze" }), "Bozze");
});

test("la conferma di eliminazione dice cosa succede ai dati", () => {
  const testo = testoConfermaEliminaAccount({ email: "personale@example.it" });
  assert.match(testo, /Eliminare l'account «personale@example\.it»\?/);
  assert.match(testo, /solo di questo account|di questo account/i);
  assert.match(testo, /Gli altri account non vengono toccati/);
  assert.match(testo, /Portachiavi/);
  assert.match(testo, /sul server di posta non cambia nulla/i);
  // Accetta anche una stringa diretta.
  assert.match(testoConfermaEliminaAccount("a@x.it"), /a@x\.it/);
});

test("il riepilogo di «Invia e ricevi» è per account, anche con un fallito", () => {
  const testo = riepilogoSyncTutti([
    { account: "a@x.it", email: "a@x.it", ok: true, nuovi: 2, cartelle: 3 },
    { account: "b@x.it", email: "b@x.it", ok: false, errore: "login IMAP rifiutato" },
    { account: "c@x.it", email: "c@x.it", ok: true, nuovi: 0, cartelle: 1 },
  ]);
  assert.match(testo, /3 account/);
  assert.match(testo, /a@x\.it: 2 messaggi nuovi/);
  assert.match(testo, /b@x\.it: non aggiornato — login IMAP rifiutato/);
  assert.match(testo, /c@x\.it: 0 messaggi nuovi/);
  assert.match(testo, /1 non aggiornato/);
});

test("il riepilogo al singolare e senza account", () => {
  assert.equal(
    riepilogoSyncTutti([{ account: "a@x.it", email: "a@x.it", ok: true, nuovi: 1 }]),
    "Invia e ricevi: a@x.it: 1 messaggio nuovo",
  );
  assert.match(riepilogoSyncTutti([]), /Nessun account configurato/);
});

test("l'elenco della finestra Account segnala predefinito e selezione", () => {
  const elenco = [
    { id: "a@x.it", email: "a@x.it", description: "Lavoro" },
    { id: "b@x.it", email: "b@x.it", description: "" },
  ];
  const righe = righeAccount(elenco, "b@x.it", "a@x.it");
  assert.equal(righe.length, 2);
  assert.equal(righe[0].nome, "Lavoro");
  assert.ok(righe[0].selezionato, "la riga cliccata è quella selezionata");
  assert.ok(!righe[0].predefinito);
  assert.ok(righe[1].predefinito, "l'account predefinito è indicato");
  assert.equal(righe[1].nome, "b@x.it", "la descrizione vuota ricade sull'indirizzo");
  // Un elenco vuoto non produce righe (la finestra lo dichiara).
  assert.deepEqual(righeAccount([], "a@x.it", ""), []);
});

test("un indirizzo diverso produce un id diverso (una riga nuova, non una sostituzione)", () => {
  const base = {
    description: "Lavoro",
    fullName: "Mario Rossi",
    email: "lavoro@example.it",
    username: "lavoro@example.it",
    password: "",
    imapHost: "imaps.example.it",
    imapPort: "993",
    imapSsl: true,
    smtpHost: "smtps.example.it",
    smtpPort: "465",
    smtpSsl: true,
  };
  const a = creaAccountDaCampi(base).account;
  const b = creaAccountDaCampi({ ...base, email: "personale@example.it", username: "personale@example.it" }).account;
  assert.equal(a.id, "lavoro@example.it");
  assert.equal(b.id, "personale@example.it");
  assert.notEqual(a.id, b.id, "un altro indirizzo è un'altra casella");
  // Lo stesso indirizzo resta lo stesso id (upsert, non duplicato).
  const a2 = creaAccountDaCampi(base).account;
  assert.equal(a2.id, a.id);
});

test("nomeAccount sceglie la descrizione, poi l'indirizzo", () => {
  assert.equal(nomeAccount({ descrizione: "Lavoro", email: "a@x.it" }), "Lavoro");
  assert.equal(nomeAccount({ email: "a@x.it" }), "a@x.it");
  assert.equal(nomeAccount(null), "");
});

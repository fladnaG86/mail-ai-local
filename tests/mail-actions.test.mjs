/**
 * Test della logica pura delle azioni sui messaggi (node --test): i filtri di
 * "Filtra posta elettronica" e la resa degli stati di una riga (letto,
 * contrassegnato, completato, categorie). Il disegno è verificato con le prove
 * visive (`?view=filtro`), non qui.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FILTRI,
  etichettaFiltro,
  messaggioOggi,
  passaFiltro,
  filtra,
  statoRiga,
  pallinoRiga,
  bandieraRiga,
  classiRiga,
  categorieRiga,
  alternaCategoria,
  CATEGORIE_PREDEFINITE,
  testoNonDisponibileRibbon,
  NON_DISPONIBILI_V1,
  fugaHtml,
} from "../src/views/mail-actions.js";
import { daRigaKernel } from "../src/views/main-view.js";

// Un "adesso" fisso (13/10/2026, mezzogiorno) per rendere deterministico il
// filtro "Oggi": i timestamp sono in secondi, come dal kernel.
const ADESSO = Date.UTC(2026, 9, 13, 12, 0, 0);
const OGGI = Math.floor(Date.UTC(2026, 9, 13, 9, 30, 0) / 1000);
const IERI = Math.floor(Date.UTC(2026, 9, 12, 9, 30, 0) / 1000);

const MESSAGGI = [
  { id: 1, seen: false, flagged: true, has_attachments: false, categories: ["Lavoro"], completed: true, timestamp: OGGI },
  { id: 2, seen: true, flagged: false, has_attachments: true, categories: [], completed: false, timestamp: OGGI },
  { id: 3, seen: false, flagged: false, has_attachments: false, categories: ["Urgente"], completed: false, timestamp: IERI },
  { id: 4, seen: true, flagged: true, has_attachments: true, categories: [], completed: false, timestamp: IERI },
];

const id = (elenco) => elenco.map((m) => m.id);

test("i cinque filtri sono quelli del riferimento, nell'ordine", () => {
  assert.deepEqual(id(FILTRI.map((f) => ({ id: f.id }))).map(String), ["tutti", "non-letti", "contrassegnati", "allegati", "oggi"]);
  assert.deepEqual(FILTRI.map((f) => f.etichetta), ["Tutti", "Non letti", "Contrassegnati", "Con allegati", "Oggi"]);
});

test("etichettaFiltro rende un nome leggibile e non inventa su un id storto", () => {
  assert.equal(etichettaFiltro("oggi"), "Oggi");
  assert.equal(etichettaFiltro("allegati"), "Con allegati");
  assert.equal(etichettaFiltro("boh"), "Tutti");
});

test("messaggioOggi distingue oggi dai giorni precedenti", () => {
  assert.equal(messaggioOggi({ timestamp: OGGI }, ADESSO), true);
  assert.equal(messaggioOggi({ timestamp: IERI }, ADESSO), false);
  // Come etichettaGruppo: senza timestamp vale "oggi" (dati di esempio del browser).
  assert.equal(messaggioOggi({}, ADESSO), true);
});

test("filtra seleziona il sottoinsieme giusto per ogni filtro", () => {
  assert.deepEqual(id(filtra(MESSAGGI, "tutti", ADESSO)), [1, 2, 3, 4]);
  assert.deepEqual(id(filtra(MESSAGGI, "non-letti", ADESSO)), [1, 3]);
  assert.deepEqual(id(filtra(MESSAGGI, "contrassegnati", ADESSO)), [1, 4]);
  assert.deepEqual(id(filtra(MESSAGGI, "allegati", ADESSO)), [2, 4]);
  assert.deepEqual(id(filtra(MESSAGGI, "oggi", ADESSO)), [1, 2]);
});

test("filtra non muta l'elenco di partenza e regge un elenco mancante", () => {
  const copia = MESSAGGI.slice();
  filtra(MESSAGGI, "non-letti", ADESSO);
  assert.deepEqual(MESSAGGI, copia);
  assert.deepEqual(filtra(null, "tutti", ADESSO), []);
});

test("passaFiltro con un filtro sconosciuto non nasconde nulla", () => {
  assert.equal(passaFiltro(MESSAGGI[0], "qualsiasi", ADESSO), true);
});

test("statoRiga rende letto/contrassegnato/completato/categorie di una riga", () => {
  const s = statoRiga(MESSAGGI[0]);
  assert.equal(s.nonLetto, true);
  assert.equal(s.contrassegnato, true);
  assert.equal(s.completato, true);
  assert.deepEqual(s.categorie, ["Lavoro"]);
  assert.equal(s.pallino, "▣"); // non letto = pallino pieno
  assert.equal(s.bandiera, "⚑"); // contrassegnato = bandiera piena
  assert.deepEqual(s.classi, ["row", "row--nonletto", "row--contrassegnato", "row--completato"]);
});

test("statoRiga di un messaggio letto e senza contrassegni resta neutro", () => {
  const s = statoRiga({ seen: true, flagged: false, completed: false });
  assert.equal(s.nonLetto, false);
  assert.equal(s.pallino, "○");
  assert.equal(s.bandiera, "");
  assert.deepEqual(s.classi, ["row"]);
  assert.deepEqual(s.categorie, []);
});

test("le funzioni di riga isolate concordano con statoRiga", () => {
  assert.equal(pallinoRiga({ seen: false }), "▣");
  assert.equal(pallinoRiga({ seen: true }), "○");
  assert.equal(bandieraRiga({ flagged: true }), "⚑");
  assert.equal(bandieraRiga({}), "");
  assert.deepEqual(classiRiga({ seen: false, flagged: true, completed: false }), ["row", "row--nonletto", "row--contrassegnato"]);
  assert.deepEqual(categorieRiga({ categories: ["A", "B"] }), ["A", "B"]);
  assert.deepEqual(categorieRiga({}), []);
});

test("alternaCategoria aggiunge o toglie, senza mutare l'originale", () => {
  const base = ["Lavoro"];
  assert.deepEqual(alternaCategoria(base, "Lavoro"), []);
  assert.deepEqual(alternaCategoria(base, "Urgente"), ["Lavoro", "Urgente"]);
  assert.deepEqual(base, ["Lavoro"]);
  assert.deepEqual(alternaCategoria(base, "  "), ["Lavoro"]);
  assert.deepEqual(alternaCategoria(null, " Nuova "), ["Nuova"]);
});

test("le categorie predefinite sono un elenco non vuoto di stringhe", () => {
  assert.ok(CATEGORIE_PREDEFINITE.length >= 4);
  for (const c of CATEGORIE_PREDEFINITE) assert.equal(typeof c, "string");
});

test("le voci non disponibili dichiarano la v1 con il loro nome", () => {
  const t = testoNonDisponibileRibbon("new-items");
  assert.match(t, /Nuovi elementi/);
  assert.match(t, /non disponibile nella v1/);
  for (const chiave of NON_DISPONIBILI_V1) {
    assert.match(testoNonDisponibileRibbon(chiave), /non disponibile nella v1/);
  }
  // Le voci gestite non fanno parte dell'elenco.
  assert.ok(!NON_DISPONIBILI_V1.has("delete"));
  assert.ok(!NON_DISPONIBILI_V1.has("filter"));
  // Dal blocco G «Riunione» è una voce viva (agenda a elenco degli inviti).
  assert.ok(!NON_DISPONIBILI_V1.has("meeting"));
});

test("fugaHtml neutralizza i caratteri pericolosi di una categoria scritta a mano", () => {
  assert.equal(fugaHtml('<b>&"'), "&lt;b&gt;&amp;&quot;");
  assert.equal(fugaHtml(null), "");
});

test("daRigaKernel porta l'account e la cartella di provenienza della riga", () => {
  // Nella lista aggregata «Tutti gli account» due caselle possono avere lo
  // stesso UID: senza l'account della riga, `accountDi` non sa da quale casella
  // pescare e ogni azione si ferma con «Seleziona una casella nella barra
  // laterale». Il kernel li manda già (`MailRow` in `src-tauri/src/lib.rs`).
  const r = daRigaKernel({
    uid: 7,
    account: "mario.rossi@esempiogroup.it",
    folder: "INBOX",
    from: "A",
    subject: "B",
    date: OGGI,
    seen: true,
  });
  assert.equal(r.account, "mario.rossi@esempiogroup.it");
  assert.equal(r.folder, "INBOX");
});

test("una riga senza account non rompe nulla: restano le stringhe vuote", () => {
  const v = daRigaKernel({ uid: 9, from: "A", subject: "B", date: OGGI, seen: true });
  assert.equal(v.account, "");
  assert.equal(v.folder, "");
});

test("daRigaKernel porta anche contrassegno, completato e categorie", () => {
  const r = daRigaKernel({
    uid: 7, from: "A", subject: "B", date: OGGI,
    seen: false, hasAttachments: true, flagged: true, completed: true, categories: ["X"],
  });
  assert.equal(r.flagged, true);
  assert.equal(r.completed, true);
  assert.deepEqual(r.categories, ["X"]);
  assert.equal(r.has_attachments, true);
  // Una riga del kernel senza i campi nuovi non rompe la resa: default prudenti.
  const v = daRigaKernel({ uid: 8, from: "A", subject: "B", date: OGGI, seen: true });
  assert.equal(v.flagged, false);
  assert.equal(v.completed, false);
  assert.deepEqual(v.categories, []);
});

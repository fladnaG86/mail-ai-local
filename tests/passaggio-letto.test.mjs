/**
 * Un messaggio non letto diventa letto quando il mouse resta 1 secondo sulla sua
 * riga nella lista: niente più grassetto, senza doverlo aprire.
 *
 * Si prova con la vera `index.html` in jsdom e il kernel finto, come
 * `divisorio.test.mjs`: il percorso è quello dell'app (riga → evento →
 * timer in `main.js` → `mail_set_seen` → ridisegno). I timer sono finti
 * (`mock.timers`), così 1 secondo si attraversa senza aspettarlo.
 */
import { test, before, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const HTML = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const ACCOUNT = "mario.rossi@esempiogroup.it";

let main;
/** L'ultima app avviata: `afterEach` ne annulla l'eventuale attesa pendente. */
let ultima = null;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  Object.defineProperty(dom.window.document, "readyState", { value: "loading", configurable: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  impostaGlobali(dom.window);
  main = await import("../src/main.js");
});

afterEach(() => {
  // Un timer finto ancora pendente resterebbe in `main.js` come handle orfano
  // dopo il reset e disturberebbe il test successivo: lo si annulla prima.
  if (ultima) {
    ultima.doc
      .querySelector("#message-list")
      .dispatchEvent(new ultima.window_.CustomEvent("message-hover-end"));
  }
  mock.timers.reset();
});

function impostaGlobali(window_) {
  globalThis.window = window_;
  globalThis.document = window_.document;
  globalThis.location = window_.location;
  globalThis.localStorage = window_.localStorage;
  globalThis.KeyboardEvent = window_.KeyboardEvent;
  // La lista avvisa con `new CustomEvent(...)`: in Node quello globale non è di
  // jsdom e `dispatchEvent` lo rifiuterebbe.
  globalThis.CustomEvent = window_.CustomEvent;
}

/** Una riga come la manda il kernel (`MailRow`). */
function riga(uid, extra = {}) {
  return Object.assign(
    {
      uid,
      folder: "INBOX",
      account: ACCOUNT,
      from: "Luca Bianchi",
      subject: `Messaggio ${uid}`,
      date: 1_760_000_000 + uid,
      seen: false,
      hasAttachments: false,
    },
    extra,
  );
}

/**
 * Un'app nuova col kernel che serve `righe` (e le stesse in una sola
 * conversazione quando il raggruppamento è attivo). Registra i `mail_set_seen`.
 * Con `fallisci` il kernel rifiuta il cambio di stato.
 */
async function avvia({ preferenze = {}, righe = [riga(1)], fallisci = false } = {}) {
  const dom = new JSDOM(HTML, { url: "http://localhost/" });
  const window_ = dom.window;
  window_.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const chiamate = [];
  window_.__TAURI__ = {
    core: {
      invoke: async (nome, args) => {
        if (nome === "impostazioni_leggi") return { preferenze };
        if (nome === "account_list") return [{ id: ACCOUNT, email: ACCOUNT }];
        if (nome === "mail_list") return righe;
        if (nome === "mail_conversazioni") {
          return righe.map((r) => ({
            chiave: `c${r.uid}`,
            numero: 1,
            nonLetti: r.seen ? 0 : 1,
            from: r.from,
            subject: r.subject,
            date: r.date,
            seen: r.seen,
            hasAttachments: false,
            messaggi: [r],
          }));
        }
        if (nome === "mail_set_seen") {
          chiamate.push(args);
          if (fallisci) throw new Error("server non raggiungibile");
          return null;
        }
        if (["cartelle_elenco", "inviti_elenco", "scadenze_voci", "conversazioni_ignorate", "registro_ia", "cartelle_registro"].includes(nome)) return [];
        return null;
      },
    },
  };
  impostaGlobali(window_);
  await main.boot();
  mock.timers.enable({ apis: ["setTimeout"] });
  ultima = { window_, doc: window_.document, chiamate };
  return ultima;
}

const SENZA_CONVERSAZIONI = { raggruppaConversazioni: false };

function evento(w, nodo, tipo) {
  nodo.dispatchEvent(new w.window_.MouseEvent(tipo, { bubbles: false }));
}

/** Lascia finire i `await` del callback del timer. */
const attendi = () => new Promise((r) => setImmediate(r));

async function passa(w, ms) {
  mock.timers.tick(ms);
  await attendi();
}

const riga_ = (w, uid) => w.doc.querySelector(`.row[data-uid="${uid}"]`);

test("dopo 1 secondo sulla riga il messaggio non letto viene segnato come letto", async () => {
  const w = await avvia({ preferenze: SENZA_CONVERSAZIONI });
  assert.ok(riga_(w, 1).classList.contains("row--nonletto"), "premessa: la riga è in grassetto");
  evento(w, riga_(w, 1), "mouseenter");
  await passa(w, 1000);
  assert.deepEqual(w.chiamate, [{ folder: "INBOX", uid: 1, letto: true, accountId: ACCOUNT }]);
  assert.equal(riga_(w, 1).classList.contains("row--nonletto"), false, "la riga è ancora in grassetto");
});

test("prima di 1 secondo non succede nulla", async () => {
  const w = await avvia({ preferenze: SENZA_CONVERSAZIONI });
  evento(w, riga_(w, 1), "mouseenter");
  await passa(w, 999);
  assert.equal(w.chiamate.length, 0);
  assert.ok(riga_(w, 1).classList.contains("row--nonletto"));
});

test("uscendo dalla riga prima di 1 secondo il messaggio resta non letto", async () => {
  const w = await avvia({ preferenze: SENZA_CONVERSAZIONI });
  evento(w, riga_(w, 1), "mouseenter");
  await passa(w, 600);
  evento(w, riga_(w, 1), "mouseleave");
  await passa(w, 2000);
  assert.equal(w.chiamate.length, 0);
});

test("passando da una riga all'altra conta il secondo dell'ultima, non della prima", async () => {
  const w = await avvia({ preferenze: SENZA_CONVERSAZIONI, righe: [riga(1), riga(2)] });
  evento(w, riga_(w, 1), "mouseenter");
  await passa(w, 700);
  evento(w, riga_(w, 1), "mouseleave");
  evento(w, riga_(w, 2), "mouseenter");
  await passa(w, 700);
  assert.equal(w.chiamate.length, 0, "dalla seconda riga non è ancora passato 1 secondo");
  await passa(w, 300);
  assert.deepEqual(w.chiamate.map((c) => c.uid), [2]);
});

test("un messaggio già letto non genera nessuna chiamata", async () => {
  const w = await avvia({ preferenze: SENZA_CONVERSAZIONI, righe: [riga(1, { seen: true })] });
  evento(w, riga_(w, 1), "mouseenter");
  await passa(w, 1500);
  assert.equal(w.chiamate.length, 0);
});

test("con la preferenza spenta il passaggio non segna nulla", async () => {
  const w = await avvia({
    preferenze: { raggruppaConversazioni: false, letturaSegnaLettoAlPassaggio: false },
  });
  evento(w, riga_(w, 1), "mouseenter");
  await passa(w, 1500);
  assert.equal(w.chiamate.length, 0);
});

test("se il kernel rifiuta, la riga resta non letta e non si finge il contrario", async () => {
  const w = await avvia({ preferenze: SENZA_CONVERSAZIONI, fallisci: true });
  evento(w, riga_(w, 1), "mouseenter");
  await passa(w, 1000);
  assert.equal(w.chiamate.length, 1, "premessa: ci ha provato");
  assert.ok(riga_(w, 1).classList.contains("row--nonletto"));
});

test("nella vista a conversazioni la riga e l'intestazione perdono il grassetto", async () => {
  const w = await avvia({});
  const figlio = w.doc.querySelector(".row--msg");
  const intestazione = w.doc.querySelector(".row--conv");
  assert.ok(figlio.classList.contains("row--nonletto"), "premessa: messaggio non letto");
  assert.ok(intestazione.classList.contains("row--nonletto"), "premessa: conversazione non letta");
  evento(w, figlio, "mouseenter");
  await passa(w, 1000);
  assert.equal(w.chiamate.length, 1);
  assert.equal(w.doc.querySelector(".row--msg").classList.contains("row--nonletto"), false);
  assert.equal(
    w.doc.querySelector(".row--conv").classList.contains("row--nonletto"),
    false,
    "l'intestazione della conversazione è rimasta in grassetto",
  );
});

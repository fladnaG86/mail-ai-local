/**
 * Blocco V3: la finestra dei file aperti dal Finder (.eml, .ics, .vcf).
 *
 * Il kernel manda il contenuto già interpretato; qui si prova come si mostra:
 * il messaggio con il corpo in un iframe senza script, gli eventi del
 * calendario in sola lettura (dichiarato), i contatti importati **solo** dopo
 * il clic, e il file illeggibile col suo motivo.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let doc;
let modulo;

beforeEach(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  doc = dom.window.document;
  modulo = modulo || (await import("../src/views/apertura-file.js"));
});

const attesa = () => new Promise((r) => setTimeout(r, 0));

const MESSAGGIO = {
  tipo: "messaggio",
  nomeFile: "Preventivo.eml",
  oggetto: "Preventivo lunedì",
  da: "Anna Verdi <anna@esempio.it>",
  a: "Bruno <bruno@esempio.it>",
  cc: "",
  data: 1792135800,
  corpo: {
    html: "<p>Ecco il preventivo.</p>",
    text: "Ecco il preventivo.",
    attachments: [{ indice: 0, name: "offerta.pdf", mime: "application/pdf", size: 2048 }],
    immaginiBloccate: false,
  },
};

test("messaggio: titolo, intestazioni, corpo in iframe sandbox senza permessi, allegati elencati", () => {
  modulo.apriFinestraFile(MESSAGGIO);
  const win = doc.querySelector(".file-win");
  assert.ok(win);
  assert.match(doc.querySelector(".file-title").textContent, /Preventivo\.eml/);
  assert.match(win.textContent, /Preventivo lunedì/);
  assert.match(win.textContent, /Anna Verdi <anna@esempio\.it>/);
  assert.match(win.textContent, /Bruno <bruno@esempio\.it>/);
  assert.doesNotMatch(win.textContent, /Cc:/, "la riga Cc vuota non si mostra");
  const frame = win.querySelector("iframe");
  assert.equal(frame.getAttribute("sandbox"), "");
  assert.match(frame.getAttribute("srcdoc"), /Ecco il preventivo\./);
  assert.match(win.textContent, /offerta\.pdf/);
});

test("messaggio solo testo: il testo si mostra scappato, non come HTML", () => {
  modulo.apriFinestraFile({ ...MESSAGGIO, corpo: { ...MESSAGGIO.corpo, html: "", text: "a < b & <i>no</i>" } });
  const srcdoc = doc.querySelector(".file-win iframe").getAttribute("srcdoc");
  assert.match(srcdoc, /a &lt; b &amp; &lt;i&gt;no&lt;\/i&gt;/);
});

test("messaggio: «Rispondi» apre la composizione verso il mittente e chiude la finestra", () => {
  const chiamate = [];
  modulo.apriFinestraFile(MESSAGGIO, { onRispondi: (campi) => chiamate.push(campi) });
  doc.querySelector('[data-file-azione="rispondi"]').click();
  assert.deepEqual(chiamate, [{ a: "Anna Verdi <anna@esempio.it>", oggetto: "R: Preventivo lunedì" }]);
  assert.equal(doc.querySelector(".file-overlay"), null);
});

test("calendario: eventi in sola lettura, con la ragione dichiarata", () => {
  modulo.apriFinestraFile({
    tipo: "calendario",
    nomeFile: "invito.ics",
    inviti: [{ oggetto: "Revisione trimestrale", inizio: 1792483200, fine: 1792486800, luogo: "Sala A", organizzatore: "anna@esempio.it", organizzatoreNome: "Anna", giornataIntera: false }],
  });
  const win = doc.querySelector(".file-win");
  assert.match(win.textContent, /Revisione trimestrale/);
  assert.match(win.textContent, /Sala A/);
  assert.match(win.textContent, /Anna/);
  assert.match(win.textContent, /serve il messaggio d'invito/);
  assert.equal(win.querySelector('[data-file-azione="importa"]'), null);
});

test("contatti: elencati, importati solo al clic, poi l'esito al posto del pulsante", async () => {
  const testi = [];
  modulo.apriFinestraFile(
    {
      tipo: "contatti",
      nomeFile: "anna.vcf",
      testo: "BEGIN:VCARD…",
      schede: [{ nome: "Anna Verdi", email: "anna@esempio.it" }],
      senzaEmail: 1,
    },
    { onImporta: async (t) => (testi.push(t), { importati: 1, aggiornati: 0 }) },
  );
  const win = doc.querySelector(".file-win");
  assert.match(win.textContent, /Anna Verdi/);
  assert.match(win.textContent, /anna@esempio\.it/);
  assert.match(win.textContent, /1 scheda senza indirizzo/);
  assert.deepEqual(testi, [], "nulla si importa da sé");
  win.querySelector('[data-file-azione="importa"]').click();
  await attesa();
  assert.deepEqual(testi, ["BEGIN:VCARD…"]);
  assert.match(win.textContent, /1 aggiunti, 0 aggiornati/);
  assert.equal(win.querySelector('[data-file-azione="importa"]'), null);
});

test("contatti: un errore del kernel si dice e il pulsante resta per riprovare", async () => {
  modulo.apriFinestraFile(
    { tipo: "contatti", nomeFile: "x.vcf", testo: "t", schede: [{ nome: "", email: "x@esempio.it" }], senzaEmail: 0 },
    { onImporta: async () => { throw "database bloccato"; } },
  );
  doc.querySelector('[data-file-azione="importa"]').click();
  await attesa();
  const win = doc.querySelector(".file-win");
  assert.match(win.textContent, /database bloccato/);
  assert.ok(win.querySelector('[data-file-azione="importa"]'));
  assert.equal(win.querySelector('[data-file-azione="importa"]').disabled, false);
});

test("illeggibile: nome del file e motivo", () => {
  modulo.apriFinestraFile({ tipo: "illeggibile", nomeFile: "enorme.eml", motivo: "il file è troppo grande (30 MB, massimo 25 MB)" });
  const win = doc.querySelector(".file-win");
  assert.match(win.textContent, /enorme\.eml/);
  assert.match(win.textContent, /troppo grande/);
});

test("Esc e «Chiudi» chiudono la finestra", () => {
  modulo.apriFinestraFile(MESSAGGIO);
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(doc.querySelector(".file-overlay"), null);
  modulo.apriFinestraFile(MESSAGGIO);
  doc.querySelector('[data-file-azione="chiudi"]').click();
  assert.equal(doc.querySelector(".file-overlay"), null);
});

test("tipo sconosciuto → nessuna finestra", () => {
  assert.equal(modulo.apriFinestraFile({ tipo: "boh" }), null);
  assert.equal(doc.querySelector(".file-overlay"), null);
});

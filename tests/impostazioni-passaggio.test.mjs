/**
 * Impostazioni → Lettura: l'interruttore «Segna come letto passando il mouse
 * sul messaggio per 1 secondo». Attivo di default (come nel kernel), si può
 * spegnere, e la scelta viaggia nelle preferenze salvate.
 */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let apriPannelloMail;
let window_;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  window_ = dom.window;
  globalThis.window = window_;
  globalThis.document = window_.document;
  ({ apriPannelloMail } = await import("../src/views/impostazioni-mail.js"));
});

beforeEach(() => {
  window_.document.body.replaceChildren();
});

function apri(preferenze, salvate = []) {
  apriPannelloMail("lettura", {
    impostazioni: { preferenze },
    onSalva: async (imp) => {
      salvate.push(imp.preferenze);
      return "Salvato";
    },
  });
  return window_.document.querySelector("#im-lt-passaggio");
}

test("senza preferenza salvata l'interruttore è acceso", () => {
  assert.equal(apri({}).checked, true);
});

test("con la preferenza spenta l'interruttore è spento", () => {
  assert.equal(apri({ letturaSegnaLettoAlPassaggio: false }).checked, false);
});

test("spegnerlo salva la preferenza e lascia intatte le altre", async () => {
  const salvate = [];
  const casella = apri({ letturaImmagini: "sempre" }, salvate);
  casella.checked = false;
  casella.dispatchEvent(new window_.Event("change", { bubbles: true }));
  await new Promise((r) => setImmediate(r));
  assert.equal(salvate.at(-1).letturaSegnaLettoAlPassaggio, false);
  assert.equal(salvate.at(-1).letturaImmagini, "sempre");
});

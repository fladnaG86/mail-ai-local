/**
 * Il corpo del messaggio riempie il pannello di lettura: allargando il pannello
 * col divisorio, `.mail-body` prende lo spazio che resta e l'iframe lo riempie.
 * jsdom non fa layout, quindi si provano gli stili calcolati dal vero `app.css`
 * sulla struttura che costruisce `preparaCorpo`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const CSS = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

function pannello() {
  const dom = new JSDOM(
    `<!doctype html><html><head><style>${CSS}</style></head><body>
       <div class="reading" id="reading-pane">
         <div class="mail-body">
           <div class="mail-body-tools"><button class="mail-btn">Mostra immagini</button></div>
           <iframe class="mail-frame"></iframe>
         </div>
         <div class="attachments"></div>
       </div>
     </body></html>`,
  );
  const w = dom.window;
  const stile = (sel) => w.getComputedStyle(w.document.querySelector(sel));
  return { stile };
}

test("il corpo cresce con il pannello di lettura", () => {
  const { stile } = pannello();
  const corpo = stile(".mail-body");
  assert.equal(corpo.flexGrow, "1");
  assert.equal(corpo.minHeight, "0px", "senza min-height 0 il corpo non si restringe e il pannello trabocca");
  assert.equal(corpo.display, "flex");
  assert.equal(corpo.flexDirection, "column");
});

test("l'iframe del messaggio riempie il corpo", () => {
  const { stile } = pannello();
  assert.equal(stile(".mail-frame").flexGrow, "1");
});

test("la barra «Mostra immagini» e gli allegati non si allungano", () => {
  const { stile } = pannello();
  assert.equal(stile(".mail-body-tools").flexGrow, "0");
  assert.equal(stile(".attachments").flexGrow, "0");
});

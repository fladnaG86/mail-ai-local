// La firma nel corpo della composizione: deve stare in un blocco a sé, così
// sostituirla non appiattisce a testo semplice il contenuto formattato.
import test from "node:test";
import assert from "node:assert/strict";

import { htmlBloccoFirma, applicaFirmaAlCorpo } from "../src/views/firme.js";

/** Elemento finto sufficiente per `applicaFirmaAlCorpo`. */
function corpoFinto(htmlIniziale = "") {
  const figli = [];
  return {
    html: htmlIniziale,
    figli,
    querySelectorAll(sel) {
      return sel === ".cmp-firma"
        ? figli.filter((f) => f.classe === "cmp-firma" && !f.rimosso)
        : [];
    },
    insertAdjacentHTML(_pos, html) {
      figli.push({ classe: "cmp-firma", html, rimosso: false, remove() { this.rimosso = true; } });
    },
    get firme() {
      return figli.filter((f) => !f.rimosso).map((f) => f.html).join("");
    },
    /** Quante firme sono attive adesso (le rimosse non contano). */
    contaFirme() {
      return figli.filter((f) => !f.rimosso).length;
    },
  };
}

test("la firma è un blocco marcato, con gli a capo resi e il testo protetto", () => {
  const html = htmlBloccoFirma("Mario\nResponsabile <sistemi> & reti");
  assert.match(html, /^<div class="cmp-firma" data-firma="1">/);
  assert.ok(html.includes("<br>"), "gli a capo diventano <br>");
  assert.ok(html.includes("&lt;sistemi&gt;"), "il testo della firma non può iniettare HTML");
  assert.ok(!html.includes("<sistemi>"));
});

test("una firma vuota o solo spazi non produce nulla", () => {
  assert.equal(htmlBloccoFirma(""), "");
  assert.equal(htmlBloccoFirma("   \n  "), "");
  assert.equal(htmlBloccoFirma(null), "");
});

test("cambiare firma sostituisce solo il blocco e non tocca il corpo", () => {
  const corpo = corpoFinto("Contenuto con <b>grassetto</b> e una tabella");
  applicaFirmaAlCorpo(corpo, "Prima firma");
  assert.equal(corpo.contaFirme(), 1);

  applicaFirmaAlCorpo(corpo, "Seconda firma");
  assert.equal(corpo.contaFirme(), 1, "non si duplica");
  assert.ok(corpo.firme.includes("Seconda firma"));
  assert.ok(!corpo.firme.includes("Prima firma"));
  // Il corpo originale non viene mai riscritto: resta il suo HTML.
  assert.equal(corpo.html, "Contenuto con <b>grassetto</b> e una tabella");
});

test("scegliere «Nessuna» toglie la firma lasciando il corpo", () => {
  const corpo = corpoFinto();
  applicaFirmaAlCorpo(corpo, "Firma");
  assert.equal(corpo.contaFirme(), 1);
  applicaFirmaAlCorpo(corpo, "");
  assert.equal(corpo.contaFirme(), 0);
});

test("un elemento assente non fa esplodere nulla", () => {
  assert.doesNotThrow(() => applicaFirmaAlCorpo(null, "Firma"));
});

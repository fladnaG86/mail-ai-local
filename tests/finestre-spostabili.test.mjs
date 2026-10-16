/**
 * Tutte le finestre che si aprono dentro l'app si spostano dalla barra del
 * titolo, come «Nuovo messaggio». Ogni finestra si apre con la sua funzione
 * vera: così il test si accorge anche di una finestra nuova dimenticata.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let window_;
let doc;
const aperture = [];

const BARRE = ".compose-titlebar, .settings-titlebar, .rubrica-titlebar, .agenda-titlebar";

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  window_ = dom.window;
  doc = window_.document;
  Object.defineProperty(window_, "innerWidth", { value: 1400, configurable: true });
  Object.defineProperty(window_, "innerHeight", { value: 800, configurable: true });
  globalThis.window = window_;
  globalThis.document = doc;
  globalThis.location = window_.location;
  globalThis.localStorage = window_.localStorage;
  globalThis.KeyboardEvent = window_.KeyboardEvent;
  globalThis.CustomEvent = window_.CustomEvent;

  const v = (nome) => import(`../src/views/${nome}.js`);
  const [aiSettings, account, d2, i2, mail, notifiche, contatti, inviti, regole, settings, cerca, categorie, contattiPannello, visualizza, aspetto, accessibilita] =
    await Promise.all([
      v("ai-settings"), v("account"), v("blocco-d2"), v("blocco-i2"), v("impostazioni-mail"), v("notifiche"),
      v("contatti"), v("inviti"), v("regole"), v("settings"), v("cerca"), v("categorie"), v("contatti-pannello"),
      v("visualizza"), v("aspetto"), v("accessibilita"),
    ]);

  aperture.push(
    ["Assistente IA", () => aiSettings.apriAssistenteIA()],
    ["Account", () => account.apriAccount()],
    ["Firme", () => d2.apriPannelloFirme()],
    ["Posta", () => d2.apriPannelloPosta()],
    ["Privacy", () => d2.apriPannelloPrivacy()],
    ["Ricerca avanzata", () => i2.apriModuloRicercaAvanzata()],
    ["Pannello generico", () => i2.apriOverlayPannello("Prova", "<p>x</p>", {})],
    ["Scelte rapide", () => i2.apriPannelloScelteRapide()],
    ["Impostazioni personali", () => i2.apriPannelloPersonali()],
    ["Lettura", () => mail.apriPannelloMail("lettura")],
    ["Composizione", () => mail.apriPannelloMail("composizione")],
    ["Notifiche", () => notifiche.apriPannelloNotifiche()],
    ["Rubrica", () => contatti.apriRubrica()],
    ["Agenda", () => inviti.apriAgenda()],
    ["Nuova riunione", () => inviti.apriNuovaRiunione()],
    ["Regole", () => regole.apriPannelloRegole()],
    ["Impostazioni", () => settings.apriImpostazioni()],
    ["Cerca", () => cerca.apriPannelloCerca()],
    ["Categorie", () => categorie.apriPannelloCategorie()],
    ["Contatti", () => contattiPannello.apriPannelloContatti()],
    ["Visualizza", () => visualizza.apriPannelloVisualizza()],
    ["Aspetto", () => aspetto.apriPannelloAspetto()],
    ["Accessibilità", () => accessibilita.apriPannelloAccessibilita()],
  );
});

function mouse(tipo, x, y) {
  return new window_.MouseEvent(tipo, { clientX: x, clientY: y, bubbles: true, button: 0 });
}

for (const nome of [
  "Assistente IA", "Account", "Firme", "Posta", "Privacy", "Ricerca avanzata", "Pannello generico",
  "Scelte rapide", "Impostazioni personali", "Lettura", "Composizione", "Notifiche", "Rubrica", "Agenda",
  "Nuova riunione", "Regole", "Impostazioni", "Cerca", "Categorie", "Contatti", "Visualizza", "Aspetto",
  "Accessibilità",
]) {
  test(`la finestra «${nome}» si sposta dalla barra del titolo`, async () => {
    doc.body.replaceChildren();
    const apri = aperture.find((a) => a[0] === nome)[1];
    await apri();
    const barra = doc.body.querySelector(BARRE);
    assert.ok(barra, `«${nome}»: nessuna barra del titolo trovata`);
    const finestra = barra.parentElement;
    finestra.getBoundingClientRect = () => ({ width: 700, height: 500, left: 350, top: 150, right: 1050, bottom: 650 });

    barra.dispatchEvent(mouse("mousedown", 600, 160));
    doc.dispatchEvent(mouse("mousemove", 640, 190));
    assert.equal(finestra.style.transform, "translate(40px, 30px)");
    doc.dispatchEvent(mouse("mouseup", 640, 190));

    // Il pulsante ✕ non avvia il trascinamento.
    const chiudi = barra.querySelector(".win-close");
    if (chiudi) {
      chiudi.dispatchEvent(mouse("mousedown", 10, 10));
      doc.dispatchEvent(mouse("mousemove", 400, 400));
      assert.equal(finestra.style.transform, "translate(40px, 30px)", "il ✕ ha spostato la finestra");
      doc.dispatchEvent(mouse("mouseup", 400, 400));
    }
  });
}

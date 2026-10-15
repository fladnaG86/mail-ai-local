/**
 * Pannello «Accessibilità».
 *
 * Etichetta del riferimento: **Accessibilità**
 * (`ZStrings.strings`), descrizione «Imposta le opzioni per l'accessibilità»
 * (`Preferences.Panes.All.strings`). Le singole voci non sono nei cataloghi di
 * Outlook (quel pannello rimanda alle preferenze di sistema): i nomi usati qui
 * sono quelli **reali di macOS**, letti dai cataloghi del sistema —
 * `Riduci movimento` e `Aumenta contrasto` (`CommandDescriptions.strings`) e
 * `Aumenta/Riduci le dimensioni del testo` (`ReaderAppearanceViewController.strings`).
 *
 * Solo opzioni che agiscono **davvero** in un client IMAP locale e che questa
 * interfaccia può cambiare: movimento, contrasto, dimensioni del testo e
 * etichette dei pulsanti. Le voci che dipendono dal sistema operativo sono
 * **dichiarate** non disponibili (`NON_DISPONIBILI`), non finte.
 *
 * Ha due parti, come gli altri moduli delle viste:
 * - le funzioni PURE (normalizzazione, classi da mettere sul `<html>`, variabili
 *   CSS): le collaudano i test `node:test`, senza DOM;
 * - il pannello vero e proprio.
 */

import { apriOverlayPannello, fuga } from "./blocco-i2.js";

// ---------------------------------------------------------------------------
// Funzioni PURE
// ---------------------------------------------------------------------------

/**
 * Le dimensioni offerte per il testo dell'interfaccia, in percentuale.
 * I nomi sono quelli di macOS («Riduci/Aumenta le dimensioni del testo»).
 */
export const SCALE_TESTO = [
  { id: 90, etichetta: "Più piccolo" },
  { id: 100, etichetta: "Normale" },
  { id: 115, etichetta: "Più grande" },
];

/** Scala del testo predefinita (nessun ingrandimento). */
export const SCALA_TESTO_DEFAULT = 100;
/** Intervallo ammesso per la scala del testo, in percentuale. */
export const SCALA_TESTO_MIN = 80;
export const SCALA_TESTO_MAX = 150;

/** Limita la scala del testo all'intervallo ammesso (default: 100). */
export function normScalaTesto(v) {
  // `null`/vuoto → default: solo un valore numerico sensato scala il testo.
  const n = v === null || v === undefined || String(v).trim() === "" ? NaN : Number(v);
  if (!Number.isFinite(n)) return SCALA_TESTO_DEFAULT;
  return Math.min(SCALA_TESTO_MAX, Math.max(SCALA_TESTO_MIN, Math.round(n)));
}

/**
 * Intervallo della scala di lettura (specchia `config.rs`, blocco R): la
 * percentuale con cui si ingrandisce il testo del messaggio aperto. Stessi
 * limiti dello zoom della composizione: sono lo stesso gesto su due corpi.
 */
export const ZOOM_LETTURA_MIN = 50;
export const ZOOM_LETTURA_MAX = 400;
export const ZOOM_LETTURA_DEFAULT = 100;

/**
 * Limita la scala di lettura all'intervallo ammesso (default 100). Un valore
 * non numerico o assente ripiega sul default: mai un `NaN`, che il browser
 * scarterebbe in silenzio lasciando il testo alla dimensione di partenza.
 */
export function limitaZoomLettura(v, def = ZOOM_LETTURA_DEFAULT) {
  const n = v === null || v === undefined || String(v).trim() === "" ? NaN : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(ZOOM_LETTURA_MAX, Math.max(ZOOM_LETTURA_MIN, Math.round(n)));
}

/**
 * La scala di lettura dalle preferenze grezze del kernel: l'unica chiave è
 * `letturaZoom` (quella di `config.json`). Non esiste una chiave normalizzata
 * corta: `serveRidisegnareLettura` confronta la stessa chiave grezza, quindi
 * introdurne una solo qui renderebbe cieco il confronto del ridisegno.
 */
export function zoomLetturaDaPreferenze(prefs = {}) {
  return limitaZoomLettura(prefs.letturaZoom);
}

/**
 * Le opzioni di accessibilità normalizzate dalle preferenze grezze.
 * `etichettePulsanti` è **attivo di default**: è il comportamento normale
 * dell'interfaccia (le etichette del ribbon si vedono sempre).
 */
export function normOpzioni(prefs = {}) {
  // Accetta sia le preferenze grezze (chiavi `accessibilita…`) sia un risultato
  // già normalizzato (chiavi brevi): è idempotente, così le altre funzioni pure
  // possono richiamarla senza perdere le opzioni.
  const flag = (breve, grezza, def) => {
    const v = prefs[breve] !== undefined ? prefs[breve] : prefs[grezza];
    return v === undefined ? def : v === true;
  };
  return {
    movimentoRidotto: flag("movimentoRidotto", "accessibilitaMovimentoRidotto", false),
    contrastoElevato: flag("contrastoElevato", "accessibilitaContrastoElevato", false),
    etichettePulsanti: flag("etichettePulsanti", "accessibilitaEtichettePulsanti", true),
    testoScala: normScalaTesto(
      prefs.testoScala !== undefined ? prefs.testoScala : prefs.accessibilitaTestoScala,
    ),
  };
}

/** La classe che spegne le animazioni (vuota se l'opzione è spenta). */
export function classeMovimentoRidotto(attivo) {
  return attivo ? "movimento-ridotto" : "";
}

/** Le classi da mettere sul `<html>`, solo quelle attive. */
export function classiAccessibilita(opzioni = {}) {
  const o = normOpzioni(opzioni);
  const classi = [];
  if (o.movimentoRidotto) classi.push("movimento-ridotto");
  if (o.contrastoElevato) classi.push("contrasto-elevato");
  if (o.etichettePulsanti) classi.push("etichette-pulsanti");
  return classi;
}

/**
 * Le variabili CSS corrispondenti: la scala del testo come numero (es. "1.15"),
 * che `app.css` usa per ingrandire l'interfaccia.
 */
export function variabiliAccessibilita(opzioni = {}) {
  const o = normOpzioni(opzioni);
  return { uiScalaTesto: String(Number((o.testoScala / 100).toFixed(2))) };
}

/** Nomi e ragioni delle voci dichiarate non disponibili in un client IMAP locale. */
export const NON_DISPONIBILI = [
  {
    titolo: "Lettore schermo",
    ragione:
      "Il lettore schermo (VoiceOver) è pilotato dal sistema operativo: l'app espone i suoi elementi all'accessibilità, ma non può accenderlo o spegnerlo.",
  },
  {
    titolo: "Controllo vocale e dettatura",
    ragione:
      "Sintesi e riconoscimento vocale appartengono a macOS e non sono governabili da un'applicazione.",
  },
];

/**
 * Applica le opzioni al `<html>`: le classi (`movimento-ridotto`,
 * `contrasto-elevato`, `etichette-pulsanti`) e la scala del testo. Rimuove le
 * classi spente, così l'effetto è sempre quello delle opzioni correnti.
 */
export function applicaAccessibilita(opzioni = {}, root = document.documentElement) {
  if (!root) return;
  const attive = new Set(classiAccessibilita(opzioni));
  for (const c of ["movimento-ridotto", "contrasto-elevato", "etichette-pulsanti"]) {
    root.classList.toggle(c, attive.has(c));
  }
  root.style.setProperty("--ui-scala-testo", variabiliAccessibilita(opzioni).uiScalaTesto);
}

// ---------------------------------------------------------------------------
// Interfaccia — pannello «Accessibilità»
// ---------------------------------------------------------------------------

/** Riga di una voce dichiarata non disponibile (mostrata, non cliccabile). */
function htmlNonDisponibile(v) {
  return `<div class="im-nota im-nota--forte"><b>${fuga(v.titolo)}: non disponibile.</b> ${fuga(v.ragione)}</div>`;
}

/**
 * Apre il pannello «Accessibilità». Ogni voce si applica subito
 * (`opzioni.onApplica`) e si salva (`opzioni.onSalva`).
 */
export function apriPannelloAccessibilita(opzioni = {}) {
  const o = normOpzioni(opzioni.preferenze || {});
  const p = apriOverlayPannello(
    "Accessibilità",
    `<div class="settings-sec">Visualizzazione</div>
     <div class="settings-hr"></div>
     <label class="ai-check"><input type="checkbox" id="acc-movimento"${o.movimentoRidotto ? " checked" : ""}> Riduci movimento (spegne animazioni e transizioni)</label>
     <label class="ai-check"><input type="checkbox" id="acc-contrasto"${o.contrastoElevato ? " checked" : ""}> Aumenta contrasto (bordi e testi più marcati)</label>
     <label class="ai-check"><input type="checkbox" id="acc-etichette"${o.etichettePulsanti ? " checked" : ""}> Mostra sempre le etichette dei pulsanti</label>
     <div class="settings-sec">Dimensioni del testo</div>
     <div class="settings-hr"></div>
     <div class="settings-grid">
       <div class="settings-lbl">Testo dell'interfaccia:</div>
       <select class="settings-fld" id="acc-scala">
         ${SCALE_TESTO.map(
           (s) => `<option value="${s.id}"${s.id === o.testoScala ? " selected" : ""}>${fuga(s.etichetta)} (${s.id}%)</option>`,
         ).join("")}
       </select>
     </div>
     <p class="im-nota">Hanno effetto immediato e restano salvati in <code>config.json</code>.</p>
     <div class="settings-sec">Non disponibili</div>
     <div class="settings-hr"></div>
     ${NON_DISPONIBILI.map(htmlNonDisponibile).join("")}`,
    opzioni,
  );
  const q = (id) => p.overlay.querySelector(`#${id}`);

  const salva = async () => {
    const nuove = {
      accessibilitaMovimentoRidotto: q("acc-movimento").checked,
      accessibilitaContrastoElevato: q("acc-contrasto").checked,
      accessibilitaEtichettePulsanti: q("acc-etichette").checked,
      accessibilitaTestoScala: normScalaTesto(q("acc-scala").value),
    };
    if (typeof opzioni.onApplica === "function") opzioni.onApplica(Object.assign({}, opzioni.preferenze, nuove));
    if (typeof opzioni.onSalva !== "function") {
      p.nota("Salvato (prova visiva: nessun file scritto).");
      return;
    }
    try {
      const esito = await opzioni.onSalva({ theme: opzioni.getTema ? opzioni.getTema() : "system", preferenze: Object.assign({}, opzioni.preferenze, nuove) });
      p.nota(esito || "Salvato.");
    } catch (e) {
      p.nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  };

  for (const id of ["acc-movimento", "acc-contrasto", "acc-etichette", "acc-scala"]) {
    q(id).addEventListener("change", salva);
  }
  return p.overlay;
}

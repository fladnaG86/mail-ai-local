/**
 * Blocco V1 — il numero dei non letti sull'icona del Dock.
 *
 * Come Outlook: il numero è la somma dei non letti della **Posta in arrivo** di
 * tutte le caselle; con zero il numero sparisce. `main.js` chiama l'aggiornamento
 * a ogni ridisegno della barra laterale, quindi lo stesso valore non viene
 * rimandato al sistema: si chiama `setBadgeCount` solo quando cambia.
 */
import { nonLettiAggregato } from "./cartelle-account.js";

/** Il numero da mostrare sul Dock, o `undefined` per toglierlo. */
export function conteggioDock(gruppi) {
  const n = nonLettiAggregato(gruppi);
  return n > 0 ? n : undefined;
}

/** La finestra Tauri corrente, o `null` nel browser. */
function finestraTauri() {
  const api = globalThis.window && window.__TAURI__ && window.__TAURI__.window;
  return api && typeof api.getCurrentWindow === "function" ? api.getCurrentWindow() : null;
}

/**
 * Crea la funzione di aggiornamento, con la memoria dell'ultimo valore mandato.
 * `daFinestra` si inietta nei test; nell'app è la finestra Tauri.
 */
export function creaAggiornaDock(daFinestra = finestraTauri) {
  // `null` = mai mandato: anche un primo `undefined` (nessun non letto) va mandato,
  // perché il Dock può avere un numero rimasto da un'esecuzione precedente.
  let ultimo = null;
  return async function aggiornaDock(gruppi) {
    const finestra = daFinestra();
    if (!finestra || typeof finestra.setBadgeCount !== "function") return;
    const n = conteggioDock(gruppi);
    if (n === ultimo) return;
    try {
      await finestra.setBadgeCount(n);
      ultimo = n;
    } catch {
      // Permesso negato o sistema muto: si riprova al prossimo ridisegno.
    }
  };
}

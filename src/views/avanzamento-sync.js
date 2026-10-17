/**
 * Avanzamento di «Invia e ricevi» nella barra di stato. Il kernel emette
 * `sync-avanzamento` ({ account, cartella, indice, totale }) prima di ogni
 * cartella; qui si trasforma in una frazione della barra e in una riga di testo.
 */
import { CARTELLA_POSTA_IN_ARRIVO, POSTA_IN_ARRIVO } from "./cartelle-account.js";

/** Nome dell'evento emesso da `mail_sync` (vedi `EVENTO_AVANZAMENTO_SYNC` nel kernel). */
export const EVENTO_AVANZAMENTO_SYNC = "sync-avanzamento";

/** Il nome della cartella come lo legge l'utente: INBOX diventa «Posta in arrivo». */
export function etichettaCartellaSync(nome) {
  const n = String(nome || "");
  return n.toUpperCase() === CARTELLA_POSTA_IN_ARRIVO ? POSTA_IN_ARRIVO : n;
}

/**
 * Frazione (0..1) e testo dell'evento `ev`, sapendo quali caselle si stanno
 * sincronizzando (`accounts`, nell'ordine del kernel). Ogni casella occupa una
 * parte uguale della barra; dentro la casella l'ultimo passo resta per
 * l'aggiornamento dell'elenco, così la barra arriva in fondo solo a lavoro finito.
 */
export function statoAvanzamento(ev, accounts) {
  const elenco = Array.isArray(accounts) && accounts.length ? accounts : [{ id: "", email: "" }];
  const pos = Math.max(0, elenco.findIndex((a) => a.id === ev.account));
  const totale = Math.max(1, Number(ev.totale) || 0);
  const indice = Math.min(totale - 1, Math.max(0, Number(ev.indice) || 0));
  const frazione = (pos + (indice + 1) / (totale + 1)) / elenco.length;
  const cartella = `${etichettaCartellaSync(ev.cartella)} (${indice + 1} di ${totale})`;
  const casella =
    elenco.length > 1 ? `${elenco[pos].email || elenco[pos].id} (${pos + 1} di ${elenco.length}): ` : "";
  return { frazione, testo: `Invia e ricevi — ${casella}${cartella}` };
}

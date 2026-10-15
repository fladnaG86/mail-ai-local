/**
 * Pannello «Visualizza» (blocco N) — le opzioni di visualizzazione della lista.
 *
 * Etichetta del riferimento (`/ERPreferencesWindow/Views/Display = Visualizza`,
 * descrizione `Preferences.Panes.All.strings`: «Impostare le opzioni per la
 * densità di visualizzazione, le dimensioni del testo e l'elenco delle cartelle»).
 *
 * Ha due parti, come gli altri moduli delle viste:
 * - le funzioni PURE (colore della riga contrassegnata): le collaudano i test
 *   `node:test`, senza DOM;
 * - il pannello vero e proprio, che salva in `config.json` e ha effetto subito.
 *
 * Le preferenze toccate qui esistono già per la maggior parte: la densità
 * (`densitaVisualizzazione`), l'anteprima nella lista (`letturaAnteprima`) e il
 * raggruppamento in conversazioni (`raggruppaConversazioni`). L'unica nuova è
 * `visualizzaColoreContrassegnata`, che dà alla riga contrassegnata lo sfondo
 * `MessageListFlaggedBackgroundColor` misurato dall'app reale (o nessuno sfondo).
 */

import { apriOverlayPannello, DENSITA_LISTA, fuga } from "./blocco-i2.js";

/**
 * Colori di sfondo della riga contrassegnata. «Giallo» è il valore misurato
 * `MessageListFlaggedBackgroundColor` (chiaro `#FFFFCC`, scuro `#464646`, vedi
 * `docs/riferimento-outlook/colori-misurati.md`); «Nessuno» non colora affatto.
 */
export const COLORI_RIGA = [
  { id: "giallo", etichetta: "Giallo" },
  { id: "nessuno", etichetta: "Nessuno" },
];

/** Colore valido o il default `giallo`. */
export function normColore(id) {
  return COLORI_RIGA.some((c) => c.id === id) ? id : "giallo";
}

/** Etichetta leggibile di un colore (fallback: Giallo). */
export function etichettaColore(id) {
  const c = COLORI_RIGA.find((x) => x.id === normColore(id));
  return c.etichetta;
}

/**
 * Applica il colore al contenitore della lista come attributo dati: il CSS
 * (`.list[data-colore-contrassegnata="giallo"] .row--contrassegnato`) sceglie lo
 * sfondo giusto per tema. Non ridisegna nulla.
 */
export function applicaColoreContrassegnata(contenitore, id) {
  if (!contenitore) return;
  contenitore.dataset.coloreContrassegnata = normColore(id);
}

/**
 * Vero se passare dalle preferenze `prec` a `succ` richiede di **ridisegnare**
 * la lista: l'anteprima del testo e il raggruppamento in conversazioni cambiano
 * le righe, quindi non bastano i token CSS come per la densità. Serve a far
 * ridisegnare il chiamante (come il percorso del ribbon `salvaVista`).
 */
export function richiedeRidisegno(prec, succ) {
  const a = prec || {};
  const b = succ || {};
  return (
    !!b.letturaAnteprima !== !!a.letturaAnteprima ||
    (b.raggruppaConversazioni !== false) !== (a.raggruppaConversazioni !== false)
  );
}

/**
 * Apre il pannello «Visualizza». Le modifiche si applicano con
 * `opzioni.onApplica` (che ridisegna la lista quando serve: anteprima e
 * raggruppamento non hanno effetto dalla sola densità/CSS) e si salvano con
 * `opzioni.onSalva`.
 */
export function apriPannelloVisualizza(opzioni = {}) {
  const prefs = opzioni.preferenze || {};
  const densita = DENSITA_LISTA.some((d) => d.id === prefs.densitaVisualizzazione)
    ? prefs.densitaVisualizzazione
    : "accogliente";
  const anteprima = !!prefs.letturaAnteprima;
  const raggruppa = prefs.raggruppaConversazioni !== false;
  const colore = normColore(prefs.visualizzaColoreContrassegnata);

  const p = apriOverlayPannello(
    "Visualizza",
    `<div class="settings-sec">Elenco</div>
     <div class="settings-hr"></div>
     <div class="settings-grid">
       <div class="settings-lbl">Densità di visualizzazione:</div>
       <select class="settings-fld" id="n-densita">
         ${DENSITA_LISTA.map(
           (d) => `<option value="${fuga(d.id)}"${d.id === densita ? " selected" : ""}>${fuga(d.etichetta)}</option>`,
         ).join("")}
       </select>
       <div class="settings-lbl">Colore riga contrassegnata:</div>
       <select class="settings-fld" id="n-colore">
         ${COLORI_RIGA.map(
           (c) => `<option value="${fuga(c.id)}"${c.id === colore ? " selected" : ""}>${fuga(c.etichetta)}</option>`,
         ).join("")}
       </select>
     </div>
     <label class="ai-check"><input type="checkbox" id="n-anteprima"${anteprima ? " checked" : ""}> Mostra l'anteprima del testo nella lista</label>
     <label class="ai-check"><input type="checkbox" id="n-raggruppa"${raggruppa ? " checked" : ""}> Raggruppa i messaggi per conversazione</label>
     <p class="im-nota">La densità cambia l'altezza delle righe; il colore è quello misurato dall'app reale per la riga contrassegnata.</p>
     <p class="im-nota">Le dimensioni del testo seguono il carattere di sistema e la densità: non c'è un interruttore separato che abbia effetto.</p>`,
    opzioni,
  );
  const q = (id) => p.overlay.querySelector(`#${id}`);
  const getTema = typeof opzioni.getTema === "function" ? opzioni.getTema : () => "system";

  /** Legge i quattro campi del pannello e costruisce le preferenze aggiornate. */
  const nuovePreferenze = () =>
    Object.assign({}, opzioni.preferenze, {
      densitaVisualizzazione: q("n-densita").value,
      visualizzaColoreContrassegnata: q("n-colore").value,
      letturaAnteprima: q("n-anteprima").checked,
      raggruppaConversazioni: q("n-raggruppa").checked,
    });

  const salva = async () => {
    const nuove = nuovePreferenze();
    if (typeof opzioni.onApplica === "function") opzioni.onApplica(nuove);
    if (typeof opzioni.onSalva !== "function") {
      p.nota("Salvato (prova visiva: nessun file scritto).");
      return;
    }
    try {
      const esito = await opzioni.onSalva({ theme: getTema(), preferenze: nuove });
      p.nota(esito || "Salvato.");
    } catch (e) {
      p.nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  };

  for (const id of ["n-densita", "n-colore", "n-anteprima", "n-raggruppa"]) {
    q(id).addEventListener("change", salva);
  }
  return p.overlay;
}

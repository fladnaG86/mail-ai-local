/**
 * Blocco W3 — posta in push (IMAP IDLE), lato interfaccia. Funzioni pure.
 *
 * Il kernel tiene un `IDLE` sulla Posta in arrivo di ogni casella e, quando il
 * server avvisa, emette `posta-push` con l'id dell'account; gli stati vanno con
 * `push-stato`. Qui le frasi degli stati e il raggruppatore degli avvisi.
 */

/** Evento del kernel: c'è del nuovo nella Posta in arrivo (payload: id account). */
export const EVENTO_POSTA_PUSH = "posta-push";
/** Evento del kernel: è cambiato lo stato del push di una casella. */
export const EVENTO_STATO_PUSH = "push-stato";
/**
 * Attesa prima di sincronizzare dopo un avviso: un messaggio nuovo porta spesso
 * più avvisi (EXISTS, RECENT, FETCH) a pochi millisecondi uno dall'altro.
 */
export const RITARDO_SYNC_PUSH_MS = 1500;

/** La frase del pannello per lo stato del push di una casella. */
export function testoStatoPush(s) {
  if (!s || typeof s !== "object") return "";
  switch (s.stato) {
    case "attivo":
      return "attivo: i messaggi arrivano appena il server li riceve";
    case "connessione":
      return "connessione in corso…";
    case "non_supportato":
      return "il server non offre IDLE: resta la sincronizzazione a intervalli";
    case "riconnessione":
      return `connessione persa (${s.errore || "errore"}): nuovo tentativo fra ${Number(s.traSecondi) || 0} s`;
    case "errore":
      return `fermo: ${s.errore || "errore"}`;
    default:
      return String(s.stato || "");
  }
}

/**
 * Raggruppa gli avvisi per chiave (l'account): dopo l'ultimo di una raffica
 * attende `ritardoMs` ed esegue `esegui(chiave)` una volta. Mai due esecuzioni
 * insieme sulla stessa chiave: un avviso durante l'esecuzione ne provoca una
 * sola al termine. Un errore di `esegui` non blocca le successive.
 */
export function creaRaggruppatore(esegui, ritardoMs = RITARDO_SYNC_PUSH_MS) {
  const stato = new Map(); // chiave → { timer, inCorso, ancora }
  const di = (k) => {
    if (!stato.has(k)) stato.set(k, { timer: null, inCorso: false, ancora: false });
    return stato.get(k);
  };
  const parti = async (k) => {
    const s = di(k);
    s.timer = null;
    if (s.inCorso) {
      s.ancora = true;
      return;
    }
    s.inCorso = true;
    try {
      await esegui(k);
    } catch {
      // L'errore lo mostra chi esegue; il push resta attivo.
    } finally {
      s.inCorso = false;
    }
    if (s.ancora) {
      s.ancora = false;
      avvisa(k);
    }
  };
  function avvisa(k) {
    const s = di(k);
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => parti(k), ritardoMs);
  }
  return avvisa;
}

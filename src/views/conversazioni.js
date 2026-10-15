/**
 * Raggruppamento dei messaggi in conversazioni (blocco H) — logica pura.
 *
 * Stesse regole del kernel (`src-tauri/src/mail/conversazioni.rs`):
 * 1. i messaggi che condividono un riferimento (References / In-Reply-To) stanno
 *    nella stessa conversazione, anche con oggetti diversi;
 * 2. in mancanza, si uniscono per **oggetto normalizzato** (via i prefissi di
 *    risposta/inoltro e i marcatori come `[externa]`, poi spazi e maiuscole);
 *    oggetti diversi non si uniscono.
 *
 * Questo modulo non tocca il DOM: `renderListaConversazioni` (main-view.js) lo
 * usa per disegnare la lista raggruppata, e i test `node --test` lo collaudano
 * senza browser.
 */

/** Prefissi di risposta/inoltro tolti dall'oggetto (confronto senza maiuscole). */
export const PREFISSI = ["re", "r", "i", "rif", "fwd", "fw"];
/** Marcatori fra parentesi quadre tolti dall'inizio dell'oggetto. */
export const MARCATORI = ["externa", "external"];

/** Toglie un marcatore `[externa]`/`[external]` all'inizio, se c'è. */
function togliMarcatore(testo) {
  const t = String(testo == null ? "" : testo).replace(/^\s+/, "");
  const m = /^\[([^\]]*)\]\s*/.exec(t);
  if (m && MARCATORI.includes(m[1].trim().toLowerCase())) {
    return t.slice(m[0].length);
  }
  return t;
}

/** Toglie un prefisso `Re:`, `R:`, `I:`, `Rif:`, `Fwd:`, `Fw:` all'inizio, se c'è. */
function togliPrefisso(testo) {
  const t = String(testo == null ? "" : testo).replace(/^\s+/, "");
  const m = /^([^\s:]+):\s*/.exec(t);
  if (m && PREFISSI.includes(m[1].toLowerCase())) {
    return t.slice(m[0].length);
  }
  return t;
}

/**
 * Normalizza l'oggetto per il raggruppamento: toglie i prefissi di
 * risposta/inoltro e i marcatori `[externa]` (ripetutamente), poi riduce gli
 * spazi e passa a minuscole.
 */
export function normalizzaOggetto(oggetto) {
  let s = String(oggetto == null ? "" : oggetto).trim();
  // Ciclo limitato: basta a sciogliere ogni combinazione ragionevole.
  for (let i = 0; i < 20; i += 1) {
    const prima = s;
    s = togliMarcatore(s);
    s = togliPrefisso(s);
    if (s === prima) break;
  }
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * La chiave di conversazione di un messaggio della lista: quella calcolata dal
 * kernel (`chiave`/`threadKey`) se c'è, altrimenti l'oggetto normalizzato, e da
 * ultimo l'uid (una riga senza nulla resta da sola).
 */
export function chiaveDi(messaggio) {
  if (!messaggio) return "";
  if (messaggio.chiave) return messaggio.chiave;
  if (messaggio.threadKey) return messaggio.threadKey;
  const ogg = normalizzaOggetto(messaggio.subject);
  if (ogg) return `s:${ogg}`;
  return `uid:${messaggio.uid || messaggio.id || ""}`;
}

/**
 * Riepilogo di una conversazione: quanti messaggi e quanti non letti (e, per
 * comodità, quanti letti).
 */
export function riepilogoConversazione(messaggi) {
  const lista = Array.isArray(messaggi) ? messaggi : [];
  const nonLetti = lista.filter((m) => m && !m.seen).length;
  return { numero: lista.length, nonLetti, letti: lista.length - nonLetti };
}

/** Il messaggio più recente di un elenco (per data; a parità, l'ultimo). */
export function rappresentanteDi(messaggi) {
  const lista = Array.isArray(messaggi) ? messaggi : [];
  if (!lista.length) return null;
  let best = lista[0];
  for (const m of lista) {
    if ((Number(m.timestamp) || 0) >= (Number(best.timestamp) || 0)) best = m;
  }
  return best;
}

/**
 * Raggruppa un elenco piatto di messaggi in conversazioni, ordinate dalla più
 * recente. Ogni conversazione porta il riepilogo, il rappresentante (l'ultimo
 * messaggio) e i suoi messaggi in ordine cronologico (dal più vecchio).
 */
export function raggruppaConversazioni(messaggi) {
  const gruppi = new Map();
  for (const m of Array.isArray(messaggi) ? messaggi : []) {
    const chiave = chiaveDi(m);
    if (!gruppi.has(chiave)) gruppi.set(chiave, []);
    gruppi.get(chiave).push(m);
  }
  const out = [];
  for (const [chiave, lista] of gruppi) {
    const ordinati = lista
      .slice()
      .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
    const rip = riepilogoConversazione(ordinati);
    const r = rappresentanteDi(ordinati);
    out.push({
      chiave,
      numero: rip.numero,
      nonLetti: rip.nonLetti,
      from: r ? r.from : "",
      subject: r ? r.subject : "",
      date: r ? r.date : "",
      timestamp: r ? r.timestamp : undefined,
      seen: rip.nonLetti === 0,
      has_attachments: ordinati.some((m) => m.has_attachments),
      anteprima: (r && r.anteprima) || "",
      messaggi: ordinati,
    });
  }
  out.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  return out;
}

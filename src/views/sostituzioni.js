/**
 * Correzione automatica: logica **pura** delle sostituzioni (nessun DOM), così
 * si collauda con `node --test` e si riusa sia nella finestra di composizione
 * sia nel pannello delle impostazioni.
 *
 * Regola unica: una sostituzione agisce su una **parola intera**. «nn» diventa
 * «non», ma dentro «Anna» o «nnn» non si tocca nulla; una parola già corretta
 * («non») resta com'è. Vale sia per il testo completo sia per il punto in cui
 * si sta scrivendo (il cursore).
 */

/** Numero massimo di sostituzioni tenute (specchia `config.rs`). */
export const SOSTITUZIONI_MAX = 100;

/** Le sostituzioni predefinite (specchia `config.rs`: `sostituzioni_predefinite`). */
export function sostituzioniPredefinite() {
  return [
    { da: "nn", a: "non" },
    { da: "ke", a: "che" },
    { da: "xche", a: "perché" },
  ];
}

/** Vero se il carattere è "di parola" (lettera, cifra o underscore). */
function diParola(c) {
  return /[0-9A-Za-zÀ-ÖØ-öø-ÿ_]/.test(c);
}

/**
 * Tiene solo le sostituzioni sensate: `da` non vuoto dopo il taglio degli spazi,
 * niente duplicati per `da` (vince la prima), al massimo `SOSTITUZIONI_MAX`.
 */
export function normalizzaSostituzioni(elenco) {
  const out = [];
  const visti = new Set();
  for (const s of Array.isArray(elenco) ? elenco : []) {
    const da = String((s && s.da) == null ? "" : s.da).trim();
    if (!da || visti.has(da)) continue;
    visti.add(da);
    out.push({ da, a: String((s && s.a) == null ? "" : s.a).trim() });
    if (out.length >= SOSTITUZIONI_MAX) break;
  }
  return out;
}

/**
 * La chiave `da` è una parola intera in `testo` alla posizione `i`? Il bordo è
 * valido se dal lato della parola non c'è un altro carattere di parola (inizio
 * o fine stringa sono bordi validi).
 */
function parolaIntera(testo, i, da) {
  const inizioParola = da.length > 0 && diParola(da[0]);
  const fineParola = da.length > 0 && diParola(da[da.length - 1]);
  const prima = i === 0 ? "" : testo[i - 1];
  const dopo = i + da.length >= testo.length ? "" : testo[i + da.length];
  const okPrima = !inizioParola || i === 0 || !diParola(prima);
  const okDopo = !fineParola || i + da.length >= testo.length || !diParola(dopo);
  return okPrima && okDopo;
}

/** Applica una singola regola a tutte le sue occorrenze come parola intera. */
function applicaUna(testo, da, a) {
  if (!da) return testo;
  let out = "";
  let i = 0;
  while (i < testo.length) {
    const j = testo.indexOf(da, i);
    if (j < 0) {
      out += testo.slice(i);
      break;
    }
    if (parolaIntera(testo, j, da)) {
      out += testo.slice(i, j) + a;
      i = j + da.length;
    } else {
      // Non è una parola intera: si tiene il carattere e si prosegue.
      out += testo.slice(i, j + 1);
      i = j + 1;
    }
  }
  return out;
}

/**
 * Applica la tabella delle sostituzioni a un testo: solo parole intere, in
 * ordine (l'uscita di una regola può essere l'ingresso della successiva, ma le
 * predefinite non si auto-innescano).
 */
export function applicaSostituzioni(testo, sostituzioni) {
  const s = String(testo == null ? "" : testo);
  let out = s;
  for (const r of normalizzaSostituzioni(sostituzioni)) out = applicaUna(out, r.da, r.a);
  return out;
}

/**
 * La sostituzione da applicare al testo **prima del cursore**: restituisce
 * `{ da, a }` quando quel testo finisce con una chiave scritta come parola
 * intera, altrimenti `null`. È il calcolo che usa la finestra di composizione a
 * ogni tasto; con più chiavi vince la più lunga (es. «xche» prima di «che»).
 */
export function sostituzioneDaApplicare(testoPrimaDelCursore, sostituzioni) {
  const t = String(testoPrimaDelCursore == null ? "" : testoPrimaDelCursore);
  const regole = normalizzaSostituzioni(sostituzioni)
    .slice()
    .sort((x, y) => y.da.length - x.da.length);
  for (const r of regole) {
    if (!t.endsWith(r.da)) continue;
    const i = t.length - r.da.length;
    if (parolaIntera(t, i, r.da)) return { da: r.da, a: r.a };
  }
  return null;
}

/**
 * Esito dell'aggiunta di una sostituzione a un elenco: `duplicato` vero se la
 * chiave c'è già (l'elenco non va toccato). Funzione pura per il pannello.
 */
export function testoSostituzione(nuova, elenco) {
  const regole = normalizzaSostituzioni(elenco);
  const da = String((nuova && nuova.da) == null ? "" : nuova.da).trim();
  if (!da) return { duplicato: false, vuota: true };
  return { duplicato: regole.some((r) => r.da === da), vuota: false };
}

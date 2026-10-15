/**
 * Posta indesiderata (blocco D, seconda metà): logica pura, senza DOM.
 *
 * Il livello di protezione è `"spenta" | "attiva"` (specchia `config.rs`). Con
 * la protezione **attiva** i messaggi dei mittenti bloccati, all'arrivo, vengono
 * spostati in Posta indesiderata; con la protezione **spenta** vengono solo
 * marcati. `riepilogoPosta` è il testo del pannello: quanti mittenti sono
 * bloccati e l'ultima volta che la protezione ha agito.
 */

/** Livelli di protezione ammessi (specchia `config::PROTEZIONI_POSTA`). */
export const PROTEZIONI = ["spenta", "attiva"];

/** Livello valido, altrimenti il default (protezione attiva). */
export function normProtezione(v, def = "attiva") {
  return PROTEZIONI.includes(v) ? v : def;
}

const ETICHETTE = {
  spenta: "Spenta (solo marcatura)",
  attiva: "Attiva (sposta in Posta indesiderata)",
};

/** Etichetta leggibile del livello. */
export function etichettaProtezione(v) {
  return ETICHETTE[normProtezione(v)];
}

/** Testo leggibile dell'ultima azione della protezione (0 = mai). */
export function testoUltimaAzione(unix) {
  const s = Number(unix);
  if (!Number.isFinite(s) || s <= 0) return "mai";
  const d = new Date(s * 1000);
  const due = (n) => String(n).padStart(2, "0");
  return (
    `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${due(d.getHours())}:${due(d.getMinutes())}`
  );
}

/**
 * Riepilogo del pannello Posta indesiderata: quanti mittenti sono bloccati, cosa
 * fa il livello di protezione in vigore e l'ultima volta che ha agito.
 */
export function riepilogoPosta({ mittenti, protezione, ultimaAzione } = {}) {
  const n = Array.isArray(mittenti) ? mittenti.length : 0;
  const prot = normProtezione(protezione);
  const testo = n === 1 ? "1 mittente bloccato" : `${n} mittenti bloccati`;
  const azione =
    prot === "attiva"
      ? "protezione attiva: all'arrivo i messaggi dei mittenti bloccati vengono spostati in Posta indesiderata"
      : "protezione spenta: all'arrivo i messaggi dei mittenti bloccati vengono solo marcati";
  return `${testo} · ${azione} · ultima azione della protezione: ${testoUltimaAzione(ultimaAzione)}.`;
}

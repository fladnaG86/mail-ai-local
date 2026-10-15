/**
 * Firme del mittente (blocco D, seconda metà): **logica pura**, senza DOM.
 *
 * Una firma è `{ id, nome, contenuto, html }`. Una preferenza `firmaDelMittente`
 * di testo singolo (la firma storica) è migrata "in lettura" da
 * `firmeEffettive`: non si perde e non si duplica. La firma predefinita di un
 * account è indicata dalla mappa `firmaPredefinitaPerAccount` (id account → id
 * firma). `sostituisciFirma` inserisce la firma in coda al corpo **sostituendo**
 * quella precedente, così cambiare firma non la duplica.
 */

/** Nome leggibile di una firma (mai vuoto). */
export function nomeFirma(f) {
  const n = String((f && f.nome) || "").trim();
  return n || "Firma";
}

/**
 * Normalizza un elenco di firme: id e nome non vuoti (generati se assenti),
 * niente id duplicati (vince la prima), niente voci completamente vuote.
 * Specchia `config::normalizza_firme` del kernel.
 */
export function normalizzaFirme(elenco) {
  const lista = Array.isArray(elenco) ? elenco : [];
  const out = [];
  for (let i = 0; i < lista.length; i += 1) {
    const f = lista[i] || {};
    const nomeGrezzo = String(f.nome == null ? "" : f.nome).trim();
    const id = String(f.id == null ? "" : f.id).trim() || `firma${i + 1}`;
    const nome = nomeGrezzo || `Firma ${i + 1}`;
    const contenuto = String(f.contenuto == null ? "" : f.contenuto);
    if (!contenuto.trim() && !nomeGrezzo) continue;
    if (out.some((x) => x.id === id)) continue;
    out.push({ id, nome, contenuto, html: !!f.html });
  }
  return out;
}

/**
 * Le firme effettive di una preferenze: quelle dell'elenco, oppure — se
 * l'elenco è vuoto e il vecchio `firmaDelMittente` ha del testo — una firma
 * creata da quello. Specchia `config::firme_effettive`.
 */
export function firmeEffettive(preferenze) {
  const f = normalizzaFirme(preferenze && preferenze.firme);
  if (f.length) return f;
  const legacy = String((preferenze && preferenze.firmaDelMittente) || "").trim();
  return legacy ? [{ id: "predefinita", nome: "Firma", contenuto: legacy, html: false }] : [];
}

/** Id della firma predefinita per un account (o `null` se non ce n'è nessuna). */
export function idFirmaPredefinita(firme, mappa, accountId) {
  const lista = normalizzaFirme(firme);
  const m = mappa && typeof mappa === "object" ? mappa : {};
  const scelto = m[accountId];
  if (scelto && lista.some((f) => f.id === scelto)) return scelto;
  return lista.length ? lista[0].id : null;
}

/** Firma predefinita per un account, come oggetto (o `null`). */
export function firmaPredefinita(firme, mappa, accountId) {
  const id = idFirmaPredefinita(firme, mappa, accountId);
  if (!id) return null;
  return normalizzaFirme(firme).find((f) => f.id === id) || null;
}

/**
 * Inserisce una firma in coda al corpo **sostituendo** quella precedente, se
 * presente: cambiare firma non la duplica. Un testo di firma vuoto la rimuove.
 */
export function sostituisciFirma(corpo, nuova, precedente) {
  let base = String(corpo == null ? "" : corpo);
  const prec = String(precedente == null ? "" : precedente);
  if (prec) {
    const i = base.lastIndexOf(prec);
    if (i >= 0) base = base.slice(0, i) + base.slice(i + prec.length);
  }
  base = base.replace(/[\s\u00a0]+$/, "");
  const f = String(nuova == null ? "" : nuova).replace(/^[\s\u00a0]+/, "").replace(/[\s\u00a0]+$/, "");
  if (!f) return base;
  return base ? `${base}\n\n${f}` : f;
}

/**
 * HTML del blocco firma da inserire nel corpo. La firma sta in un blocco a sé
 * (`.cmp-firma`): così cambiarla sostituisce **solo** quel blocco e non tocca il
 * resto del corpo — grassetti, elenchi, tabelle e immagini compresi.
 */
export function htmlBloccoFirma(testo, fuga) {
  const t = String(testo == null ? "" : testo);
  if (!t.trim()) return "";
  const esc = typeof fuga === "function" ? fuga : fugaPredefinita;
  return `<div class="cmp-firma" data-firma="1">${esc(t).replace(/\r?\n/g, "<br>")}</div>`;
}

function fugaPredefinita(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sostituisce il blocco firma dentro il corpo mantenendo intatto tutto il resto.
 * Lavora sul DOM (`Element`): è la differenza che evita di appiattire a testo
 * semplice il contenuto formattato scritto dall'utente (o una tabella inserita).
 */
export function applicaFirmaAlCorpo(corpoEl, testoFirma, fuga) {
  if (!corpoEl || typeof corpoEl.querySelectorAll !== "function") return;
  corpoEl.querySelectorAll(".cmp-firma").forEach((n) => n.remove());
  const html = htmlBloccoFirma(testoFirma, fuga);
  if (html) corpoEl.insertAdjacentHTML("beforeend", html);
}

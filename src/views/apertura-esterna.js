/**
 * Blocco V2 — aperture dall'esterno: link `mailto:` mandati da altre app.
 *
 * macOS consegna i link all'app (schema `mailto` dichiarato in `Info.plist`);
 * il kernel li mette in coda (`aperture.rs`) e avvisa con l'evento
 * `aperture-esterne`. Qui le funzioni **pure** che li traducono nei campi della
 * composizione; il collegamento all'evento sta in `main.js`.
 */

/** Nome dell'evento con cui il kernel avvisa che ci sono aperture in coda. */
export const EVENTO_APERTURE = "aperture-esterne";

/** Decodifica percentuale che non lancia: una codifica rotta lascia il testo com'è. */
function decodifica(testo) {
  try {
    return decodeURIComponent(testo);
  } catch {
    return testo;
  }
}

/** Gli indirizzi di un campo, separati da virgola, decodificati e senza vuoti. */
function indirizzi(campo) {
  return decodifica(campo)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * I campi della composizione da un link `mailto:` (RFC 6068), o `null` se il
 * testo non è un `mailto:`. Il `+` non è uno spazio (a differenza dei moduli
 * web); gli a capo `%0D%0A` diventano `\n`.
 */
export function analizzaMailto(url) {
  const testo = String(url || "");
  if (!/^mailto:/i.test(testo)) return null;
  const resto = testo.slice("mailto:".length);
  const q = resto.indexOf("?");
  const percorso = q < 0 ? resto : resto.slice(0, q);
  const query = q < 0 ? "" : resto.slice(q + 1);

  const a = indirizzi(percorso);
  const cc = [];
  const ccn = [];
  let oggetto = "";
  let corpo = "";
  for (const coppia of query.split("&")) {
    if (!coppia) continue;
    const uguale = coppia.indexOf("=");
    const chiave = (uguale < 0 ? coppia : coppia.slice(0, uguale)).toLowerCase();
    const valore = uguale < 0 ? "" : coppia.slice(uguale + 1);
    if (chiave === "to") a.push(...indirizzi(valore));
    else if (chiave === "cc") cc.push(...indirizzi(valore));
    else if (chiave === "bcc") ccn.push(...indirizzi(valore));
    else if (chiave === "subject") oggetto = decodifica(valore);
    else if (chiave === "body") corpo = decodifica(valore).replace(/\r\n?/g, "\n");
  }
  return { a: a.join(", "), cc: cc.join(", "), ccn: ccn.join(", "), oggetto, corpo };
}

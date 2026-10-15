/**
 * Barra dell'Assistente IA (Milestone 6.4) e bozza di risposta assistita (7.1).
 *
 * Contiene la logica pura (etichette, formattazione del risultato, messaggi
 * d'errore) testata con `node --test tests/`, e il disegno della scheda del
 * risultato sotto il messaggio. La chiamata al kernel resta in main.js.
 */

/** Modelli come li mostra il selettore della barra (coincidono con i default del kernel). */
export const MODELLI = {
  locale: "locale · thinkingcap-27b",
  cloud: "cloud · OpenRouter",
};

/** Etichetta della destinazione dei dati per il selettore della barra. */
export function etichettaDestinazione(provider, modello) {
  const m = modello || (provider === "cloud" ? "OpenRouter" : "thinkingcap-27b");
  return `${provider} · ${m}`;
}

/** Titolo della scheda per un'azione ("RIASSUNTO", "AZIONI", …). */
export function titoloAzione(azione, messaggiUsati) {
  const nomi = {
    riassumi: "RIASSUNTO",
    azioni: "AZIONI",
    traduci: "TRADUZIONE",
    bozza_risposta: "BOZZA DI RISPOSTA",
  };
  const nome = nomi[azione] || azione.toUpperCase();
  return messaggiUsati ? `${nome} · ${messaggiUsati} messaggi` : nome;
}

/**
 * Estrae il JSON dell'azione "azioni" dal testo del modello.
 * Restituisce { ok: true, azioni, scadenzeAssenti } oppure { ok: false } se il
 * testo non è JSON valido (in quel caso l'interfaccia mostra il testo grezzo).
 */
export function formattaAzioni(testo) {
  const pulito = String(testo || "")
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
  const inizio = pulito.indexOf("{");
  const fine = pulito.lastIndexOf("}");
  if (inizio < 0 || fine <= inizio) return { ok: false, testo: pulito };
  try {
    const dato = JSON.parse(pulito.slice(inizio, fine + 1));
    if (!Array.isArray(dato.azioni)) return { ok: false, testo: pulito };
    return {
      ok: true,
      azioni: dato.azioni,
      scadenzeAssenti: dato.scadenze_assenti === true || dato.scadenze_assenti === "true",
    };
  } catch {
    return { ok: false, testo: pulito };
  }
}

/**
 * Traduce un errore del kernel in un messaggio d'interfaccia chiaro:
 * modello locale non avviato, thread vuoto, risposta non valida, consenso o
 * chiave del cloud mancanti. In ogni altro caso passa il testo originale.
 */
export function messaggioErrore(err) {
  const t = String(err || "");
  if (/messaggio non trovato/i.test(t))
    return "Nessun messaggio da analizzare: il thread è vuoto o non è più in cache. Seleziona un messaggio e riprova.";
  if (/errore di rete|connessione rifiutata|connection refused|refused|timeout/i.test(t))
    return "Il modello locale non risponde: sembra non essere in esecuzione. Avvia il modello locale (endpoint http://127.0.0.1:8000) e riprova.";
  if (/risposta non valida|manca choices|risposta incompleta|json/i.test(t))
    return "La risposta del modello non è valida. Riprova; se torna lo stesso errore, prova un'altra azione.";
  if (/consenso/i.test(t))
    return "Per l'uso del cloud serve la conferma esplicita: riprova e conferma l'avviso.";
  if (/chiave/i.test(t))
    return "Chiave OpenRouter assente: configurala nel portachiavi prima di usare il cloud.";
  return t || "Errore sconosciuto dell'assistente.";
}

/** Fuga i caratteri per l'HTML della scheda. */
function fuga(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inserisce la scheda nel punto giusto del pannello di lettura: sotto
 * l'intestazione del messaggio (oggetto, mittente, barra informativa) e sopra il
 * corpo, come nel mockup approvato. Senza corpo, in coda.
 */
function inserisciScheda(root, scheda) {
  const corpo = root.querySelector(".mail-body");
  if (corpo) corpo.before(scheda);
  else root.append(scheda);
}

/**
 * Disegna (o aggiorna) la scheda del risultato IA nel pannello di lettura.
 * `dati`: { azione, testo, modello, provider, messaggiUsati, esclusi,
 *           inAttesa, errore }.
 * La scheda è richiudibile (clic sull'intestazione) e si rimuove con "×".
 * Restituisce l'elemento della scheda, o null se `dati` è vuoto.
 */
export function renderSchedaIA(root, dati) {
  if (!root || !dati) return null;
  const vecchia = root.querySelector(".ai-card");
  if (vecchia) vecchia.remove();

  const scheda = document.createElement("div");
  scheda.className = "ai-card";

  if (dati.inAttesa) {
    scheda.classList.add("ai-card--attesa");
    scheda.innerHTML = `
      <div class="t">${fuga(titoloAzione(dati.azione, dati.messaggiUsati))} — elaborazione in corso…</div>
      <div class="b">L'assistente sta leggendo il thread; nulla viene inviato senza il tuo consenso.</div>`;
    inserisciScheda(root, scheda);
    return scheda;
  }

  if (dati.errore) {
    scheda.classList.add("ai-card--errore");
    scheda.innerHTML = `
      <div class="t">ASSISTENTE — errore</div>
      <div class="b">${fuga(messaggioErrore(dati.errore))}</div>
      <div class="f">${fuga(dati.provider === "cloud" ? "tentativo via cloud" : "tentativo in locale")}</div>
      <button class="ai-card-close" type="button" title="Chiudi">×</button>`;
    chiudibile(scheda, root);
    inserisciScheda(root, scheda);
    return scheda;
  }

  // Corpo: elenco leggibile per "azioni", testo per tutto il resto.
  let corpo;
  if (dati.azione === "azioni") {
    const parsed = formattaAzioni(dati.testo);
    if (parsed.ok) {
      const righe = parsed.azioni
        .map((a) => {
          const entro = a.entro ? ` · entro ${fuga(a.entro)}` : "";
          const fonte = a.fonte ? ` · fonte [${fuga(a.fonte)}]` : "";
          return `<li>${fuga(a.cosa)} — chi: ${fuga(a.chi || "?")}${entro}${fonte}</li>`;
        })
        .join("");
      corpo = `<ul class="ai-elenco">${righe || "<li>nessuna azione nel thread</li>"}</ul>` +
        (parsed.scadenzeAssenti ? `<div class="ai-scadenze">⚠︎ il thread cita una scadenza senza data</div>` : "");
    } else {
      corpo = `<div class="b">${fuga(parsed.testo)}</div>`;
    }
  } else {
    corpo = `<div class="b">${fuga(dati.testo)}</div>`;
  }

  const destinazione =
    dati.provider === "cloud"
      ? "elaborato nel cloud · il testo è uscito dal Mac con il tuo consenso"
      : "elaborato in locale · nessun dato inviato fuori";
  const esclusi =
    dati.esclusi > 0 ? ` · esclusi ${dati.esclusi} messaggi precedenti` : "";
  const fonti =
    dati.messaggiUsati > 0 ? ` · fonti: ${dati.messaggiUsati} messaggi del thread` : "";

  scheda.innerHTML = `
    <div class="t">${fuga(titoloAzione(dati.azione, dati.messaggiUsati))}</div>
    ${corpo}
    <div class="f">${fuga(destinazione)} · modello ${fuga(dati.modello || "")}${fuga(fonti)}${fuga(esclusi)}</div>
    <button class="ai-card-close" type="button" title="Chiudi">×</button>`;
  chiudibile(scheda, root);
  inserisciScheda(root, scheda);
  return scheda;
}

/** Clic sull'intestazione richiude/apre il corpo; "×" rimuove la scheda. */
function chiudibile(scheda, root) {
  const chiudi = scheda.querySelector(".ai-card-close");
  if (chiudi)
    chiudi.addEventListener("click", () => scheda.remove());
  const testa = scheda.querySelector(".t");
  if (testa)
    testa.addEventListener("click", () => scheda.classList.toggle("ai-card--richiusa"));
}

/**
 * Richiesta di consenso per l'uso del cloud: finestra di conferma in-app che
 * dice esplicitamente che il testo uscirà dal Mac. Risolve true solo se
 * l'utente conferma; annulla chiude senza chiamare il modello.
 */
export function chiediConsensoCloud() {
  return new Promise((risolvi) => {
    const velo = document.createElement("div");
    velo.className = "consenso-velo";
    velo.innerHTML = `
      <div class="consenso-box" role="dialog" aria-label="Consenso per il cloud">
        <div class="consenso-titolo">Inviare il testo al cloud?</div>
        <p>Il testo del messaggio e della richiesta uscirà dal Mac e sarà
        elaborato da OpenRouter. Nella richiesta non vanno la rubrica né gli
        altri messaggi della casella, ma il contenuto del thread sì.</p>
        <div class="consenso-bottoni">
          <button type="button" class="consenso-no">Resta in locale</button>
          <button type="button" class="consenso-si">Continua col cloud</button>
        </div>
      </div>`;
    document.body.append(velo);
    const chiudi = (esito) => {
      velo.remove();
      risolvi(esito);
    };
    velo.querySelector(".consenso-no").addEventListener("click", () => chiudi(false));
    velo.querySelector(".consenso-si").addEventListener("click", () => chiudi(true));
    velo.addEventListener("mousedown", (e) => {
      if (e.target === velo) chiudi(false);
    });
  });
}

// --- dati di esempio per le prove visive nel browser (?view=assistente) ---
// Servono a confrontare la scheda con il mockup senza account né modello.
export function schedaDiEsempio(azione) {
  if (azione === "azioni")
    return {
      azione: "azioni",
      testo: JSON.stringify({
        azioni: [
          { cosa: "inviare la lista degli interventi su VED e Beta", chi: "io", entro: "2026-11-20", fonte: 1 },
          { cosa: "confermare la finestra di fermo impianto di dicembre", chi: "Luca Bianchi", entro: null, fonte: 1 },
        ],
        scadenze_assenti: false,
      }),
      modello: "thinkingcap-27b",
      provider: "locale",
      messaggiUsati: 3,
      esclusi: 2,
    };
  if (azione === "traduci")
    return {
      azione: "traduci",
      testo: "Translation (example data): the maintenance plan for Q4 requires the works on VED and Beta and the costs by 20/11.",
      modello: "thinkingcap-27b",
      provider: "locale",
      messaggiUsati: 3,
      esclusi: 0,
    };
  return {
    azione: "riassumi",
    testo:
      "Luca Bianchi chiede gli interventi su VED (linea compositi) e Beta (quadri elettrici) per il fermo impianto di dicembre, e la lista con i costi entro il 20/11 [1]. Manca ancora la lista degli interventi [1].",
    modello: "thinkingcap-27b",
    provider: "locale",
    messaggiUsati: 3,
    esclusi: 2,
  };
}

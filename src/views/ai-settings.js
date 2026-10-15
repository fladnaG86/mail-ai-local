/**
 * Pannello "Assistente IA" (task 8.2, Milestone 8).
 *
 * Riferimento: `mockup-impostazioni.html` (pannello nuovo, larga 640 pt) e §2.5
 * della spec. Sezioni: **Motore** (locale consigliato / cloud, endpoint, modelli),
 * **Privacy** (conferma prima di ogni invio al cloud, registro con l'elenco delle
 * righe), **Comportamento** (avvio del modello locale, tono, lingue) e **Firma del
 * mittente**.
 *
 * Ogni modifica viene salvata subito e ha effetto: la firma compare nelle nuove
 * composizioni, il tono e la lingua di traduzione entrano nei prompt, il provider
 * cambia il default della barra dell'Assistente. Le caselle di testo salvano su
 * `change` (blur o Invio), non a ogni tasto, per non riscrivere il file a metà parola.
 *
 * Nel percorso browser (senza Tauri) il pannello funziona con valori di esempio e
 * salvataggi in memoria: serve alle prove visive (`?view=assistente-ia`).
 *
 * Nessuna password compare qui: la chiave OpenRouter resta nel Keychain, il file
 * `config.json` non la vede mai.
 *
 * Il tema corrente arriva dal chiamante (`opzioni.getTema`): questo modulo non
 * importa `theme.js`, quindi si carica anche senza un DOM (test con `node --test`).
 */

import { impostaFirma } from "./compose.js";
import { PULSANTE_CHIUDI } from "./blocco-i2.js";

/** Toni ammessi per le bozze (specchia il kernel: `TONO_DEFAULT` = "diretto"). */
export const TONI = ["formale", "diretto", "breve"];

/** Lingue offerte nei selettori (una lingua scritta a mano resta valida). */
export const LINGUE = [
  "italiano",
  "inglese",
  "francese",
  "tedesco",
  "spagnolo",
  "portoghese",
];

/** Etichetta leggibile di un tono ("diretto" → "Diretto"). */
export function etichettaTono(tono) {
  const t = String(tono || "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

/** Etichetta leggibile di una lingua (la prima lettera maiuscola). */
export function etichettaLingua(lingua) {
  return etichettaTono(lingua);
}

/**
 * Data e ora leggibili di una riga del registro, dai secondi Unix.
 * Restituisce "--" se il valore non è una data sensata.
 */
export function formatoData(unixSecondi) {
  const s = Number(unixSecondi);
  if (!Number.isFinite(s) || s <= 0) return "--";
  const d = new Date(s * 1000);
  const due = (n) => String(n).padStart(2, "0");
  return (
    `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${due(d.getHours())}:${due(d.getMinutes())}`
  );
}

/**
 * Riga di spiegazione del registro, mostrata sopra la tabella: dice cosa viene
 * registrato e — altrettanto importante — cosa non lo è mai.
 */
export function spiegazioneRegistro() {
  return (
    "Nel registro va una riga per ogni richiesta inviata al cloud: data e ora, provider, modello, " +
    "azione e impronta (SHA-256) del testo. Il contenuto delle mail NON viene registrato: nel " +
    "registro non c'è mai il testo dei messaggi né degli allegati."
  );
}

/**
 * La riga di stato della chiave OpenRouter. Dice **cosa manca e cosa fare**,
 * non solo «assente»: senza chiave il cloud non è utilizzabile, e chi l'ha
 * scelto deve saperlo prima di premere un'azione, non dopo l'errore.
 *
 * Funzione pura: si prova senza DOM e senza Portachiavi.
 */
export function testoStatoChiave({ presente = false } = {}) {
  return presente
    ? "Chiave presente nel Portachiavi: il cloud è utilizzabile."
    : "Nessuna chiave salvata: senza, le azioni sul cloud non partono.";
}

/** Intestazioni della tabella del registro. */
export function colonneRegistro() {
  return ["Data e ora", "Provider", "Modello", "Azione", "Versione prompt", "Impronta"];}

/**
 * Riepilogo del pannello Privacy/registro: quante voci ci sono e — altrettanto
 * importante — cosa contengono e cosa non contengono mai. Coerente con i campi
 * che il registro ha davvero (data, provider, modello, azione, versione, hash).
 */
export function riepilogoRegistro(righe, { registroAttivo = true, consensoRichiesto = true } = {}) {
  const n = Array.isArray(righe) ? righe.length : 0;
  const voci = n === 1 ? "1 voce" : `${n} voci`;
  return (
    `Registro: ${voci}. Ogni voce è solo impronta SHA-256 e metadati (data e ora, provider, ` +
    `modello, azione, versione del prompt): il testo dei messaggi e degli allegati non viene ` +
    `mai registrato. ` +
    (consensoRichiesto
      ? "Il consenso all'invio al cloud è chiesto ogni volta."
      : "Il consenso all'invio al cloud è già stato dato: non si chiede più a ogni azione.") +
    " " +
    (registroAttivo
      ? "Nessuna telemetria: le voci restano su questo Mac."
      : "Il registro è spento: nessuna nuova voce verrà scritta.")
  );
}

/** Righe di esempio del registro, per le prove visive nel browser. */
export function righeDiEsempio() {
  return [
    {
      data: 1791876000,
      provider: "cloud",
      modello: "openai/gpt-4o-mini",
      azione: "riassumi",
      promptVersion: "v1",
      hash: "3f2a91c4b7e0…",
    },
    {
      data: 1791872400,
      provider: "cloud",
      modello: "openai/gpt-4o-mini",
      azione: "bozza_risposta",
      promptVersion: "v1",
      hash: "9c1de0aa55f2…",
    },
  ];
}

/** Impostazioni di esempio (stessi default del kernel), per il percorso browser. */
export function impostazioniDiEsempio() {
  return {
    theme: "system",
    preferenze: {
      firmaDelMittente: "Mario Rossi\nResponsabile sistemi — Azienda Esempio",
      firme: [
        {
          id: "lavoro",
          nome: "Lavoro",
          contenuto: "Mario Rossi — Responsabile sistemi, Azienda Esempio",
          html: false,
        },
      ],
      firmaPredefinitaPerAccount: { "mario.rossi@esempiogroup.it": "lavoro" },
      cartellaIniziale: "INBOX",
      protezionePostaIndesiderata: "attiva",
      protezioneUltimaAzione: 0,
      providerIa: "locale",
      endpointLocale: "http://127.0.0.1:8000/v1",
      modelloLocale: "thinkingcap-27b",
      modelloCloud: "openai/gpt-4o-mini",
      consensoRichiesto: true,
      registroAttivo: true,
      controlloTonoAttivo: false,
      tonoBozze: "diretto",
      linguaRisposte: "italiano",
      linguaTraduzione: "inglese",
      avviaModelloAllApertura: false,
      comandoAvvioLocale: "open -a Splash-M1",
      // Blocco D — Lettura, Composizione, Tipi di carattere, Correzione
      // automatica, Ortografia (stessi default del kernel).
      letturaPannello: "sotto",
      letturaSegnaLettoDopo: 0,
      letturaImmagini: "chiedi",
      letturaAnteprima: false,
      composizioneFormato: "html",
      composizioneACapo: true,
      composizioneIncludiOriginale: true,
      composizioneNuovaFinestra: false,
      carattereFamiglia: "Aptos",
      carattereDimensione: 12,
      correzioneAutomaticaAttiva: true,
      correzioneSostituzioni: [
        { da: "nn", a: "non" },
        { da: "ke", a: "che" },
        { da: "xche", a: "perché" },
      ],
      ortografiaAttiva: false,
      ortografiaLingua: "it-IT",
      // Blocco E — Notifiche e suoni (stessi default del kernel).
      notificheAttive: true,
      notificheAnteprima: true,
      notificheSuono: "Glass",
      nonDisturbareAttivo: false,
      nonDisturbareInizio: "22:00",
      nonDisturbareFine: "07:00",
      // Blocco H — conversazioni e regole locali (stessi default del kernel).
      raggruppaConversazioni: true,
      regole: [],
    },
  };
}

/** Completa un oggetto impostazioni parziale coi default (campi mancanti). */
function completaIimpostazioni(imp) {
  const base = impostazioniDiEsempio();
  const p = Object.assign({}, base.preferenze, (imp && imp.preferenze) || {});
  return { theme: (imp && imp.theme) || base.theme, preferenze: p };
}

/** Fuga dei caratteri per l'inserimento nell'HTML. */
function fuga(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Opzioni di un `<select>`, aggiungendo il valore corrente se fuori elenco. */
function opzioniSelect(valori, corrente) {
  const elenco = valori.slice();
  if (corrente && !elenco.includes(corrente)) elenco.push(corrente);
  return elenco
    .map(
      (v) =>
        `<option value="${fuga(v)}"${v === corrente ? " selected" : ""}>${fuga(etichettaLingua(v))}</option>`,
    )
    .join("");
}

/** Markup completo del pannello. */
function markup(p) {
  const sel = (valori) => opzioniSelect(valori, "");
  return `
  <div class="ai-settings-win" role="dialog" aria-label="Assistente IA">
    <header class="settings-titlebar">
      ${PULSANTE_CHIUDI}
      <span class="settings-title">Assistente IA</span>
      <button type="button" class="settings-showall">Mostra tutte</button>
    </header>

    <div class="ai-settings-body">
      <div class="settings-sec">Motore</div>
      <div class="settings-hr"></div>
      <div class="ai-riga-motore">
        <label><input type="radio" name="provider" value="locale"${p.providerIa === "locale" ? " checked" : ""}> Locale (consigliato)</label>
        <label><input type="radio" name="provider" value="cloud"${p.providerIa === "cloud" ? " checked" : ""}> OpenRouter (cloud)</label>
      </div>
      <div class="settings-grid">
        <div class="settings-lbl">Endpoint locale:</div>
        <input class="settings-fld" type="text" id="ai-endpoint" autocomplete="off" value="${fuga(p.endpointLocale)}" />
        <div class="settings-lbl">Modello locale:</div>
        <input class="settings-fld" type="text" id="ai-modello-locale" autocomplete="off" value="${fuga(p.modelloLocale)}" />
        <div class="settings-lbl">Modello cloud:</div>
        <input class="settings-fld" type="text" id="ai-modello-cloud" autocomplete="off" value="${fuga(p.modelloCloud)}" />
      </div>

      <div class="settings-sec">Chiave OpenRouter</div>
      <div class="settings-hr"></div>
      <div class="ai-chiave-riga">
        <div class="settings-lbl">Chiave API:</div>
        <input class="settings-fld ai-chiave-fld" type="password" id="ai-chiave" autocomplete="off"
               spellcheck="false" placeholder="sk-or-v1-…" />
        <button type="button" class="ai-btn2" id="ai-chiave-mostra" title="Mostra o nascondi la chiave">Mostra</button>
      </div>
      <div class="ai-chiave-azioni">
        <button type="button" class="ai-btn2" id="ai-chiave-salva">Salva nel Portachiavi</button>
        <button type="button" class="ai-btn2" id="ai-chiave-prova">Prova la chiave</button>
        <button type="button" class="ai-btn2" id="ai-chiave-rimuovi">Rimuovi</button>
        <span class="ai-chiave-esito" id="ai-chiave-esito"></span>
      </div>
      <div class="ai-chiave-nota">
        La chiave resta nel <b>Portachiavi di macOS</b>, mai in un file di configurazione.
        L'app la rilegge solo quando invia qualcosa al cloud, e non la mostra mai indietro:
        qui si può solo sostituire o rimuovere. Si prende da
        <span class="ai-chiave-link">openrouter.ai/keys</span>.
      </div>

      <div class="settings-sec">Privacy</div>
      <div class="settings-hr"></div>
      <label class="ai-check"><input type="checkbox" id="ai-consenso"${p.consensoRichiesto ? " checked" : ""}> Chiedi conferma prima di ogni invio al cloud</label>
      <label class="ai-check"><input type="checkbox" id="ai-registro"${p.registroAttivo ? " checked" : ""}> Registra le richieste inviate al cloud (per tracciabilità)</label>
      <div class="ai-registro-riga">
        <span id="ai-registro-conteggio">Registro delle richieste cloud…</span>
        <button type="button" class="ai-link" id="ai-apri-registro">apri il registro</button>
      </div>
      <div class="ai-registro-pannello" id="ai-registro-pannello" hidden>
        <div class="ai-registro-spiega">${fuga(spiegazioneRegistro())}</div>
        <div class="ai-registro-tabella" id="ai-registro-tabella"></div>
      </div>

      <div class="settings-sec">Comportamento</div>
      <div class="settings-hr"></div>
      <label class="ai-check"><input type="checkbox" id="ai-avvia"${p.avviaModelloAllApertura ? " checked" : ""}> Avvia il modello locale all'apertura dell'app</label>
      <div class="ai-avvia-riga">
        <button type="button" class="ai-btn2" id="ai-avvia-ora">Avvia ora il modello locale</button>
        <span class="ai-avvia-esito" id="ai-avvia-esito"></span>
      </div>
      <div class="settings-grid">
        <div class="settings-lbl">Tono delle bozze:</div>
        <select class="settings-fld" id="ai-tono">${sel(TONI)}</select>
        <div class="settings-lbl">Lingua delle risposte:</div>
        <select class="settings-fld" id="ai-lingua-risposte">${sel(LINGUE)}</select>
        <div class="settings-lbl">Lingua di traduzione:</div>
        <select class="settings-fld" id="ai-lingua-traduzione">${sel(LINGUE)}</select>
      </div>

      <div class="settings-sec">Firma del mittente</div>
      <div class="settings-hr"></div>
      <textarea class="settings-fld ai-firma" id="ai-firma" rows="3" spellcheck="false">${fuga(p.firmaDelMittente)}</textarea>
      <div class="ai-firma-nota">La firma viene aggiunta alle nuove composizioni. È salvata in config.json, non nel browser.</div>
    </div>

    <div class="settings-nota" role="status" aria-live="polite"></div>
  </div>`;
}

/**
 * Apre il pannello Assistente IA.
 *
 * `opzioni`: `{ impostazioni, onSalva, onRegistro, onAvvia, onProvider }`.
 *  - `impostazioni` è l'oggetto completo `{ theme, preferenze }` (di default i
 *    valori di esempio).
 *  - `onSalva(impostazioni)` salva e restituisce un esito leggibile (Tauri:
 *    comando `impostazioni_salva`).
 *  - `onRegistro(limite)` restituisce le righe del registro (Tauri: `registro_ia`).
 *  - `onAvvia()` tenta di avviare il motore locale (Tauri: `assistente_avvia`).
 *  - `onProvider(provider)` notifica il cambio di provider (aggiorna la barra).
 *
 * Restituisce l'elemento dell'overlay.
 */
export function apriAssistenteIA(opzioni = {}) {
  document.querySelectorAll(".ai-settings-overlay").forEach((el) => el.remove());

  const stato = {
    impostazioni: completaIimpostazioni(opzioni.impostazioni),
    onSalva:
      typeof opzioni.onSalva === "function"
        ? opzioni.onSalva
        : async (imp) => {
            stato.impostazioni = imp;
            return "Salvato (prova visiva: nessun file scritto).";
          },
    onRegistro:
      typeof opzioni.onRegistro === "function" ? opzioni.onRegistro : async () => righeDiEsempio(),
    onAvvia:
      typeof opzioni.onAvvia === "function"
        ? opzioni.onAvvia
        : async () => "Prova visiva: il comando di avvio non viene eseguito.",
    onProvider: typeof opzioni.onProvider === "function" ? opzioni.onProvider : null,
    // Chiave OpenRouter: vive nel Portachiavi, non nelle preferenze. Queste
    // callback parlano col kernel; la chiave non entra mai in `impostazioni`.
    onChiaveStato:
      typeof opzioni.onChiaveStato === "function" ? opzioni.onChiaveStato : async () => false,
    onChiaveSalva:
      typeof opzioni.onChiaveSalva === "function"
        ? opzioni.onChiaveSalva
        : async () => "Prova visiva: la chiave non viene scritta (serve l'app avviata).",
    onChiaveElimina:
      typeof opzioni.onChiaveElimina === "function"
        ? opzioni.onChiaveElimina
        : async () => "Prova visiva: nessuna chiave da rimuovere.",
    onChiaveProva:
      typeof opzioni.onChiaveProva === "function"
        ? opzioni.onChiaveProva
        : async () => "Prova visiva: la chiave non viene provata (serve l'app avviata).",
    getTema: typeof opzioni.getTema === "function" ? opzioni.getTema : () => "system",
  };
  const p = stato.impostazioni.preferenze;

  const overlay = document.createElement("div");
  overlay.className = "ai-settings-overlay";
  overlay.innerHTML = markup(p);
  document.body.append(overlay);

  const notaEl = overlay.querySelector(".settings-nota");
  const nota = (testo, errore) => {
    notaEl.textContent = testo || "";
    notaEl.classList.toggle("settings-nota--errore", !!errore);
  };

  const chiudi = () => overlay.remove();
  overlay.querySelector(".win-close").addEventListener("click", chiudi);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) chiudi();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") chiudi();
  });
  overlay.querySelector(".settings-showall").addEventListener("click", () =>
    nota("«Mostra tutte» non è disponibile nella v1."),
  );

  /** Salva le preferenze correnti col tema letto ora (non quello caricato). */
  async function salva() {
    const daSalvare = { theme: stato.getTema(), preferenze: p };
    try {
      const esito = await stato.onSalva(daSalvare);
      nota(esito || "Salvato.");
    } catch (e) {
      nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  }

  // --- Motore ---
  overlay.querySelectorAll('input[name="provider"]').forEach((r) =>
    r.addEventListener("change", async () => {
      p.providerIa = r.value;
      if (stato.onProvider) stato.onProvider(r.value);
      await salva();
    }),
  );
  for (const [id, campo] of [
    ["#ai-endpoint", "endpointLocale"],
    ["#ai-modello-locale", "modelloLocale"],
    ["#ai-modello-cloud", "modelloCloud"],
  ]) {
    const el = overlay.querySelector(id);
    el.addEventListener("change", async () => {
      p[campo] = el.value.trim();
      await salva();
    });
  }

  // --- Privacy ---
  overlay.querySelector("#ai-consenso").addEventListener("change", async (e) => {
    p.consensoRichiesto = e.target.checked;
    await salva();
  });
  overlay.querySelector("#ai-registro").addEventListener("change", async (e) => {
    p.registroAttivo = e.target.checked;
    await salva();
  });

  // --- Registro: conteggio all'apertura, tabella su richiesta ---
  const conteggioEl = overlay.querySelector("#ai-registro-conteggio");
  const pannelloEl = overlay.querySelector("#ai-registro-pannello");
  const tabellaEl = overlay.querySelector("#ai-registro-tabella");

  function disegnaRegistro(righe) {
    const cols = colonneRegistro();
    if (!Array.isArray(righe) || righe.length === 0) {
      tabellaEl.innerHTML = `<div class="ai-registro-vuoto">Nessuna richiesta inviata al cloud: il registro è vuoto.</div>`;
      return;
    }
    tabellaEl.innerHTML = `
      <table class="reg-table">
        <thead><tr>${cols.map((c) => `<th>${fuga(c)}</th>`).join("")}</tr></thead>
        <tbody>
          ${righe
            .map(
              (r) =>
                `<tr>
                  <td>${fuga(formatoData(r.data))}</td>
                  <td>${fuga(r.provider)}</td>
                  <td>${fuga(r.modello)}</td>
                  <td>${fuga(r.azione)}</td>
                  <td>${fuga(r.promptVersion || r.prompt_version || "")}</td>
                  <td class="reg-hash">${fuga(r.hash)}</td>
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>`;
  }

  async function caricaRegistro(aggiornaConteggio) {
    let righe = [];
    try {
      righe = (await stato.onRegistro(200)) || [];
    } catch (e) {
      conteggioEl.textContent = `Registro non leggibile: ${e && e.message ? e.message : e}`;
      return [];
    }
    if (!Array.isArray(righe)) righe = [];
    if (aggiornaConteggio)
      conteggioEl.textContent = `Registro: ${righe.length} invii registrati (ultimi 200).`;
    return righe;
  }

  overlay.querySelector("#ai-apri-registro").addEventListener("click", async () => {
    if (!pannelloEl.hidden) {
      pannelloEl.hidden = true;
      return;
    }
    pannelloEl.hidden = false;
    tabellaEl.innerHTML = `<div class="ai-registro-vuoto">Caricamento del registro…</div>`;
    const righe = await caricaRegistro(true);
    disegnaRegistro(righe);
  });

  // --- Comportamento ---
  overlay.querySelector("#ai-avvia").addEventListener("change", async (e) => {
    p.avviaModelloAllApertura = e.target.checked;
    await salva();
  });
  overlay.querySelector("#ai-avvia-ora").addEventListener("click", async () => {
    const esitoEl = overlay.querySelector("#ai-avvia-esito");
    esitoEl.textContent = "Avvio in corso…";
    try {
      const esito = await stato.onAvvia();
      esitoEl.textContent = esito || "Avvio richiesto.";
    } catch (e) {
      esitoEl.textContent = `Avvio non riuscito: ${e && e.message ? e.message : e}`;
    }
  });

  // --- Chiave OpenRouter (cloud) ---
  //
  // La chiave non entra mai in `impostazioni`: va nel Portachiavi tramite il
  // kernel, e l'interfaccia non la riceve mai indietro — solo `presente` sì/no.
  // Perciò il campo non si pre-compila mai: si incolla, si salva, si svuota.
  const chiaveEl = overlay.querySelector("#ai-chiave");
  const chiaveEsitoEl = overlay.querySelector("#ai-chiave-esito");
  const esitoChiave = (testo, errore = false) => {
    chiaveEsitoEl.textContent = testo || "";
    chiaveEsitoEl.classList.toggle("ai-chiave-esito--errore", !!errore);
  };

  /** Aggiorna la riga di stato interrogando il kernel (solo «c'è / non c'è»). */
  async function aggiornaStatoChiave() {
    try {
      const presente = await stato.onChiaveStato();
      esitoChiave(testoStatoChiave({ presente }));
    } catch (e) {
      esitoChiave(`Stato della chiave non leggibile: ${e && e.message ? e.message : e}`, true);
    }
  }

  overlay.querySelector("#ai-chiave-mostra").addEventListener("click", () => {
    const mostra = chiaveEl.type === "password";
    chiaveEl.type = mostra ? "text" : "password";
    overlay.querySelector("#ai-chiave-mostra").textContent = mostra ? "Nascondi" : "Mostra";
  });

  overlay.querySelector("#ai-chiave-salva").addEventListener("click", async () => {
    esitoChiave("Salvataggio nel Portachiavi…");
    try {
      const esito = await stato.onChiaveSalva(chiaveEl.value);
      chiaveEl.value = ""; // il segreto non resta nel campo
      esitoChiave(esito || "Chiave salvata nel Portachiavi.");
      await aggiornaStatoChiave();
    } catch (e) {
      esitoChiave(`Chiave non salvata: ${e && e.message ? e.message : e}`, true);
    }
  });

  overlay.querySelector("#ai-chiave-rimuovi").addEventListener("click", async () => {
    esitoChiave("Rimozione dal Portachiavi…");
    try {
      const esito = await stato.onChiaveElimina();
      esitoChiave(esito || "Chiave rimossa dal Portachiavi.");
      await aggiornaStatoChiave();
    } catch (e) {
      esitoChiave(`Chiave non rimossa: ${e && e.message ? e.message : e}`, true);
    }
  });

  overlay.querySelector("#ai-chiave-prova").addEventListener("click", async () => {
    esitoChiave("Prova della chiave in corso…");
    try {
      const esito = await stato.onChiaveProva();
      esitoChiave(esito || "Chiave valida.");
    } catch (e) {
      esitoChiave(`Chiave non valida: ${e && e.message ? e.message : e}`, true);
    }
  });

  // I selettori sono pre-compilati con il valore corrente: aggiorno dopo il markup.
  const tonoEl = overlay.querySelector("#ai-tono");
  tonoEl.innerHTML = opzioniSelect(TONI, p.tonoBozze);
  tonoEl.addEventListener("change", async () => {
    p.tonoBozze = tonoEl.value;
    await salva();
  });
  for (const [id, campo] of [
    ["#ai-lingua-risposte", "linguaRisposte"],
    ["#ai-lingua-traduzione", "linguaTraduzione"],
  ]) {
    const el = overlay.querySelector(id);
    el.innerHTML = opzioniSelect(LINGUE, p[campo]);
    el.addEventListener("change", async () => {
      p[campo] = el.value;
      await salva();
    });
  }

  // --- Firma del mittente: salvata e subito attiva nelle nuove composizioni ---
  const firmaEl = overlay.querySelector("#ai-firma");
  firmaEl.addEventListener("change", async () => {
    p.firmaDelMittente = firmaEl.value;
    impostaFirma(firmaEl.value);
    await salva();
  });

  // Conteggio del registro all'apertura (senza aprire la tabella).
  caricaRegistro(true);
  // Stato della chiave all'apertura: «c'è / non c'è», mai il valore.
  aggiornaStatoChiave();

  return overlay;
}

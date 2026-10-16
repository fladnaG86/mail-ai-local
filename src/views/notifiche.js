/**
 * Pannello **Notifiche e suoni** (blocco E) e la sua logica pura.
 *
 * Il pannello è lo stesso telaio dei riquadri del blocco D (overlay
 * `.mail-settings-overlay`): interruttore generale, anteprima (mittente+oggetto),
 * suono di sistema con «Prova», «non disturbare» con orari, e «Prova notifica».
 *
 * La **logica pura** — normalizzazione degli orari, intervallo che scavalca la
 * mezzanotte, testo della notifica e limite di conteggio — sta qui e si collauda
 * con `node --test` senza un DOM. Il kernel (`src-tauri/src/notifiche.rs`)
 * riproduce le stesse regole.
 */

import { rendiSpostabile } from "./finestre.js";
import { PULSANTE_CHIUDI } from "./blocco-i2.js";

/** Suoni di sistema offerti (specchia `config.rs`). `"nessuno"` = silenzio. */
export const SUONI = ["nessuno", "Basso", "Glass", "Ping", "Pop", "Sosumi", "Tink"];
/** Suono predefinito. */
export const SUONO_DEFAULT = "Glass";
/** Orari predefiniti di «non disturbare». */
export const NON_DISTURBARE_INIZIO_DEFAULT = "22:00";
export const NON_DISTURBARE_FINE_DEFAULT = "07:00";
/** Oltre questo conteggio la notifica dice «99+ nuovi messaggi». */
export const MAX_CONTEGGIO_MOSTRATO = 99;

/** Etichette leggibili dei suoni (i nomi di sistema restano quelli del file). */
const ETICHETTE_SUONO = {
  nessuno: "Nessuno (silenzioso)",
  Basso: "Basso",
  Glass: "Vetro",
  Ping: "Ping",
  Pop: "Pop",
  Sosumi: "Sosumi",
  Tink: "Tink",
};

/** Vero se `s` è un orario nel formato `HH:MM` (ore e minuti anche a una cifra). */
export function orarioValido(s) {
  const testo = String(s == null ? "" : s).trim();
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(testo);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h < 24 && min >= 0 && min < 60;
}

/** Minuti dalla mezzanotte di un orario `HH:MM`, oppure `null` se non valido. */
export function minutiDaOrario(s) {
  if (!orarioValido(s)) return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(s).trim());
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Normalizza un orario nel formato `HH:MM` a due cifre. Un valore sbagliato
 * (`"25:00"`, `"abc"`, vuoto) dà il default indicato. Serve a un `config.json`
 * modificato a mano o a un campo time svuotato.
 */
export function normalizzaOrario(v, def = NON_DISTURBARE_INIZIO_DEFAULT) {
  const m = minutiDaOrario(v);
  if (m === null) return def;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Suono valido, altrimenti il default. */
export function normSuono(v, def = SUONO_DEFAULT) {
  return SUONI.includes(v) ? v : def;
}

/** Etichetta leggibile di un suono. */
export function etichettaSuono(v) {
  return ETICHETTE_SUONO[normSuono(v)];
}

/**
 * Vero se `adesso` (minuti dalla mezzanotte) cade nell'intervallo
 * `[inizio, fine)` di «non disturbare».
 *
 * Con `inizio < fine` l'intervallo è nella stessa giornata; con `inizio > fine`
 * **scavalca la mezzanotte** (es. 22:00 → 07:00). Estremi uguali = intervallo
 * vuoto. Accetta orari `"HH:MM"` o già minuti.
 */
export function dentroNonDisturbare(adesso, inizio, fine) {
  const a = normMinuti(adesso);
  const i = normMinuti(inizio);
  const f = normMinuti(fine);
  if (a === null || i === null || f === null) return false;
  if (i === f) return false;
  if (i < f) return a >= i && a < f;
  return a >= i || a < f;
}

/** Minuti dalla mezzanotte da un numero o da `"HH:MM"`, portati in 0–1439. */
export function normMinuti(v) {
  const m = typeof v === "string" ? minutiDaOrario(v) : Number(v);
  if (m === null || !Number.isFinite(m)) return null;
  return ((Math.trunc(m) % 1440) + 1440) % 1440;
}

/**
 * Titolo e corpo della notifica, dati il conteggio e il messaggio più recente.
 * Un solo messaggio: mittente e oggetto (o un testo generico senza anteprima).
 * Più di uno: «N nuovi messaggi» (oltre il limite: «99+»).
 */
export function testoNotifica(conteggio, mittente, oggetto, anteprima) {
  const n = Number.isFinite(Number(conteggio)) ? Math.max(0, Math.trunc(Number(conteggio))) : 0;
  const da = String(mittente == null ? "" : mittente).trim() || "Mittente sconosciuto";
  const ogg = String(oggetto == null ? "" : oggetto).trim() || "(nessun oggetto)";

  if (n <= 1) {
    if (anteprima) return { titolo: da, corpo: ogg };
    return { titolo: "Nuovo messaggio", corpo: "Hai ricevuto un nuovo messaggio." };
  }
  const titolo = titoloConteggio(n);
  if (anteprima) return { titolo, corpo: `Il più recente — ${da}: ${ogg}` };
  return { titolo, corpo: "Hai ricevuto nuovi messaggi." };
}

/** Titolo del conteggio, applicando il limite dichiarato (oltre → «99+»). */
export function titoloConteggio(conteggio) {
  const n = Math.max(0, Math.trunc(Number(conteggio) || 0));
  if (n > MAX_CONTEGGIO_MOSTRATO) return `${MAX_CONTEGGIO_MOSTRATO}+ nuovi messaggi`;
  return `${n} nuovi messaggi`;
}

/** Titoli dei pannelli del blocco E (per le prove e il hub). */
export const TITOLI_PANNELLI_E = { notifiche: "Notifiche e suoni" };

// ---------------------------------------------------------------------------
// Disegno del pannello (stesso telaio dei riquadri del blocco D).
// ---------------------------------------------------------------------------

/** Fuga dei caratteri per l'inserimento nell'HTML. */
function fuga(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Apre il pannello «Notifiche e suoni».
 *
 * `opzioni`: `{ preferenze, onSalva, onApplica, getTema, onProvaNotifica,
 * onProvaSuono }`. `onProvaNotifica()` mostra una notifica vera; `onProvaSuono(suono)`
 * fa sentire il suono scelto. Restituisce l'elemento overlay.
 */
export function apriPannelloNotifiche(opzioni = {}) {
  const titolo = TITOLI_PANNELLI_E.notifiche;
  document.querySelectorAll(".mail-settings-overlay").forEach((el) => el.remove());

  const base = Object.assign({}, opzioni.preferenze || {});
  const inp = {
    notificheAttive: base.notificheAttive !== false,
    notificheAnteprima: base.notificheAnteprima !== false,
    notificheSuono: normSuono(base.notificheSuono),
    nonDisturbareAttivo: !!base.nonDisturbareAttivo,
    nonDisturbareInizio: normalizzaOrario(base.nonDisturbareInizio, NON_DISTURBARE_INIZIO_DEFAULT),
    nonDisturbareFine: normalizzaOrario(base.nonDisturbareFine, NON_DISTURBARE_FINE_DEFAULT),
  };

  const getTema = typeof opzioni.getTema === "function" ? opzioni.getTema : () => "system";
  const preferenze = () => Object.assign({}, base, inp);

  const overlay = document.createElement("div");
  overlay.className = "mail-settings-overlay";
  overlay.dataset.pannello = "notifiche";
  overlay.innerHTML = `
    <div class="ai-settings-win mail-settings-win" role="dialog" aria-label="${fuga(titolo)}">
      <header class="settings-titlebar">
        ${PULSANTE_CHIUDI}
        <span class="settings-title">${fuga(titolo)}</span>
        <button type="button" class="settings-showall">Mostra tutte</button>
      </header>
      <div class="ai-settings-body" id="nt-body">
        <div class="settings-sec">Notifiche di sistema</div>
        <div class="settings-hr"></div>
        <label class="ai-check"><input type="checkbox" id="nt-attive"${inp.notificheAttive ? " checked" : ""}> Mostra una notifica quando arrivano messaggi nuovi</label>
        <label class="ai-check"><input type="checkbox" id="nt-anteprima"${inp.notificheAnteprima ? " checked" : ""}> Mostra mittente e oggetto nella notifica</label>
        <div class="settings-grid">
          <div class="settings-lbl">Suono:</div>
          <select class="settings-fld" id="nt-suono">
            ${SUONI.map((v) => `<option value="${v}"${v === inp.notificheSuono ? " selected" : ""}>${fuga(etichettaSuono(v))}</option>`).join("")}
          </select>
        </div>
        <div class="ai-avvia-riga">
          <button type="button" class="ai-btn2" id="nt-prova-suono">Prova</button>
          <button type="button" class="ai-btn2" id="nt-prova-notifica">Prova notifica</button>
          <span class="im-nota" id="nt-esito"></span>
        </div>
        <p class="im-nota">La notifica mostra il mittente e l'oggetto del messaggio più recente, oppure «N nuovi messaggi» se ne arrivano più di uno (oltre ${MAX_CONTEGGIO_MOSTRATO}: «${MAX_CONTEGGIO_MOSTRATO}+»). Con l'anteprima spenta non rivela il contenuto.</p>

        <div class="settings-sec">Non disturbare</div>
        <div class="settings-hr"></div>
        <label class="ai-check"><input type="checkbox" id="nt-dnd"${inp.nonDisturbareAttivo ? " checked" : ""}> Non mostrare notifiche in un intervallo di ore</label>
        <div class="settings-grid">
          <div class="settings-lbl">Da:</div>
          <input class="settings-fld settings-fld--ora" type="time" id="nt-dnd-inizio" value="${fuga(inp.nonDisturbareInizio)}" />
          <div class="settings-lbl">A:</div>
          <input class="settings-fld settings-fld--ora" type="time" id="nt-dnd-fine" value="${fuga(inp.nonDisturbareFine)}" />
        </div>
        <p class="im-nota">Un intervallo che scavalca la mezzanotte (es. dalle 22:00 alle 07:00) è ammesso: le notifiche tacciono la notte. Le regole sono rispettate davvero: i messaggi già letti, quelli dei mittenti bloccati e quelli in Posta indesiderata non producono notifiche, e se la finestra dell'app è in primo piano non si notifica.</p>
      </div>
      <div class="settings-nota" role="status" aria-live="polite"></div>
    </div>`;
  document.body.append(overlay);
  rendiSpostabile(overlay);

  const notaEl = overlay.querySelector(".settings-nota");
  const nota = (testo, errore) => {
    notaEl.textContent = testo || "";
    notaEl.classList.toggle("settings-nota--errore", !!errore);
  };
  const esito = overlay.querySelector("#nt-esito");
  const q = (sel) => overlay.querySelector(sel);

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

  /** Salva e applica: prima l'effetto in memoria, poi la persistenza. */
  async function salva() {
    if (typeof opzioni.onApplica === "function") opzioni.onApplica(preferenze());
    if (typeof opzioni.onSalva !== "function") {
      nota("Salvato (prova visiva: nessun file scritto).");
      return;
    }
    try {
      const r = await opzioni.onSalva({ theme: getTema(), preferenze: preferenze() });
      nota(r || "Salvato.");
    } catch (e) {
      nota(`Non salvato: ${e && e.message ? e.message : e}`, true);
    }
  }

  q("#nt-attive").addEventListener("change", async (e) => {
    inp.notificheAttive = e.target.checked;
    await salva();
  });
  q("#nt-anteprima").addEventListener("change", async (e) => {
    inp.notificheAnteprima = e.target.checked;
    await salva();
  });
  q("#nt-suono").addEventListener("change", async (e) => {
    inp.notificheSuono = normSuono(e.target.value);
    await salva();
  });
  q("#nt-dnd").addEventListener("change", async (e) => {
    inp.nonDisturbareAttivo = e.target.checked;
    await salva();
  });
  for (const [sel, campo, def] of [
    ["#nt-dnd-inizio", "nonDisturbareInizio", NON_DISTURBARE_INIZIO_DEFAULT],
    ["#nt-dnd-fine", "nonDisturbareFine", NON_DISTURBARE_FINE_DEFAULT],
  ]) {
    q(sel).addEventListener("change", async (e) => {
      inp[campo] = normalizzaOrario(e.target.value, def);
      e.target.value = inp[campo];
      await salva();
    });
  }

  q("#nt-prova-suono").addEventListener("click", async () => {
    if (typeof opzioni.onProvaSuono !== "function") {
      esito.textContent = "Prova non collegata in questa prova visiva.";
      return;
    }
    esito.textContent = "Riproduzione…";
    try {
      esito.textContent = (await opzioni.onProvaSuono(inp.notificheSuono)) || "Fatto.";
    } catch (e) {
      esito.textContent = `Prova non riuscita: ${e && e.message ? e.message : e}`;
    }
  });

  q("#nt-prova-notifica").addEventListener("click", async () => {
    if (typeof opzioni.onProvaNotifica !== "function") {
      esito.textContent = "Notifica di prova non collegata in questa prova visiva.";
      return;
    }
    esito.textContent = "Invio…";
    try {
      esito.textContent = (await opzioni.onProvaNotifica()) || "Notifica inviata.";
    } catch (e) {
      esito.textContent = `Notifica non riuscita: ${e && e.message ? e.message : e}`;
    }
  });

  overlay.__impostaNotifiche = (patch) => {
    Object.assign(inp, patch);
    if (typeof opzioni.onApplica === "function") opzioni.onApplica(preferenze());
  };
  return overlay;
}

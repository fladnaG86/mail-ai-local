# Blocco R — Carattere e dimensione applicati davvero (lettura, composizione, messaggio inviato)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere vivi il carattere e la dimensione di «Tipi di carattere» in tre punti dove oggi non arrivano: il pannello di lettura (quindi anche Posta inviata), i controlli del gruppo «Carattere» della composizione, e l'HTML del messaggio inviato.

**Architecture:** Il valore della preferenza esiste già (`carattereFamiglia`/`carattereDimensione`, `src-tauri/src/config.rs`), ma ha un solo consumatore reale: lo stile in linea del `contenteditable` della composizione. Tre buchi: (1) `documentoCorpo()` scrive `font:13px/1.6 -apple-system…` a mano dentro l'iframe di lettura, quindi la preferenza non tocca mai il messaggio letto; (2) `htmlCarattere()` disegna una casella passiva e tiene due pulsanti `data-zoom` che cambiano lo zoom, non il carattere; (3) `leggiCampi()` legge solo `corpoEl.innerHTML`, quindi lo stile in linea del `contenteditable` (famiglia e dimensione in vigore) non finisce mai nell'HTML inviato: il destinatario vede il proprio font, non il tuo. Le tre correzioni condividono la stessa fonte (la preferenza) e un nuovo pezzo di stato: la **scala di lettura**, cioè di quanto l'utente ingrandisce il testo del messaggio aperto.

**Tech Stack:** JavaScript ES modules senza framework (`src/views/*.js`), CSS puro (`src/styles/app.css`), Rust (Tauri 2, `src-tauri/src/config.rs`) per la sola preferenza nuova, test con `node --test tests/*.mjs` e `cargo test --manifest-path src-tauri/Cargo.toml`.

**Spec:** `docs/plans/2026-10-12-outlook-clone-ia-v1.md` (blocco D, sezione «Tipi di carattere», riga ~841) e `docs/riferimento-outlook/ribbon-struttura.md`. Riferimento funzionale: pannello Outlook «Tipi di carattere» (`Preferences.Panes.Fonts.strings`) e i gruppi ribbon `msotcidChunkBasicText` / `msotcidChunkZoom`.

## Global Constraints

- Tutto in italiano: interfaccia, commenti, messaggi di commit.
- **Nessun codice, icona o tipo di carattere di Microsoft copiato**: si leggono solo *dati* (etichette dai cataloghi `.strings`, identificativi dei gruppi dai `.ribbon`). Regola in `docs/riferimento-outlook/inventario-funzioni.md`. Le famiglie offerte dal menu sono di **sistema**: si scrive il nome, non si copia alcun file di font.
- Preferenze in `config.json` via la struct `Preferenze` (`src-tauri/src/config.rs`): ogni campo nuovo ha `#[serde(default)]`, un valore in `Default::default()`, la normalizzazione in `normalizzata()` e il rifiuto in `valida()` quando fuori intervallo. Mai password in config.
- Intervalli esistenti da riusare: dimensione carattere `8..=72` (`CARATTERE_DIMENSIONE_MIN`/`CARATTERE_DIMENSIONE_MAX`), zoom composizione `50..=400` (`ZOOM_COMPOSIZIONE_MIN`/`ZOOM_COMPOSIZIONE_MAX`).
- Nessun pulsante muto: una voce che non può funzionare va **dichiarata**, non disegnata e basta.
- TDD: ogni task scrive prima il test che fallisce, poi l'implementazione minima, poi il commit.
- Ogni task termina coi test verdi: `node --test tests/*.mjs` e `cargo test --manifest-path src-tauri/Cargo.toml`.
- Prove visive senza Tauri: `python3 -m http.server 8099 --directory ~/outlook-ai-clone` poi `?view=…` (elenco in `docs/uso-e-prova.md`).

## Review Focus

1. **Famiglia di carattere con caratteri che cambiano una dichiarazione CSS** — la famiglia finisce in un attributo `style` e dentro il `<style>` del documento del corpo, dove l'escaping HTML non protegge (`&quot;` è già decodificato quando il CSS viene letto). Difesa: `soloFamiglia` (whitelist), con `fugaHtml`/`fuga` come seconda cintura. Test in Task 1, 2, 5.
2. **Dimensione fuori intervallo o non numerica** — `0`, `9999`, `"abc"`, `null`: deve ripiegare sul default 12 e **mai** produrre `font-size: NaNpx`, che il browser scarta in silenzio lasciando il testo alla misura di partenza senza spiegazione. Test in Task 1, 2, 5.
3. **Messaggio di un client esterno che porta il proprio `<style>`** — se l'utente non ha scelto nulla di diverso dal default, la regola di lettura non deve stravolgere l'impaginazione dell'autore più di quanto faccia oggi (13px di sistema). Test in Task 2.
4. **Scala di lettura ai limiti** — `A⁻` sotto 50% e `A⁺` sopra 400%: il valore si ferma al limite e resta un intero, mai `NaN` né `0`. Test in Task 1 e Task 3.
5. **Cambio carattere con un messaggio già aperto** — l'utente apre un messaggio, poi apre Impostazioni → Tipi di carattere e cambia la famiglia: il messaggio a schermo deve aggiornarsi subito. Test in Task 6.

---

### Task 1: La scala di lettura, con la sua logica pura e la sua preferenza

La scala di lettura è la percentuale con cui si ingrandisce il testo del messaggio aperto (controlli `A⁻`/`A⁺` del pannello di lettura). Vive in `config.json` come `letturaZoom`, così la scelta sopravvive alla chiusura dell'app.

**Files:**
- Modify: `src-tauri/src/config.rs` (costanti ~riga 83, campo in `Preferenze` ~riga 654, `Default::default()` ~riga 793, `normalizzata()` ~riga 883, `valida()` ~riga 1064)
- Modify: `src-tauri/tests/config_test.rs` (i test Rust di config vivono QUI: `config.rs` non ha un `mod tests`)
- Modify: `src/views/accessibilita.js` (funzioni pure nuove, subito dopo `normScalaTesto`)
- Modify: `src/views/impostazioni-mail.js` (nuova `soloFamiglia`, e `stileCarattere` che la usa)
- Test: `tests/lettura-zoom.test.mjs` (nuovo)

**Interfaces:**
- Consumes: niente da task precedenti.
- Produces:
  - `pub const LETTURA_ZOOM_DEFAULT: i64 = 100;` / `LETTURA_ZOOM_MIN: i64 = 50` / `LETTURA_ZOOM_MAX: i64 = 400` in `config.rs`
  - campo `pub lettura_zoom: i64` in `Preferenze` (JSON: `letturaZoom`)
  - `export const ZOOM_LETTURA_MIN = 50;` `export const ZOOM_LETTURA_MAX = 400;` `export const ZOOM_LETTURA_DEFAULT = 100;` `export function limitaZoomLettura(v, def = 100)` `export function zoomLetturaDaPreferenze(prefs = {})` in `src/views/accessibilita.js`
  - `export function soloFamiglia(valore, def = "Aptos")` in `src/views/impostazioni-mail.js`: la famiglia ridotta ai soli caratteri ammessi in un nome di famiglia. **L'escaping HTML non basta**: la famiglia finisce dentro un attributo `style` e dentro un `<style>` del documento del corpo, dove una `;` o una `}` iniettate cambiano le dichiarazioni anche senza rompere il markup. La whitelist è l'unica difesa che regge in quel contesto.

- [ ] **Step 1: Write the failing test (JS)**

Crea `tests/lettura-zoom.test.mjs`:

```javascript
/**
 * Test della scala di lettura (blocco R): la percentuale con cui si ingrandisce
 * il testo del messaggio aperto. Funzione pura: nessun DOM.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ZOOM_LETTURA_MIN,
  ZOOM_LETTURA_MAX,
  limitaZoomLettura,
  zoomLetturaDaPreferenze,
} from "../src/views/accessibilita.js";

test("limitaZoomLettura tiene i valori nell'intervallo", () => {
  assert.equal(limitaZoomLettura(100), 100);
  assert.equal(limitaZoomLettura(150), 150);
});

test("limitaZoomLettura porta ai limiti i valori fuori scala", () => {
  assert.equal(limitaZoomLettura(10), ZOOM_LETTURA_MIN);
  assert.equal(limitaZoomLettura(9999), ZOOM_LETTURA_MAX);
  assert.equal(limitaZoomLettura(-40), ZOOM_LETTURA_MIN);
});

test("limitaZoomLettura ripiega sul default sui valori non numerici", () => {
  assert.equal(limitaZoomLettura(undefined), 100);
  assert.equal(limitaZoomLettura(null), 100);
  assert.equal(limitaZoomLettura(""), 100);
  assert.equal(limitaZoomLettura("abc"), 100);
  assert.equal(limitaZoomLettura(NaN), 100);
});

test("limitaZoomLettura arrotonda a un intero", () => {
  assert.equal(limitaZoomLettura(112.6), 113);
  assert.equal(limitaZoomLettura(112.4), 112);
});

test("zoomLetturaDaPreferenze legge le preferenze grezze e quelle normalizzate", () => {
  assert.equal(zoomLetturaDaPreferenze({ letturaZoom: 150 }), 150);
  assert.equal(zoomLetturaDaPreferenze({ zoomLettura: 150 }), 150);
  assert.equal(zoomLetturaDaPreferenze({}), 100);
  assert.equal(zoomLetturaDaPreferenze({ letturaZoom: 5000 }), ZOOM_LETTURA_MAX);
});

test("soloFamiglia tiene i nomi di famiglia veri, virgolette comprese", () => {
  assert.equal(soloFamiglia("Georgia"), "Georgia");
  assert.equal(soloFamiglia("Times New Roman"), "Times New Roman");
  assert.equal(soloFamiglia("Courier New"), "Courier New");
  assert.equal(soloFamiglia("  Helvetica  "), "Helvetica");
  assert.equal(soloFamiglia("Arial, sans-serif"), "Arial, sans-serif");
});

test("soloFamiglia ripiega sul default sui valori vuoti", () => {
  assert.equal(soloFamiglia(""), "Aptos");
  assert.equal(soloFamiglia("   "), "Aptos");
  assert.equal(soloFamiglia(null), "Aptos");
  assert.equal(soloFamiglia(undefined), "Aptos");
});

test("soloFamiglia toglie tutto ciò che può cambiare una dichiarazione CSS", () => {
  // L'escaping HTML non basterebbe: dentro un attributo style e dentro un
  // <style>, `&quot;` è già decodificato quando il CSS viene letto.
  // I caratteri cadono senza lasciare traccia: gli spazi restano solo quelli
  // che il valore aveva davvero.
  assert.equal(soloFamiglia('Arial"; background:url(https://esempio.it/x.png)'), "Arial backgroundurlhttpsesempioitxpng");
  assert.equal(soloFamiglia("Georgia}</style><script>alert(1)</script>"), "Georgiastylescriptalert1script");
  assert.equal(soloFamiglia("Arial;color:red"), "Arialcolorred");
  // Le virgolette sono escluse apposta: una spaiata aprirebbe una stringa CSS
  // mai chiusa e la dichiarazione verrebbe scartata in silenzio.
  assert.equal(soloFamiglia("O'Brien"), "OBrien");
  assert.equal(soloFamiglia("'Segoe UI'"), "Segoe UI");
  assert.doesNotMatch(soloFamiglia("O'Brien"), /['"]/);
  assert.doesNotMatch(soloFamiglia("'Segoe UI'"), /['"]/);
  assert.doesNotMatch(soloFamiglia('Arial"; background:url(x)'), /[";{}()<>]/);
});
```

Import in testa a `tests/lettura-zoom.test.mjs`:

```javascript
import { soloFamiglia } from "../src/views/impostazioni-mail.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lettura-zoom.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../src/views/accessibilita.js' does not provide an export named 'limitaZoomLettura'`

- [ ] **Step 3: Write minimal implementation (JS)**

In `src/views/impostazioni-mail.js`, subito dopo `stileCarattere`, aggiungi:

```javascript
/**
 * La famiglia ridotta ai soli caratteri ammessi in un nome di famiglia: lettere,
 * cifre, spazi e `-`/`_`/`,` (il separatore degli elenchi di famiglie).
 * Tutto il resto cade.
 *
 * Serve perché la famiglia finisce in un attributo `style` e dentro il
 * `<style>` del documento del corpo: lì l'escaping HTML **non** protegge, dato
 * che `&quot;` viene decodificato prima che il CSS sia letto. Una `;` o una `}`
 * di troppo cambierebbero le dichiarazioni. È anche la normalizzazione giusta
 * per il valore: un nome di famiglia non contiene altro.
 *
 * **Le virgolette sono escluse apposta**, sia doppie sia semplici. Una
 * virgoletta spaiata (`O'Brien`) aprirebbe una stringa CSS mai chiusa che
 * inghiotte il resto della regola: la dichiarazione verrebbe scartata **in
 * silenzio** e il messaggio tornerebbe al font del browser. Le virgolette non
 * servono comunque: il CSS accetta un nome di famiglia non quotato fatto di
 * parole separate da spazi, quindi `'Segoe UI'` e `Segoe UI` valgono uguale.
 */
export function soloFamiglia(valore, def = "Aptos") {
  const pulito = String(valore == null ? "" : valore)
    .replace(/[^A-Za-z0-9 \-_,]/g, "")
    .trim();
  return pulito || def;
}
```

Poi sostituisci `stileCarattere` perché passi da lì:

```javascript
export function stileCarattere(famiglia, dimensione, defFamiglia = "Aptos", defDimensione = 12) {
  return {
    fontFamily: soloFamiglia(famiglia, defFamiglia),
    fontSize: limitaDimensione(dimensione, limitaDimensione(defDimensione)),
  };
}
```

In `src/views/accessibilita.js`, subito dopo la funzione `normScalaTesto` e prima di `normOpzioni`, aggiungi:

```javascript
/**
 * Intervallo della scala di lettura (specchia `config.rs`, blocco R): la
 * percentuale con cui si ingrandisce il testo del messaggio aperto. Stessi
 * limiti dello zoom della composizione: sono lo stesso gesto su due corpi.
 */
export const ZOOM_LETTURA_MIN = 50;
export const ZOOM_LETTURA_MAX = 400;
export const ZOOM_LETTURA_DEFAULT = 100;

/**
 * Limita la scala di lettura all'intervallo ammesso (default 100). Un valore
 * non numerico o assente ripiega sul default: mai un `NaN`, che il browser
 * scarterebbe in silenzio lasciando il testo alla dimensione di partenza.
 */
export function limitaZoomLettura(v, def = ZOOM_LETTURA_DEFAULT) {
  const n = v === null || v === undefined || String(v).trim() === "" ? NaN : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(ZOOM_LETTURA_MAX, Math.max(ZOOM_LETTURA_MIN, Math.round(n)));
}

/**
 * La scala di lettura dalle preferenze: accetta sia la chiave grezza
 * (`letturaZoom`, dal kernel) sia quella già normalizzata (`zoomLettura`),
 * com'è idempotente il resto del modulo.
 */
export function zoomLetturaDaPreferenze(prefs = {}) {
  const v = prefs.zoomLettura !== undefined ? prefs.zoomLettura : prefs.letturaZoom;
  return limitaZoomLettura(v);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lettura-zoom.test.mjs`
Expected: PASS (8 test)

- [ ] **Step 5: Write the failing Rust test**

In `src-tauri/tests/config_test.rs` (NON in `config.rs`: quel file non ha un `mod tests`), in coda al file, aggiungi:

```rust
#[test]
fn lettura_zoom_fuori_scala_torna_al_default() {
    // Fuori scala si torna al default in ENTRAMBE le direzioni, come fa lo
    // zoom della composizione (vedi blocco_i2_test.rs): non ai bordi
    // dell'intervallo. `normalizzata` consuma il valore, quindi si riassegna.
    let mut p = Preferenze::default();
    p.lettura_zoom = 9999;
    let n = p.normalizzata();
    assert_eq!(n.lettura_zoom, config::LETTURA_ZOOM_DEFAULT);
    let mut p2 = Preferenze::default();
    p2.lettura_zoom = 10;
    let n2 = p2.normalizzata();
    assert_eq!(n2.lettura_zoom, config::LETTURA_ZOOM_DEFAULT);
}

#[test]
fn lettura_zoom_ai_bordi_resta() {
    // I bordi dell'intervallo sono valori validi: non vanno normalizzati.
    let mut p = Preferenze::default();
    p.lettura_zoom = config::LETTURA_ZOOM_MIN;
    let n = p.normalizzata();
    assert_eq!(n.lettura_zoom, config::LETTURA_ZOOM_MIN);
    let mut p2 = Preferenze::default();
    p2.lettura_zoom = config::LETTURA_ZOOM_MAX;
    let n2 = p2.normalizzata();
    assert_eq!(n2.lettura_zoom, config::LETTURA_ZOOM_MAX);
}

#[test]
fn lettura_zoom_valido_resta() {
    let mut p = Preferenze::default();
    p.lettura_zoom = 150;
    let n = p.normalizzata();
    assert_eq!(n.lettura_zoom, 150);
}

#[test]
fn lettura_zoom_fuori_intervallo_e_rifiutato_al_salvataggio() {
    let mut p = Preferenze::default();
    p.lettura_zoom = 10_000;
    // `valida` è una funzione libera del modulo, non un metodo.
    assert!(config::valida(&p).is_err());
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml lettura_zoom`
Expected: FAIL — `error[E0609]: no field 'lettura_zoom' on type 'Preferenze'`

- [ ] **Step 7: Write minimal implementation (Rust)**

In `src-tauri/src/config.rs`, accanto alle costanti dello zoom composizione (riga ~83):

```rust
/// Scala del testo del messaggio letto, in percentuale (blocco R). Stessi
/// limiti dello zoom della composizione: è lo stesso gesto su due corpi.
pub const LETTURA_ZOOM_DEFAULT: i64 = 100;
pub const LETTURA_ZOOM_MIN: i64 = 50;
pub const LETTURA_ZOOM_MAX: i64 = 400;
```

Nel blocco `// --- Blocco D: Lettura ---` della struct `Preferenze`, dopo `lettura_anteprima`:

```rust
    /// Scala del testo del messaggio letto, in percentuale (blocco R):
    /// i pulsanti A⁻/A⁺ del pannello di lettura la cambiano.
    pub lettura_zoom: i64,
```

In `Default::default()`, dopo `lettura_anteprima: false,`:

```rust
            lettura_zoom: LETTURA_ZOOM_DEFAULT,
```

In `normalizzata()`, dopo il blocco che limita `lettura_segna_letto_dopo`:

```rust
        if !(LETTURA_ZOOM_MIN..=LETTURA_ZOOM_MAX).contains(&self.lettura_zoom) {
            self.lettura_zoom = LETTURA_ZOOM_DEFAULT;
        }
```

In `valida()`, accanto al controllo di `zoom_composizione`:

```rust
    if !(LETTURA_ZOOM_MIN..=LETTURA_ZOOM_MAX).contains(&p.lettura_zoom) {
        return Err(ConfigError::PreferenzaNonValida {
            campo: "letturaZoom".to_string(),
            valore: p.lettura_zoom.to_string(),
        });
    }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS — tutti i test del kernel verdi, comprese le 3 nuove

- [ ] **Step 9: Commit**

```bash
cd ~/outlook-ai-clone
git add src/views/accessibilita.js tests/lettura-zoom.test.mjs src-tauri/src/config.rs
git commit -m "feat(R): la scala di lettura è una preferenza vera (letturaZoom)"
```

Corpo del commit:

```
Il testo del messaggio letto si potrà ingrandire con A-/A+ dal pannello di
lettura. La percentuale vive in config.json come letturaZoom (50-400,
default 100), con la stessa normalizzazione e lo stesso rifiuto dello zoom
della composizione: sono lo stesso gesto su due corpi.

Test: 5 JS nuovi, 3 Rust nuovi.
```

---

### Task 2: Il pannello di lettura veste il carattere scelto

`documentoCorpo()` scrive a mano `font:13px/1.6 -apple-system,'Segoe UI',Arial,sans-serif` dentro il documento dell'iframe: qualunque cosa l'utente scelga in «Tipi di carattere», il messaggio letto — Posta inviata compresa — resta a 13px di sistema.

**Files:**
- Modify: `src/views/main-view.js` (`documentoCorpo`, righe ~605-618; `mostraCorpoHtml`, riga ~594; import in testa)
- Modify: `src/main.js` (`applicaCorpo`, riga ~1477; stato accanto a `preferenzeCorrenti`; import `zoomLetturaDaPreferenze`)
- Test: `tests/lettura-carattere.test.mjs` (nuovo)

**Interfaces:**
- Consumes: `stileCarattere(famiglia, dimensione, defFamiglia, defDimensione)` e `limitaDimensione` da `src/views/impostazioni-mail.js` (esistenti, restituiscono `{ fontFamily, fontSize }`); `limitaZoomLettura` dal Task 1.
- Produces:
  - `export function documentoCorpo(html, stile = {})` — `stile` è `{ famiglia, dimensione, zoom }`. Senza `stile` il documento è **identico** a oggi (13px di sistema).
  - `export function stileLettura(famiglia, dimensione, zoom = 100)` in `src/views/main-view.js` → `{ famiglia, px, variabili }`.
  - `export function mostraCorpoHtml(lettura, html, stile = {})` (firma estesa, retrocompatibile).

- [ ] **Step 1: Write the failing test**

Crea `tests/lettura-carattere.test.mjs`:

```javascript
/**
 * Test del carattere applicato al pannello di lettura (blocco R). Funzioni
 * pure: `documentoCorpo` costruisce una stringa, nessun DOM.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { documentoCorpo, stileLettura } from "../src/views/main-view.js";

test("senza stile il documento del corpo resta quello di prima", () => {
  const d = documentoCorpo("<p>ciao</p>");
  assert.match(d, /font:13px\/1\.6/);
  assert.match(d, /<p>ciao<\/p>/);
});

test("con lo stile scelto il documento indossa famiglia e dimensione", () => {
  const d = documentoCorpo("<p>ciao</p>", { famiglia: "Georgia", dimensione: 18, zoom: 100 });
  assert.match(d, /font-family:Georgia/);
  assert.match(d, /font-size:18px/);
  assert.doesNotMatch(d, /font:13px\/1\.6/);
});

test("lo zoom di lettura moltiplica la dimensione, non la sostituisce", () => {
  const d = documentoCorpo("<p>ciao</p>", { famiglia: "Georgia", dimensione: 18, zoom: 150 });
  assert.match(d, /font-size:27px/);
});

test("dimensione non valida ripiega su 12 punti, mai NaN", () => {
  const d = documentoCorpo("<p>ciao</p>", { famiglia: "Georgia", dimensione: "abc" });
  assert.match(d, /font-size:12px/);
  assert.doesNotMatch(d, /NaN/);
});

test("famiglia non valida ripiega su Aptos", () => {
  const d = documentoCorpo("<p>ciao</p>", { famiglia: "   " });
  assert.match(d, /font-family:Aptos/);
});

test("una famiglia con virgolette non esce dal suo valore", () => {
  const d = documentoCorpo("<p>ciao</p>", {
    famiglia: 'Arial"; background:url(https://esempio.it/x.png)',
  });
  // Il valore dichiarato si legge dalla sola dichiarazione, non dal documento
  // intero (che ha legittimamente graffe e punti e virgola nel CSS di base).
  const dichiarazione = /font-family:([^;}]+)/.exec(d);
  assert.ok(dichiarazione, "la dichiarazione della famiglia deve esserci");
  assert.doesNotMatch(dichiarazione[1], /[";{}()<>]/);
  assert.doesNotMatch(d, /background:url/);
});

test("stileLettura calcola le tre parti", () => {
  const s = stileLettura("Georgia", 18, 150);
  assert.equal(s.famiglia, "Georgia");
  assert.equal(s.px, 27);
  assert.equal(s.variabili, "--lettura-famiglia:Georgia;--lettura-px:27px;");
});

test("stileLettura limita lo zoom all'intervallo", () => {
  assert.equal(stileLettura("Georgia", 18, 9999).px, 72);
  assert.equal(stileLettura("Georgia", 18, 1).px, 9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lettura-carattere.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../src/views/main-view.js' does not provide an export named 'stileLettura'`

- [ ] **Step 3: Write minimal implementation**

In `src/views/main-view.js`, aggiungi in testa al file, accanto agli import esistenti:

```javascript
import { stileCarattere } from "./impostazioni-mail.js";
import { limitaZoomLettura } from "./accessibilita.js";
```

Sostituisci `mostraCorpoHtml` (riga ~594) con:

```javascript
/** Scrive l'HTML sanificato dentro l'iframe, attraverso `srcdoc`. */
export function mostraCorpoHtml(lettura, html, stile = {}) {
  if (!lettura) return;
  lettura.frame.setAttribute("srcdoc", documentoCorpo(html, stile));
}
```

Sostituisci `documentoCorpo` (righe ~605-618) con:

```javascript
/**
 * Avvolge l'HTML sanificato in un documento minimo con lo stile di lettura. Il
 * documento eredita la CSP dell'app: le immagini remote partono solo dopo il
 * consenso, perché finché non sono consentite sono già state sostituite dal
 * sanitizzatore con il segnaposto.
 *
 * Con `stile` (blocco R) il corpo indossa la famiglia e la dimensione scelte in
 * «Tipi di carattere», moltiplicate per la scala di lettura. Senza `stile` il
 * documento resta quello di sempre (13px di sistema): l'impaginazione di un
 * messaggio di un client esterno non cambia se l'utente non ha scelto nulla.
 */
export function documentoCorpo(html, stile = {}) {
  const base =
    "html,body{margin:0;padding:8px 4px;background:#ffffff;color:#111111}" +
    "a{color:#0b62c4}img{max-width:100%;height:auto}" +
    ".immagine-esterna-bloccata{display:inline-block;border:1px dashed #9a9a9a;" +
    "border-radius:3px;padding:1px 6px;color:#666666;font-style:italic;font-size:12px}";
  const s =
    stile && (stile.famiglia != null || stile.dimensione != null)
      ? stileLettura(stile.famiglia, stile.dimensione, stile.zoom)
      : null;
  const regola = s
    ? `html,body{font-family:${fugaHtml(s.famiglia)};font-size:${s.px}px;line-height:1.6}`
    : "html,body{font:13px/1.6 -apple-system,'Segoe UI',Arial,sans-serif}";
  return (
    '<!doctype html><html lang="it"><head><meta charset="utf-8"><style>' +
    base +
    regola +
    "</style></head><body>" +
    html +
    "</body></html>"
  );
}

/**
 * Lo stile di lettura calcolato: famiglia (default «Aptos»), dimensione in pixel
 * già moltiplicata per la scala di lettura, e la stringa pronta per un
 * attributo `style`. La famiglia arriva **già ripulita** da `soloFamiglia`
 * (`stileCarattere` la applica): nessuna virgoletta, nessun `;` o `{` che possa
 * cambiare una dichiarazione. `fugaHtml` al momento dell'uso è una seconda
 * cintura, non la difesa principale.
 */
export function stileLettura(famiglia, dimensione, zoom = 100) {
  const st = stileCarattere(famiglia, dimensione);
  const scala = limitaZoomLettura(zoom);
  const px = Math.round((st.fontSize * scala) / 100);
  return {
    famiglia: st.fontFamily,
    px,
    variabili: `--lettura-famiglia:${st.fontFamily};--lettura-px:${px}px;`,
  };
}
```

In `src/main.js`, accanto a `let preferenzeCorrenti` (cerca la dichiarazione), aggiungi:

```javascript
/** Scala del testo del messaggio letto (blocco R): dai pulsanti A⁻/A⁺. */
let zoomLetturaCorrente = 100;
```

Sostituisci `applicaCorpo` (riga ~1477) con:

```javascript
function applicaCorpo(lettura, corpo, messaggio) {
  if (!lettura || !corpo) return;
  const html = corpo.html && corpo.html.trim() ? corpo.html : testoInParagrafi(corpo.text);
  const p = preferenzeCorrenti || {};
  mostraCorpoHtml(lettura, html, {
    famiglia: p.carattereFamiglia,
    dimensione: p.carattereDimensione,
    zoom: zoomLetturaCorrente,
  });
  mostraAllegati(lettura.allegati, corpo.attachments || [], (allegato, bottone, riga) =>
    salvaAllegato(messaggio, allegato, bottone, riga),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lettura-carattere.test.mjs`
Expected: PASS (8 test)

- [ ] **Step 5: Run the whole JS suite for regressions**

Run: `node --test tests/*.mjs`
Expected: PASS — nessun test preesistente rotto

- [ ] **Step 6: Commit**

```bash
cd ~/outlook-ai-clone
git add src/views/main-view.js src/main.js tests/lettura-carattere.test.mjs
git commit -m "fix(R): il pannello di lettura veste il carattere scelto"
```

Corpo del commit:

```
documentoCorpo scriveva font:13px/1.6 di sistema a mano dentro l'iframe:
la preferenza «Tipi di carattere» non toccava mai il messaggio letto, Posta
inviata compresa. Ora il documento indossa famiglia e dimensione scelte,
moltiplicate per la scala di lettura; senza stile resta identico a prima,
così l'impaginazione dei messaggi esterni non cambia da sola.

Test: 8 JS nuovi, suite intera verde.
```

---

### Task 3: I pulsanti A⁻/A⁺ nel pannello di lettura

Senza un comando l'utente non ha modo di toccare la scala di lettura. Due pulsanti nella barra delle azioni del messaggio, come `msotcidChunkZoom` del riferimento.

**Files:**
- Modify: `src/views/main-view.js` (`PASSI_ZOOM_LETTURA` e `passoZoomLettura` prima di `renderReading`; markup in `renderReading`, riga ~508)
- Modify: `src/styles/app.css` (dopo `.mail-body-tools`, riga ~388)
- Modify: `src/main.js` (`collegaZoomLettura`, chiamata in `apriMessaggio`, stato `corpoCorrenteHtml`)
- Test: `tests/lettura-zoom-ui.test.mjs` (nuovo)

**Interfaces:**
- Consumes: `limitaZoomLettura`, `ZOOM_LETTURA_MIN`, `ZOOM_LETTURA_MAX` (Task 1); `mostraCorpoHtml` (Task 2).
- Produces:
  - `export const PASSI_ZOOM_LETTURA = [50, 75, 100, 125, 150, 200, 300, 400];`
  - `export function passoZoomLettura(corrente, verso)` in `src/views/main-view.js` — `verso` è `"dentro"` o `"fuori"`.
  - markup in `.ai-bar`: `<span class="lettura-zoom"><button data-zoom-lettura="fuori">A⁻</button><span id="lettura-zoom-val">100%</span><button data-zoom-lettura="dentro">A⁺</button></span>`

- [ ] **Step 1: Write the failing test**

Crea `tests/lettura-zoom-ui.test.mjs`:

```javascript
/**
 * Test dei passi dello zoom di lettura (blocco R). Funzione pura.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { PASSI_ZOOM_LETTURA, passoZoomLettura } from "../src/views/main-view.js";

test("i passi coprono l'intervallo ammesso", () => {
  assert.equal(PASSI_ZOOM_LETTURA[0], 50);
  assert.equal(PASSI_ZOOM_LETTURA[PASSI_ZOOM_LETTURA.length - 1], 400);
});

test('"dentro" sale al passo successivo', () => {
  assert.equal(passoZoomLettura(100, "dentro"), 125);
  assert.equal(passoZoomLettura(50, "dentro"), 75);
});

test('"fuori" scende al passo precedente', () => {
  assert.equal(passoZoomLettura(100, "fuori"), 75);
  assert.equal(passoZoomLettura(400, "fuori"), 300);
});

test("ai limiti il valore resta al limite, non va in NaN né a zero", () => {
  assert.equal(passoZoomLettura(400, "dentro"), 400);
  assert.equal(passoZoomLettura(50, "fuori"), 50);
});

test("un valore fuori lista si aggancia al passo più vicino", () => {
  assert.equal(passoZoomLettura(130, "dentro"), 150);
  assert.equal(passoZoomLettura(130, "fuori"), 125);
  assert.equal(passoZoomLettura("abc", "dentro"), 125);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lettura-zoom-ui.test.mjs`
Expected: FAIL — `does not provide an export named 'passoZoomLettura'`

- [ ] **Step 3: Write minimal implementation**

In `src/views/main-view.js`, aggiungi `ZOOM_LETTURA_MAX` e `ZOOM_LETTURA_MIN` all'import da `accessibilita.js` e, prima di `renderReading`:

```javascript
/**
 * I passi della scala di lettura (blocco R): gli stessi limiti di
 * `ZOOM_LETTURA_*`, ma a scatti leggibili invece che a colpi di 5%. A⁻/A⁺ si
 * muovono qui dentro.
 */
export const PASSI_ZOOM_LETTURA = [50, 75, 100, 125, 150, 200, 300, 400];

/**
 * Il passo successivo della scala di lettura: `verso` è `"dentro"` (più grande)
 * o `"fuori"` (più piccolo). Ai limiti il valore resta al limite — mai `NaN`,
 * mai zero. Un valore fuori lista si aggancia al passo successivo in quella
 * direzione, così un valore arrivato da un `config.json` modificato a mano non
 * blocca i pulsanti.
 */
export function passoZoomLettura(corrente, verso) {
  const n = limitaZoomLettura(corrente);
  const dentro = verso === "dentro";
  const candidati = dentro
    ? PASSI_ZOOM_LETTURA.filter((p) => p > n)
    : PASSI_ZOOM_LETTURA.filter((p) => p < n).reverse();
  if (candidati.length) return candidati[0];
  return dentro ? ZOOM_LETTURA_MAX : ZOOM_LETTURA_MIN;
}
```

In `renderReading`, in coda a `aiBar.innerHTML` (riga ~508), aggiungi i due pulsanti:

```javascript
    <span class="lettura-zoom">
      <button class="ai-btn" data-zoom-lettura="fuori" title="Riduci il testo del messaggio">A⁻</button>
      <span id="lettura-zoom-val" class="lettura-zoom-val">100%</span>
      <button class="ai-btn" data-zoom-lettura="dentro" title="Ingrandisci il testo del messaggio">A⁺</button>
    </span>`;
```

In `src/styles/app.css`, dopo `.mail-body-tools`:

```css
/* Scala del testo del messaggio letto (blocco R): A⁻ / A⁺ nella barra delle azioni. */
.lettura-zoom { display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; }
.lettura-zoom-val { font-size: 11px; color: var(--text-secondary); min-width: 34px; text-align: center; }
```

In `src/main.js`, accanto a `zoomLetturaCorrente`, aggiungi:

```javascript
/** HTML sanificato del messaggio aperto: serve a ridisegnarlo allo zoom. */
let corpoCorrenteHtml = "";
```

In `apriMessaggio`, subito dopo `renderLettura(readingEl, messaggio);`:

```javascript
  corpoCorrenteHtml = "";
```

I pulsanti si collegano **dentro `renderLettura`**, non in `apriMessaggio`. `renderLettura` (src/main.js:422) è il punto per cui passano tutti i ridisegni del pannello: i quattro ridisegni sul posto (timer «segna come letto», `alternaLetto`, categoria, contrassegno) e i due del pannello vuoto. Legandoli solo in `apriMessaggio` i pulsanti resterebbero **senza listener** dopo uno di quei ridisegni: un pulsante muto, cioè esattamente ciò che il progetto vieta. Sostituisci `renderLettura` con:

```javascript
function renderLettura(el, msg) {
  renderReading(el, msg, { coloriCategorie: coloriCategorie() });
  // Il ridisegno ricostruisce la barra delle azioni da capo, quindi i pulsanti
  // vanno ricollegati qui: è il punto per cui passano TUTTI i ridisegni del
  // pannello, non solo l'apertura di un messaggio. Senza questo, A⁻/A⁺
  // resterebbero muti dopo «segna come letto», contrassegna o categoria.
  collegaZoomLettura(el);
}
```

Non chiamare `collegaZoomLettura` anche in `apriMessaggio`: sarebbe un secondo listener sullo stesso pulsante e un clic farebbe due passi. `apriMessaggio` chiama già `renderLettura`, quindi il collegamento avviene da lì.

In `applicaCorpo`, valorizza l'HTML tenuto da parte — la funzione diventa:

```javascript
function applicaCorpo(lettura, corpo, messaggio) {
  if (!lettura || !corpo) return;
  const html = corpo.html && corpo.html.trim() ? corpo.html : testoInParagrafi(corpo.text);
  corpoCorrenteHtml = html;
  const p = preferenzeCorrenti || {};
  mostraCorpoHtml(lettura, html, {
    famiglia: p.carattereFamiglia,
    dimensione: p.carattereDimensione,
    zoom: zoomLetturaCorrente,
  });
  mostraAllegati(lettura.allegati, corpo.attachments || [], (allegato, bottone, riga) =>
    salvaAllegato(messaggio, allegato, bottone, riga),
  );
}
```

Aggiungi la funzione, accanto a `applicaCorpo`:

```javascript
/**
 * Collega A⁻/A⁺ del pannello di lettura: cambiano la scala del testo del
 * messaggio aperto, ridisegnano subito il corpo (senza riaprirlo) e salvano la
 * scelta come `letturaZoom`, così vale anche per i messaggi aperti dopo.
 */
function collegaZoomLettura(readingEl) {
  const etichetta = readingEl.querySelector("#lettura-zoom-val");
  const aggiorna = () => {
    if (etichetta) etichetta.textContent = `${zoomLetturaCorrente}%`;
  };
  aggiorna();
  readingEl.querySelectorAll("[data-zoom-lettura]").forEach((b) => {
    b.addEventListener("click", async () => {
      zoomLetturaCorrente = passoZoomLettura(zoomLetturaCorrente, b.dataset.zoomLettura);
      aggiorna();
      const frame = readingEl.querySelector(".mail-frame");
      const p = preferenzeCorrenti || {};
      if (frame && corpoCorrenteHtml) {
        mostraCorpoHtml({ frame }, corpoCorrenteHtml, {
          famiglia: p.carattereFamiglia,
          dimensione: p.carattereDimensione,
          zoom: zoomLetturaCorrente,
        });
      }
      await salvaImpostazioni({
        theme: getTheme(),
        preferenze: Object.assign({}, p, { letturaZoom: zoomLetturaCorrente }),
      });
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lettura-zoom-ui.test.mjs`
Expected: PASS (5 test)

- [ ] **Step 5: Verifica visiva nel browser**

Run:
```bash
python3 -m http.server 8099 --directory ~/outlook-ai-clone &
```
Apri `http://127.0.0.1:8099/src/index.html`.
Expected: la barra dell'Assistente in cima al pannello di lettura mostra `A⁻ 100% A⁺` in coda. Clic su `A⁺` → `125%`; clic su `A⁻` due volte → `75%`. Il valore non scende sotto `50%` né sale sopra `400%`.

Nota: `?view=lettura` viene aggiunto nel Task 6; qui basta la vista normale.

- [ ] **Step 6: Commit**

```bash
cd ~/outlook-ai-clone
git add src/views/main-view.js src/styles/app.css src/main.js tests/lettura-zoom-ui.test.mjs
git commit -m "feat(R): A-/A+ nel pannello di lettura, con la scala salvata"
```

Corpo del commit:

```
Due pulsanti nella barra delle azioni cambiano la scala del testo del
messaggio aperto (50-400% a scatti) e la salvano come letturaZoom, così la
scelta vale anche per i messaggi aperti dopo. Il corpo si ridisegna subito,
senza riaprire il messaggio.

Test: 5 JS nuovi.
```

---

### Task 4: Il gruppo «Carattere» della composizione cambia davvero il carattere

Oggi `htmlCarattere()` disegna `<span class="cmp-font">Georgia (Corpo)</span>`: una casella passiva. In Outlook `msotcidChunkBasicText` apre l'elenco dei tipi di carattere e quello delle dimensioni. I due pulsanti accanto restano `data-zoom`, che è un'altra cosa.

**Files:**
- Modify: `src/views/compose.js` (`CARATTERI_COMPOSIZIONE`/`elencoDimensioni`/`impostaCarattereCorpo` prima di `htmlCarattere`; `htmlCarattere` righe ~524-545; gestione clic riga ~1678; `impostaSalvaPreferenze`)
- Modify: `src/styles/app.css` (dopo `.cmp-group--carattere`)
- Modify: `src/main.js` (collegamento `impostaSalvaPreferenze`)
- Test: `tests/compose-carattere.test.mjs` (nuovo)

**Interfaces:**
- Consumes: `stileCarattere`, `limitaDimensione` (già importati in `compose.js` da `impostazioni-mail.js`); `DIMENSIONE_MIN`/`DIMENSIONE_MAX` per il test.
- Produces:
  - `export const CARATTERI_COMPOSIZIONE` — `["Aptos", "Georgia", "Helvetica", "Times New Roman", "Courier New", "Verdana"]`
  - `export function elencoDimensioni()` — `[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]`
  - `export function impostaCarattereCorpo(overlay, famiglia, dimensione)` → `{ fontFamily, fontSize }`
  - `export function impostaSalvaPreferenze(fn)`

- [ ] **Step 1: Write the failing test**

Crea `tests/compose-carattere.test.mjs`:

```javascript
/**
 * Test dei valori del gruppo «Carattere» della composizione (blocco R):
 * elenchi di famiglie e dimensioni offerti dai due menu. Funzioni pure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { CARATTERI_COMPOSIZIONE, elencoDimensioni } from "../src/views/compose.js";
import { DIMENSIONE_MIN, DIMENSIONE_MAX } from "../src/views/impostazioni-mail.js";

test("le famiglie offerte sono tutte non vuote, senza spazi ai bordi e senza duplicati", () => {
  assert.ok(CARATTERI_COMPOSIZIONE.length >= 5);
  const basse = CARATTERI_COMPOSIZIONE.map((f) => f.toLowerCase());
  assert.equal(new Set(basse).size, basse.length);
  assert.ok(CARATTERI_COMPOSIZIONE.every((f) => f.trim() === f && f.length > 0));
});

test("il primo carattere offerto è il predefinito della finestra", () => {
  assert.equal(CARATTERI_COMPOSIZIONE[0], "Aptos");
});

test("le dimensioni offerte stanno nell'intervallo ammesso", () => {
  const d = elencoDimensioni();
  assert.ok(d.length >= 10);
  assert.ok(d.every((n) => n >= DIMENSIONE_MIN && n <= DIMENSIONE_MAX));
});

test("le dimensioni sono in ordine crescente e senza duplicati", () => {
  const d = elencoDimensioni();
  for (let i = 1; i < d.length; i += 1) assert.ok(d[i] > d[i - 1]);
});

test("le dimensioni più usate ci sono", () => {
  const d = elencoDimensioni();
  for (const n of [10, 11, 12, 14, 18, 24]) assert.ok(d.includes(n), `manca ${n}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/compose-carattere.test.mjs`
Expected: FAIL — `does not provide an export named 'CARATTERI_COMPOSIZIONE'`

- [ ] **Step 3: Write minimal implementation**

In `src/views/compose.js`, prima di `htmlCarattere`, aggiungi:

```javascript
/**
 * I tipi di carattere offerti dal menu «Carattere» (blocco R). Sono famiglie
 * di **sistema**, presenti su macOS e Windows: si scrive il nome della
 * famiglia, **nessun file di font** è copiato nel progetto. «Aptos» è la prima
 * perché è il predefinito della finestra (specchia `CARATTERE_FAMIGLIA_DEFAULT`).
 */
export const CARATTERI_COMPOSIZIONE = [
  "Aptos",
  "Georgia",
  "Helvetica",
  "Times New Roman",
  "Courier New",
  "Verdana",
];

/** Le dimensioni offerte dal menu: quelle usuali, dentro l'intervallo ammesso. */
export function elencoDimensioni() {
  return [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
}
```

Aggiungi in testa a `compose.js`, accanto agli altri agganci del chiamante (cerca `impostaSalvaBozza`):

```javascript
/** Funzione del chiamante che salva le preferenze (blocco R). */
let salvaPreferenze = null;

/** Registra la funzione che persiste una modifica alle preferenze. */
export function impostaSalvaPreferenze(fn) {
  salvaPreferenze = typeof fn === "function" ? fn : null;
}
```

Sostituisci `htmlCarattere()` con:

```javascript
function htmlCarattere() {
  // La casella del gruppo "Carattere" mostra la famiglia e la dimensione in
  // vigore e le cambia davvero (blocco R): un clic apre l'elenco, la scelta
  // veste il corpo e resta per le composizioni successive. Lo zoom (A⁻/A⁺)
  // resta un'altra cosa: ingrandisce la vista, non il carattere del messaggio.
  const st = stileCarattere(prefsComposizione.carattereFamiglia, prefsComposizione.carattereDimensione);
  return `<div class="cmp-group cmp-group--carattere">
    <button type="button" class="cmp-font" data-font-menu="1" title="Tipo di carattere del corpo">${fuga(st.fontFamily)} (Corpo)</button>
    <button type="button" class="cmp-size" data-size-menu="1" title="Dimensione del carattere del corpo">${st.fontSize}</button>
    <span class="cmp-inl" data-zoom="fuori" title="Riduci lo zoom">A⁻</span><span class="cmp-inl" data-zoom="dentro" title="Aumenta lo zoom">A⁺</span>
    <span class="cmp-inl cmp-zoom" id="cmp-zoom" title="Zoom del corpo">${zoomCorpo}%</span>
    <span class="cmp-sep-lite"></span>
    <span class="cmp-inl cmp-b" data-cmd="bold" data-lb="Grassetto" title="Grassetto">G</span><span class="cmp-inl cmp-i" data-cmd="italic" data-lb="Corsivo" title="Corsivo">S</span>
    <span class="cmp-inl cmp-u" data-cmd="underline" data-lb="Sottolineato" title="Sottolineato">S</span>
    <span class="cmp-inl cmp-s" data-cmd2="barrato" data-lb="Barrato" title="Barrato">S̶</span>
    <span class="cmp-inl" data-cmd2="testo_normale" data-lb="Testo normale" title="Testo normale">A</span>
    <span class="cmp-inl" data-cmd2="cancella_formattazione" data-lb="Cancella formattazione" title="Cancella formattazione">✕A</span>
    <span class="cmp-inl" data-cmd="superscript" data-lb="Apice" title="Apice">x²</span><span class="cmp-inl" data-cmd="subscript" data-lb="Pedice" title="Pedice">x₂</span>
    <span class="cmp-inl cmp-evid" data-cmd2="evidenzia" data-lb="Colore evidenziazione carattere" title="Colore evidenziazione carattere">🖍</span>
  </div>`;
}

/**
 * Applica famiglia e dimensione al corpo della composizione e ridisegna la
 * casella del gruppo «Carattere». Usata dai due menu del ribbon.
 */
export function impostaCarattereCorpo(overlay, famiglia, dimensione) {
  const st = stileCarattere(famiglia, dimensione);
  prefsComposizione.carattereFamiglia = st.fontFamily;
  prefsComposizione.carattereDimensione = st.fontSize;
  const corpo = overlay.querySelector("#cmp-body");
  if (corpo) {
    corpo.style.fontFamily = st.fontFamily;
    corpo.style.fontSize = `${Math.round((st.fontSize * zoomCorpo) / 100)}px`;
  }
  const casella = overlay.querySelector(".cmp-font");
  if (casella) casella.textContent = `${st.fontFamily} (Corpo)`;
  const taglia = overlay.querySelector(".cmp-size");
  if (taglia) taglia.textContent = String(st.fontSize);
  return st;
}
```

Nella gestione dei clic (dove è trattato `data-zoom`, riga ~1678), aggiungi:

```javascript
  overlay.querySelectorAll("[data-font-menu]").forEach((el) => {
    el.addEventListener("click", () => apriMenuCarattere(overlay, el));
  });
  overlay.querySelectorAll("[data-size-menu]").forEach((el) => {
    el.addEventListener("click", () => apriMenuDimensione(overlay, el));
  });
```

Accanto a `cambiaZoom`, aggiungi:

```javascript
/**
 * Menu del tipo di carattere: elenco di famiglie di sistema, ognuna disegnata
 * col proprio carattere. La scelta veste subito il corpo e viene salvata.
 */
function apriMenuCarattere(overlay, ancora) {
  chiudiMenuCarattere(overlay);
  const menu = document.createElement("div");
  menu.className = "cmp-menu";
  menu.dataset.menuCarattere = "1";
  menu.innerHTML = CARATTERI_COMPOSIZIONE.map(
    (f) =>
      `<button type="button" class="cmp-menu-voce" data-famiglia="${fuga(f)}" style="font-family:${fuga(f)}">${fuga(f)}</button>`,
  ).join("");
  overlay.append(menu);
  menu.querySelectorAll("[data-famiglia]").forEach((b) =>
    b.addEventListener("click", async () => {
      impostaCarattereCorpo(overlay, b.dataset.famiglia, prefsComposizione.carattereDimensione);
      chiudiMenuCarattere(overlay);
      await salvaCarattere();
    }),
  );
  posizionaMenu(menu, ancora);
}

/** Menu della dimensione: elenco di punti, dentro l'intervallo ammesso. */
function apriMenuDimensione(overlay, ancora) {
  chiudiMenuCarattere(overlay);
  const menu = document.createElement("div");
  menu.className = "cmp-menu";
  menu.dataset.menuCarattere = "1";
  menu.innerHTML = elencoDimensioni()
    .map((n) => `<button type="button" class="cmp-menu-voce" data-punti="${n}">${n}</button>`)
    .join("");
  overlay.append(menu);
  menu.querySelectorAll("[data-punti]").forEach((b) =>
    b.addEventListener("click", async () => {
      impostaCarattereCorpo(overlay, prefsComposizione.carattereFamiglia, Number(b.dataset.punti));
      chiudiMenuCarattere(overlay);
      await salvaCarattere();
    }),
  );
  posizionaMenu(menu, ancora);
}

/** Toglie il menu del carattere aperto: uno solo per volta. */
function chiudiMenuCarattere(overlay) {
  overlay.querySelectorAll("[data-menu-carattere]").forEach((m) => m.remove());
}

/** Mette il menu sotto il pulsante che l'ha aperto, dentro la finestra. */
function posizionaMenu(menu, ancora) {
  const r = ancora.getBoundingClientRect();
  const w = ancora.closest(".compose-overlay, .mail-settings-overlay") || document.body;
  const b = w.getBoundingClientRect();
  menu.style.left = `${r.left - b.left}px`;
  menu.style.top = `${r.bottom - b.top + 2}px`;
}

/**
 * Manda al chiamante la famiglia e la dimensione scelte, perché le salvi in
 * `config.json` (`carattereFamiglia`/`carattereDimensione`): la scelta vale
 * anche per le composizioni aperte dopo.
 */
async function salvaCarattere() {
  if (!salvaPreferenze) return;
  await salvaPreferenze({
    carattereFamiglia: prefsComposizione.carattereFamiglia,
    carattereDimensione: prefsComposizione.carattereDimensione,
  });
}
```

In `src/styles/app.css`, dopo `.cmp-group--carattere`:

```css
/* Menu del gruppo «Carattere» (blocco R): famiglie e dimensioni. */
.cmp-font, .cmp-size { font: inherit; cursor: pointer; border: 1px solid transparent; border-radius: 4px; padding: 1px 4px; background: transparent; color: var(--text-primary); }
.cmp-font:hover, .cmp-size:hover { border-color: var(--btn-border); }
.cmp-menu { position: absolute; z-index: 40; min-width: 150px; max-height: 260px; overflow: auto; padding: 4px; background: var(--window-bg); border: 1px solid var(--btn-border); border-radius: 6px; box-shadow: 0 6px 18px rgba(0,0,0,.18); }
.cmp-menu-voce { display: block; width: 100%; text-align: left; font: inherit; padding: 4px 8px; border: 0; border-radius: 4px; background: transparent; color: var(--text-primary); cursor: pointer; }
.cmp-menu-voce:hover { background: var(--row-sep); }
```

In `src/main.js`, aggiungi `impostaSalvaPreferenze` all'import da `./views/compose.js` e, accanto a `impostaSalvaBozza(salvaBozzaKernel);`:

```javascript
  // Blocco R: la scelta della famiglia e della dimensione dalla finestra di
  // composizione si salva in config.json, come quella fatta dalle Impostazioni.
  impostaSalvaPreferenze(async (modifica) => {
    await salvaImpostazioni({
      theme: getTheme(),
      preferenze: Object.assign({}, preferenzeCorrenti || {}, modifica),
    });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/compose-carattere.test.mjs`
Expected: PASS (5 test)

- [ ] **Step 5: Verifica visiva nel browser**

Apri `http://127.0.0.1:8099/src/index.html?view=compose`.
Expected: la casella mostra `Aptos (Corpo)` e `12`. Clic sulla casella → menu con sei famiglie, ognuna disegnata col proprio carattere. Scegli `Georgia` → la casella dice `Georgia (Corpo)` e il testo del corpo cambia aspetto. Clic sulla dimensione → menu `8…72`; scegli `24` → il corpo cresce e la casella dice `24`. `A⁻`/`A⁺` continuano a cambiare lo zoom e la percentuale, non il carattere.

- [ ] **Step 6: Commit**

```bash
cd ~/outlook-ai-clone
git add src/views/compose.js src/styles/app.css src/main.js tests/compose-carattere.test.mjs
git commit -m "feat(R): il gruppo Carattere della composizione cambia il carattere"
```

Corpo del commit:

```
La casella «Georgia (Corpo)» era uno <span> passivo: un clic non faceva
nulla e l'unico modo di cambiare il carattere era passare dalle
Impostazioni. Ora apre l'elenco delle famiglie di sistema e quello delle
dimensioni, veste subito il corpo e salva la scelta in config.json. Lo zoom
(A-/A+) resta un'altra cosa: ingrandisce la vista, non il carattere.

Test: 5 JS nuovi.
```

---

### Task 5: Il carattere scelto entra nel messaggio inviato

`leggiCampi()` legge `corpoEl.innerHTML`: lo `style="font-family:…;font-size:…px"` del `contenteditable` resta fuori dall'HTML che parte, quindi il destinatario vede il proprio font. Il messaggio deve invece portare la famiglia e la dimensione scelte, come fa Outlook.

**Files:**
- Modify: `src/views/compose.js` (`htmlConCarattere` prima di `leggiCampi`; calcolo di `corpoHtml` dentro `leggiCampi`, righe ~713-745)
- Test: `tests/compose-invio-carattere.test.mjs` (nuovo)

**Interfaces:**
- Consumes: `prefsComposizione` e `zoomCorpo` (interni a `compose.js`); `stileCarattere`.
- Produces: `export function htmlConCarattere(html, famiglia, dimensione, zoom = 100)` → stringa HTML avvolta, oppure `""` se `html` è vuoto.

- [ ] **Step 1: Write the failing test**

Crea `tests/compose-invio-carattere.test.mjs`:

```javascript
/**
 * Test dell'HTML inviato col carattere scelto (blocco R): il messaggio deve
 * portare la famiglia e la dimensione del corpo, non solo il markup.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { htmlConCarattere } from "../src/views/compose.js";

test("avvolge il corpo nella famiglia e nella dimensione scelte", () => {
  const h = htmlConCarattere("<p>Ciao</p>", "Georgia", 18);
  assert.match(h, /font-family:Georgia/);
  assert.match(h, /font-size:18px/);
  assert.match(h, /<p>Ciao<\/p>/);
});

test("senza markup resta vuoto: l'HTML non parte", () => {
  assert.equal(htmlConCarattere("", "Georgia", 18), "");
  assert.equal(htmlConCarattere("   ", "Georgia", 18), "");
});

test("una dimensione fuori intervallo ripiega su 12 punti", () => {
  const h = htmlConCarattere("<p>Ciao</p>", "Georgia", 9999);
  assert.match(h, /font-size:12px/);
});

test("una famiglia vuota ripiega su Aptos", () => {
  const h = htmlConCarattere("<p>Ciao</p>", "  ", 12);
  assert.match(h, /font-family:Aptos/);
});

test("una virgoletta nella famiglia non esce dal suo attributo", () => {
  const h = htmlConCarattere("<p>Ciao</p>", 'Arial" onload="x', 12);
  assert.doesNotMatch(h, /onload=/);
  const dichiarazione = /font-family:([^;}]+)/.exec(h);
  assert.ok(dichiarazione);
  assert.doesNotMatch(dichiarazione[1], /[";{}()<>]/);
});

test("lo zoom moltiplica la dimensione dichiarata nel messaggio", () => {
  const h = htmlConCarattere("<p>Ciao</p>", "Georgia", 20, 150);
  assert.match(h, /font-size:30px/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/compose-invio-carattere.test.mjs`
Expected: FAIL — `does not provide an export named 'htmlConCarattere'`

- [ ] **Step 3: Write minimal implementation**

In `src/views/compose.js`, prima di `leggiCampi`, aggiungi:

```javascript
/**
 * L'HTML del corpo col carattere scelto (blocco R). Lo stile in linea del
 * `contenteditable` veste solo la finestra: senza questo involucro il
 * destinatario vede il proprio font, non quello scelto dal mittente. La
 * famiglia passa da `soloFamiglia` (niente virgolette né punti e virgola) e poi
 * da `fuga()`: due cinture, perché il valore sta in un attributo `style`. Un
 * corpo senza markup resta `""`: l'HTML non parte, com'è giusto.
 */
export function htmlConCarattere(html, famiglia, dimensione, zoom = 100) {
  const testo = String(html == null ? "" : html).trim();
  if (!testo) return "";
  const st = stileCarattere(famiglia, dimensione);
  const scala = Math.min(400, Math.max(50, Number(zoom) || 100));
  const px = Math.round((st.fontSize * scala) / 100);
  // `st.fontFamily` è già passato da `soloFamiglia`: niente virgolette, punti e
  // virgola o graffe. `fuga()` è la seconda cintura, per l'attributo.
  return `<div style="font-family:${fuga(st.fontFamily)};font-size:${px}px">${testo}</div>`;
}
```

Dentro `leggiCampi`, sostituisci il calcolo di `corpoHtml`:

```javascript
  const corpoHtml =
    prefsComposizione.composizioneFormato === "testo"
      ? ""
      : /<[a-z][\s\S]*>/i.test(html)
        ? htmlConCarattere(
            html,
            prefsComposizione.carattereFamiglia,
            prefsComposizione.carattereDimensione,
            zoomCorpo,
          )
        : "";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/compose-invio-carattere.test.mjs`
Expected: PASS (6 test)

- [ ] **Step 5: Run the whole JS suite for regressions**

Run: `node --test tests/*.mjs`
Expected: PASS — in particolare `compose-invio-payload.test.mjs` e `compose.test.mjs` restano verdi: `payloadInvio` non cambia forma, cambia solo il contenuto di `corpoHtml`.

- [ ] **Step 6: Verifica end-to-end nell'app**

Ricompila (`npm run tauri build`), poi:
1. Impostazioni → Tipi di carattere → famiglia `Georgia`, dimensione `18`.
2. Nuovo messaggio a sé stessi, una riga con del grassetto.
3. Invia, poi apri il messaggio in **Posta inviata**.

Expected: il corpo del messaggio inviato si legge in Georgia a 18 punti, il grassetto c'è, e la barra `A⁻/A⁺` lo ingrandisce ancora.

- [ ] **Step 7: Commit**

```bash
cd ~/outlook-ai-clone
git add src/views/compose.js tests/compose-invio-carattere.test.mjs
git commit -m "fix(R): il messaggio inviato porta il carattere scelto"
```

Corpo del commit:

```
leggiCampi leggeva solo innerHTML: lo stile in linea del contenteditable
restava fuori, quindi il destinatario vedeva il proprio font e non quello
scelto dal mittente. Ora l'HTML parte avvolto nella famiglia e nella
dimensione in vigore, moltiplicate per lo zoom, con la famiglia passata da
fuga().

Test: 6 JS nuovi, suite intera verde.
```

---

### Task 6: Cambio dal pannello a messaggio aperto, e documentazione

Ultimo tassello: cambiare famiglia o dimensione dal pannello Impostazioni mentre un messaggio è aperto deve aggiornare il messaggio a schermo, non solo il prossimo. Poi si annota il blocco.

**Files:**
- Modify: `src/views/main-view.js` (`serveRidisegnareLettura` accanto a `stileLettura`)
- Modify: `src/main.js` (`applicaPreferenze`, righe ~295-335; import; aggancio `?view=lettura`)
- Modify: `docs/uso-e-prova.md` (elenco delle prove visive)
- Modify: `docs/plans/2026-10-12-outlook-clone-ia-v1.md` (tabella dei blocchi, in coda)
- Test: `tests/lettura-ridisegno.test.mjs` (nuovo)

**Interfaces:**
- Consumes: tutto quanto sopra.
- Produces: `export function serveRidisegnareLettura(vecchie, nuove)` in `src/views/main-view.js` → booleano.

- [ ] **Step 1: Write the failing test**

Crea `tests/lettura-ridisegno.test.mjs`:

```javascript
/**
 * Test della decisione di ridisegnare il corpo letto (blocco R): cambiare il
 * carattere dal pannello mentre un messaggio è aperto deve aggiornarlo subito.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { serveRidisegnareLettura } from "../src/views/main-view.js";

test("un cambio di famiglia richiede il ridisegno", () => {
  assert.equal(
    serveRidisegnareLettura({ carattereFamiglia: "Aptos" }, { carattereFamiglia: "Georgia" }),
    true,
  );
});

test("un cambio di dimensione richiede il ridisegno", () => {
  assert.equal(
    serveRidisegnareLettura({ carattereDimensione: 12 }, { carattereDimensione: 18 }),
    true,
  );
});

test("un cambio di scala di lettura richiede il ridisegno", () => {
  assert.equal(serveRidisegnareLettura({ letturaZoom: 100 }, { letturaZoom: 150 }), true);
});

test("una modifica che non tocca il carattere non ridisegna", () => {
  assert.equal(
    serveRidisegnareLettura(
      { carattereFamiglia: "Aptos", letturaAnteprima: false },
      { carattereFamiglia: "Aptos", letturaAnteprima: true },
    ),
    false,
  );
});

test("preferenze mancanti o vuote non fanno ridisegnare", () => {
  assert.equal(serveRidisegnareLettura(null, null), false);
  assert.equal(serveRidisegnareLettura({}, {}), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lettura-ridisegno.test.mjs`
Expected: FAIL — `does not provide an export named 'serveRidisegnareLettura'`

- [ ] **Step 3: Write minimal implementation**

In `src/views/main-view.js`, accanto a `stileLettura`, aggiungi:

```javascript
/**
 * Vero se il corpo letto va ridisegnato: cambiano la famiglia, la dimensione o
 * la scala di lettura. Tutto il resto (anteprima in lista, posizione del
 * pannello, immagini) agisce altrove e non deve toccare il messaggio aperto.
 */
export function serveRidisegnareLettura(vecchie, nuove) {
  const a = vecchie || {};
  const b = nuove || {};
  if (String(a.carattereFamiglia || "") !== String(b.carattereFamiglia || "")) return true;
  if (Number(a.carattereDimensione || 0) !== Number(b.carattereDimensione || 0)) return true;
  return limitaZoomLettura(a.letturaZoom) !== limitaZoomLettura(b.letturaZoom);
}
```

In `src/main.js`, aggiungi `serveRidisegnareLettura` all'import da `./views/main-view.js` e `zoomLetturaDaPreferenze` a quello da `./views/accessibilita.js`. Poi, in `applicaPreferenze`, sostituisci l'inizio della funzione:

```javascript
function applicaPreferenze(imp) {
  if (!imp || !imp.preferenze) return;
  const precedenti = preferenzeCorrenti;
  preferenzeCorrenti = imp.preferenze;
  // Blocco R: la scala del testo letto arriva dalla preferenza, non solo dai
  // pulsanti; il corpo già aperto si ridisegna se il carattere è cambiato.
  zoomLetturaCorrente = zoomLetturaDaPreferenze(imp.preferenze);
  if (corpoCorrenteHtml && readingEl && serveRidisegnareLettura(precedenti, imp.preferenze)) {
    const lettura = preparaCorpo(readingEl);
    mostraCorpoHtml(lettura, corpoCorrenteHtml, {
      famiglia: imp.preferenze.carattereFamiglia,
      dimensione: imp.preferenze.carattereDimensione,
      zoom: zoomLetturaCorrente,
    });
    collegaZoomLettura(readingEl);
  }
  // ...il resto della funzione resta invariato...
```

In `src/main.js`, accanto a `?view=filtro`, aggiungi l'aggancio di prova visiva:

```javascript
  // Blocco R: `?view=lettura` apre il primo messaggio nel pannello di lettura,
  // per provare la scala A⁻/A⁺ e il carattere senza clic.
  if (vista === "lettura") {
    const m = messaggiCorrenti.find((x) => x.selected) || messaggiCorrenti[0] || sampleMessages[0];
    apriMessaggio(readingEl, m);
  }
```

In `docs/uso-e-prova.md`, in coda all'elenco delle viste:

```
#      ?view=lettura                → primo messaggio nel pannello di lettura, con A⁻/A⁺ (blocco R)
#      ?zoomlettura=150             → il pannello di lettura col testo al 150% (blocco R)
#      ?view=compose&carattere=Georgia&dimensione=18 → gruppo «Carattere» con la scelta (blocco R)
```

In `docs/plans/2026-10-12-outlook-clone-ia-v1.md`, in coda alla tabella dei blocchi:

```
| R | **Carattere e dimensione applicati davvero**: pannello di lettura (Posta inviata compresa), menu del gruppo «Carattere» nella composizione, HTML del messaggio inviato, scala di lettura A⁻/A⁺ | **fatto** (preferenza `letturaZoom` in `config.json` con normalizzazione e rifiuto; `documentoCorpo` veste la scelta; `CARATTERI_COMPOSIZIONE`/`elencoDimensioni` con menu vivi; `htmlConCarattere` mette il font nel messaggio inviato; **N test JS, M Rust**) |
```

Sostituisci `N` e `M` coi numeri reali dopo lo Step 5.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lettura-ridisegno.test.mjs`
Expected: PASS (5 test)

- [ ] **Step 5: Run entrambe le suite**

Run:
```bash
node --test tests/*.mjs
cargo test --manifest-path src-tauri/Cargo.toml
```
Expected: tutto verde. Annota i due conteggi e mettili al posto di `N` e `M` nel piano.

- [ ] **Step 6: Commit**

```bash
cd ~/outlook-ai-clone
git add src/main.js src/views/main-view.js tests/lettura-ridisegno.test.mjs docs/uso-e-prova.md docs/plans/2026-10-12-outlook-clone-ia-v1.md
git commit -m "fix(R): cambiare il carattere aggiorna il messaggio già aperto"
```

Corpo del commit:

```
applicaPreferenze non ridisegnava il corpo letto: la modifica si vedeva solo
riaprendo il messaggio, cioè sembrava non fare nulla. Ora famiglia, dimensione
e scala di lettura fanno ridisegnare il corpo aperto (decisione in
serveRidisegnareLettura, collaudata). Documentati il blocco R, ?view=lettura e
i conteggi delle suite.
```

---

## Verifica finale

Prima di dichiarare chiuso il blocco R:

- [ ] `node --test tests/*.mjs` — verde, conteggio annotato
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` — verde, conteggio annotato
- [ ] `npm run tauri build` — `Outlook AI.app` ricostruita senza errori
- [ ] Prova manuale: Tipi di carattere → `Georgia` 18 → nuovo messaggio → invio a sé stessi → apertura in **Posta inviata** → il corpo è in Georgia a 18 punti
- [ ] Prova manuale: `A⁺` nel pannello di lettura su un messaggio ricevuto → il testo cresce, e resta ingrandito dopo aver riaperto l'app
- [ ] Prova manuale: cambio famiglia dal pannello con un messaggio aperto → il messaggio si aggiorna subito
- [ ] Nessun pulsante muto: le voci nuove (A⁻/A⁺, casella carattere, casella dimensione) hanno tutte un effetto osservabile

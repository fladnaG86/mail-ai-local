//! Controllo **prima dell'invio** (task 7.2, Milestone 7).
//!
//! Avvisi dei controlli strutturali **deterministici** — senza modello — più il
//! controllo del **tono**, opzionale e separato, che usa il modello locale.
//!
//! REGOLA NON NEGOZIABILE (spec §2.4 e `docs/ai-prompts.md` §5): il controllo
//! **non blocca mai l'invio**. Il risultato non ha alcun campo che impedisca
//! l'invio: `Avviso` porta solo tipo, gravità e messaggio, e la funzione
//! [`puo_inviare`] restituisce `true` qualunque sia l'elenco degli avvisi. La
//! scelta resta sempre dell'utente.
//!
//! I controlli deterministici implementati: allegato citato nel testo ma
//! assente, oggetto vuoto, troppi destinatari (soglia parametrica), possibile
//! dato sensibile (password, IBAN italiano, numero di carta, codice fiscale),
//! testo quasi tutto in maiuscolo. Il controllo del tono passa dal client IA
//! esistente (`crate::ai::client`) con provider **locale**: se il modello è
//! spento o risponde male, il tono semplicemente non produce avvisi (mai un
//! errore che impedisca l'invio).
//!
//! SCOSTAMENTO REGISTRATO: il piano (`docs/plans/…-ia-v1.md`, task 7.2) indica
//! `src-tauri/src/ai/presend.rs`; su indicazione esplicita il modulo vive in
//! `src-tauri/src/presend.rs` per non toccare `src-tauri/src/ai/*`. I nomi del
//! piano (`check`, `Kind::*`) sono qui `controlla`, [`Tipo::*`].

use serde::Serialize;

use crate::ai::client::{Client, MessaggioChat, Richiesta, Trasporto};
use crate::send;

/// Template del controllo del tono (`docs/ai-prompts.md` §5): vive qui perché
/// `ai/*` non va modificato in questo task. Identico al documento.
pub const TEMPLATE_TONO: &str = r#"Valuta se il testo seguente, in una mail di lavoro, può risultare brusco o troppo informale.
Rispondi con una sola riga: OK oppure AVVISO: <motivo breve>. Non riscrivere il testo.

Testo:
{corpo}"#;

/// Nome dell'azione del tono, come compare nel registro delle richieste.
pub const AZIONE_TONO: &str = "tono";

/// Soglia predefinita di destinatari oltre la quale si avvisa.
pub const MAX_DESTINATARI_DEFAULT: usize = 10;

/// Minimo di lettere necessarie perché il controllo delle maiuscole sia sensato.
pub const MIN_LETTERE_MAIUSCOLE: usize = 20;

/// Frazione di lettere maiuscole oltre la quale il testo è "tutto in maiuscolo".
pub const MAX_FRAZIONE_MAIUSCOLE: f64 = 0.7;

/// Tipo di avviso: identifica la regola che l'ha prodotto.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Tipo {
    /// Il testo cita un allegato ma non ce n'è nessuno.
    AllegatoMancante,
    /// L'oggetto è vuoto.
    OggettoVuoto,
    /// Il numero di destinatari supera la soglia.
    TroppiDestinatari,
    /// Sospetto dato sensibile nel corpo (password, IBAN, carta, codice fiscale).
    DatoSensibile,
    /// Il testo è quasi tutto in maiuscolo.
    Maiuscole,
    /// Il tono del testo, secondo il modello locale (opzionale).
    Tono,
}

/// Gravità dell'avviso: serve solo a distinguerli nell'interfaccia.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Gravita {
    /// Segnalazione senza particolare urgenza.
    Informativo,
    /// Merita uno sguardo prima di inviare.
    Attenzione,
}

/// Un avviso del controllo prima dell'invio.
///
/// Non esiste alcun campo "bloccante": per costruzione un avviso non può
/// impedire l'invio (vedi [`puo_inviare`]).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Avviso {
    pub tipo: Tipo,
    pub gravita: Gravita,
    pub messaggio: String,
}

impl Avviso {
    fn nuovo(tipo: Tipo, gravita: Gravita, messaggio: impl Into<String>) -> Self {
        Avviso {
            tipo,
            gravita,
            messaggio: messaggio.into(),
        }
    }
}

/// Dati del messaggio su cui gira il controllo. `numero_allegati` è il numero di
/// file realmente allegati (nella v1 il client non allega nulla, quindi 0).
#[derive(Debug, Clone, Default)]
pub struct Ingresso {
    pub a: String,
    pub cc: String,
    pub oggetto: String,
    pub corpo: String,
    pub numero_allegati: usize,
}

/// Soglie del controllo, parametriche (così i test possono variarle).
#[derive(Debug, Clone)]
pub struct Soglie {
    /// Destinatari (A: + Cc:) oltre i quali si avvisa.
    pub max_destinatari: usize,
    /// Frazione di maiuscole oltre la quale si avvisa.
    pub max_frazione_maiuscole: f64,
    /// Minimo di lettere perché il controllo delle maiuscole si attivi.
    pub min_lettere_maiuscole: usize,
}

impl Default for Soglie {
    fn default() -> Self {
        Soglie {
            max_destinatari: MAX_DESTINATARI_DEFAULT,
            max_frazione_maiuscole: MAX_FRAZIONE_MAIUSCOLE,
            min_lettere_maiuscole: MIN_LETTERE_MAIUSCOLE,
        }
    }
}

/// **Modello esplicito della regola "non blocca mai"**: l'invio è sempre
/// possibile, qualunque sia l'elenco degli avvisi. Non è una scelta
/// dell'interfaccia: è una proprietà del controllo.
pub fn puo_inviare(_avvisi: &[Avviso]) -> bool {
    true
}

/// Esegue tutti i controlli **deterministici** (senza modello) con le soglie
/// predefinite.
pub fn controlla(ingresso: &Ingresso) -> Vec<Avviso> {
    controlla_con(ingresso, &Soglie::default())
}

/// Esegue i controlli deterministici con soglie esplicite.
pub fn controlla_con(ingresso: &Ingresso, soglie: &Soglie) -> Vec<Avviso> {
    let mut avvisi = Vec::new();
    controllo_allegato(ingresso, &mut avvisi);
    controllo_oggetto(ingresso, &mut avvisi);
    controllo_destinatari(ingresso, soglie, &mut avvisi);
    controllo_dati_sensibili(ingresso, &mut avvisi);
    controllo_maiuscole(ingresso, soglie, &mut avvisi);
    avvisi
}

/// Esegue il controllo completo: sempre i deterministici, e il tono solo se
/// `con_tono` è vero. Non restituisce mai un errore: un problema del modello
/// locale lascia semplicemente l'elenco senza avvisi di tono.
pub async fn esegui<T: Trasporto>(
    ingresso: &Ingresso,
    con_tono: bool,
    client: &Client<T>,
) -> Vec<Avviso> {
    let mut avvisi = controlla(ingresso);
    if con_tono {
        avvisi.extend(controllo_tono(client, &ingresso.corpo).await);
    }
    avvisi
}

// ---------------------------------------------------------------------------
// Controlli deterministici
// ---------------------------------------------------------------------------

/// Frasi che citano un allegato nel testo o nell'oggetto.
const CITAZIONI_ALLEGATO: &[&str] = &[
    "in allegato",
    "ti allego",
    "vedi allegato",
    "attachment",
    "allego il",
    "allego la",
    "come allegato",
];

/// Allegato citato nel testo (o nell'oggetto) ma nessun allegato presente.
fn controllo_allegato(ingresso: &Ingresso, out: &mut Vec<Avviso>) {
    if ingresso.numero_allegati > 0 {
        return;
    }
    let testo = format!("{}\n{}", ingresso.oggetto, ingresso.corpo).to_lowercase();
    if CITAZIONI_ALLEGATO.iter().any(|f| testo.contains(f)) {
        out.push(Avviso::nuovo(
            Tipo::AllegatoMancante,
            Gravita::Attenzione,
            "Il testo cita un allegato (\"in allegato\", \"ti allego\", …) ma non c'è nessun file \
             allegato: allega il file oppure togli il riferimento.",
        ));
    }
}

/// Oggetto vuoto.
fn controllo_oggetto(ingresso: &Ingresso, out: &mut Vec<Avviso>) {
    if ingresso.oggetto.trim().is_empty() {
        out.push(Avviso::nuovo(
            Tipo::OggettoVuoto,
            Gravita::Attenzione,
            "L'oggetto è vuoto: un oggetto chiaro aiuta chi riceve a riconoscere la mail.",
        ));
    }
}

/// Numero di destinatari (A: + Cc:) superiore alla soglia. La copia nascosta
/// (Ccn) non esiste nella v1 e non viene considerata (vedi report).
fn controllo_destinatari(ingresso: &Ingresso, soglie: &Soglie, out: &mut Vec<Avviso>) {
    let totale = send::dividi_indirizzi(&ingresso.a).len()
        + send::dividi_indirizzi(&ingresso.cc).len();
    if totale > soglie.max_destinatari {
        out.push(Avviso::nuovo(
            Tipo::TroppiDestinatari,
            Gravita::Attenzione,
            format!(
                "Ci sono {totale} destinatari (soglia {}): controlla di non aver messo in copia \
                 qualcuno per errore.",
                soglie.max_destinatari
            ),
        ));
    }
}

/// Possibile dato sensibile nel corpo: password, IBAN italiano, numero di carta
/// (13–19 cifre, anche con spazi) e codice fiscale (16 caratteri, formato
/// italiano).
fn controllo_dati_sensibili(ingresso: &Ingresso, out: &mut Vec<Avviso>) {
    let corpo = &ingresso.corpo;
    let basso = corpo.to_lowercase();
    if basso.contains("password") || basso.contains("pwd") {
        out.push(Avviso::nuovo(
            Tipo::DatoSensibile,
            Gravita::Attenzione,
            "Possibile password nel corpo: una credenziale in una mail può restare negli archivi. \
             Valuta un canale diverso.",
        ));
    }
    if trova_iban_it(corpo) {
        out.push(Avviso::nuovo(
            Tipo::DatoSensibile,
            Gravita::Attenzione,
            "Possibile IBAN italiano nel corpo: verifica che sia davvero da condividere per mail.",
        ));
    }
    if trova_numero_carta(corpo) {
        out.push(Avviso::nuovo(
            Tipo::DatoSensibile,
            Gravita::Attenzione,
            "Possibile numero di carta nel corpo: non inviare dati di pagamento per mail.",
        ));
    }
    if trova_codice_fiscale(corpo) {
        out.push(Avviso::nuovo(
            Tipo::DatoSensibile,
            Gravita::Attenzione,
            "Possibile codice fiscale nel corpo: è un dato personale, verifica se serve davvero.",
        ));
    }
}

/// Testo quasi tutto in maiuscolo oltre la soglia.
fn controllo_maiuscole(ingresso: &Ingresso, soglie: &Soglie, out: &mut Vec<Avviso>) {
    let lettere = ingresso.corpo.chars().filter(|c| c.is_alphabetic()).count();
    if lettere < soglie.min_lettere_maiuscole {
        return;
    }
    let maiuscole = ingresso
        .corpo
        .chars()
        .filter(|c| c.is_uppercase())
        .count();
    let frazione = maiuscole as f64 / lettere as f64;
    if frazione >= soglie.max_frazione_maiuscole {
        out.push(Avviso::nuovo(
            Tipo::Maiuscole,
            Gravita::Informativo,
            "Il testo è quasi tutto in maiuscolo: in una mail di lavoro può sembrare che si stia \
             urlando.",
        ));
    }
}

/// IBAN italiano: `IT` + 2 cifre di controllo + 1 lettera + 10 cifre + 12
/// caratteri alfanumerici (27 in tutto), anche con spazi di raggruppamento.
fn trova_iban_it(testo: &str) -> bool {
    let compatto: String = testo
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect::<String>()
        .to_uppercase();
    let b = compatto.as_bytes();
    if b.len() < 27 {
        return false;
    }
    let mut i = 0;
    while i + 27 <= b.len() {
        if b[i] == b'I'
            && b[i + 1] == b'T'
            && b[i + 2..i + 4].iter().all(|c| c.is_ascii_digit())
            && b[i + 4].is_ascii_alphabetic()
            && b[i + 5..i + 15].iter().all(|c| c.is_ascii_digit())
            && b[i + 15..i + 27].iter().all(|c| c.is_ascii_alphanumeric())
        {
            return true;
        }
        i += 1;
    }
    false
}

/// Numero di carta: 13–19 cifre, anche raggruppate con spazi o trattini
/// (`4111 1111 1111 1111`).
fn trova_numero_carta(testo: &str) -> bool {
    let mut cifre = 0usize;
    let mut in_sequenza = false;
    for c in testo.chars() {
        if c.is_ascii_digit() {
            cifre += 1;
            in_sequenza = true;
        } else if (c == ' ' || c == '-') && in_sequenza {
            // separatore ammesso solo dentro una sequenza di cifre già iniziata
        } else {
            if (13..=19).contains(&cifre) {
                return true;
            }
            cifre = 0;
            in_sequenza = false;
        }
    }
    (13..=19).contains(&cifre)
}

/// Codice fiscale italiano: `AAAAAA` + 2 cifre + lettera + 2 cifre + lettera +
/// 3 cifre + lettera (16 caratteri).
fn trova_codice_fiscale(testo: &str) -> bool {
    let alto = testo.to_uppercase();
    let b = alto.as_bytes();
    if b.len() < 16 {
        return false;
    }
    let mut i = 0;
    while i + 16 <= b.len() {
        let s = &b[i..i + 16];
        if s[0..6].iter().all(|c| c.is_ascii_alphabetic())
            && s[6..8].iter().all(|c| c.is_ascii_digit())
            && s[8].is_ascii_alphabetic()
            && s[9..11].iter().all(|c| c.is_ascii_digit())
            && s[11].is_ascii_alphabetic()
            && s[12..15].iter().all(|c| c.is_ascii_digit())
            && s[15].is_ascii_alphabetic()
        {
            return true;
        }
        i += 1;
    }
    false
}

// ---------------------------------------------------------------------------
// Controllo del tono (modello locale, opzionale)
// ---------------------------------------------------------------------------

/// Controllo del **tono** via modello locale. Restituisce al più un avviso
/// (tipo [`Tipo::Tono`], gravità informativa). Se il modello è spento, risponde
/// male o con "OK", restituisce un elenco vuoto: **mai un errore** che possa
/// impedire l'invio.
pub async fn controllo_tono<T: Trasporto>(client: &Client<T>, corpo: &str) -> Vec<Avviso> {
    if corpo.trim().is_empty() {
        return Vec::new();
    }
    let richiesta = Richiesta {
        provider: "locale".to_string(),
        endpoint: String::new(),
        modello: crate::ai::MODELLO_LOCALE_DEFAULT.to_string(),
        azione: AZIONE_TONO.to_string(),
        prompt_version: crate::ai::PROMPT_VERSION.to_string(),
        temperatura: crate::ai::TEMPERATURA_BASSA,
        // Il tono usa sempre e solo il modello locale: nessun consenso cloud.
        consenso_cloud: false,
        messaggi: vec![MessaggioChat::utente(TEMPLATE_TONO.replace("{corpo}", corpo))],
    };
    match client.completa(&richiesta).await {
        Ok(testo) => avviso_dal_tono(&testo),
        // Modello spento o risposta non valida: nessun avviso, nessun errore.
        Err(_) => Vec::new(),
    }
}

/// Interpreta la risposta del modello: "OK" → nessun avviso; qualcosa con
/// "AVVISO" → un avviso informativo con il motivo dichiarato.
fn avviso_dal_tono(testo: &str) -> Vec<Avviso> {
    let t = testo.trim();
    if !t.to_uppercase().contains("AVVISO") {
        return Vec::new();
    }
    let motivo = t.splitn(2, ':').nth(1).unwrap_or(t).trim();
    vec![Avviso::nuovo(
        Tipo::Tono,
        Gravita::Informativo,
        format!("Tono da rivedere: {motivo}"),
    )]
}

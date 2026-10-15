//! Notifiche di sistema e suoni (blocco E).
//!
//! La **decisione** se notificare è una funzione pura (`decidi`), separata
//! dall'effetto: si collauda con `cargo test` senza mostrare nulla. Le regole
//! sono quelle dichiarate nel pannello «Notifiche e suoni»:
//!
//! - i messaggi **già letti** non si notificano;
//! - i messaggi di un **mittente bloccato** non si notificano (la protezione
//!   della posta indesiderata li ha già spostati o marcati);
//! - i messaggi che stanno **in Posta indesiderata** non si notificano;
//! - dentro l'intervallo di **«non disturbare»** (anche a cavallo della
//!   mezzanotte, es. 22:00–07:00) non si notifica;
//! - se la **finestra dell'app è in primo piano** non si notifica (scelta
//!   dichiarata: l'utente sta già guardando la posta);
//! - con l'**interruttore generale spento** non si notifica.
//!
//! Il testo della notifica mostra mittente e oggetto del messaggio più recente
//! (uno solo) oppure «N nuovi messaggi»; con l'anteprima spenta non rivela il
//! contenuto.
//!
//! L'effetto usa il **plugin ufficiale** `tauri-plugin-notification`; se la
//! chiamata fallisce si ripiega su `osascript`, che passa comunque da
//! Notification Center. Il suono è quello di sistema scelto (`afplay` per la
//! prova isolata; il plugin per la notifica).

use crate::config::{self, Preferenze};

/// Numero massimo di messaggi mostrato «per esteso» nel testo: oltre, la
/// notifica dice «{MAX}+ nuovi messaggi» invece di enumerare. È il limite di
/// conteggio dichiarato nel pannello.
pub const MAX_CONTEGGIO_MOSTRATO: usize = 99;

/// Un messaggio candidato alla notifica: quanto basta a decidere e a comporre
/// il testo, senza il corpo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidato {
    pub mittente: String,
    pub oggetto: String,
    /// Data del messaggio in secondi dall'epoca Unix.
    pub quando: i64,
    /// Vero se il messaggio è già stato letto (allora non si notifica).
    pub letto: bool,
    /// Vero se il mittente è nell'elenco dei bloccati.
    pub mittente_bloccato: bool,
    /// Vero se il messaggio sta in Posta indesiderata.
    pub cartella_indesiderata: bool,
}

/// Le opzioni che governano la decisione. Tutto già normalizzato in minuti
/// dalla mezzanotte, così la funzione resta pura.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct OpzioniNotifica {
    /// Interruttore generale.
    pub attivo: bool,
    /// Vero se la finestra dell'app è in primo piano (allora non si notifica).
    pub finestra_attiva: bool,
    /// «Non disturbare» attivo.
    pub non_disturbare_attivo: bool,
    /// Inizio dell'intervallo, in minuti dalla mezzanotte.
    pub non_disturbare_inizio: i32,
    /// Fine dell'intervallo, in minuti dalla mezzanotte.
    pub non_disturbare_fine: i32,
    /// Ora corrente, in minuti dalla mezzanotte (0–1439).
    pub adesso_minuti: i32,
    /// Mostra mittente e oggetto nel testo.
    pub anteprima: bool,
}

/// Perché si notifica o non si notifica.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Motivo {
    Inviata,
    InterruttoreSpento,
    NonDisturbare,
    FinestraInPrimoPiano,
    NessunMessaggioAmmissibile,
}

/// Esito della decisione: se mostrare, perché, quanti messaggi ammissibili e
/// qual è il più recente (per il testo).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Decisione {
    pub mostrare: bool,
    pub motivo: Motivo,
    pub conteggio: usize,
    pub piu_recente: Option<Candidato>,
}

/// Vero se il messaggio può dare una notifica: non letto, mittente non bloccato
/// e non in Posta indesiderata.
pub fn messaggio_ammissibile(c: &Candidato) -> bool {
    !c.letto && !c.mittente_bloccato && !c.cartella_indesiderata
}

/// I messaggi ammissibili, nell'ordine di arrivo.
pub fn ammissibili(candidati: &[Candidato]) -> Vec<&Candidato> {
    candidati.iter().filter(|c| messaggio_ammissibile(c)).collect()
}

/// Vero se `adesso` cade nell'intervallo `[inizio, fine)` di «non disturbare».
///
/// Un intervallo con `inizio < fine` è nella stessa giornata; con
/// `inizio > fine` **scavalca la mezzanotte** (es. 22:00–07:00). Un intervallo
/// con estremi uguali è vuoto. I minuti vengono portati in `0–1439`.
pub fn dentro_non_disturbare(adesso: i32, inizio: i32, fine: i32) -> bool {
    let g = |m: i32| m.rem_euclid(1440);
    let (a, i, f) = (g(adesso), g(inizio), g(fine));
    if i == f {
        return false;
    }
    if i < f {
        a >= i && a < f
    } else {
        a >= i || a < f
    }
}

/// Minuti dalla mezzanotte di un orario `HH:MM`, se valido e nel formato.
pub fn minuti_da_orario(s: &str) -> Option<i32> {
    if !config::orario_valido(s) {
        return None;
    }
    let (h, m) = s.trim().split_once(':')?;
    let h: i32 = h.parse().ok()?;
    let m: i32 = m.parse().ok()?;
    Some(h * 60 + m)
}

/// Minuti dalla mezzanotte dell'ora locale corrente.
pub fn adesso_minuti() -> i32 {
    crono::adesso_minuti()
}

/// Toglie dall'intervallo la mezzanotte: costruisce le opzioni dai minuti.
pub fn opzioni_da_preferenze(
    p: &Preferenze,
    finestra_attiva: bool,
    adesso_minuti: i32,
) -> OpzioniNotifica {
    let inizio = minuti_da_orario(&p.non_disturbare_inizio)
        .unwrap_or_else(|| minuti_da_orario(config::NON_DISTURBARE_INIZIO_DEFAULT).unwrap_or(1320));
    let fine = minuti_da_orario(&p.non_disturbare_fine)
        .unwrap_or_else(|| minuti_da_orario(config::NON_DISTURBARE_FINE_DEFAULT).unwrap_or(420));
    OpzioniNotifica {
        attivo: p.notifiche_attive,
        finestra_attiva,
        non_disturbare_attivo: p.non_disturbare_attivo,
        non_disturbare_inizio: inizio,
        non_disturbare_fine: fine,
        adesso_minuti: adesso_minuti.rem_euclid(1440),
        anteprima: p.notifiche_anteprima,
    }
}

/// Decide se notificare i candidati (funzione pura). L'ordine dei controlli è
/// quello dichiarato nel pannello:
/// interruttore → messaggi ammissibili → «non disturbare» → finestra attiva.
pub fn decidi(candidati: &[Candidato], opz: &OpzioniNotifica) -> Decisione {
    let amm = ammissibili(candidati);
    let piu_recente = amm
        .iter()
        .max_by_key(|c| c.quando)
        .map(|c| (*c).clone())
        .or_else(|| candidati.iter().max_by_key(|c| c.quando).cloned());
    let conteggio = amm.len();

    let (mostrare, motivo) = if !opz.attivo {
        (false, Motivo::InterruttoreSpento)
    } else if amm.is_empty() {
        (false, Motivo::NessunMessaggioAmmissibile)
    } else if opz.non_disturbare_attivo
        && dentro_non_disturbare(
            opz.adesso_minuti,
            opz.non_disturbare_inizio,
            opz.non_disturbare_fine,
        )
    {
        (false, Motivo::NonDisturbare)
    } else if opz.finestra_attiva {
        (false, Motivo::FinestraInPrimoPiano)
    } else {
        (true, Motivo::Inviata)
    };

    Decisione {
        mostrare,
        motivo,
        conteggio,
        piu_recente,
    }
}

/// Titolo e corpo della notifica, dati il conteggio e il messaggio più recente.
///
/// - un solo messaggio: mittente e oggetto (o un testo generico senza anteprima);
/// - più di uno: «N nuovi messaggi» (oltre `MAX_CONTEGGIO_MOSTRATO`: «99+»).
pub fn testo_notifica(
    conteggio: usize,
    mittente: &str,
    oggetto: &str,
    anteprima: bool,
) -> (String, String) {
    let mittente = mittente.trim();
    let oggetto = oggetto.trim();
    let mittente = if mittente.is_empty() { "Mittente sconosciuto" } else { mittente };
    let oggetto = if oggetto.is_empty() { "(nessun oggetto)" } else { oggetto };

    if conteggio <= 1 {
        if anteprima {
            (mittente.to_string(), oggetto.to_string())
        } else {
            ("Nuovo messaggio".to_string(), "Hai ricevuto un nuovo messaggio.".to_string())
        }
    } else if anteprima {
        (
            format!("{} nuovi messaggi", conteggio),
            format!("Il più recente — {mittente}: {oggetto}"),
        )
    } else {
        (
            format!("{} nuovi messaggi", conteggio),
            "Hai ricevuto nuovi messaggi.".to_string(),
        )
    }
}

/// Titolo del conteggio con il limite dichiarato: oltre `MAX_CONTEGGIO_MOSTRATO`
/// si mostra «99+».
pub fn titolo_conteggio(conteggio: usize) -> String {
    if conteggio > MAX_CONTEGGIO_MOSTRATO {
        format!("{MAX_CONTEGGIO_MOSTRATO}+ nuovi messaggi")
    } else {
        format!("{conteggio} nuovi messaggi")
    }
}

/// Titolo e corpo definitivi, applicando il limite al conteggio.
pub fn testo_da_decisione(d: &Decisione, anteprima: bool) -> Option<(String, String)> {
    let c = d.piu_recente.as_ref()?;
    if d.conteggio <= 1 {
        Some(testo_notifica(d.conteggio, &c.mittente, &c.oggetto, anteprima))
    } else if anteprima {
        Some((
            titolo_conteggio(d.conteggio),
            format!(
                "Il più recente — {}: {}",
                if c.mittente.trim().is_empty() { "Mittente sconosciuto" } else { c.mittente.trim() },
                if c.oggetto.trim().is_empty() { "(nessun oggetto)" } else { c.oggetto.trim() },
            ),
        ))
    } else {
        Some((titolo_conteggio(d.conteggio), "Hai ricevuto nuovi messaggi.".to_string()))
    }
}

// ---------------------------------------------------------------------------
// Suoni
// ---------------------------------------------------------------------------

/// Percorso del file di suono di sistema per il nome scelto, se è un suono
/// valido. `None` per «nessuno» (silenzio) o per un nome fuori elenco.
pub fn percorso_suono(nome: &str) -> Option<String> {
    let nome = nome.trim();
    if nome.is_empty() || nome == "nessuno" {
        return None;
    }
    if !config::SUONI_NOTIFICA.contains(&nome) {
        return None;
    }
    Some(format!("/System/Library/Sounds/{nome}.aiff"))
}

/// Riproduce il suono scelto con `afplay` (riproduttore di sistema di macOS).
/// Restituisce una frase leggibile: nessun suono, suono riprodotto o errore.
pub fn suona(nome: &str) -> Result<String, String> {
    let Some(percorso) = percorso_suono(nome) else {
        return Ok("Nessun suono: la scelta è «nessuno».".to_string());
    };
    if !std::path::Path::new(&percorso).exists() {
        return Err(format!("Suono di sistema non trovato: {percorso}"));
    }
    match std::process::Command::new("afplay").arg(&percorso).status() {
        Ok(s) if s.success() => Ok(format!("Suono «{nome}» riprodotto.")),
        Ok(s) => Err(format!("afplay è terminato con esito {s}.")),
        Err(e) => Err(format!("afplay non è stato avviato: {e}")),
    }
}

// ---------------------------------------------------------------------------
// Effetto: notifica di sistema (plugin ufficiale, con ripiego `osascript`)
// ---------------------------------------------------------------------------

/// Notifica di sistema col plugin ufficiale `tauri-plugin-notification`. Il
/// plugin prepara il payload e lo consegna su un task separato: questa funzione
/// torna subito. Se la preparazione fallisce, si ripiega su `osascript`.
pub fn mostra(app: &tauri::AppHandle, titolo: &str, corpo: &str, suono: &str) -> Result<String, String> {
    use tauri_plugin_notification::NotificationExt;
    let suono_nome = percorso_suono(suono).map(|_| suono.trim().to_string());
    let mut builder = app
        .notification()
        .builder()
        .title(titolo.to_string())
        .body(corpo.to_string());
    if let Some(s) = suono_nome {
        builder = builder.sound(s);
    }
    match builder.show() {
        Ok(()) => Ok("Notifica inviata a Notification Center.".to_string()),
        Err(e) => {
            let ripiego = osascript_notifica(titolo, corpo)?;
            Ok(format!("Plugin non disponibile ({e}); notifica mostrata con osascript: {ripiego}"))
        }
    }
}

/// Ripiego: mostra la notifica con `osascript`.
pub fn osascript_notifica(titolo: &str, corpo: &str) -> Result<String, String> {
    let script = format!(
        "display notification {} with title {}",
        stringa_applescript(corpo),
        stringa_applescript(titolo),
    );
    match std::process::Command::new("osascript").arg("-e").arg(&script).status() {
        Ok(s) if s.success() => Ok("con osascript".to_string()),
        Ok(s) => Err(format!("osascript è terminato con esito {s}")),
        Err(e) => Err(format!("osascript non è stato avviato: {e}")),
    }
}

/// Racchiude e mette in sicurezza una stringa per uno script AppleScript:
/// doppi apici e barre rovesciate sfuggono, le andate a capo diventano spazi.
pub fn stringa_applescript(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' | '\r' => out.push(' '),
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Ore e minuti dell'ora locale, senza introdurre un crate di date.
mod crono {
    /// Minuti dalla mezzanotte dell'ora locale corrente, letti da `date +%H:%M`
    /// (comando di sistema di macOS). Se non riesce, 0 (mezzanotte): la decisione
    /// resta deterministica e il chiamante può sempre passare l'ora nei test.
    pub fn adesso_minuti() -> i32 {
        let Ok(out) = std::process::Command::new("date").arg("+%H:%M").output() else {
            return 0;
        };
        if !out.status.success() {
            return 0;
        }
        let s = String::from_utf8_lossy(&out.stdout);
        super::minuti_da_orario(s.trim()).unwrap_or(0)
    }
}

//! Configurazione persistente dell'applicazione (config.json).
//! Nessun campo password: le credenziali vivono solo nel Keychain (vedi `secrets`).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use thiserror::Error;

/// Nome del file di configurazione dentro la cartella dell'app.
const CONFIG_FILE: &str = "config.json";

/// Provider IA predefinito: il modello locale (nessun dato esce dal Mac).
pub const PROVIDER_IA_DEFAULT: &str = "locale";

/// Lingua predefinita delle risposte dell'assistente.
pub const LINGUA_RISPOSTE_DEFAULT: &str = "italiano";

/// Comando predefinito per avviare il motore locale (Splash-M1 su macOS).
/// È configurabile in `config.json` (campo `comandoAvvioLocale`): l'app non
/// conosce altri percorsi di avvio e non avvia nulla da sé senza questa azione.
pub const COMANDO_AVVIO_LOCALE_DEFAULT: &str = "open -a Splash-M1";

// ---------------------------------------------------------------------------
// Blocco D — impostazioni che governano il comportamento (Lettura, Composizione,
// Tipi di carattere, Correzione automatica, Ortografia).
// ---------------------------------------------------------------------------

/// Dove sta il pannello di lettura nella finestra principale.
pub const PANNELLI_LETTURA: [&str; 3] = ["sotto", "destra", "nascosto"];
/// Valore predefinito del pannello di lettura (sotto la lista, come nella v1).
pub const LETTURA_PANNELLO_DEFAULT: &str = "sotto";

/// Politica di caricamento delle immagini dei messaggi.
pub const MODI_IMMAGINI: [&str; 3] = ["mai", "chiedi", "sempre"];
/// Predefinito: chiedi (le immagini remote restano bloccate finché l'utente non
/// le autorizza con "Mostra immagini").
pub const LETTURA_IMMAGINI_DEFAULT: &str = "chiedi";

/// Secondi massimi accettati per "segna come letto dopo N secondi".
pub const SEGNA_LETTO_SECONDI_MAX: i64 = 600;

/// Formato predefinito delle nuove composizioni.
pub const FORMATI_COMPOSIZIONE: [&str; 2] = ["html", "testo"];
/// Predefinito: HTML (il corpo può contenere formattazione).
pub const COMPOSIZIONE_FORMATO_DEFAULT: &str = "html";

/// Famiglia di carattere predefinita del corpo di composizione.
pub const CARATTERE_FAMIGLIA_DEFAULT: &str = "Aptos";
/// Dimensione predefinita del corpo di composizione, in punti.
pub const CARATTERE_DIMENSIONE_DEFAULT: i64 = 12;
/// Intervallo ammesso per la dimensione del carattere.
pub const CARATTERE_DIMENSIONE_MIN: i64 = 8;
pub const CARATTERE_DIMENSIONE_MAX: i64 = 72;

/// Lingua predefinita del controllo ortografico.
pub const ORTOGRAFIA_LINGUA_DEFAULT: &str = "it-IT";

// ---------------------------------------------------------------------------
// Blocco I2 — vista (Ordina per, Densità di visualizzazione), zoom della
// composizione, conferme di lettura/recapito predefinite e impostazioni
// personali. Etichette del riferimento: `Ordina per`, `Compatta`, `Accogliente`,
// `Spaziosa`.
// ---------------------------------------------------------------------------

/// Campi su cui si può ordinare la lista (etichette del riferimento).
pub const ORDINAMENTI: [&str; 4] = ["data", "mittente", "oggetto", "dimensione"];
/// Campo di ordinamento predefinito: la data (come Outlook).
pub const ORDINAMENTO_DEFAULT: &str = "data";

/// Versi di ordinamento (etichette del riferimento).
pub const ORDINAMENTI_VERSO: [&str; 2] = ["crescente", "discendente"];
/// Verso predefinito: discendente (dal più recente).
pub const ORDINAMENTO_VERSO_DEFAULT: &str = "discendente";

/// Densità di visualizzazione della lista: `Compatta` / `Accogliente` / `Spaziosa`.
pub const DENSITA: [&str; 3] = ["compatta", "accogliente", "spaziosa"];
/// Densità predefinita: accogliente.
pub const DENSITA_DEFAULT: &str = "accogliente";

/// Zoom del corpo di composizione (percentuale) come `ChunkZoom` del riferimento.
pub const ZOOM_COMPOSIZIONE_DEFAULT: i64 = 100;
pub const ZOOM_COMPOSIZIONE_MIN: i64 = 50;
pub const ZOOM_COMPOSIZIONE_MAX: i64 = 400;

/// Scala del testo del messaggio letto, in percentuale (blocco R). Stessi
/// limiti dello zoom della composizione: è lo stesso gesto su due corpi.
pub const LETTURA_ZOOM_DEFAULT: i64 = 100;
pub const LETTURA_ZOOM_MIN: i64 = 50;
pub const LETTURA_ZOOM_MAX: i64 = 400;

/// Quota di altezza data alla lista rispetto alla lettura quando la lettura sta
/// sotto la lista (0 = lista al minimo, 1 = al massimo). Il divisorio trascinabile
/// la scrive.
pub const SPLIT_RAPPORTO_DEFAULT: f64 = 0.5;

// ---------------------------------------------------------------------------
// Blocco N — Visualizza, Cerca, Impostazioni di sincronizzazione, Archiviazione.
// Etichette del riferimento: `/ERPreferencesWindow/Views/Display = Visualizza`,
// `Search = Cerca`, `SyncSettings = Impostazioni di sincronizzazione`,
// `StorageQuota = Archiviazione`.
// ---------------------------------------------------------------------------

/// Colori di sfondo della riga contrassegnata. `"giallo"` è il valore misurato
/// `MessageListFlaggedBackgroundColor` (chiaro `#FFFFCC`, scuro `#464646`).
pub const COLORI_CONTRASSEGNATA: [&str; 2] = ["giallo", "nessuno"];
/// Colore predefinito della riga contrassegnata.
pub const COLORE_CONTRASSEGNATA_DEFAULT: &str = "giallo";

/// Ambiti della ricerca: tutte le cartelle o solo quella aperta.
pub const AMBITI_RICERCA: [&str; 2] = ["tutte", "cartella"];
/// Ambito di ricerca predefinito.
pub const AMBITO_RICERCA_DEFAULT: &str = "tutte";
/// Limite predefinito di risultati della ricerca e intervallo ammesso.
pub const RICERCA_LIMITE_DEFAULT: i64 = 50;
pub const RICERCA_LIMITE_MIN: i64 = 10;
pub const RICERCA_LIMITE_MAX: i64 = 500;

/// Intervallo di sincronizzazione automatica (minuti) e massimo ammesso
/// (una giornata). 0 = mai.
pub const SYNC_INTERVALLO_DEFAULT: i64 = 0;
pub const SYNC_INTERVALLO_MAX: i64 = 1440;

/// Soglia di avviso sulla dimensione della cache locale, in MB (0 = nessun
/// avviso) e massimo ammesso.
pub const ARCHIVIAZIONE_AVVISO_MB_DEFAULT: i64 = 0;
pub const ARCHIVIAZIONE_AVVISO_MB_MAX: i64 = 102_400;

/// Numero massimo di sostituzioni automatiche accettate.
pub const SOSTITUZIONI_MAX: usize = 100;

/// Una sostituzione della correzione automatica: `da` (parola scritta) → `a`
/// (parola corretta). I due campi sono testo: es. `nn` → `non`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sostituzione {
    pub da: String,
    pub a: String,
}

/// Le tre sostituzioni predefinite della correzione automatica (italiano).
pub fn sostituzioni_predefinite() -> Vec<Sostituzione> {
    vec![
        Sostituzione {
            da: "nn".to_string(),
            a: "non".to_string(),
        },
        Sostituzione {
            da: "ke".to_string(),
            a: "che".to_string(),
        },
        Sostituzione {
            da: "xche".to_string(),
            a: "perché".to_string(),
        },
    ]
}

/// Tiene solo le sostituzioni sensate: `da` non vuoto (dopo trim), al massimo
/// `SOSTITUZIONI_MAX` voci, senza duplicati per `da` (vince la prima). Serve a un
/// `config.json` modificato a mano o a una tabella salvata storta.
pub fn normalizza_sostituzioni(elenco: &[Sostituzione]) -> Vec<Sostituzione> {
    let mut out: Vec<Sostituzione> = Vec::new();
    for s in elenco {
        let da = s.da.trim().to_string();
        if da.is_empty() {
            continue;
        }
        if out.iter().any(|x| x.da == da) {
            continue;
        }
        out.push(Sostituzione {
            da,
            a: s.a.trim().to_string(),
        });
        if out.len() >= SOSTITUZIONI_MAX {
            break;
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Blocco D, seconda metà — firme multiple, posta indesiderata, cartella iniziale.
// ---------------------------------------------------------------------------

/// Numero massimo di firme accettate.
pub const FIRME_MAX: usize = 20;

/// Cartella mostrata all'avvio quando la preferenza è assente.
pub const CARTELLA_INIZIALE_DEFAULT: &str = "INBOX";

/// Livelli di protezione della posta indesiderata.
pub const PROTEZIONI_POSTA: [&str; 2] = ["spenta", "attiva"];
/// Predefinito: protezione attiva (sposta in Posta indesiderata i mittenti bloccati).
pub const PROTEZIONE_POSTA_DEFAULT: &str = "attiva";

/// Una firma del mittente: nome leggibile, contenuto (testo o HTML) e il tipo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Firma {
    /// Identificatore stabile (riferito da `firma_predefinita_per_account`).
    pub id: String,
    /// Nome mostrato nel selettore (es. "Lavoro").
    pub nome: String,
    /// Contenuto della firma.
    pub contenuto: String,
    /// Vero se il contenuto è HTML.
    #[serde(default)]
    pub html: bool,
}

/// Tiene solo le firme sensate: id e nome non vuoti (generati se assenti),
/// niente id duplicati (vince la prima), niente voci completamente vuote.
/// Le firme **effettive**: quelle dell'elenco, oppure — se l'elenco è vuoto e il
/// vecchio campo `firmaDelMittente` ha del testo — una firma creata da quello.
/// È la migrazione "in lettura" dalla firma singola: non riscrive il file, così
/// un salvataggio seguito da una lettura resta identico, e la firma storica non
/// va mai persa.
pub fn firme_effettive(p: &Preferenze) -> Vec<Firma> {
    let firme = normalizza_firme(&p.firme);
    if !firme.is_empty() {
        return firme;
    }
    let legacy = p.firma_del_mittente.trim();
    if legacy.is_empty() {
        return Vec::new();
    }
    vec![Firma {
        id: "predefinita".to_string(),
        nome: "Firma".to_string(),
        contenuto: legacy.to_string(),
        html: false,
    }]
}

pub fn normalizza_firme(elenco: &[Firma]) -> Vec<Firma> {
    let mut out: Vec<Firma> = Vec::new();
    for (i, f) in elenco.iter().enumerate() {
        let nome = if f.nome.trim().is_empty() {
            format!("Firma {}", i + 1)
        } else {
            f.nome.trim().to_string()
        };
        let id = if f.id.trim().is_empty() {
            format!("firma{}", i + 1)
        } else {
            f.id.trim().to_string()
        };
        if f.contenuto.trim().is_empty() && f.nome.trim().is_empty() {
            continue;
        }
        if out.iter().any(|x| x.id == id) {
            continue;
        }
        out.push(Firma {
            id,
            nome,
            contenuto: f.contenuto.clone(),
            html: f.html,
        });
        if out.len() >= FIRME_MAX {
            break;
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Blocco E — notifiche di sistema e suoni.
// ---------------------------------------------------------------------------

/// Suoni di sistema offerti per le notifiche. `"nessuno"` è il silenzio; gli
/// altri nomi corrispondono ai file `/System/Library/Sounds/<nome>.aiff` di macOS
/// (riprodotti con `afplay`, il riproduttore di sistema).
pub const SUONI_NOTIFICA: [&str; 7] =
    ["nessuno", "Basso", "Glass", "Ping", "Pop", "Sosumi", "Tink"];
/// Suono predefinito delle notifiche.
pub const SUONO_NOTIFICA_DEFAULT: &str = "Glass";
/// Inizio predefinito dell'intervallo di «non disturbare» (formato `HH:MM`).
pub const NON_DISTURBARE_INIZIO_DEFAULT: &str = "22:00";
/// Fine predefinita dell'intervallo di «non disturbare» (formato `HH:MM`).
pub const NON_DISTURBARE_FINE_DEFAULT: &str = "07:00";

/// Vero se `s` è un orario sensato nel formato `HH:MM` (00:00–23:59). Le ore e i
/// minuti si accettano anche a una cifra (`7:05`), come li scrive l'utente.
pub fn orario_valido(s: &str) -> bool {
    let Some((h, m)) = s.trim().split_once(':') else {
        return false;
    };
    let due_cifre_digit =
        |x: &str| !x.is_empty() && x.len() <= 2 && x.chars().all(|c| c.is_ascii_digit());
    if !due_cifre_digit(h) || !due_cifre_digit(m) {
        return false;
    }
    match (h.parse::<u32>(), m.parse::<u32>()) {
        (Ok(h), Ok(m)) => h < 24 && m < 60,
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Blocco H — raggruppamento in conversazioni e regole locali sui messaggi.
// ---------------------------------------------------------------------------

/// Numero massimo di regole accettate.
pub const REGOLE_MAX: usize = 200;
/// Tipi di azione ammessi per una regola, nell'ordine in cui il pannello li offre.
pub const TIPI_AZIONE: [&str; 5] = [
    "sposta",
    "contrassegna",
    "categorizza",
    "segna_letto",
    "elimina",
];
/// Valori ammessi per la condizione «con allegato».
pub const ALLEGATO_CONDIZIONI: [&str; 3] = ["indifferente", "con", "senza"];

/// Condizioni di una regola, combinate in **AND**. Un campo di testo vuoto è
/// indifferente: non restringe nulla.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CondizioniRegola {
    pub mittente_contiene: String,
    pub oggetto_contiene: String,
    pub corpo_contiene: String,
    pub destinatario_contiene: String,
    /// `"indifferente" | "con" | "senza"`.
    pub allegato: String,
}

/// Un'azione di una regola: `tipo` (uno di `TIPI_AZIONE`) e `valore`
/// (la destinazione per «sposta», la categoria per «categorizza»). Le azioni si
/// applicano **nell'ordine** dell'elenco.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AzioneRegola {
    pub tipo: String,
    pub valore: String,
}

fn vero() -> bool {
    true
}

/// Una regola locale: nome, attiva/disattiva, ordine, condizioni in AND, azioni
/// in ordine e le statistiche di trasparenza (`esecuzioni` = quante volte ha
/// agito, `ultima_esecuzione` = secondi Unix dell'ultima volta, 0 = mai).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Regola {
    pub id: String,
    pub nome: String,
    #[serde(default = "vero")]
    pub attiva: bool,
    pub ordine: i64,
    pub condizioni: CondizioniRegola,
    pub azioni: Vec<AzioneRegola>,
    pub esecuzioni: i64,
    pub ultima_esecuzione: i64,
}

impl Default for Regola {
    fn default() -> Self {
        Regola {
            id: String::new(),
            nome: String::new(),
            attiva: true,
            ordine: 0,
            condizioni: CondizioniRegola::default(),
            azioni: Vec::new(),
            esecuzioni: 0,
            ultima_esecuzione: 0,
        }
    }
}

/// Tiene solo le regole sensate: id e nome non vuoti (generati se assenti),
/// niente id duplicati (vince la prima), valore «con allegato» ammesso, azioni
/// solo fra i tipi dichiarati (una «sposta» senza destinazione è scartata),
/// statistiche non negative. L'elenco esce **ordinato per `ordine`** (a parità,
/// l'ordine di inserimento). Serve a un `config.json` modificato a mano.
pub fn normalizza_regole(elenco: &[Regola]) -> Vec<Regola> {
    let mut out: Vec<Regola> = Vec::new();
    for (i, r) in elenco.iter().enumerate() {
        let nome = if r.nome.trim().is_empty() {
            format!("Regola {}", i + 1)
        } else {
            r.nome.trim().to_string()
        };
        let id = if r.id.trim().is_empty() {
            format!("regola{}", i + 1)
        } else {
            r.id.trim().to_string()
        };
        if out.iter().any(|x| x.id == id) {
            continue;
        }
        let mut cond = r.condizioni.clone();
        cond.mittente_contiene = cond.mittente_contiene.trim().to_string();
        cond.oggetto_contiene = cond.oggetto_contiene.trim().to_string();
        cond.corpo_contiene = cond.corpo_contiene.trim().to_string();
        cond.destinatario_contiene = cond.destinatario_contiene.trim().to_string();
        if !ALLEGATO_CONDIZIONI.contains(&cond.allegato.as_str()) {
            cond.allegato = "indifferente".to_string();
        }
        let azioni: Vec<AzioneRegola> = r
            .azioni
            .iter()
            .filter(|a| TIPI_AZIONE.contains(&a.tipo.as_str()))
            .map(|a| AzioneRegola {
                tipo: a.tipo.clone(),
                valore: a.valore.trim().to_string(),
            })
            .filter(|a| a.tipo != "sposta" || !a.valore.is_empty())
            .collect();
        out.push(Regola {
            id,
            nome,
            attiva: r.attiva,
            ordine: r.ordine,
            condizioni: cond,
            azioni,
            esecuzioni: r.esecuzioni.max(0),
            ultima_esecuzione: r.ultima_esecuzione.max(0),
        });
        if out.len() >= REGOLE_MAX {
            break;
        }
    }
    // L'ordinamento è stabile: a parità di `ordine` vince l'inserimento.
    out.sort_by(|a, b| a.ordine.cmp(&b.ordine));
    out
}

// ---------------------------------------------------------------------------
// Blocco O — categorie definite dall'utente (nome + colore).
//
// Etichette del riferimento: il riquadro si chiama «Categorie»
// (`Preferences.Panes.All.strings`), il pannello ha le colonne «Nome» e
// «Colore» (`Preferences.Panes.Categories.strings`). Le categorie predefinite
// sono quelle di Outlook (nomi reali da `ZStrings.strings`, chiavi
// `/outlook/Exchange/MasterCategories/*category`): Rosso, Blu, Verde,
// Arancione, Viola, Giallo. NIENTE segreti: solo nomi e colori.
// ---------------------------------------------------------------------------

/// Numero massimo di categorie accettate.
pub const CATEGORIE_MAX: usize = 100;

/// Le tinte ammesse per una categoria: `(id, esadecimale)`. Gli id sono quelli
/// salvati in `config.json` (campo `colore`); i valori sono le tinte delle
/// categorie di Outlook (preset OWA `Preset0/1/3/4/7/8`) e coincidono con i
/// token CSS `--cat-*` di `src/styles/tokens.css`.
pub const COLORI_CATEGORIA: [(&str, &str); 6] = [
    ("rosso", "#D13438"),
    ("arancione", "#F7630C"),
    ("giallo", "#FFB900"),
    ("verde", "#107C10"),
    ("blu", "#0078D4"),
    ("viola", "#8764B8"),
];

/// Tinta predefinita quando il colore è assente o sconosciuto.
pub const COLORE_CATEGORIA_DEFAULT: &str = "blu";

/// Una categoria definita dall'utente: `id` stabile, `nome` mostrato e `colore`
/// (uno degli id di `COLORI_CATEGORIA`). Il nome è quello che viene scritto sul
/// server come keyword IMAP quando si assegna la categoria a un messaggio.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Categoria {
    pub id: String,
    pub nome: String,
    pub colore: String,
}

impl Default for Categoria {
    fn default() -> Self {
        Categoria {
            id: String::new(),
            nome: String::new(),
            colore: COLORE_CATEGORIA_DEFAULT.to_string(),
        }
    }
}

/// Le categorie predefinite di Outlook, nell'ordine del riferimento:
/// Rosso · Blu · Verde · Arancione · Viola · Giallo.
pub fn categorie_predefinite() -> Vec<Categoria> {
    vec![
        Categoria { id: "rosso".into(), nome: "Rosso".into(), colore: "rosso".into() },
        Categoria { id: "blu".into(), nome: "Blu".into(), colore: "blu".into() },
        Categoria { id: "verde".into(), nome: "Verde".into(), colore: "verde".into() },
        Categoria { id: "arancione".into(), nome: "Arancione".into(), colore: "arancione".into() },
        Categoria { id: "viola".into(), nome: "Viola".into(), colore: "viola".into() },
        Categoria { id: "giallo".into(), nome: "Giallo".into(), colore: "giallo".into() },
    ]
}

/// Tiene solo le categorie sensate: nome non vuoto (altrimenti la voce è
/// scartata), id non vuoto (generato se assente: `categoria1`, `categoria2`, …),
/// niente id o nomi duplicati (vince la prima, senza badare alle maiuscole),
/// colore sconosciuto → default. Al massimo `CATEGORIE_MAX` voci. Serve a un
/// `config.json` modificato a mano. L'ordine è quello salvato.
pub fn normalizza_categorie(elenco: &[Categoria]) -> Vec<Categoria> {
    let mut out: Vec<Categoria> = Vec::new();
    let mut nomi_visti: Vec<String> = Vec::new();
    for (i, c) in elenco.iter().enumerate() {
        let nome = c.nome.trim().to_string();
        if nome.is_empty() {
            continue;
        }
        let nome_chiave = nome.to_lowercase();
        if nomi_visti.contains(&nome_chiave) {
            continue;
        }
        let id = if c.id.trim().is_empty() {
            format!("categoria{}", i + 1)
        } else {
            c.id.trim().to_string()
        };
        if out.iter().any(|x| x.id == id) {
            continue;
        }
        let colore = if COLORI_CATEGORIA.iter().any(|(k, _)| *k == c.colore) {
            c.colore.clone()
        } else {
            COLORE_CATEGORIA_DEFAULT.to_string()
        };
        nomi_visti.push(nome_chiave);
        out.push(Categoria { id, nome, colore });
        if out.len() >= CATEGORIE_MAX {
            break;
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Blocco P — Aspetto (colore accento) e Accessibilità (movimento ridotto,
// contrasto elevato, dimensioni del testo, etichette dei pulsanti).
//
// Etichette del riferimento: i pannelli si chiamano «Aspetto» e «Accessibilità»
// (`ZStrings.strings`, `/ERPreferencesWindow/Views/Appearance` e `…/Accessibility`).
// Le tinte dell'accento sono i valori misurati in
// `docs/riferimento-outlook/colori-misurati.md`; coincidono con i token CSS
// `--cat-*` e con `COLORI_CATEGORIA`. NIENTE segreti: solo scelte enumerative.
// ---------------------------------------------------------------------------

/// Tinte ammesse per il colore accento, nell'ordine del pannello. Sono le tinte
/// misurate dall'app reale: `blu` è `BlueButtonPrimaryBackgroundDefaultColor`
/// (#0078D4) e `GroupCardBlueColor`; le altre sono i preset categoria di Outlook.
pub const ACCENTI: [&str; 6] = ["blu", "verde", "viola", "rosso", "arancione", "giallo"];
/// Accento predefinito: il blu misurato.
pub const ACCENTO_DEFAULT: &str = "blu";

/// Scala del testo dell'interfaccia, in percentuale (100 = normale).
pub const SCALA_TESTO_DEFAULT: i64 = 100;
pub const SCALA_TESTO_MIN: i64 = 80;
pub const SCALA_TESTO_MAX: i64 = 150;

// ---------------------------------------------------------------------------
// Blocco Q — pannello «Contatti» (rubrica e completamento dei destinatari).
//
// Etichette del riferimento (`Preferences.Panes.AddressBook.strings`):
// «Ordina i risultati nel riquadro Ricerca contatti per:» (`Nome`, `Cognome`),
// «Formato indirizzo predefinito:», «Anteprima:». Il riquadro si chiama
// **Contatti** (`Preferences.Panes.All.strings`, voce 301). NIENTE segreti:
// solo scelte enumerative e un numero in un intervallo.
// ---------------------------------------------------------------------------

/// Campi di ordinamento della rubrica. `Nome` e `Cognome` sono le voci del
/// riferimento; `Azienda` è un campo del nostro modello (l'etichetta è già in
/// uso nella rubrica).
pub const ORDINAMENTI_RUBRICA: [&str; 3] = ["nome", "cognome", "azienda"];
/// Ordinamento predefinito della rubrica: per nome.
pub const ORDINAMENTO_RUBRICA_DEFAULT: &str = "nome";

/// Formati del nome visualizzato di un contatto: `Nome Cognome` (default),
/// `Cognome Nome`, oppure l'`Azienda` (con ripiego sul nome).
pub const FORMATI_NOME_CONTATTO: [&str; 3] = ["nome_cognome", "cognome_nome", "azienda"];
/// Formato predefinito del nome: «Nome Cognome».
pub const FORMATO_NOME_CONTATTO_DEFAULT: &str = "nome_cognome";

/// Numero di suggerimenti nel completamento dei destinatari e suo intervallo.
pub const CONTATTI_SUGGERIMENTI_DEFAULT: i64 = 8;
pub const CONTATTI_SUGGERIMENTI_MIN: i64 = 3;
pub const CONTATTI_SUGGERIMENTI_MAX: i64 = 20;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("impossibile leggere la configurazione: {0}")]
    Lettura(#[from] std::io::Error),
    #[error("impossibile interpretare il file di configurazione: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("il tema \"system|light|dark\" non accetta il valore \"{0}\"")]
    TemaNonValido(String),
    #[error("valore non ammesso per {campo}: \"{valore}\"")]
    PreferenzaNonValida { campo: String, valore: String },
}

/// Stato della configurazione letto dal disco.
pub struct Config {
    /// Preferenza tema: "system" | "light" | "dark".
    pub theme: String,
    /// Preferenze dell'assistente, della firma e della posta.
    pub preferenze: Preferenze,
}

/// Preferenze dell'utente oltre al tema: firma, assistente IA, lingue.
///
/// Tutti i campi hanno un default, quindi un `config.json` scritto prima di
/// questa milestone (senza la chiave `preferenze`) si carica senza errori e
/// produce i valori predefiniti (vedi `tests/config_test.rs`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferenze {
    /// Firma singola del mittente (testo) aggiunta alle nuove composizioni.
    /// Conservata per compatibilità: migrata in `firme` alla lettura.
    pub firma_del_mittente: String,
    /// Firme del mittente (più di una).
    pub firme: Vec<Firma>,
    /// Firma predefinita per account: id account → id firma.
    pub firma_predefinita_per_account: HashMap<String, String>,
    /// Cartella mostrata all'avvio della finestra principale.
    pub cartella_iniziale: String,
    /// Livello di protezione della posta indesiderata: "spenta" | "attiva".
    pub protezione_posta_indesiderata: String,
    /// Secondi Unix dell'ultima volta che la protezione ha agito durante la
    /// sincronizzazione (0 = mai). Lo aggiorna il kernel; il pannello lo mostra.
    pub protezione_ultima_azione: i64,
    /// Provider IA predefinito: "locale" oppure "cloud".
    pub provider_ia: String,
    /// Endpoint del motore locale (OpenAI-compatibile).
    pub endpoint_locale: String,
    /// Nome del modello locale.
    pub modello_locale: String,
    /// Nome del modello cloud (OpenRouter).
    pub modello_cloud: String,
    /// Chiedi conferma prima di ogni invio al cloud (attivo di default).
    pub consenso_richiesto: bool,
    /// Registra le richieste inviate al cloud (attivo di default).
    pub registro_attivo: bool,
    /// Controllo del tono attivo nella barra pre-invio (spento di default).
    pub controllo_tono_attivo: bool,
    /// Tono delle bozze: "formale" | "diretto" | "breve".
    pub tono_bozze: String,
    /// Lingua delle risposte dell'assistente.
    pub lingua_risposte: String,
    /// Lingua di traduzione dell'azione "traduci".
    pub lingua_traduzione: String,
    /// Avvia il modello locale all'apertura dell'app (spento di default).
    pub avvia_modello_all_apertura: bool,
    /// Comando con cui tentare di avviare il motore locale.
    pub comando_avvio_locale: String,
    // --- Blocco D: Lettura ---
    /// Posizione del pannello di lettura: "sotto" | "destra" | "nascosto".
    pub lettura_pannello: String,
    /// Segna come letto dopo N secondi dall'apertura (0 = mai).
    pub lettura_segna_letto_dopo: i64,
    /// Segna come letto un messaggio dopo che il mouse è rimasto 1 secondo sulla
    /// sua riga nella lista (attivo di default).
    pub lettura_segna_letto_al_passaggio: bool,
    /// Politica delle immagini: "mai" | "chiedi" | "sempre".
    pub lettura_immagini: String,
    /// Mostra l'anteprima del testo nella lista (spento di default).
    pub lettura_anteprima: bool,
    /// Scala del testo del messaggio letto, in percentuale (blocco R):
    /// i pulsanti A⁻/A⁺ del pannello di lettura la cambiano.
    pub lettura_zoom: i64,
    /// Rapporto lista/lettura del divisorio trascinabile, in 0..=1.
    pub split_rapporto: f64,
    // --- Blocco D: Composizione ---
    /// Formato predefinito: "html" | "testo".
    pub composizione_formato: String,
    /// A capo automatico nel corpo (attivo di default).
    pub composizione_a_capo: bool,
    /// Includi sempre il messaggio originale in Rispondi/Inoltra (attivo).
    pub composizione_includi_originale: bool,
    /// Apri le risposte in una nuova finestra invece che nella stessa (spento).
    pub composizione_nuova_finestra: bool,
    /// Famiglia di carattere predefinita del corpo.
    pub carattere_famiglia: String,
    /// Dimensione predefinita del corpo, in punti.
    pub carattere_dimensione: i64,
    // --- Blocco D: Correzione automatica ---
    /// Correzione automatica attiva mentre si scrive (attiva di default).
    pub correzione_automatica_attiva: bool,
    /// Tabella delle sostituzioni (`nn` → `non`, …).
    pub correzione_sostituzioni: Vec<Sostituzione>,
    // --- Blocco D: Ortografia ---
    /// Controllo ortografico del webview sul corpo (spento di default).
    pub ortografia_attiva: bool,
    /// Lingua suggerita al controllo ortografico (es. "it-IT").
    pub ortografia_lingua: String,
    // --- Blocco E: Notifiche e suoni ---
    /// Interruttore generale delle notifiche di sistema (attivo di default).
    pub notifiche_attive: bool,
    /// Mostra mittente e oggetto nella notifica (attivo di default). Spento,
    /// la notifica non rivela il contenuto: dice solo quanti messaggi sono
    /// arrivati.
    pub notifiche_anteprima: bool,
    /// Suono della notifica: uno di `SUONI_NOTIFICA` (`"nessuno"` = silenzio).
    pub notifiche_suono: String,
    /// «Non disturbare» attivo (spento di default).
    pub non_disturbare_attivo: bool,
    /// Inizio dell'intervallo di «non disturbare», formato `HH:MM`.
    pub non_disturbare_inizio: String,
    /// Fine dell'intervallo di «non disturbare», formato `HH:MM`.
    pub non_disturbare_fine: String,
    // --- Blocco H: conversazioni e regole locali ---
    /// Raggruppa i messaggi in conversazioni nella lista (attivo di default,
    /// come «Raggruppa per conversazione» del riferimento).
    pub raggruppa_conversazioni: bool,
    /// Regole locali applicate durante la sincronizzazione, in ordine di `ordine`.
    pub regole: Vec<Regola>,
    // --- Blocco I2: vista, composizione, conferme, impostazioni personali ---
    /// Campo di ordinamento della lista: uno di `ORDINAMENTI`.
    pub ordina_per: String,
    /// Verso dell'ordinamento: uno di `ORDINAMENTI_VERSO`.
    pub ordina_verso: String,
    /// Densità delle righe della lista: uno di `DENSITA`.
    pub densita_visualizzazione: String,
    /// Zoom del corpo di composizione, in percentuale.
    pub zoom_composizione: i64,
    /// Richiedi conferma di lettura nelle nuove composizioni (spento di default).
    pub conferma_lettura_default: bool,
    /// Richiedi conferma di recapito nelle nuove composizioni (spento di default).
    pub conferma_recapito_default: bool,
    /// Nome mostrato (impostazioni personali).
    pub personali_nome: String,
    /// Iniziali dell'utente (impostazioni personali), al massimo 3 caratteri.
    pub personali_iniziali: String,
    /// Indirizzo di risposta predefinito (campo `Reply-To`), vuoto = nessuno.
    pub risposta_predefinita: String,
    // --- Blocco J: più caselle ---
    /// Identificativo dell'account **predefinito** (quello aperto all'avvio).
    /// Vuoto = il primo account configurato. Vive qui e non dentro `Account`
    /// perché un `config.json` scritto prima del blocco J non ha il campo: un
    /// campo nuovo su `Account` (che non ha `default`) renderebbe illeggibili i
    /// file esistenti.
    pub account_predefinito: String,
    // --- Blocco N: Visualizza, Cerca, Sincronizzazione, Archiviazione ---
    /// Colore di sfondo della riga contrassegnata: uno di `COLORI_CONTRASSEGNATA`.
    pub visualizza_colore_contrassegnata: String,
    /// Ambito predefinito della ricerca: uno di `AMBITI_RICERCA`.
    pub ricerca_ambito: String,
    /// Numero massimo di risultati della ricerca (`RICERCA_LIMITE_MIN..MAX`).
    pub ricerca_limite: i64,
    /// Cerca mentre si digita (attivo di default). Spento, si cerca con Invio.
    pub ricerca_mentre_si_digita: bool,
    /// Intervallo di sincronizzazione automatica in minuti (0 = mai).
    pub sync_intervallo_minuti: i64,
    /// Esegue una sincronizzazione all'avvio dell'app (attivo di default: è il
    /// comportamento storico dell'app, che al lancio ha sempre sincronizzato).
    pub sync_all_avvio: bool,
    /// Soglia di avviso sulla dimensione della cache locale, in MB (0 = mai).
    pub archiviazione_avviso_mb: i64,
    // --- Blocco O: categorie definite dall'utente (nome + colore) ---
    /// Le categorie dell'utente, nell'ordine mostrato nel pannello. Predefinite:
    /// Rosso · Blu · Verde · Arancione · Viola · Giallo.
    pub categorie: Vec<Categoria>,
    // --- Blocco P: Aspetto e Accessibilità ---
    /// Colore accento dell'interfaccia: uno di `ACCENTI` (default `blu`).
    pub accento: String,
    /// Riduci movimento: spegne animazioni e transizioni (spento di default).
    pub accessibilita_movimento_ridotto: bool,
    /// Aumenta contrasto: bordi e testi secondari più marcati (spento di default).
    pub accessibilita_contrasto_elevato: bool,
    /// Mostra sempre le etichette dei pulsanti della barra multifunzione
    /// (attivo di default: è il comportamento normale dell'interfaccia).
    pub accessibilita_etichette_pulsanti: bool,
    /// Scala del testo dell'interfaccia, in percentuale (`SCALA_TESTO_MIN..MAX`).
    pub accessibilita_testo_scala: i64,
    // --- Blocco Q: pannello «Contatti» (rubrica e destinatari) ---
    /// Campo di ordinamento della rubrica: uno di `ORDINAMENTI_RUBRICA`.
    pub rubrica_ordinamento: String,
    /// Formato del nome visualizzato dei contatti: uno di `FORMATI_NOME_CONTATTO`.
    pub rubrica_formato_nome: String,
    /// Numero di suggerimenti nel completamento dei destinatari
    /// (`CONTATTI_SUGGERIMENTI_MIN..MAX`).
    pub contatti_suggerimenti_limite: i64,
}

impl Default for Preferenze {
    fn default() -> Self {
        Preferenze {
            firma_del_mittente: String::new(),
            firme: Vec::new(),
            firma_predefinita_per_account: HashMap::new(),
            cartella_iniziale: CARTELLA_INIZIALE_DEFAULT.to_string(),
            protezione_posta_indesiderata: PROTEZIONE_POSTA_DEFAULT.to_string(),
            protezione_ultima_azione: 0,
            provider_ia: PROVIDER_IA_DEFAULT.to_string(),
            // Default dell'endpoint e dei modelli: riusati dai costanti del
            // client IA, così non esistono due copie che possono divergere.
            endpoint_locale: crate::ai::client::ENDPOINT_LOCALE_DEFAULT.to_string(),
            modello_locale: crate::ai::MODELLO_LOCALE_DEFAULT.to_string(),
            modello_cloud: crate::ai::MODELLO_CLOUD_DEFAULT.to_string(),
            consenso_richiesto: true,
            registro_attivo: true,
            controllo_tono_attivo: false,
            tono_bozze: crate::ai::TONO_DEFAULT.to_string(),
            lingua_risposte: LINGUA_RISPOSTE_DEFAULT.to_string(),
            lingua_traduzione: crate::ai::LINGUA_DESTINAZIONE_DEFAULT.to_string(),
            avvia_modello_all_apertura: false,
            comando_avvio_locale: COMANDO_AVVIO_LOCALE_DEFAULT.to_string(),
            lettura_pannello: LETTURA_PANNELLO_DEFAULT.to_string(),
            lettura_segna_letto_dopo: 0,
            lettura_segna_letto_al_passaggio: true,
            lettura_immagini: LETTURA_IMMAGINI_DEFAULT.to_string(),
            lettura_anteprima: false,
            lettura_zoom: LETTURA_ZOOM_DEFAULT,
            split_rapporto: SPLIT_RAPPORTO_DEFAULT,
            composizione_formato: COMPOSIZIONE_FORMATO_DEFAULT.to_string(),
            composizione_a_capo: true,
            composizione_includi_originale: true,
            composizione_nuova_finestra: false,
            carattere_famiglia: CARATTERE_FAMIGLIA_DEFAULT.to_string(),
            carattere_dimensione: CARATTERE_DIMENSIONE_DEFAULT,
            correzione_automatica_attiva: true,
            correzione_sostituzioni: sostituzioni_predefinite(),
            ortografia_attiva: false,
            ortografia_lingua: ORTOGRAFIA_LINGUA_DEFAULT.to_string(),
            notifiche_attive: true,
            notifiche_anteprima: true,
            notifiche_suono: SUONO_NOTIFICA_DEFAULT.to_string(),
            non_disturbare_attivo: false,
            non_disturbare_inizio: NON_DISTURBARE_INIZIO_DEFAULT.to_string(),
            non_disturbare_fine: NON_DISTURBARE_FINE_DEFAULT.to_string(),
            raggruppa_conversazioni: true,
            regole: Vec::new(),
            ordina_per: ORDINAMENTO_DEFAULT.to_string(),
            ordina_verso: ORDINAMENTO_VERSO_DEFAULT.to_string(),
            densita_visualizzazione: DENSITA_DEFAULT.to_string(),
            zoom_composizione: ZOOM_COMPOSIZIONE_DEFAULT,
            conferma_lettura_default: false,
            conferma_recapito_default: false,
            personali_nome: String::new(),
            personali_iniziali: String::new(),
            risposta_predefinita: String::new(),
            account_predefinito: String::new(),
            visualizza_colore_contrassegnata: COLORE_CONTRASSEGNATA_DEFAULT.to_string(),
            ricerca_ambito: AMBITO_RICERCA_DEFAULT.to_string(),
            ricerca_limite: RICERCA_LIMITE_DEFAULT,
            ricerca_mentre_si_digita: true,
            sync_intervallo_minuti: SYNC_INTERVALLO_DEFAULT,
            sync_all_avvio: true,
            archiviazione_avviso_mb: ARCHIVIAZIONE_AVVISO_MB_DEFAULT,
            categorie: categorie_predefinite(),
            accento: ACCENTO_DEFAULT.to_string(),
            accessibilita_movimento_ridotto: false,
            accessibilita_contrasto_elevato: false,
            accessibilita_etichette_pulsanti: true,
            accessibilita_testo_scala: SCALA_TESTO_DEFAULT,
            rubrica_ordinamento: ORDINAMENTO_RUBRICA_DEFAULT.to_string(),
            rubrica_formato_nome: FORMATO_NOME_CONTATTO_DEFAULT.to_string(),
            contatti_suggerimenti_limite: CONTATTI_SUGGERIMENTI_DEFAULT,
        }
    }
}

impl Preferenze {
    /// Corregge i valori enumerativi sconosciuti (provider, tono) tornando al
    /// default, e svuota i campi testuali obbligatori se vuoti. Serve a un
    /// `config.json` modificato a mano: l'app non deve fallire a causa sua.
    pub fn normalizzata(mut self) -> Preferenze {
        if self.provider_ia != "locale" && self.provider_ia != "cloud" {
            self.provider_ia = PROVIDER_IA_DEFAULT.to_string();
        }
        if !matches!(self.tono_bozze.as_str(), "formale" | "diretto" | "breve") {
            self.tono_bozze = crate::ai::TONO_DEFAULT.to_string();
        }
        let d = Preferenze::default();
        if self.endpoint_locale.trim().is_empty() {
            self.endpoint_locale = d.endpoint_locale;
        }
        if self.modello_locale.trim().is_empty() {
            self.modello_locale = d.modello_locale;
        }
        if self.modello_cloud.trim().is_empty() {
            self.modello_cloud = d.modello_cloud;
        }
        if self.lingua_risposte.trim().is_empty() {
            self.lingua_risposte = d.lingua_risposte;
        }
        if self.lingua_traduzione.trim().is_empty() {
            self.lingua_traduzione = d.lingua_traduzione;
        }
        if self.comando_avvio_locale.trim().is_empty() {
            self.comando_avvio_locale = d.comando_avvio_locale;
        }
        // --- Blocco D: valori enumerativi, intervalli e testo obbligatorio ---
        if !PANNELLI_LETTURA.contains(&self.lettura_pannello.as_str()) {
            self.lettura_pannello = LETTURA_PANNELLO_DEFAULT.to_string();
        }
        if !MODI_IMMAGINI.contains(&self.lettura_immagini.as_str()) {
            self.lettura_immagini = LETTURA_IMMAGINI_DEFAULT.to_string();
        }
        if !FORMATI_COMPOSIZIONE.contains(&self.composizione_formato.as_str()) {
            self.composizione_formato = COMPOSIZIONE_FORMATO_DEFAULT.to_string();
        }
        // Secondi negativi o troppo alti: 0 = mai, al massimo SEGNA_LETTO_SECONDI_MAX.
        if self.lettura_segna_letto_dopo < 0 {
            self.lettura_segna_letto_dopo = 0;
        }
        if self.lettura_segna_letto_dopo > SEGNA_LETTO_SECONDI_MAX {
            self.lettura_segna_letto_dopo = SEGNA_LETTO_SECONDI_MAX;
        }
        if !(LETTURA_ZOOM_MIN..=LETTURA_ZOOM_MAX).contains(&self.lettura_zoom) {
            self.lettura_zoom = LETTURA_ZOOM_DEFAULT;
        }
        if !(0.0..=1.0).contains(&self.split_rapporto) {
            self.split_rapporto = SPLIT_RAPPORTO_DEFAULT;
        }
        if !(CARATTERE_DIMENSIONE_MIN..=CARATTERE_DIMENSIONE_MAX)
            .contains(&self.carattere_dimensione)
        {
            self.carattere_dimensione = CARATTERE_DIMENSIONE_DEFAULT;
        }
        if self.carattere_famiglia.trim().is_empty() {
            self.carattere_famiglia = CARATTERE_FAMIGLIA_DEFAULT.to_string();
        }
        if self.ortografia_lingua.trim().is_empty() {
            self.ortografia_lingua = ORTOGRAFIA_LINGUA_DEFAULT.to_string();
        }
        self.correzione_sostituzioni = normalizza_sostituzioni(&self.correzione_sostituzioni);
        // --- Blocco D, seconda metà ---
        // Le firme si normalizzano qui; la migrazione dalla firma singola è
        // "in lettura" (`firme_effettive`), così il file salvato resta quello
        // che è e un round-trip non cambia.
        self.firme = normalizza_firme(&self.firme);
        // La firma predefinita di un account deve puntare a una firma esistente.
        let firme = self.firme.clone();
        self.firma_predefinita_per_account
            .retain(|_, fid| firme.iter().any(|f| &f.id == fid));
        if !PROTEZIONI_POSTA.contains(&self.protezione_posta_indesiderata.as_str()) {
            self.protezione_posta_indesiderata = PROTEZIONE_POSTA_DEFAULT.to_string();
        }
        if self.cartella_iniziale.trim().is_empty() {
            self.cartella_iniziale = CARTELLA_INIZIALE_DEFAULT.to_string();
        }
        if self.protezione_ultima_azione < 0 {
            self.protezione_ultima_azione = 0;
        }
        // --- Blocco E: notifiche e suoni ---
        if !SUONI_NOTIFICA.contains(&self.notifiche_suono.as_str()) {
            self.notifiche_suono = SUONO_NOTIFICA_DEFAULT.to_string();
        }
        if !orario_valido(&self.non_disturbare_inizio) {
            self.non_disturbare_inizio = NON_DISTURBARE_INIZIO_DEFAULT.to_string();
        }
        if !orario_valido(&self.non_disturbare_fine) {
            self.non_disturbare_fine = NON_DISTURBARE_FINE_DEFAULT.to_string();
        }
        // --- Blocco H: le regole si normalizzano qui (ordine, id, azioni). ---
        self.regole = normalizza_regole(&self.regole);
        // --- Blocco I2: vista, zoom, impostazioni personali ---
        if !ORDINAMENTI.contains(&self.ordina_per.as_str()) {
            self.ordina_per = ORDINAMENTO_DEFAULT.to_string();
        }
        if !ORDINAMENTI_VERSO.contains(&self.ordina_verso.as_str()) {
            self.ordina_verso = ORDINAMENTO_VERSO_DEFAULT.to_string();
        }
        if !DENSITA.contains(&self.densita_visualizzazione.as_str()) {
            self.densita_visualizzazione = DENSITA_DEFAULT.to_string();
        }
        if !(ZOOM_COMPOSIZIONE_MIN..=ZOOM_COMPOSIZIONE_MAX).contains(&self.zoom_composizione) {
            self.zoom_composizione = ZOOM_COMPOSIZIONE_DEFAULT;
        }
        // Le iniziali sono al massimo 3 caratteri: si tengono i primi utili.
        self.personali_iniziali = normalizza_iniziali(&self.personali_iniziali);
        // --- Blocco N: Visualizza, Cerca, Sincronizzazione, Archiviazione ---
        if !COLORI_CONTRASSEGNATA.contains(&self.visualizza_colore_contrassegnata.as_str()) {
            self.visualizza_colore_contrassegnata = COLORE_CONTRASSEGNATA_DEFAULT.to_string();
        }
        if !AMBITI_RICERCA.contains(&self.ricerca_ambito.as_str()) {
            self.ricerca_ambito = AMBITO_RICERCA_DEFAULT.to_string();
        }
        if !(RICERCA_LIMITE_MIN..=RICERCA_LIMITE_MAX).contains(&self.ricerca_limite) {
            self.ricerca_limite = RICERCA_LIMITE_DEFAULT;
        }
        if self.sync_intervallo_minuti < 0 {
            self.sync_intervallo_minuti = 0;
        }
        if self.sync_intervallo_minuti > SYNC_INTERVALLO_MAX {
            self.sync_intervallo_minuti = SYNC_INTERVALLO_MAX;
        }
        if self.archiviazione_avviso_mb < 0 {
            self.archiviazione_avviso_mb = 0;
        }
        if self.archiviazione_avviso_mb > ARCHIVIAZIONE_AVVISO_MB_MAX {
            self.archiviazione_avviso_mb = ARCHIVIAZIONE_AVVISO_MB_MAX;
        }
        // --- Blocco O: le categorie si normalizzano qui (id, nome, colore). ---
        self.categorie = normalizza_categorie(&self.categorie);
        // --- Blocco P: accento e accessibilità ---
        if !ACCENTI.contains(&self.accento.as_str()) {
            self.accento = ACCENTO_DEFAULT.to_string();
        }
        // La scala del testo si riporta dentro l'intervallo ammesso (come i
        // secondi di "segna come letto" e l'intervallo di sincronizzazione).
        if self.accessibilita_testo_scala < SCALA_TESTO_MIN {
            self.accessibilita_testo_scala = SCALA_TESTO_MIN;
        }
        if self.accessibilita_testo_scala > SCALA_TESTO_MAX {
            self.accessibilita_testo_scala = SCALA_TESTO_MAX;
        }
        // --- Blocco Q: rubrica e destinatari ---
        if !ORDINAMENTI_RUBRICA.contains(&self.rubrica_ordinamento.as_str()) {
            self.rubrica_ordinamento = ORDINAMENTO_RUBRICA_DEFAULT.to_string();
        }
        if !FORMATI_NOME_CONTATTO.contains(&self.rubrica_formato_nome.as_str()) {
            self.rubrica_formato_nome = FORMATO_NOME_CONTATTO_DEFAULT.to_string();
        }
        if !(CONTATTI_SUGGERIMENTI_MIN..=CONTATTI_SUGGERIMENTI_MAX)
            .contains(&self.contatti_suggerimenti_limite)
        {
            self.contatti_suggerimenti_limite = CONTATTI_SUGGERIMENTI_DEFAULT;
        }
        self
    }
}

/// Normalizza le iniziali: senza spazi, al massimo 3 caratteri, in maiuscolo.
pub fn normalizza_iniziali(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_whitespace())
        .take(3)
        .flat_map(|c| c.to_uppercase())
        .collect()
}

/// Valida le preferenze prima di scriverle: i valori enumerativi e i campi
/// obbligatori devono essere sensati. Restituisce un errore leggibile.
pub fn valida(p: &Preferenze) -> Result<()> {
    let enumerativi: [(&str, &str, &[&str]); 15] = [
        ("providerIa", &p.provider_ia, &["locale", "cloud"]),
        ("tonoBozze", &p.tono_bozze, &["formale", "diretto", "breve"]),
        ("letturaPannello", &p.lettura_pannello, &PANNELLI_LETTURA),
        ("letturaImmagini", &p.lettura_immagini, &MODI_IMMAGINI),
        (
            "composizioneFormato",
            &p.composizione_formato,
            &FORMATI_COMPOSIZIONE,
        ),
        (
            "protezionePostaIndesiderata",
            &p.protezione_posta_indesiderata,
            &PROTEZIONI_POSTA,
        ),
        ("notificheSuono", &p.notifiche_suono, &SUONI_NOTIFICA),
        ("ordinaPer", &p.ordina_per, &ORDINAMENTI),
        ("ordinaVerso", &p.ordina_verso, &ORDINAMENTI_VERSO),
        (
            "densitaVisualizzazione",
            &p.densita_visualizzazione,
            &DENSITA,
        ),
        (
            "visualizzaColoreContrassegnata",
            &p.visualizza_colore_contrassegnata,
            &COLORI_CONTRASSEGNATA,
        ),
        ("ricercaAmbito", &p.ricerca_ambito, &AMBITI_RICERCA),
        ("accento", &p.accento, &ACCENTI),
        ("rubricaOrdinamento", &p.rubrica_ordinamento, &ORDINAMENTI_RUBRICA),
        ("rubricaFormatoNome", &p.rubrica_formato_nome, &FORMATI_NOME_CONTATTO),
    ];
    for (campo, valore, ammessi) in enumerativi {
        if !ammessi.contains(&valore) {
            return Err(ConfigError::PreferenzaNonValida {
                campo: campo.to_string(),
                valore: valore.to_string(),
            });
        }
    }
    // Gli orari di «non disturbare» devono essere nel formato HH:MM.
    for (campo, valore) in [
        ("nonDisturbareInizio", &p.non_disturbare_inizio),
        ("nonDisturbareFine", &p.non_disturbare_fine),
    ] {
        if !orario_valido(valore) {
            return Err(ConfigError::PreferenzaNonValida {
                campo: campo.to_string(),
                valore: valore.to_string(),
            });
        }
    }
    // Lo zoom della composizione deve restare nell'intervallo ammesso.
    if !(ZOOM_COMPOSIZIONE_MIN..=ZOOM_COMPOSIZIONE_MAX).contains(&p.zoom_composizione) {
        return Err(ConfigError::PreferenzaNonValida {
            campo: "zoomComposizione".to_string(),
            valore: p.zoom_composizione.to_string(),
        });
    }
    if !(LETTURA_ZOOM_MIN..=LETTURA_ZOOM_MAX).contains(&p.lettura_zoom) {
        return Err(ConfigError::PreferenzaNonValida {
            campo: "letturaZoom".to_string(),
            valore: p.lettura_zoom.to_string(),
        });
    }
    if !(0.0..=1.0).contains(&p.split_rapporto) {
        return Err(ConfigError::PreferenzaNonValida {
            campo: "splitRapporto".to_string(),
            valore: p.split_rapporto.to_string(),
        });
    }
    // Blocco N: intervalli numerici ammessi.
    for (campo, valore, min, max) in [
        (
            "ricercaLimite",
            p.ricerca_limite,
            RICERCA_LIMITE_MIN,
            RICERCA_LIMITE_MAX,
        ),
        (
            "syncIntervalloMinuti",
            p.sync_intervallo_minuti,
            0,
            SYNC_INTERVALLO_MAX,
        ),
        (
            "archiviazioneAvvisoMb",
            p.archiviazione_avviso_mb,
            0,
            ARCHIVIAZIONE_AVVISO_MB_MAX,
        ),
        (
            "accessibilitaTestoScala",
            p.accessibilita_testo_scala,
            SCALA_TESTO_MIN,
            SCALA_TESTO_MAX,
        ),
        (
            "contattiSuggerimentiLimite",
            p.contatti_suggerimenti_limite,
            CONTATTI_SUGGERIMENTI_MIN,
            CONTATTI_SUGGERIMENTI_MAX,
        ),
    ] {
        if valore < min || valore > max {
            return Err(ConfigError::PreferenzaNonValida {
                campo: campo.to_string(),
                valore: valore.to_string(),
            });
        }
    }
    let obbligatori: [(&str, &str); 9] = [
        ("endpointLocale", &p.endpoint_locale),
        ("modelloLocale", &p.modello_locale),
        ("modelloCloud", &p.modello_cloud),
        ("linguaRisposte", &p.lingua_risposte),
        ("linguaTraduzione", &p.lingua_traduzione),
        ("comandoAvvioLocale", &p.comando_avvio_locale),
        ("carattereFamiglia", &p.carattere_famiglia),
        ("ortografiaLingua", &p.ortografia_lingua),
        ("cartellaIniziale", &p.cartella_iniziale),
    ];
    for (campo, valore) in obbligatori {
        if valore.trim().is_empty() {
            return Err(ConfigError::PreferenzaNonValida {
                campo: campo.to_string(),
                valore: String::new(),
            });
        }
    }
    // Le firme devono avere un id non vuoto e non ripetuto: sono riferite dalla
    // firma predefinita per account.
    let mut id_visti: Vec<&str> = Vec::new();
    for f in &p.firme {
        let id = f.id.trim();
        if id.is_empty() || id_visti.contains(&id) {
            return Err(ConfigError::PreferenzaNonValida {
                campo: "firme".to_string(),
                valore: id.to_string(),
            });
        }
        id_visti.push(id);
    }
    // Le regole devono avere id univoci, condizioni «con allegato» ammesse e
    // azioni solo fra i tipi dichiarati (una «sposta» senza destinazione è un
    // errore: non si saprebbe dove spostare).
    let mut id_regola: Vec<&str> = Vec::new();
    for r in &p.regole {
        let id = r.id.trim();
        if id.is_empty() || id_regola.contains(&id) {
            return Err(ConfigError::PreferenzaNonValida {
                campo: "regole".to_string(),
                valore: id.to_string(),
            });
        }
        id_regola.push(id);
        if !ALLEGATO_CONDIZIONI.contains(&r.condizioni.allegato.as_str()) {
            return Err(ConfigError::PreferenzaNonValida {
                campo: "regolaAllegato".to_string(),
                valore: r.condizioni.allegato.clone(),
            });
        }
        for a in &r.azioni {
            if !TIPI_AZIONE.contains(&a.tipo.as_str()) {
                return Err(ConfigError::PreferenzaNonValida {
                    campo: "regolaAzione".to_string(),
                    valore: a.tipo.clone(),
                });
            }
            if a.tipo == "sposta" && a.valore.trim().is_empty() {
                return Err(ConfigError::PreferenzaNonValida {
                    campo: "regolaAzione".to_string(),
                    valore: "sposta senza destinazione".to_string(),
                });
            }
        }
    }
    // Le categorie devono avere id e nome non vuoti, id univoci e una tinta
    // ammessa: un id vuoto o un colore inventato non si saprebbero mostrare.
    let mut id_categoria: Vec<&str> = Vec::new();
    for c in &p.categorie {
        let id = c.id.trim();
        if id.is_empty() || c.nome.trim().is_empty() || id_categoria.contains(&id) {
            return Err(ConfigError::PreferenzaNonValida {
                campo: "categorie".to_string(),
                valore: id.to_string(),
            });
        }
        id_categoria.push(id);
        if !COLORI_CATEGORIA.iter().any(|(k, _)| *k == c.colore) {
            return Err(ConfigError::PreferenzaNonValida {
                campo: "categoriaColore".to_string(),
                valore: c.colore.clone(),
            });
        }
    }
    Ok(())
}

/// Un account di posta. La password NON è tra i campi: sta nel Keychain.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub description: String,
    pub full_name: String,
    pub email: String,
    pub username: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_ssl: bool,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_ssl: bool,
}

/// Struttura del file config.json: tema + elenco account (senza password) +
/// preferenze. I campi mancanti prendono il default, così un file scritto da una
/// versione precedente resta valido.
#[derive(Debug, Default, Serialize, Deserialize)]
struct ConfigFile {
    #[serde(default)]
    theme: Option<String>,
    #[serde(default)]
    accounts: Vec<Account>,
    #[serde(default)]
    preferenze: Preferenze,
}

/// Percorso del file di configurazione dentro `dir`.
pub fn config_path(dir: &Path) -> PathBuf {
    dir.join(CONFIG_FILE)
}

/// Legge il file di configurazione; se manca, usa i default (tema "system").
fn leggi_file(dir: &Path) -> Result<ConfigFile> {
    let path = config_path(dir);
    if !path.exists() {
        return Ok(ConfigFile::default());
    }
    let raw = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&raw)?)
}

/// Scrive il file di configurazione in modo atomico: prima su un file
/// temporaneo, poi rename sopra il file definitivo.
fn scrivi_file(dir: &Path, dati: &ConfigFile) -> Result<()> {
    fs::create_dir_all(dir)?;
    let tmp = dir.join(format!("{CONFIG_FILE}.tmp"));
    {
        let mut f = fs::File::create(&tmp)?;
        let json = serde_json::to_string_pretty(dati)?;
        f.write_all(json.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, config_path(dir))?;
    Ok(())
}

/// Carica la configurazione; il tema di default è "system" quando il file manca.
pub fn load_from(dir: &Path) -> Result<Config> {
    let dati = leggi_file(dir)?;
    Ok(Config {
        theme: dati.theme.unwrap_or_else(|| "system".to_string()),
        preferenze: dati.preferenze.normalizzata(),
    })
}

/// Imposta il tema ("system" | "light" | "dark") e lo persiste in modo atomico.
pub fn set_theme(dir: &Path, tema: &str) -> Result<()> {
    match tema {
        "system" | "light" | "dark" => {}
        altro => return Err(ConfigError::TemaNonValido(altro.to_string())),
    }
    let mut dati = leggi_file(dir)?;
    dati.theme = Some(tema.to_string());
    scrivi_file(dir, &dati)
}

/// Salva (o aggiorna) un account nella configurazione. Nessuna password tocca il disco.
pub fn save_account(dir: &Path, account: &Account) -> Result<()> {
    let mut dati = leggi_file(dir)?;
    dati.accounts.retain(|a| a.id != account.id);
    dati.accounts.push(account.clone());
    scrivi_file(dir, &dati)
}

/// Carica tutti gli account dalla configurazione.
pub fn load_accounts(dir: &Path) -> Vec<Account> {
    leggi_file(dir).map(|d| d.accounts).unwrap_or_default()
}

/// Elimina un account dalla configurazione. Restituisce `true` se c'era.
///
/// **Cosa fa ai dati**: tocca **solo** la voce dell'account indicato. Se era
/// l'account predefinito, la preferenza `accountPredefinito` viene azzerata
/// (così l'avvio non punta a un id inesistente). Gli altri account e le loro
/// preferenze restano intatti. La password, che vive solo nel Keychain, la
/// cancella il comando `account_elimina`.
pub fn elimina_account(dir: &Path, id: &str) -> Result<bool> {
    let mut dati = leggi_file(dir)?;
    let prima = dati.accounts.len();
    dati.accounts.retain(|a| a.id != id);
    let rimosso = dati.accounts.len() != prima;
    if rimosso && dati.preferenze.account_predefinito == id {
        dati.preferenze.account_predefinito = String::new();
    }
    scrivi_file(dir, &dati)?;
    Ok(rimosso)
}

/// Segna l'account predefinito (quello aperto all'avvio). Con `id` vuoto la
/// preferenza si azzera (torna il primo account configurato).
pub fn set_account_predefinito(dir: &Path, id: &str) -> Result<()> {
    let mut p = load_preferenze(dir);
    p.account_predefinito = id.trim().to_string();
    save_preferenze(dir, &p)
}

/// L'account predefinito, se configurato **e** esistente; altrimenti il primo
/// account configurato. `None` se non c'è nessun account.
pub fn account_predefinito(dir: &Path) -> Option<Account> {
    let accounts = load_accounts(dir);
    let scelto = load_preferenze(dir).account_predefinito;
    if !scelto.is_empty() {
        if let Some(a) = accounts.iter().find(|a| a.id == scelto) {
            return Some(a.clone());
        }
    }
    accounts.into_iter().next()
}

/// Carica le preferenze (con i default applicati e i valori enumerativi
/// sconosciuti corretti). Non fallisce mai: un file illeggibile dà i default.
pub fn load_preferenze(dir: &Path) -> Preferenze {
    leggi_file(dir)
        .map(|d| d.preferenze.normalizzata())
        .unwrap_or_default()
}

/// Valida e salva le preferenze, preservando tema e account già presenti.
pub fn save_preferenze(dir: &Path, p: &Preferenze) -> Result<()> {
    valida(p)?;
    let mut dati = leggi_file(dir)?;
    dati.preferenze = p.clone();
    scrivi_file(dir, &dati)
}

/// Alias per il `Result` del modulo.
pub type Result<T> = std::result::Result<T, ConfigError>;

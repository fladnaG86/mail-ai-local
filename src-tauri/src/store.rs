//! Cache locale SQLite con ricerca full-text (task 3.3, Milestone 3).
//!
//! Le intestazioni dei messaggi vengono salvate così come arrivano dal server
//! (`upsert_header`), mentre il corpo è scaricato su richiesta (`set_body`).
//! Un indice FTS5 esterno alla tabella `messages` (con trigger di
//! sincronizzazione) permette la ricerca su soggetto, mittente e corpo.

use std::path::Path;

use rusqlite::{params, params_from_iter, types::Value, Connection, OptionalExtension};

use crate::ricerca::{self, Query};

/// Errore del modulo di cache.
#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    /// Errore proveniente da SQLite.
    #[error("errore SQLite: {0}")]
    Sqlite(#[from] rusqlite::Error),

    /// Errore di I/O sulla creazione del file o delle cartelle.
    #[error("errore di I/O: {0}")]
    Io(#[from] std::io::Error),

    /// Errore di formato sulle categorie salvate come JSON.
    #[error("errore nel formato delle categorie: {0}")]
    Categorie(String),

    /// Errore sui dati di un contatto (per esempio l'indirizzo email mancante).
    #[error("errore nel contatto: {0}")]
    Contatto(String),

    /// Errore sui dati di un invito di riunione (per esempio l'UID mancante).
    #[error("errore nell'invito: {0}")]
    Invito(String),
}

/// Risultato delle operazioni di cache.
pub type Result<T> = std::result::Result<T, StoreError>;

/// Intestazione di un messaggio (una riga di `messages`, senza il corpo).
#[derive(Debug, Clone)]
pub struct Header {
    pub account: String,
    pub folder: String,
    pub uid: String,
    pub message_id: Option<String>,
    pub subject: Option<String>,
    pub sender: Option<String>,
    pub recipients: Option<String>,
    pub date: i64,
    pub seen: bool,
    pub has_attachments: bool,
    pub thread_key: Option<String>,
    /// `In-Reply-To` del messaggio (base del raggruppamento in conversazioni).
    pub in_reply_to: Option<String>,
    /// Campo `References` grezzo, quando disponibile.
    pub references: Option<String>,
}

/// Riga restituita da `list` e `search`: intestazione senza il corpo scaricato.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessageRow {
    pub id: i64,
    pub account: String,
    pub folder: String,
    pub uid: String,
    pub message_id: Option<String>,
    pub subject: Option<String>,
    pub sender: Option<String>,
    pub recipients: Option<String>,
    pub date: i64,
    pub seen: bool,
    pub has_attachments: bool,
    pub thread_key: Option<String>,
    /// Testo del corpo in cache (se già scaricato): serve all'anteprima in lista
    /// quando la preferenza `letturaAnteprima` è attiva. `None` finché il corpo
    /// non è stato scaricato.
    pub body_text: Option<String>,
}

/// Messaggio di un thread per la costruzione del contesto IA: intestazione
/// essenziale più il testo del corpo, quando già in cache.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThreadRow {
    pub folder: String,
    pub uid: String,
    pub subject: Option<String>,
    pub sender: Option<String>,
    pub date: i64,
    pub body_text: Option<String>,
}

/// Riga restituita dalla ricerca (blocco B): i campi che l'interfaccia disegna
/// nella lista dei risultati, più l'anteprima attorno alla corrispondenza.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RigaRicerca {
    /// Casella di provenienza. La ricerca **non** filtra per account — attraversa
    /// tutte le caselle — e due caselle possono avere lo stesso `uid`: senza
    /// questo campo ogni azione su un risultato in vista aggregata non saprebbe
    /// da dove pescare il messaggio (`accountDi`, `src/main.js`). Stessa ragione
    /// del gemello in `MailRow` (`src-tauri/src/lib.rs`).
    pub account: String,
    pub folder: String,
    pub uid: String,
    pub subject: Option<String>,
    pub sender: Option<String>,
    pub date: i64,
    pub seen: bool,
    pub has_attachments: bool,
    pub flagged: bool,
    pub completato: bool,
    /// Categorie salvate come JSON grezzo (la decodifica la fa il comando IPC).
    pub categorie: Option<String>,
    /// Frammento di testo attorno alla corrispondenza, termine fra « ».
    pub anteprima: String,
}

/// Esito della ricerca: le righe e l'eventuale avviso di ripiego.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EsitoRicercaStore {
    pub righe: Vec<RigaRicerca>,
    /// Valorizzato quando FTS5 ha rifiutato l'espressione e si è ripiegati
    /// sulla ricerca per sottostringa.
    pub nota: Option<String>,
}

/// Riga del registro delle richieste IA inviate al cloud (`ai_audit`).
/// Non contiene mai il testo, solo la sua impronta SHA-256.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditEntry {
    /// Secondi dall'epoca Unix.
    pub timestamp: i64,
    pub provider: String,
    pub modello: String,
    pub azione: String,
    pub prompt_version: String,
    pub hash_testo: String,
}

/// Riga del registro letta dal database, con il suo identificatore.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditRow {
    pub id: i64,
    pub timestamp: i64,
    pub provider: String,
    pub modello: String,
    pub azione: String,
    pub prompt_version: String,
    pub hash_testo: String,
}

/// Riga della rubrica dei contatti (tabella `contatti`). L'email è la chiave
/// logica: è salvata e confrontata in minuscolo, senza duplicati.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContattoRow {
    pub id: i64,
    pub nome: String,
    pub cognome: String,
    pub email: String,
    pub telefono: String,
    pub azienda: String,
    pub note: String,
    pub creato: i64,
    pub modificato: i64,
    /// Blocco U (vedi `contatti::Contatto`).
    pub ruolo: String,
    pub indirizzo: String,
    pub email_altre: Vec<crate::contatti::Recapito>,
    pub telefoni: Vec<crate::contatti::Recapito>,
    pub origine: String,
}

/// Dati per salvare un contatto della rubrica. `id` assente = nuovo contatto.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContattoInput {
    pub id: Option<i64>,
    pub nome: String,
    pub cognome: String,
    pub email: String,
    pub telefono: String,
    pub azienda: String,
    pub note: String,
    pub ruolo: String,
    pub indirizzo: String,
    pub email_altre: Vec<crate::contatti::Recapito>,
    pub telefoni: Vec<crate::contatti::Recapito>,
    pub origine: String,
}

/// Colonne di `contatti` lette da `contatto_from`, nell'ordine.
const CONTATTO_COLONNE: &str = "id, nome, cognome, email, telefono, azienda, note, creato, \
     modificato, ruolo, indirizzo, email_altre, telefoni, origine";

/// Colonne aggiunte a `contatti` dal blocco U (migrate come quelle di `messages`).
const COLONNE_CONTATTI_AGGIUNTE: &[(&str, &str)] = &[
    ("ruolo", "TEXT NOT NULL DEFAULT ''"),
    ("indirizzo", "TEXT NOT NULL DEFAULT ''"),
    ("email_altre", "TEXT NOT NULL DEFAULT '[]'"),
    ("telefoni", "TEXT NOT NULL DEFAULT '[]'"),
    ("origine", "TEXT NOT NULL DEFAULT ''"),
];

/// Email «altre» normalizzate: minuscole, senza vuote, senza la principale e
/// senza doppioni (vince la prima etichetta).
fn normalizza_email_altre(
    altre: &[crate::contatti::Recapito],
    principale: &str,
) -> Vec<crate::contatti::Recapito> {
    let mut out: Vec<crate::contatti::Recapito> = Vec::new();
    for r in altre {
        let valore = r.valore.trim().to_ascii_lowercase();
        if valore.is_empty() || valore == principale || out.iter().any(|x| x.valore == valore) {
            continue;
        }
        out.push(crate::contatti::Recapito { etichetta: r.etichetta.trim().to_string(), valore });
    }
    out
}

/// Telefoni «in più» senza vuoti né doppioni.
fn normalizza_telefoni(telefoni: &[crate::contatti::Recapito]) -> Vec<crate::contatti::Recapito> {
    let mut out: Vec<crate::contatti::Recapito> = Vec::new();
    for r in telefoni {
        let valore = r.valore.trim().to_string();
        if valore.is_empty() || out.iter().any(|x| x.valore == valore) {
            continue;
        }
        out.push(crate::contatti::Recapito { etichetta: r.etichetta.trim().to_string(), valore });
    }
    out
}

fn json_recapiti(r: &[crate::contatti::Recapito]) -> String {
    serde_json::to_string(r).unwrap_or_else(|_| "[]".to_string())
}

/// Una riga della tabella `inviti` (blocco G, versione inviti).
///
/// Le date sono in secondi dall'epoca Unix; `invitati` è l'elenco JSON degli
/// invitati (la decodifica la fa chi chiama); `uscita` è vero per un invito
/// creato da noi (a un proprio invito non si risponde).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvitoRiga {
    pub id: i64,
    pub uid: String,
    pub sequenza: i64,
    pub oggetto: String,
    pub organizzatore: String,
    pub organizzatore_nome: String,
    pub inizio: i64,
    pub fine: Option<i64>,
    pub luogo: String,
    pub giornata_intera: bool,
    pub stato: String,
    pub metodo: String,
    pub rrule: Option<String>,
    pub descrizione: String,
    /// Elenco JSON degli invitati.
    pub invitati: String,
    pub cartella: String,
    pub uid_messaggio: String,
    pub uscita: bool,
}

/// Dati di un messaggio in cache utili al raggruppamento in conversazioni.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThreadInputRow {
    pub uid: String,
    pub message_id: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
    pub subject: Option<String>,
}

/// Una conversazione raggruppata in una cartella: la riga unica mostrata in
/// lista (con il numero di messaggi e quanti non letti) e i suoi messaggi.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RigaConversazione {
    /// Chiave del gruppo (thread_key, oppure `uid:<uid>` per una riga isolata).
    pub chiave: String,
    /// Account di provenienza dei messaggi della conversazione (blocco J): nella
    /// lista aggregata «Tutti gli account» due account possono avere la stessa
    /// chiave, quindi l'account distingue le righe.
    pub account: String,
    /// Quanti messaggi contiene la conversazione.
    pub numero: usize,
    /// Quanti messaggi non letti contiene.
    pub non_letti: usize,
    /// UID del messaggio più recente (quello mostrato come rappresentante).
    pub uid: String,
    pub subject: Option<String>,
    pub sender: Option<String>,
    pub date: i64,
    /// Vero se **tutti** i messaggi della conversazione sono letti.
    pub seen: bool,
    /// Vero se **almeno un** messaggio ha allegati.
    pub has_attachments: bool,
    /// Testo del corpo del messaggio più recente, se già in cache.
    pub body_text: Option<String>,
    /// I messaggi della conversazione, in ordine cronologico (dal più vecchio).
    pub messaggi: Vec<MessageRow>,
}

/// Dati di un messaggio che il motore delle regole deve valutare.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessaggioRegoleRow {
    pub uid: String,
    pub mittente: Option<String>,
    pub oggetto: Option<String>,
    pub destinatario: Option<String>,
    pub corpo: Option<String>,
    pub ha_allegati: bool,
}

/// Schema dello store: tabella dei messaggi, indice FTS5 esterno e trigger
/// che tengono l'indice allineato a ogni INSERT/UPDATE/DELETE.
///
/// Oltre alle colonne storiche, `messages` porta lo stato delle operazioni sui
/// messaggi (blocco A): `flagged` (contrassegnato), `completato` (locale) e
/// `categorie` (elenco JSON). I database creati prima di queste colonne vengono
/// migrati da `migra` con `ALTER TABLE ... ADD COLUMN`.
const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, account TEXT, folder TEXT, uid TEXT, message_id TEXT,
  subject TEXT, sender TEXT, recipients TEXT, date INTEGER, seen INTEGER DEFAULT 0,
  has_attachments INTEGER DEFAULT 0, thread_key TEXT, body_text TEXT, body_html TEXT,
  flagged INTEGER DEFAULT 0, completato INTEGER DEFAULT 0, categorie TEXT,
  in_reply_to TEXT, references_hdr TEXT, regole_applicate INTEGER DEFAULT 0,
  UNIQUE(account, folder, uid));

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(subject, sender, body_text,
  content='messages', content_rowid='id');

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, subject, sender, body_text)
  VALUES (new.id, new.subject, new.sender, new.body_text);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, subject, sender, body_text)
  VALUES ('delete', old.id, old.subject, old.sender, old.body_text);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, subject, sender, body_text)
  VALUES ('delete', old.id, old.subject, old.sender, old.body_text);
  INSERT INTO messages_fts(rowid, subject, sender, body_text)
  VALUES (new.id, new.subject, new.sender, new.body_text);
END;

CREATE TABLE IF NOT EXISTS ai_audit (
  id INTEGER PRIMARY KEY, timestamp INTEGER, provider TEXT, modello TEXT,
  azione TEXT, prompt_version TEXT, hash_testo TEXT);

CREATE TABLE IF NOT EXISTS mittenti_bloccati (
  indirizzo TEXT PRIMARY KEY, aggiunto INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS contatti (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL DEFAULT '', cognome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE, telefono TEXT NOT NULL DEFAULT '', azienda TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '', creato INTEGER NOT NULL DEFAULT 0,
  modificato INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS inviti (
  id INTEGER PRIMARY KEY, uid TEXT NOT NULL UNIQUE, sequenza INTEGER DEFAULT 0,
  oggetto TEXT NOT NULL DEFAULT '', organizzatore TEXT NOT NULL DEFAULT '',
  organizzatore_nome TEXT NOT NULL DEFAULT '',
  inizio INTEGER NOT NULL DEFAULT 0, fine INTEGER,
  luogo TEXT NOT NULL DEFAULT '', giornata_intera INTEGER DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'in_attesa', metodo TEXT NOT NULL DEFAULT 'REQUEST',
  rrule TEXT, descrizione TEXT NOT NULL DEFAULT '', invitati TEXT NOT NULL DEFAULT '[]',
  cartella TEXT NOT NULL DEFAULT '', uid_messaggio TEXT NOT NULL DEFAULT '',
  uscita INTEGER DEFAULT 0, creato INTEGER DEFAULT 0, aggiornato INTEGER DEFAULT 0);

-- Blocco I1: registro delle cartelle conosciute (nome dal server) e delle
-- preferite; la barra laterale mostra le preferite in alto. Blocco L: il
-- registro è **per account** (chiave `(account, nome)`): due caselle con una
-- cartella omonima non condividono la preferenza. L'account vuoto (`''`) è
-- quello delle righe storiche, creato prima del blocco L.
CREATE TABLE IF NOT EXISTS cartelle (
  account TEXT NOT NULL DEFAULT '', nome TEXT NOT NULL,
  preferita INTEGER DEFAULT 0, aggiornato INTEGER DEFAULT 0,
  PRIMARY KEY (account, nome));

-- Blocco I1: conversazioni ignorate, per `thread_key`. Un messaggio di una
-- conversazione ignorata viene segnato letto e spostato in Posta eliminata
-- durante la sincronizzazione; la voce «Non ignorare più» lo riattiva.
-- Blocco L: la scelta è **per account** (chiave `(account, thread_key)`):
-- ignorare una conversazione in una casella non la ignora nell'altra.
CREATE TABLE IF NOT EXISTS conversazioni_ignorate (
  account TEXT NOT NULL DEFAULT '', thread_key TEXT NOT NULL, creato INTEGER DEFAULT 0,
  PRIMARY KEY (account, thread_key));

-- Blocco I2: scelte dell'utente sulle conferme di lettura/recapito richieste da
-- un messaggio in arrivo. `tipo` è "lettura" oppure "recapito"; `inviata` dice
-- se l'utente ha scelto di inviare la conferma o di non inviarla. Serve a non
-- richiedere due volte la stessa scelta e a sapere che è già stata decisa.
-- Blocco L: la scelta è **per account** (chiave `(account, folder, uid, tipo)`):
-- la stessa coppia cartella+UID in due caselle non condivide la decisione.
CREATE TABLE IF NOT EXISTS conferme (
  account TEXT NOT NULL DEFAULT '', folder TEXT NOT NULL, uid TEXT NOT NULL, tipo TEXT NOT NULL,
  inviata INTEGER NOT NULL DEFAULT 0, creato INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account, folder, uid, tipo));
"#;

/// Colonne aggiunte dopo la prima versione dello schema, con il tipo SQL.
/// Sono applicate in modo idempotente da `migra`.
const COLONNE_AGGIUNTE: &[(&str, &str)] = &[
    ("flagged", "INTEGER DEFAULT 0"),
    ("completato", "INTEGER DEFAULT 0"),
    ("categorie", "TEXT"),
    ("indesiderato", "INTEGER DEFAULT 0"),
    ("in_reply_to", "TEXT"),
    ("references_hdr", "TEXT"),
    ("regole_applicate", "INTEGER DEFAULT 0"),
    ("scadenza", "TEXT"),
    ("immagini_consentite", "INTEGER DEFAULT 0"),
];

/// Colonne delle intestazioni, usate dalle query di lettura.
const ROW_COLUMNS: &str = "id, account, folder, uid, message_id, subject, sender, \
     recipients, date, seen, has_attachments, thread_key, body_text";

/// Cache locale dei messaggi.
pub struct Store {
    conn: Connection,
}

impl Store {
    /// Apre (o crea) il database al percorso indicato e applica lo schema.
    ///
    /// Le cartelle intermedie mancanti vengono create; lo schema è idempotente,
    /// quindi chiamare `open` su un database esistente lo migra senza perdere dati.
    pub fn open(path: &Path) -> Result<Store> {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)?;
            }
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        migra(&conn)?;
        Ok(Store { conn })
    }

    /// Inserisce o aggiorna una intestazione, in modo idempotente sull'unicità
    /// `(account, folder, uid)`. Restituisce l'`id` della riga interessata.
    ///
    /// Lo stato `seen` non viene mai riportato a "non letto": un nuovo sync non
    /// deve annullare una lettura già avvenuta.
    pub fn upsert_header(&self, h: &Header) -> Result<i64> {
        let id: i64 = self.conn.query_row(
            "INSERT INTO messages
                (account, folder, uid, message_id, subject, sender, recipients,
                 date, seen, has_attachments, thread_key, in_reply_to, references_hdr)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(account, folder, uid) DO UPDATE SET
                message_id = excluded.message_id,
                subject = excluded.subject,
                sender = excluded.sender,
                recipients = excluded.recipients,
                date = excluded.date,
                seen = MAX(messages.seen, excluded.seen),
                has_attachments = excluded.has_attachments,
                thread_key = excluded.thread_key,
                in_reply_to = excluded.in_reply_to,
                references_hdr = excluded.references_hdr
             RETURNING id",
            params![
                h.account,
                h.folder,
                h.uid,
                h.message_id,
                h.subject,
                h.sender,
                h.recipients,
                h.date,
                h.seen,
                h.has_attachments,
                h.thread_key,
                h.in_reply_to,
                h.references,
            ],
            |row| row.get(0),
        )?;
        Ok(id)
    }

    /// Salva il corpo scaricato su richiesta. L'aggiornamento passa dal trigger
    /// di UPDATE, quindi il nuovo testo entra subito nell'indice di ricerca.
    pub fn set_body(&self, id: i64, text: &str, html: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET body_text = ?2, body_html = ?3 WHERE id = ?1",
            params![id, text, html],
        )?;
        Ok(())
    }

    /// Registra la scelta dell'utente su una conferma richiesta (blocco I2).
    /// `tipo` è `"lettura"` oppure `"recapito"`; `inviata` dice se la conferma va
    /// inviata (vero) o no (falso). Una seconda scelta sullo stesso messaggio e
    /// tipo **sovrascrive** la precedente: non si accumulano righe. Blocco L: la
    /// scelta è **per account**, così la stessa coppia cartella+UID in due caselle
    /// non condivide la decisione.
    pub fn conferma_registra(
        &self,
        account: &str,
        folder: &str,
        uid: &str,
        tipo: &str,
        inviata: bool,
        adesso: i64,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO conferme (account, folder, uid, tipo, inviata, creato)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(account, folder, uid, tipo) DO UPDATE SET inviata = excluded.inviata, \
             creato = excluded.creato",
            params![account, folder, uid, tipo, inviata as i64, adesso],
        )?;
        Ok(())
    }

    /// Le scelte già registrate per un messaggio **di un account**, come elenco
    /// `(tipo, inviata)`. Un messaggio senza scelte registrate restituisce un
    /// elenco vuoto. Blocco L: chiavata sull'account.
    pub fn conferme_scelte(&self, account: &str, folder: &str, uid: &str) -> Result<Vec<(String, bool)>> {
        let mut stmt = self.conn.prepare(
            "SELECT tipo, inviata FROM conferme
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3 ORDER BY tipo",
        )?;
        let rows = stmt.query_map(params![account, folder, uid], |row| {
            let tipo: String = row.get(0)?;
            let inviata: i64 = row.get(1)?;
            Ok((tipo, inviata != 0))
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Cerca in soggetto, mittente e corpo, ordinata per data discendente.
    ///
    /// La query dell'utente è trasformata in una serie di termini quotati uniti
    /// in AND, così che caratteri speciali di FTS5 non producano errori di sintassi.
    pub fn search(&self, query: &str) -> Result<Vec<MessageRow>> {
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }
        let match_query = fts_match_query(query);
        let sql = format!(
            "SELECT {cols} FROM messages m
             WHERE m.id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?1)
             ORDER BY m.date DESC, m.id DESC",
            cols = ROW_COLUMNS
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![match_query], row_from)?;
        collect_rows(rows)
    }

    /// Ricerca in stile Outlook (blocco B) sull'indice FTS5 esistente.
    ///
    /// Il testo libero dell'utente viene passato così com'è a `MATCH`, così
    /// restano disponibili gli operatori di FTS5. Se FTS5 rifiuta l'espressione
    /// (errore di sintassi) **non si va in errore**: si ripiega su una ricerca
    /// per sottostringa (`LIKE`, con AND fra le parole) e lo si dichiara in
    /// `nota`. I prefissi `da:`, `oggetto:`, `con:allegato`, `non:letto` sono
    /// applicati come filtri aggiuntivi. `limite` è il numero massimo di righe.
    pub fn cerca(&self, testo: &str, limite: usize) -> Result<EsitoRicercaStore> {
        let q = ricerca::analizza_query(testo);
        let limite = if limite == 0 { 50 } else { limite };
        let testo_libero = q.testo.trim().to_string();

        if testo_libero.is_empty() {
            // Solo prefissi (es. `non:letto`): nessun MATCH, si filtra e basta.
            let righe = self.cerca_con_match(&q, &testo_libero, limite, MatchKind::Sottostringa)?;
            return Ok(EsitoRicercaStore { righe, nota: None });
        }

        match self.cerca_con_match(&q, &testo_libero, limite, MatchKind::Fts) {
            Ok(righe) => Ok(EsitoRicercaStore { righe, nota: None }),
            Err(StoreError::Sqlite(_)) => {
                // FTS5 ha rifiutato la query: ripiego per sottostringa, dichiarato.
                let righe =
                    self.cerca_con_match(&q, &testo_libero, limite, MatchKind::Sottostringa)?;
                Ok(EsitoRicercaStore {
                    righe,
                    nota: Some(
                        "Espressione di ricerca non valida per l'indice full-text: \
                         ho cercato per sottostringa."
                            .to_string(),
                    ),
                })
            }
            Err(e) => Err(e),
        }
    }

    /// Esegue una ricerca con il tipo di confronto indicato e i filtri dei
    /// prefissi. Estratta così il ripiego riusa la stessa costruzione di query.
    fn cerca_con_match(
        &self,
        q: &Query,
        testo_libero: &str,
        limite: usize,
        kind: MatchKind,
    ) -> Result<Vec<RigaRicerca>> {
        let mut sql = String::from(
            "SELECT m.account, m.folder, m.uid, m.subject, m.sender, m.date, m.seen, \
             m.has_attachments, m.flagged, m.completato, m.categorie, m.body_text \
             FROM messages m WHERE 1=1",
        );
        let mut valori: Vec<Value> = Vec::new();

        if !testo_libero.trim().is_empty() {
            match kind {
                MatchKind::Fts => {
                    sql.push_str(
                        " AND m.id IN (SELECT rowid FROM messages_fts \
                         WHERE messages_fts MATCH ?)",
                    );
                    valori.push(Value::Text(ricerca::espressione_fts(testo_libero)));
                }
                MatchKind::Sottostringa => {
                    for parola in ricerca::parole_sottostringa(testo_libero) {
                        sql.push_str(
                            " AND (lower(m.subject) LIKE ? OR lower(m.sender) LIKE ? \
                             OR lower(m.body_text) LIKE ?)",
                        );
                        let schema = format!("%{}%", parola.to_lowercase());
                        valori.push(Value::Text(schema.clone()));
                        valori.push(Value::Text(schema.clone()));
                        valori.push(Value::Text(schema));
                    }
                }
            }
        }
        if let Some(da) = &q.da {
            sql.push_str(" AND lower(m.sender) LIKE ?");
            valori.push(Value::Text(format!("%{}%", da.to_lowercase())));
        }
        if let Some(oggetto) = &q.oggetto {
            sql.push_str(" AND lower(m.subject) LIKE ?");
            valori.push(Value::Text(format!("%{}%", oggetto.to_lowercase())));
        }
        if let Some(a) = &q.a {
            sql.push_str(" AND lower(m.recipients) LIKE ?");
            valori.push(Value::Text(format!("%{}%", a.to_lowercase())));
        }
        if q.con_allegato {
            sql.push_str(" AND m.has_attachments = 1");
        }
        if q.senza_allegato {
            sql.push_str(" AND m.has_attachments = 0");
        }
        if q.non_letto {
            sql.push_str(" AND m.seen = 0");
        }
        if let Some(dopo) = q.dopo {
            sql.push_str(" AND m.date >= ?");
            valori.push(Value::Integer(dopo));
        }
        if let Some(prima) = q.prima {
            // `prima:` esclude il giorno indicato: si confronta con l'inizio del
            // giorno successivo, così il periodo «da/a» include le date estreme.
            sql.push_str(" AND m.date < ?");
            valori.push(Value::Integer(prima + 86_400));
        }
        sql.push_str(" ORDER BY m.date DESC, m.id DESC LIMIT ?");
        valori.push(Value::Integer(limite as i64));

        let termine = q.termine_evidenza();
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(valori.iter()), |row| {
            let subject: Option<String> = row.get(3)?;
            let body: Option<String> = row.get(11)?;
            Ok(RigaRicerca {
                account: row.get(0)?,
                folder: row.get(1)?,
                uid: row.get(2)?,
                subject: subject.clone(),
                sender: row.get(4)?,
                date: row.get(5)?,
                seen: row.get(6)?,
                has_attachments: row.get(7)?,
                flagged: row.get(8)?,
                completato: row.get(9)?,
                categorie: row.get(10)?,
                anteprima: ricerca::anteprima(body.as_deref(), subject.as_deref(), &termine),
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Conta **tutti** i messaggi in cache, di ogni cartella e account (blocco N,
    /// per il pannello «Archiviazione»).
    pub fn conta_tutti(&self) -> Result<i64> {
        let n: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0))?;
        Ok(n)
    }

    /// Conta i messaggi di una cartella.
    pub fn count(&self, folder: &str) -> Result<i64> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE folder = ?1",
            params![folder],
            |row| row.get(0),
        )?;
        Ok(n)
    }

    /// Restituisce una pagina di messaggi di una cartella, ordinati per data
    /// discendente (prima i più recenti).
    pub fn list(&self, folder: &str, offset: usize, limit: usize) -> Result<Vec<MessageRow>> {
        let sql = format!(
            "SELECT {cols} FROM messages
             WHERE folder = ?1
             ORDER BY date DESC, id DESC
             LIMIT ?2 OFFSET ?3",
            cols = ROW_COLUMNS
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![folder, limit as i64, offset as i64], row_from)?;
        collect_rows(rows)
    }

    /// Pagina di messaggi di una cartella, ordinata secondo le preferenze della
    /// vista (blocco I2): campo (`data`/`mittente`/`oggetto`/`dimensione`) e
    /// verso (`crescente`/`discendente`). Campo o verso sconosciuti ricadono sul
    /// default (data discendente), così una preferenza scritta male non rompe.
    pub fn list_ordinato(
        &self,
        folder: &str,
        offset: usize,
        limit: usize,
        campo: &str,
        verso: &str,
    ) -> Result<Vec<MessageRow>> {
        let ord = ordinamento_sql(campo, verso);
        let sql = format!(
            "SELECT {cols} FROM messages m
             WHERE m.folder = ?1
             ORDER BY {ord}
             LIMIT ?2 OFFSET ?3",
            cols = ROW_COLUMNS,
            ord = ord
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![folder, limit as i64, offset as i64], row_from)?;
        collect_rows(rows)
    }

    // -----------------------------------------------------------------------
    // Blocco J — più caselle: liste e conteggi per account, e aggregati.
    // -----------------------------------------------------------------------

    /// Pagina di messaggi di **un solo account** in una cartella, ordinata come
    /// `list_ordinato`. È la lettura della casella selezionata nella barra
    /// laterale raggruppata per account.
    pub fn list_per_account(
        &self,
        account: &str,
        folder: &str,
        offset: usize,
        limit: usize,
        campo: &str,
        verso: &str,
    ) -> Result<Vec<MessageRow>> {
        let ord = ordinamento_sql(campo, verso);
        let sql = format!(
            "SELECT {cols} FROM messages m
             WHERE m.account = ?1 AND m.folder = ?2
             ORDER BY {ord}
             LIMIT ?3 OFFSET ?4",
            cols = ROW_COLUMNS,
            ord = ord
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(
            params![account, folder, limit as i64, offset as i64],
            row_from,
        )?;
        collect_rows(rows)
    }

    /// Pagina di messaggi di una cartella **su tutti gli account**: è la vista
    /// «Tutti gli account → Posta in arrivo», ordinata per data (o secondo la
    /// preferenza di vista). Ogni riga porta il suo `account` di provenienza.
    /// Con **un solo account** la tabella dei messaggi contiene solo le sue
    /// righe, quindi il risultato coincide riga per riga con
    /// `list_per_account` / `list_ordinato` (test di non regressione).
    pub fn list_tutti_gli_account(
        &self,
        folder: &str,
        offset: usize,
        limit: usize,
        campo: &str,
        verso: &str,
    ) -> Result<Vec<MessageRow>> {
        let ord = ordinamento_sql(campo, verso);
        let sql = format!(
            "SELECT {cols} FROM messages m
             WHERE m.folder = ?1
             ORDER BY {ord}
             LIMIT ?2 OFFSET ?3",
            cols = ROW_COLUMNS,
            ord = ord
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![folder, limit as i64, offset as i64], row_from)?;
        collect_rows(rows)
    }

    /// Numero di messaggi di un account in una cartella.
    pub fn count_per_account(&self, account: &str, folder: &str) -> Result<i64> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE account = ?1 AND folder = ?2",
            params![account, folder],
            |row| row.get(0),
        )?;
        Ok(n)
    }

    /// Numero di messaggi di una cartella su tutti gli account.
    pub fn count_tutti_gli_account(&self, folder: &str) -> Result<i64> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE folder = ?1",
            params![folder],
            |row| row.get(0),
        )?;
        Ok(n)
    }

    /// Le cartelle di un account **presenti in cache**, con il numero di
    /// messaggi **non letti** di ciascuna. Serve alla barra laterale raggruppata
    /// per account (blocco J): i conteggi vengono dalla cache, non da una stima.
    /// Ordinate per nome (case-insensitive).
    pub fn cartelle_per_account(&self, account: &str) -> Result<Vec<(String, u32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT folder, SUM(CASE WHEN seen = 0 THEN 1 ELSE 0 END) \
             FROM messages WHERE account = ?1 \
             GROUP BY folder ORDER BY lower(folder) ASC",
        )?;
        let rows = stmt.query_map(params![account], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (nome, non_letti) = row?;
            out.push((nome, non_letti.max(0) as u32));
        }
        Ok(out)
    }

    /// Elimina **solo** i messaggi dell'account indicato dalla cache locale.
    ///
    /// Non tocca le righe degli altri account, né la configurazione, né la
    /// tabella `cartelle`. Restituisce quante righe ha rimosso. È la parte dati
    /// di `account_elimina` (la voce di configurazione la rimuove `config`).
    pub fn elimina_account(&self, account: &str) -> Result<usize> {
        let n = self.conn.execute(
            "DELETE FROM messages WHERE account = ?1",
            params![account],
        )?;
        Ok(n)
    }

    /// UID piu alto gia presente in cache per (account, folder). `None` se la
    /// cartella non ha ancora nulla: serve al sync per sapere da dove ripartire.
    pub fn max_uid(&self, account: &str, folder: &str) -> Result<Option<u32>> {
        let massimo: Option<i64> = self.conn.query_row(
            "SELECT MAX(CAST(uid AS INTEGER)) FROM messages WHERE account = ?1 AND folder = ?2",
            params![account, folder],
            |row| row.get(0),
        )?;
        Ok(massimo.map(|n| n as u32))
    }

    /// Testo del corpo salvato in cache per un messaggio (identificato dall'UID),
    /// se e gia stato scaricato. `None` quando il corpo non e ancora in cache.
    pub fn body_by_uid(&self, uid: &str) -> Result<Option<String>> {
        let testo: Option<Option<String>> = self
            .conn
            .query_row(
                "SELECT body_text FROM messages WHERE uid = ?1 LIMIT 1",
                params![uid],
                |row| row.get(0),
            )
            .optional()?;
        Ok(testo.flatten())
    }

    /// Messaggi del thread a cui appartiene `(account, folder, uid)`, in ordine
    /// cronologico (dal più vecchio al più recente), con il corpo se in cache.
    ///
    /// Quando `thread_key` è valorizzato si prendono tutti i messaggi che la
    /// condividono **nello stesso account e nella stessa cartella** (le chiavi per
    /// oggetto non sono univoche fra cartelle né fra caselle); se è assente (un
    /// database vecchio) si ripiega sul solo messaggio richiesto. Vuoto se il
    /// messaggio non è in cache. Blocco K: confinato all'account.
    pub fn thread_messages(&self, account: &str, folder: &str, uid: &str) -> Result<Vec<ThreadRow>> {
        let thread_key: Option<String> = self
            .conn
            .query_row(
                "SELECT thread_key FROM messages \
                 WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3 LIMIT 1",
                params![account, folder, uid],
                |row| row.get(0),
            )
            .optional()?
            .flatten();

        let ha_thread = thread_key.is_some();
        let (sql, chiave) = match thread_key {
            Some(k) => (
                "SELECT folder, uid, subject, sender, date, body_text FROM messages
                 WHERE thread_key = ?1 AND folder = ?2 AND COALESCE(account, '') = ?3
                 ORDER BY date ASC, id ASC",
                k,
            ),
            None => (
                "SELECT folder, uid, subject, sender, date, body_text FROM messages
                 WHERE folder = ?1 AND uid = ?2 AND COALESCE(account, '') = ?3
                 ORDER BY date ASC, id ASC",
                String::new(),
            ),
        };

        let mut stmt = self.conn.prepare(sql)?;
        let mut out = Vec::new();
        if ha_thread {
            let rows = stmt.query_map(params![chiave, folder, account], recipe_thread)?;
            for row in rows {
                out.push(row?);
            }
        } else {
            let rows = stmt.query_map(params![folder, uid, account], recipe_thread)?;
            for row in rows {
                out.push(row?);
            }
        }
        Ok(out)
    }

    /// Scrive una riga nel registro delle richieste IA; restituisce l'id.
    /// Il registro non contiene mai il testo, solo l'impronta SHA-256.
    pub fn audit_log(&self, e: &AuditEntry) -> Result<i64> {
        let id = self.conn.query_row(
            "INSERT INTO ai_audit
                (timestamp, provider, modello, azione, prompt_version, hash_testo)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             RETURNING id",
            params![
                e.timestamp,
                e.provider,
                e.modello,
                e.azione,
                e.prompt_version,
                e.hash_testo,
            ],
            |row| row.get(0),
        )?;
        Ok(id)
    }

    /// Legge tutte le righe del registro, in ordine di inserimento.
    pub fn audit_all(&self) -> Result<Vec<AuditRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, provider, modello, azione, prompt_version, hash_testo
             FROM ai_audit ORDER BY id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(AuditRow {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                provider: row.get(2)?,
                modello: row.get(3)?,
                azione: row.get(4)?,
                prompt_version: row.get(5)?,
                hash_testo: row.get(6)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Legge le ultime `limite` righe del registro, dalla più recente. Serve
    /// all'elenco delle richieste cloud nelle impostazioni (Milestone 8): la
    /// lettura completa non è necessaria e il limite tiene la risposta piccola.
    pub fn audit_last(&self, limite: usize) -> Result<Vec<AuditRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, provider, modello, azione, prompt_version, hash_testo
             FROM ai_audit ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limite as i64], |row| {
            Ok(AuditRow {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                provider: row.get(2)?,
                modello: row.get(3)?,
                azione: row.get(4)?,
                prompt_version: row.get(5)?,
                hash_testo: row.get(6)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
    // -----------------------------------------------------------------------
    // Operazioni sui messaggi (blocco A): stato locale della cache. Sono
    // aggiornate solo DOPO che il server ha confermato, tranne "completato" e le
    // categorie, che sono locali e valgono anche offline.
    // -----------------------------------------------------------------------

    /// Imposta lo stato di lettura della riga in cache (dopo il "sì" del server).
    ///
    /// Blocco K: la riga è identificata da `(account, folder, uid)` — due caselle
    /// con la stessa cartella e lo stesso UID restano righe distinte.
    pub fn set_seen(&self, account: &str, folder: &str, uid: &str, letto: bool) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET seen = ?4 \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid, letto],
        )?;
        Ok(())
    }

    /// Registra che l'utente ha scelto «Mostra immagini» per questo messaggio:
    /// le volte successive il corpo arriva già con le immagini e il pulsante
    /// non si ripropone. Una riga assente dalla cache non è un errore.
    pub fn consenti_immagini(&self, account: &str, folder: &str, uid: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET immagini_consentite = 1 \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid],
        )?;
        Ok(())
    }

    /// Vero se per questo messaggio le immagini remote sono già state consentite.
    pub fn immagini_consentite(&self, account: &str, folder: &str, uid: &str) -> Result<bool> {
        let valore: Option<i64> = self
            .conn
            .query_row(
                "SELECT immagini_consentite FROM messages \
                 WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
                params![account, folder, uid],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        Ok(valore.unwrap_or(0) != 0)
    }

    /// Imposta il contrassegno (`\Flagged`) della riga in cache (per account).
    pub fn set_flagged(
        &self,
        account: &str,
        folder: &str,
        uid: &str,
        contrassegnato: bool,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET flagged = ?4 \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid, contrassegnato],
        )?;
        Ok(())
    }

    /// Imposta il contrassegno "completato". È uno stato locale: non tocca il
    /// server e vale anche offline. Confinato all'account (blocco K).
    pub fn set_completato(
        &self,
        account: &str,
        folder: &str,
        uid: &str,
        completato: bool,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET completato = ?4 \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid, completato],
        )?;
        Ok(())
    }

    /// Salva le categorie come elenco JSON. Un elenco vuoto le rimuove (NULL).
    /// Confinato all'account (blocco K).
    pub fn set_categorie(
        &self,
        account: &str,
        folder: &str,
        uid: &str,
        categorie: &[String],
    ) -> Result<()> {
        let valore: Option<String> = if categorie.is_empty() {
            None
        } else {
            Some(
                serde_json::to_string(categorie)
                    .map_err(|e| StoreError::Categorie(e.to_string()))?,
            )
        };
        self.conn.execute(
            "UPDATE messages SET categorie = ?4 \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid, valore],
        )?;
        Ok(())
    }

    /// Legge le categorie salvate (elenco vuoto se assenti). Per account.
    pub fn categorie(&self, account: &str, folder: &str, uid: &str) -> Result<Vec<String>> {
        let grezzo: Option<Option<String>> = self
            .conn
            .query_row(
                "SELECT categorie FROM messages \
                 WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3 LIMIT 1",
                params![account, folder, uid],
                |row| row.get(0),
            )
            .optional()?;
        match grezzo.flatten() {
            Some(s) if !s.trim().is_empty() => {
                serde_json::from_str(&s).map_err(|e| StoreError::Categorie(e.to_string()))
            }
            _ => Ok(Vec::new()),
        }
    }

    /// Legge lo stato "completato" (falso se la riga non esiste). Per account.
    pub fn completato(&self, account: &str, folder: &str, uid: &str) -> Result<bool> {
        let valore: Option<Option<i64>> = self
            .conn
            .query_row(
                "SELECT completato FROM messages \
                 WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3 LIMIT 1",
                params![account, folder, uid],
                |row| row.get(0),
            )
            .optional()?;
        Ok(valore.flatten().unwrap_or(0) != 0)
    }

    /// Legge il contrassegno (`\Flagged`) dalla cache. Per account.
    pub fn flagged(&self, account: &str, folder: &str, uid: &str) -> Result<bool> {
        let valore: Option<Option<i64>> = self
            .conn
            .query_row(
                "SELECT flagged FROM messages \
                 WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3 LIMIT 1",
                params![account, folder, uid],
                |row| row.get(0),
            )
            .optional()?;
        Ok(valore.flatten().unwrap_or(0) != 0)
    }

    /// Sposta una riga dalla cartella di partenza a quella di destinazione.
    /// Confinato all'account (blocco K).
    pub fn sposta(
        &self,
        account: &str,
        folder: &str,
        uid: &str,
        destinazione: &str,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET folder = ?4 \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid, destinazione],
        )?;
        Ok(())
    }

    /// Rimuove la riga dalla cache (eliminazione definitiva sul server). Per account.
    pub fn rimuovi(&self, account: &str, folder: &str, uid: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM messages \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid],
        )?;
        Ok(())
    }

    /// Mittente della riga, come salvato dal sync ("Nome <utente@host>").
    /// Per account (blocco K).
    pub fn mittente(&self, account: &str, folder: &str, uid: &str) -> Result<Option<String>> {
        let valore: Option<Option<String>> = self
            .conn
            .query_row(
                "SELECT sender FROM messages \
                 WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3 LIMIT 1",
                params![account, folder, uid],
                |row| row.get(0),
            )
            .optional()?;
        Ok(valore.flatten())
    }

    /// Aggiunge un indirizzo all'elenco dei mittenti bloccati. È idempotente:
    /// lo stesso indirizzo (in minuscolo) non viene mai duplicato.
    pub fn aggiungi_mittente_bloccato(&self, indirizzo: &str) -> Result<()> {
        let normalizzato = indirizzo.trim().to_ascii_lowercase();
        if normalizzato.is_empty() {
            return Ok(());
        }
        self.conn.execute(
            "INSERT OR IGNORE INTO mittenti_bloccati (indirizzo) VALUES (?1)",
            params![normalizzato],
        )?;
        Ok(())
    }

    /// Elenco dei mittenti bloccati, in ordine alfabetico.
    pub fn mittenti_bloccati(&self) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT indirizzo FROM mittenti_bloccati ORDER BY indirizzo ASC")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Toglie un indirizzo dall'elenco dei mittenti bloccati e restituisce quanti
    /// indirizzi ha rimosso. Sbloccare un indirizzo **non** bloccato non è un
    /// errore: restituisce 0.
    pub fn rimuovi_mittente_bloccato(&self, indirizzo: &str) -> Result<usize> {
        let normalizzato = indirizzo.trim().to_ascii_lowercase();
        if normalizzato.is_empty() {
            return Ok(0);
        }
        let n = self.conn.execute(
            "DELETE FROM mittenti_bloccati WHERE indirizzo = ?1",
            params![normalizzato],
        )?;
        Ok(n)
    }

    /// Vero se l'indirizzo (normalizzato in minuscolo) è fra i bloccati.
    pub fn mittente_bloccato(&self, indirizzo: &str) -> Result<bool> {
        let normalizzato = indirizzo.trim().to_ascii_lowercase();
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM mittenti_bloccati WHERE indirizzo = ?1",
            params![normalizzato],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// Marca (o smarca) un messaggio come indesiderato in cache. È lo stato che la
    /// protezione applica ai mittenti bloccati quando non li sposta. Per account.
    pub fn set_indesiderato(
        &self,
        account: &str,
        folder: &str,
        uid: &str,
        indesiderato: bool,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET indesiderato = ?4 \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid, indesiderato],
        )?;
        Ok(())
    }

    /// Stato "indesiderato" di un messaggio (falso se la riga non esiste). Per account.
    pub fn indesiderato(&self, account: &str, folder: &str, uid: &str) -> Result<bool> {
        let valore: Option<Option<i64>> = self
            .conn
            .query_row(
                "SELECT indesiderato FROM messages \
                 WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3 LIMIT 1",
                params![account, folder, uid],
                |row| row.get(0),
            )
            .optional()?;
        Ok(valore.flatten().unwrap_or(0) != 0)
    }

    /// UID e mittente dei messaggi di una cartella il cui indirizzo è fra i
    /// bloccati. Serve alla protezione durante la sincronizzazione. Per account
    /// (blocco K): la protezione di una casella non tocca le righe omonime di
    /// un'altra.
    pub fn messaggi_da_mittenti_bloccati(
        &self,
        account: &str,
        folder: &str,
    ) -> Result<Vec<(String, String)>> {
        let bloccati = self.mittenti_bloccati()?;
        if bloccati.is_empty() {
            return Ok(Vec::new());
        }
        let mut stmt = self.conn.prepare(
            "SELECT uid, sender FROM messages \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND sender IS NOT NULL",
        )?;
        let rows = stmt.query_map(params![account, folder], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (uid, sender) = row?;
            if let Some(ind) = crate::mail::ops::estrai_indirizzo(&sender) {
                if bloccati.contains(&ind) {
                    out.push((uid, sender));
                }
            }
        }
        Ok(out)
    }

    /// Svuota la cache dei **messaggi**: non tocca il registro `ai_audit` né
    /// l'elenco dei mittenti bloccati. Restituisce quanti messaggi ha rimosso.
    pub fn svuota_messaggi(&self) -> Result<usize> {
        let n = self.conn.execute("DELETE FROM messages", [])?;
        Ok(n)
    }

    /// Svuota il registro delle richieste IA. Restituisce quante righe ha rimosso.
    pub fn svuota_registro(&self) -> Result<usize> {
        let n = self.conn.execute("DELETE FROM ai_audit", [])?;
        Ok(n)
    }

    // -----------------------------------------------------------------------
    // Rubrica dei contatti (blocco F): tabella `contatti`, chiave logica email
    // in minuscolo. Nessun doppione: salvare un indirizzo già presente aggiorna
    // la riga esistente.
    // -----------------------------------------------------------------------

    /// Elenco dei contatti, in ordine alfabetico per cognome, nome, email.
    ///
    /// Con `filtro` valorizzato si tengono solo i contatti in cui il testo
    /// (senza distinzione fra maiuscole e minuscole) compare in nome, cognome,
    /// email o azienda.
    pub fn contatti(&self, filtro: Option<&str>) -> Result<Vec<ContattoRow>> {
        let mut sql = format!("SELECT {CONTATTO_COLONNE} FROM contatti");
        let mut valori: Vec<Value> = Vec::new();
        if let Some(f) = filtro.map(str::trim).filter(|f| !f.is_empty()) {
            sql.push_str(
                " WHERE lower(nome) LIKE ?1 OR lower(cognome) LIKE ?1 \
                 OR lower(email) LIKE ?1 OR lower(azienda) LIKE ?1 \
                 OR lower(email_altre) LIKE ?1 OR lower(ruolo) LIKE ?1",
            );
            valori.push(Value::Text(format!("%{}%", f.to_lowercase())));
        }
        sql.push_str(" ORDER BY lower(cognome) ASC, lower(nome) ASC, lower(email) ASC");

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(valori.iter()), contatto_from)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Cerca un contatto per email (chiave logica, confrontata in minuscolo).
    ///
    /// Blocco U: se l'indirizzo non è la principale di nessuno, si cerca fra le
    /// email «altre» (così «Aggiungi ai contatti» non crea un doppione).
    pub fn contatto_per_email(&self, email: &str) -> Result<Option<ContattoRow>> {
        let normalizzata = email.trim().to_ascii_lowercase();
        let riga = self
            .conn
            .query_row(
                &format!("SELECT {CONTATTO_COLONNE} FROM contatti WHERE email = ?1 LIMIT 1"),
                params![normalizzata],
                contatto_from,
            )
            .optional()?;
        if riga.is_some() || normalizzata.is_empty() {
            return Ok(riga);
        }
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {CONTATTO_COLONNE} FROM contatti WHERE lower(email_altre) LIKE ?1"
        ))?;
        let candidati = stmt.query_map(params![format!("%{normalizzata}%")], contatto_from)?;
        for c in candidati {
            let c = c?;
            if c.email_altre.iter().any(|r| r.valore == normalizzata) {
                return Ok(Some(c));
            }
        }
        Ok(None)
    }

    /// Blocco U: un'email non appartiene mai a due contatti. Errore leggibile se
    /// una di `email` è già (come principale o altra) di un contatto diverso da
    /// `proprietario`.
    fn controlla_email_libere(&self, email: &[&str], proprietario: Option<i64>) -> Result<()> {
        for e in email {
            if let Some(altro) = self.contatto_per_email(e)? {
                if Some(altro.id) != proprietario {
                    let chi = format!("{} {}", altro.nome, altro.cognome);
                    let chi = if chi.trim().is_empty() { altro.email.clone() } else { chi.trim().to_string() };
                    return Err(StoreError::Contatto(format!(
                        "l'indirizzo {e} è già del contatto «{chi}»"
                    )));
                }
            }
        }
        Ok(())
    }

    /// Salva un contatto con deduplicazione per email: se esiste già un contatto
    /// con lo stesso indirizzo — a prescindere dall'`id` — lo **aggiorna** invece
    /// di crearne un doppione. Restituisce `(id, aggiornato)`.
    ///
    /// Due casi distinti, dichiarati:
    /// - `id` esplicito di un contatto esistente: è una **modifica** dal modulo
    ///   della rubrica, quindi i campi inviati (anche vuoti) sostituiscono quelli
    ///   precedenti;
    /// - deduplicazione per email (es. "Aggiungi ai contatti" da un messaggio che
    ///   porta solo l'indirizzo): i campi **vuoti non cancellano** quelli già
    ///   presenti, così un nome buono non si perde.
    pub fn contatto_salva(&self, c: &ContattoInput) -> Result<(i64, bool)> {
        let email = c.email.trim().to_ascii_lowercase();
        if email.is_empty() {
            return Err(StoreError::Contatto(
                "l'indirizzo email è obbligatorio".to_string(),
            ));
        }
        let adesso = adesso_unix();

        let altre = normalizza_email_altre(&c.email_altre, &email);
        let telefoni = normalizza_telefoni(&c.telefoni);

        if let Some(id) = c.id {
            let esiste: Option<i64> = self
                .conn
                .query_row("SELECT id FROM contatti WHERE id = ?1", params![id], |r| {
                    r.get(0)
                })
                .optional()?;
            if esiste.is_some() {
                let tutte: Vec<&str> = std::iter::once(email.as_str())
                    .chain(altre.iter().map(|r| r.valore.as_str()))
                    .collect();
                self.controlla_email_libere(&tutte, Some(id))?;
                self.conn.execute(
                    "UPDATE contatti SET nome = ?2, cognome = ?3, email = ?4, telefono = ?5, \
                     azienda = ?6, note = ?7, modificato = ?8, ruolo = ?9, indirizzo = ?10, \
                     email_altre = ?11, telefoni = ?12, origine = ?13 WHERE id = ?1",
                    params![
                        id, c.nome, c.cognome, email, c.telefono, c.azienda, c.note, adesso,
                        c.ruolo, c.indirizzo, json_recapiti(&altre), json_recapiti(&telefoni),
                        c.origine
                    ],
                )?;
                return Ok((id, true));
            }
        }

        if let Some(esistente) = self.contatto_per_email(&email)? {
            let nome = if c.nome.trim().is_empty() {
                esistente.nome
            } else {
                c.nome.clone()
            };
            let cognome = if c.cognome.trim().is_empty() {
                esistente.cognome
            } else {
                c.cognome.clone()
            };
            let telefono = if c.telefono.trim().is_empty() {
                esistente.telefono
            } else {
                c.telefono.clone()
            };
            let azienda = if c.azienda.trim().is_empty() {
                esistente.azienda
            } else {
                c.azienda.clone()
            };
            let note = if c.note.trim().is_empty() {
                esistente.note
            } else {
                c.note.clone()
            };
            let ruolo = if c.ruolo.trim().is_empty() { esistente.ruolo } else { c.ruolo.clone() };
            let indirizzo =
                if c.indirizzo.trim().is_empty() { esistente.indirizzo } else { c.indirizzo.clone() };
            // Le email e i telefoni «in più» si uniscono a quelli già presenti.
            let mut unite = esistente.email_altre.clone();
            unite.extend(altre);
            let unite = normalizza_email_altre(&unite, &esistente.email);
            let nuove: Vec<&str> = unite.iter().map(|r| r.valore.as_str()).collect();
            self.controlla_email_libere(&nuove, Some(esistente.id))?;
            let mut tel = esistente.telefoni.clone();
            tel.extend(telefoni);
            let tel = normalizza_telefoni(&tel);
            // Un salvataggio dell'utente rende «suo» un contatto aggiunto da sé.
            let origine = if c.origine.is_empty() { String::new() } else { esistente.origine };
            self.conn.execute(
                "UPDATE contatti SET nome = ?2, cognome = ?3, telefono = ?4, azienda = ?5, \
                 note = ?6, modificato = ?7, ruolo = ?8, indirizzo = ?9, email_altre = ?10, \
                 telefoni = ?11, origine = ?12 WHERE id = ?1",
                params![
                    esistente.id, nome, cognome, telefono, azienda, note, adesso, ruolo,
                    indirizzo, json_recapiti(&unite), json_recapiti(&tel), origine
                ],
            )?;
            return Ok((esistente.id, true));
        }

        let nuove: Vec<&str> = altre.iter().map(|r| r.valore.as_str()).collect();
        self.controlla_email_libere(&nuove, None)?;
        let id: i64 = self.conn.query_row(
            "INSERT INTO contatti (nome, cognome, email, telefono, azienda, note, creato, \
             modificato, ruolo, indirizzo, email_altre, telefoni, origine) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8, ?9, ?10, ?11, ?12) RETURNING id",
            params![
                c.nome, c.cognome, email, c.telefono, c.azienda, c.note, adesso, c.ruolo,
                c.indirizzo, json_recapiti(&altre), json_recapiti(&telefoni), c.origine
            ],
            |row| row.get(0),
        )?;
        Ok((id, false))
    }

    /// Elimina il contatto con l'id indicato. Restituisce quante righe ha rimosso
    /// (0 se l'id non esiste: eliminare un contatto già assente non è un errore).
    pub fn contatto_elimina(&self, id: i64) -> Result<usize> {
        let n = self
            .conn
            .execute("DELETE FROM contatti WHERE id = ?1", params![id])?;
        Ok(n)
    }

    /// Indirizzi distinti già visti nella cache dei messaggi (mittente e
    /// destinatari), nella forma grezza del sync ("Nome <utente@host>"). Serve ai
    /// suggerimenti della composizione: gli indirizzi dei corrispondenti che non
    /// hanno ancora una voce in rubrica.
    pub fn indirizzi_messaggi(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT sender FROM messages WHERE sender IS NOT NULL AND sender <> '' \
             UNION SELECT recipients FROM messages WHERE recipients IS NOT NULL AND recipients <> ''",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut out: Vec<String> = Vec::new();
        for row in rows {
            let grezzo = row?;
            for pezzo in grezzo.split([',', ';']) {
                let p = pezzo.trim();
                if !p.is_empty() && !out.iter().any(|x| x == p) {
                    out.push(p.to_string());
                }
            }
        }
        Ok(out)
    }

    // -----------------------------------------------------------------------
    // Blocco H — conversazioni e regole locali.
    // -----------------------------------------------------------------------

    /// I dati per il raggruppamento in conversazioni: tutte le righe di **un
    /// account** in una cartella con message-id, in-reply-to, references e
    /// oggetto. Blocco K: il raggruppamento è confinato all'account, così lo
    /// stesso oggetto in due caselle non si unisce in un'unica conversazione.
    pub fn thread_inputs(&self, account: &str, folder: &str) -> Result<Vec<ThreadInputRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT uid, message_id, in_reply_to, references_hdr, subject \
             FROM messages WHERE COALESCE(account, '') = ?1 AND folder = ?2 \
             ORDER BY date ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![account, folder], |row| {
            Ok(ThreadInputRow {
                uid: row.get(0)?,
                message_id: row.get(1)?,
                in_reply_to: row.get(2)?,
                references: row.get(3)?,
                subject: row.get(4)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Scrive la chiave di conversazione di un messaggio (per account, blocco K).
    pub fn set_thread_key(
        &self,
        account: &str,
        folder: &str,
        uid: &str,
        chiave: &str,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET thread_key = ?4 \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid, chiave],
        )?;
        Ok(())
    }

    /// Conversazioni raggruppate di una cartella. Senza account indicato è la
    /// vista **«Tutti gli account»** (blocco J): il raggruppamento tiene conto
    /// dell'account, così due caselle con la stessa chiave di conversazione
    /// restano due righe distinte e ognuna porta il suo `account`. Con **una
    /// sola casella** il risultato è identico a quello di sempre (le righe sono
    /// tutte di quell'account).
    pub fn conversazioni(
        &self,
        folder: &str,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<RigaConversazione>> {
        self.conversazioni_con(None, folder, offset, limit)
    }

    /// Conversazioni di **un solo account** in una cartella (blocco J): è la
    /// lista della casella selezionata nella barra laterale.
    pub fn conversazioni_per_account(
        &self,
        account: &str,
        folder: &str,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<RigaConversazione>> {
        self.conversazioni_con(Some(account), folder, offset, limit)
    }

    /// Implementazione comune: `account` `None` = tutti gli account.
    fn conversazioni_con(
        &self,
        account: Option<&str>,
        folder: &str,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<RigaConversazione>> {
        // (account, chiave, numero, non_letti, ultima data)
        let chiavi: Vec<(String, String, i64, i64, i64)> = if let Some(a) = account {
            let mut stmt = self.conn.prepare(
                "SELECT COALESCE(account, '') AS acc, COALESCE(thread_key, 'uid:' || uid) AS k, \
                        COUNT(*) AS n, SUM(CASE WHEN seen = 0 THEN 1 ELSE 0 END) AS nl, MAX(date) AS ultima \
                 FROM messages WHERE folder = ?1 AND account = ?2 \
                 GROUP BY acc, k ORDER BY ultima DESC, k ASC LIMIT ?3 OFFSET ?4",
            )?;
            let rows = stmt.query_map(params![folder, a, limit as i64, offset as i64], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })?;
            let mut out = Vec::new();
            for row in rows {
                out.push(row?);
            }
            out
        } else {
            let mut stmt = self.conn.prepare(
                "SELECT COALESCE(account, '') AS acc, COALESCE(thread_key, 'uid:' || uid) AS k, \
                        COUNT(*) AS n, SUM(CASE WHEN seen = 0 THEN 1 ELSE 0 END) AS nl, MAX(date) AS ultima \
                 FROM messages WHERE folder = ?1 \
                 GROUP BY acc, k ORDER BY ultima DESC, k ASC LIMIT ?2 OFFSET ?3",
            )?;
            let rows = stmt.query_map(params![folder, limit as i64, offset as i64], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })?;
            let mut out = Vec::new();
            for row in rows {
                out.push(row?);
            }
            out
        };

        let mut out = Vec::with_capacity(chiavi.len());
        for (acc, chiave, numero, non_letti, ultima) in chiavi {
            let messaggi = self.messaggi_conversazione_di(&acc, folder, &chiave)?;
            let rappresentante = messaggi.last().cloned();
            let tutti_letti = non_letti == 0;
            let con_allegati = messaggi.iter().any(|m| m.has_attachments);
            out.push(RigaConversazione {
                chiave,
                account: acc,
                numero: numero.max(0) as usize,
                non_letti: non_letti.max(0) as usize,
                uid: rappresentante
                    .as_ref()
                    .map(|m| m.uid.clone())
                    .unwrap_or_default(),
                subject: rappresentante.as_ref().and_then(|m| m.subject.clone()),
                sender: rappresentante.as_ref().and_then(|m| m.sender.clone()),
                date: ultima,
                seen: tutti_letti,
                has_attachments: con_allegati,
                body_text: rappresentante.as_ref().and_then(|m| m.body_text.clone()),
                messaggi,
            });
        }
        Ok(out)
    }

    /// I messaggi di una conversazione (identificata dalla chiave) **di un
    /// account**, in ordine cronologico dal più vecchio. La chiave è quella di
    /// `conversazioni`. Blocco K: due caselle con la stessa chiave non si
    /// mescolano.
    pub fn messaggi_conversazione(
        &self,
        account: &str,
        folder: &str,
        chiave: &str,
    ) -> Result<Vec<MessageRow>> {
        let sql = format!(
            "SELECT {cols} FROM messages \
             WHERE folder = ?1 AND COALESCE(account, '') = ?2 \
               AND COALESCE(thread_key, 'uid:' || uid) = ?3 \
             ORDER BY date ASC, id ASC",
            cols = ROW_COLUMNS
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![folder, account, chiave], row_from)?;
        collect_rows(rows)
    }

    /// Come `messaggi_conversazione`, ma ristretto a **un account** (blocco J):
    /// nella lista aggregata due caselle possono condividere la chiave.
    pub fn messaggi_conversazione_di(
        &self,
        account: &str,
        folder: &str,
        chiave: &str,
    ) -> Result<Vec<MessageRow>> {
        let sql = format!(
            "SELECT {cols} FROM messages \
             WHERE folder = ?1 AND COALESCE(account, '') = ?2 \
               AND COALESCE(thread_key, 'uid:' || uid) = ?3 \
             ORDER BY date ASC, id ASC",
            cols = ROW_COLUMNS
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![folder, account, chiave], row_from)?;
        collect_rows(rows)
    }

    /// Messaggi di una cartella che il motore delle regole **non ha ancora
    /// valutato** (`regole_applicate = 0`): è la garanzia che un messaggio non
    /// venga rielaborato due volte. Ordine cronologico. Per account (blocco K).
    pub fn messaggi_da_regole(
        &self,
        account: &str,
        folder: &str,
    ) -> Result<Vec<MessaggioRegoleRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT uid, sender, subject, recipients, body_text, has_attachments \
             FROM messages WHERE COALESCE(account, '') = ?1 AND folder = ?2 \
               AND COALESCE(regole_applicate, 0) = 0 \
             ORDER BY date ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![account, folder], |row| {
            Ok(MessaggioRegoleRow {
                uid: row.get(0)?,
                mittente: row.get(1)?,
                oggetto: row.get(2)?,
                destinatario: row.get(3)?,
                corpo: row.get(4)?,
                ha_allegati: row.get::<_, i64>(5)? != 0,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Marca un messaggio come «valutato dalle regole»: non verrà più toccato
    /// dalle regole ai sincronismi successivi. Per account (blocco K).
    pub fn segna_regole_applicate(&self, account: &str, folder: &str, uid: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET regole_applicate = 1 \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid],
        )?;
        Ok(())
    }

    /// Aggiunge una categoria a un messaggio **senza rimuovere** quelle già
    /// presenti (usato dalla regola «categorizza»). Per account (blocco K).
    pub fn aggiungi_categoria(
        &self,
        account: &str,
        folder: &str,
        uid: &str,
        categoria: &str,
    ) -> Result<()> {
        let nome = categoria.trim();
        if nome.is_empty() {
            return Ok(());
        }
        let mut attuali = self.categorie(account, folder, uid)?;
        if !attuali.iter().any(|c| c == nome) {
            attuali.push(nome.to_string());
            self.set_categorie(account, folder, uid, &attuali)?;
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Inviti di riunione (blocco G, versione inviti): tabella `inviti`.
    // Lo **stesso UID** con una SEQUENCE più alta aggiorna la riga invece di
    // crearne una seconda; un `METHOD:CANCEL` la porta ad `annullato`.
    // -----------------------------------------------------------------------

    /// Inserisce o aggiorna un invito (chiave logica: l'`UID`).
    ///
    /// Regole dichiarate:
    /// - un `UID` nuovo crea la riga con lo stato indicato (o `in_attesa`);
    /// - lo stesso `UID` con `SEQUENCE` **più alta** aggiorna i campi;
    /// - un `METHOD:CANCEL` porta sempre lo stato ad `annullato`;
    /// - una SEQUENCE uguale o più bassa **non riscrive** la riga, così lo stato
    ///   scelto dall'utente (accettato/tentativo/rifiutato) non si perde a ogni
    ///   sincronizzazione.
    ///
    /// Restituisce l'`id` della riga.
    pub fn salva_invito(&self, i: &InvitoRiga) -> Result<i64> {
        if i.uid.trim().is_empty() {
            return Err(StoreError::Invito("l'invito non ha un UID".to_string()));
        }
        let adesso = adesso_unix();
        let stato = if i.stato.trim().is_empty() {
            "in_attesa".to_string()
        } else {
            i.stato.clone()
        };
        let sql = "INSERT INTO inviti
             (uid, sequenza, oggetto, organizzatore, organizzatore_nome, inizio, fine,
              luogo, giornata_intera, stato, metodo, rrule, descrizione, invitati,
              cartella, uid_messaggio, uscita, creato, aggiornato)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                     ?15, ?16, ?17, ?18, ?18)
             ON CONFLICT(uid) DO UPDATE SET
               sequenza = excluded.sequenza,
               oggetto = excluded.oggetto,
               organizzatore = excluded.organizzatore,
               organizzatore_nome = excluded.organizzatore_nome,
               inizio = excluded.inizio,
               fine = excluded.fine,
               luogo = excluded.luogo,
               giornata_intera = excluded.giornata_intera,
               metodo = excluded.metodo,
               rrule = excluded.rrule,
               descrizione = excluded.descrizione,
               invitati = excluded.invitati,
               cartella = excluded.cartella,
               uid_messaggio = excluded.uid_messaggio,
               uscita = excluded.uscita,
               aggiornato = excluded.aggiornato,
               stato = CASE WHEN excluded.metodo = 'CANCEL' THEN 'annullato'
                            ELSE inviti.stato END
             WHERE excluded.sequenza > inviti.sequenza OR excluded.metodo = 'CANCEL'
             RETURNING id";
        let id: Option<i64> = self
            .conn
            .query_row(
                sql,
                params![
                    i.uid,
                    i.sequenza,
                    i.oggetto,
                    i.organizzatore,
                    i.organizzatore_nome,
                    i.inizio,
                    i.fine,
                    i.luogo,
                    i.giornata_intera,
                    stato,
                    i.metodo,
                    i.rrule,
                    i.descrizione,
                    i.invitati,
                    i.cartella,
                    i.uid_messaggio,
                    i.uscita,
                    adesso,
                ],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(id) = id {
            return Ok(id);
        }
        // Nessun aggiornamento: la riga esiste già con SEQUENCE ≥ (e non è CANCEL).
        let esistente: i64 = self.conn.query_row(
            "SELECT id FROM inviti WHERE uid = ?1",
            params![i.uid],
            |row| row.get(0),
        )?;
        Ok(esistente)
    }

    /// Elenco degli inviti, ordinato per **data di inizio** (dal più vicino).
    ///
    /// Con `filtro` valorizzato (e diverso da `tutti`) si tiene solo quello
    /// stato (`in_attesa`, `accettato`, `tentativo`, `rifiutato`, `annullato`).
    pub fn inviti(&self, filtro: Option<&str>) -> Result<Vec<InvitoRiga>> {
        let mut sql = String::from(
            "SELECT id, uid, sequenza, oggetto, organizzatore, organizzatore_nome, \
             inizio, fine, luogo, giornata_intera, stato, metodo, rrule, descrizione, \
             invitati, cartella, uid_messaggio, uscita FROM inviti",
        );
        let mut valori: Vec<Value> = Vec::new();
        if let Some(f) = filtro
            .map(str::trim)
            .filter(|f| !f.is_empty() && *f != "tutti")
        {
            sql.push_str(" WHERE stato = ?1");
            valori.push(Value::Text(f.to_string()));
        }
        sql.push_str(" ORDER BY inizio ASC, id ASC");
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(valori.iter()), invito_from)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Legge un invito dal suo `id` (identificatore della riga), se esiste.
    pub fn invito_per_id(&self, id: i64) -> Result<Option<InvitoRiga>> {
        let riga = self
            .conn
            .query_row(
                "SELECT id, uid, sequenza, oggetto, organizzatore, organizzatore_nome, \
                 inizio, fine, luogo, giornata_intera, stato, metodo, rrule, descrizione, \
                 invitati, cartella, uid_messaggio, uscita FROM inviti WHERE id = ?1",
                params![id],
                invito_from,
            )
            .optional()?;
        Ok(riga)
    }

    /// Legge un invito dal suo `UID`, se esiste.
    pub fn invito_per_uid(&self, uid: &str) -> Result<Option<InvitoRiga>> {
        let riga = self
            .conn
            .query_row(
                "SELECT id, uid, sequenza, oggetto, organizzatore, organizzatore_nome, \
                 inizio, fine, luogo, giornata_intera, stato, metodo, rrule, descrizione, \
                 invitati, cartella, uid_messaggio, uscita FROM inviti WHERE uid = ?1",
                params![uid],
                invito_from,
            )
            .optional()?;
        Ok(riga)
    }

    /// Imposta lo stato di un invito (risposta dell'utente). Restituisce quante
    /// righe ha aggiornato (0 se l'UID non esiste: non è un errore).
    pub fn imposta_stato_invito(&self, uid: &str, stato: &str) -> Result<usize> {
        let n = self.conn.execute(
            "UPDATE inviti SET stato = ?2, aggiornato = ?3 WHERE uid = ?1",
            params![uid, stato, adesso_unix()],
        )?;
        Ok(n)
    }

    // -----------------------------------------------------------------------
    // Blocco I1 — copia, scadenza del contrassegno, cartelle e conversazioni
    // ignorate.
    // -----------------------------------------------------------------------

    /// **Copia** una riga da una cartella a un'altra (**senza** rimuovere
    /// l'originale). Idempotente: se la destinazione ha già quella riga
    /// (`UNIQUE(account, folder, uid)`) non fa nulla. Per account (blocco K).
    pub fn copia(
        &self,
        account: &str,
        folder: &str,
        uid: &str,
        destinazione: &str,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO messages
                (account, folder, uid, message_id, subject, sender, recipients, date, seen,
                 has_attachments, thread_key, body_text, body_html, flagged, completato,
                 categorie, in_reply_to, references_hdr, regole_applicate, indesiderato, scadenza)
             SELECT account, ?4, uid, message_id, subject, sender, recipients, date, seen,
                 has_attachments, thread_key, body_text, body_html, flagged, completato,
                 categorie, in_reply_to, references_hdr, regole_applicate, indesiderato, scadenza
             FROM messages WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid, destinazione],
        )?;
        Ok(())
    }

    /// Salva (o rimuove) la data del contrassegno. `None` la cancella.
    /// Per account (blocco K).
    pub fn set_scadenza(
        &self,
        account: &str,
        folder: &str,
        uid: &str,
        scadenza: Option<&str>,
    ) -> Result<()> {
        let valore = scadenza.map(str::trim).filter(|s| !s.is_empty());
        self.conn.execute(
            "UPDATE messages SET scadenza = ?4 \
             WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3",
            params![account, folder, uid, valore],
        )?;
        Ok(())
    }

    /// Legge la data del contrassegno (ISO), se presente. Per account.
    pub fn scadenza(&self, account: &str, folder: &str, uid: &str) -> Result<Option<String>> {
        let valore: Option<Option<String>> = self
            .conn
            .query_row(
                "SELECT scadenza FROM messages \
                 WHERE COALESCE(account, '') = ?1 AND folder = ?2 AND uid = ?3 LIMIT 1",
                params![account, folder, uid],
                |row| row.get(0),
            )
            .optional()?;
        Ok(valore.flatten())
    }

    /// Registra una cartella conosciuta (dal server) **per account**, senza
    /// toccare la preferenza già eventualmente impostata. Idempotente. Blocco L:
    /// il registro è per account, così due caselle con una cartella omonima non si
    /// sovrascrivono.
    pub fn registra_cartella(&self, account: &str, nome: &str) -> Result<()> {
        let nome = nome.trim();
        if nome.is_empty() {
            return Ok(());
        }
        self.conn.execute(
            "INSERT INTO cartelle (account, nome, preferita, aggiornato) VALUES (?1, ?2, 0, ?3)
             ON CONFLICT(account, nome) DO UPDATE SET aggiornato = excluded.aggiornato",
            params![account, nome, adesso_unix()],
        )?;
        Ok(())
    }

    /// Imposta (o toglie) la preferenza di una cartella **di un account**. La
    /// riga viene creata se assente, così una cartella può essere messa fra i
    /// preferiti anche prima che il sync l'abbia registrata. Blocco L: per account.
    pub fn set_cartella_preferita(&self, account: &str, nome: &str, preferita: bool) -> Result<()> {
        self.conn.execute(
            "INSERT INTO cartelle (account, nome, preferita, aggiornato) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(account, nome) DO UPDATE SET preferita = excluded.preferita,
                                            aggiornato = excluded.aggiornato",
            params![account, nome.trim(), preferita, adesso_unix()],
        )?;
        Ok(())
    }

    /// Elenco dei nomi delle cartelle preferite **di un account**, in ordine
    /// alfabetico. Blocco L: per account.
    pub fn cartelle_preferite(&self, account: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT nome FROM cartelle WHERE COALESCE(account, '') = ?1 AND preferita = 1 \
             ORDER BY lower(nome) ASC",
        )?;
        let rows = stmt.query_map(params![account], |row| row.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Le cartelle registrate **di un account** con la loro preferenza, con le
    /// **preferite in alto** (poi in ordine alfabetico): è l'ordine della barra
    /// laterale. Blocco L: per account.
    pub fn cartelle_registrate(&self, account: &str) -> Result<Vec<(String, bool)>> {
        let mut stmt = self.conn.prepare(
            "SELECT nome, preferita FROM cartelle WHERE COALESCE(account, '') = ?1
             ORDER BY preferita DESC, lower(nome) ASC",
        )?;
        let rows = stmt.query_map(params![account], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0))
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Rinomina una cartella **in cache** per un account: le righe dei messaggi e
    /// la voce del registro (di quell'account) si spostano sul nuovo nome. Non
    /// tocca `conversazioni_ignorate` né le altre caselle. Blocco L: per account.
    pub fn rinomina_cartella_cache(&self, account: &str, vecchio: &str, nuovo: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET folder = ?2 WHERE folder = ?1 AND COALESCE(account, '') = ?3",
            params![vecchio, nuovo, account],
        )?;
        // Se il nuovo nome esiste già nel registro, quello vecchio si fonde.
        self.conn.execute(
            "DELETE FROM cartelle WHERE COALESCE(account, '') = ?1 AND nome = ?2",
            params![account, vecchio],
        )?;
        self.conn.execute(
            "INSERT INTO cartelle (account, nome, preferita, aggiornato) VALUES (?1, ?2, 0, ?3)
             ON CONFLICT(account, nome) DO UPDATE SET aggiornato = excluded.aggiornato",
            params![account, nuovo, adesso_unix()],
        )?;
        Ok(())
    }

    /// Elimina una cartella **dalla cache** per un account: righe dei messaggi e
    /// voce del registro (con l'eventuale preferenza). Blocco L: per account.
    pub fn elimina_cartella_cache(&self, account: &str, nome: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM messages WHERE folder = ?1 AND COALESCE(account, '') = ?2",
            params![nome, account],
        )?;
        self.conn.execute(
            "DELETE FROM cartelle WHERE COALESCE(account, '') = ?1 AND nome = ?2",
            params![account, nome],
        )?;
        Ok(())
    }

    /// Svuota una cartella **in cache** per un account: rimuove i messaggi,
    /// lascia la voce del registro (e la preferenza). Restituisce quante righe ha
    /// rimosso. Blocco L: per account.
    pub fn svuota_cartella_cache(&self, account: &str, nome: &str) -> Result<usize> {
        let n = self.conn.execute(
            "DELETE FROM messages WHERE folder = ?1 AND COALESCE(account, '') = ?2",
            params![nome, account],
        )?;
        Ok(n)
    }

    /// Marca come lette tutte le righe di una cartella **di un account** in cache.
    /// Restituisce quante ne ha aggiornate. Blocco L: per account.
    pub fn segna_cartella_letta_cache(&self, account: &str, nome: &str) -> Result<usize> {
        let n = self.conn.execute(
            "UPDATE messages SET seen = 1 WHERE folder = ?1 AND COALESCE(account, '') = ?2",
            params![nome, account],
        )?;
        Ok(n)
    }

    /// Segna (o toglie) una conversazione come ignorata **per account**.
    /// Idempotente. Blocco L: la chiave è `(account, thread_key)`, così ignorare
    /// una conversazione in una casella non la ignora nell'altra.
    pub fn conversazione_ignora(&self, account: &str, thread_key: &str, ignora: bool) -> Result<()> {
        let chiave = thread_key.trim();
        if chiave.is_empty() {
            return Ok(());
        }
        if ignora {
            self.conn.execute(
                "INSERT OR IGNORE INTO conversazioni_ignorate (account, thread_key, creato)
                 VALUES (?1, ?2, ?3)",
                params![account, chiave, adesso_unix()],
            )?;
        } else {
            self.conn.execute(
                "DELETE FROM conversazioni_ignorate WHERE COALESCE(account, '') = ?1 AND thread_key = ?2",
                params![account, chiave],
            )?;
        }
        Ok(())
    }

    /// Le chiavi di conversazione ignorate **di un account**, in ordine. Blocco L.
    pub fn conversazioni_ignorate(&self, account: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT thread_key FROM conversazioni_ignorate WHERE COALESCE(account, '') = ?1 \
             ORDER BY thread_key ASC",
        )?;
        let rows = stmt.query_map(params![account], |row| row.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Vero se la conversazione è ignorata **nell'account indicato**. Blocco L.
    pub fn e_conversazione_ignorata(&self, account: &str, thread_key: &str) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM conversazioni_ignorate
             WHERE COALESCE(account, '') = ?1 AND thread_key = ?2",
            params![account, thread_key.trim()],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// Gli UID dei messaggi di **un account** in una cartella che appartengono a
    /// una delle conversazioni ignorate indicate: sono quelli da marcare letti e
    /// spostare durante la sincronizzazione. Per account (blocco K).
    pub fn messaggi_di_conversazioni_ignorate(
        &self,
        account: &str,
        folder: &str,
        ignorate: &[String],
    ) -> Result<Vec<String>> {
        if ignorate.is_empty() {
            return Ok(Vec::new());
        }
        let segnaposti = vec!["?"; ignorate.len()].join(", ");
        let sql = format!(
            "SELECT uid FROM messages WHERE COALESCE(account, '') = ?1 AND folder = ?2 \
             AND thread_key IN ({segnaposti})"
        );
        let mut valori: Vec<Value> = Vec::with_capacity(ignorate.len() + 2);
        valori.push(Value::Text(account.to_string()));
        valori.push(Value::Text(folder.to_string()));
        for k in ignorate {
            valori.push(Value::Text(k.clone()));
        }
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(valori.iter()), |row| {
            row.get::<_, String>(0)
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}

/// Aggiunge in modo idempotente le colonne mancanti al database esistente.
/// Un database appena creato le ha già dallo schema; uno più vecchio le riceve
/// qui con `ALTER TABLE ... ADD COLUMN` solo se assenti.
fn migra(conn: &Connection) -> Result<()> {
    let esistenti: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(messages)")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        let mut nomi = Vec::new();
        for row in rows {
            nomi.push(row?);
        }
        nomi
    };
    for (colonna, tipo) in COLONNE_AGGIUNTE {
        if !esistenti.iter().any(|c| c == colonna) {
            conn.execute_batch(&format!("ALTER TABLE messages ADD COLUMN {colonna} {tipo}"))?;
        }
    }
    // Blocco U: colonne nuove della rubrica, aggiunte solo se mancano.
    let in_contatti: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(contatti)")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        rows.collect::<std::result::Result<_, _>>()?
    };
    if !in_contatti.is_empty() {
        for (colonna, tipo) in COLONNE_CONTATTI_AGGIUNTE {
            if !in_contatti.iter().any(|c| c == colonna) {
                conn.execute_batch(&format!("ALTER TABLE contatti ADD COLUMN {colonna} {tipo}"))?;
            }
        }
    }
    // Blocco L: `cartelle`, `conversazioni_ignorate` e `conferme` diventano **per
    // account** (chiave estesa con `account`). Un database creato prima del blocco
    // non ha la colonna: le si ricostruisce con lo schema nuovo copiando le righe
    // esistenti come dell'account predefinito (`account = ''`). Idempotente.
    migra_tabelle_per_account(conn)?;
    Ok(())
}

/// Aggiunge (in modo idempotente) la colonna `account` alle tabelle del blocco L
/// ricostruendole con la chiave nuova, senza perdere le righe esistenti: quelle
/// create prima del blocco L sono trattate come dell'account predefinito
/// (`account = ''`), come le righe legacy del blocco K.
fn migra_tabelle_per_account(conn: &Connection) -> Result<()> {
    // (tabella, CREATE nuova, colonne di destinazione, colonne di origine).
    const TABELLE: &[(&str, &str, &str, &str)] = &[
        (
            "cartelle",
            "CREATE TABLE cartelle (account TEXT NOT NULL DEFAULT '', nome TEXT NOT NULL, \
             preferita INTEGER DEFAULT 0, aggiornato INTEGER DEFAULT 0, \
             PRIMARY KEY (account, nome))",
            "(account, nome, preferita, aggiornato)",
            "'', nome, preferita, aggiornato",
        ),
        (
            "conversazioni_ignorate",
            "CREATE TABLE conversazioni_ignorate (account TEXT NOT NULL DEFAULT '', \
             thread_key TEXT NOT NULL, creato INTEGER DEFAULT 0, \
             PRIMARY KEY (account, thread_key))",
            "(account, thread_key, creato)",
            "'', thread_key, creato",
        ),
        (
            "conferme",
            "CREATE TABLE conferme (account TEXT NOT NULL DEFAULT '', folder TEXT NOT NULL, \
             uid TEXT NOT NULL, tipo TEXT NOT NULL, inviata INTEGER NOT NULL DEFAULT 0, \
             creato INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (account, folder, uid, tipo))",
            "(account, folder, uid, tipo, inviata, creato)",
            "'', folder, uid, tipo, inviata, creato",
        ),
    ];
    for (tabella, crea, destinazione, origine) in TABELLE {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({tabella})"))?;
        let mut colonne: Vec<String> = Vec::new();
        for r in stmt.query_map([], |row| row.get::<_, String>(1))? {
            colonne.push(r?);
        }
        drop(stmt);
        if colonne.iter().any(|c| c == "account") {
            continue; // già migrata (o creata dallo schema nuovo)
        }
        let legacy = format!("{tabella}__legacy");
        conn.execute_batch(&format!(
            "DROP TABLE IF EXISTS {legacy};\n\
             ALTER TABLE {tabella} RENAME TO {legacy};\n\
             {crea};\n\
             INSERT INTO {tabella} {destinazione} SELECT {origine} FROM {legacy};\n\
             DROP TABLE {legacy};"
        ))?;
    }
    Ok(())
}

/// Tipo di confronto del testo libero: indice FTS5 oppure sottostringa.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MatchKind {
    Fts,
    Sottostringa,
}

/// Frammento `ORDER BY` per la lista secondo il campo e il verso scelti in
/// «Ordina per» (blocco I2).
///
/// Il campo e il verso arrivano da una preferenza già validata; qui si ripete la
/// mappatura verso nomi di colonna **fissi** (mai testo dell'utente), quindi non
/// esiste alcuna iniezione possibile. Campo o verso non riconosciuti ricadono sul
/// default: data discendente. La **dimensione** è approssimata — la cache non
/// conserva la dimensione esatta del messaggio — come lunghezza del corpo in
/// cache più un peso fisso per i messaggi con allegati.
pub fn ordinamento_sql(campo: &str, verso: &str) -> String {
    let colonna = match campo {
        "mittente" => "lower(m.sender)",
        "oggetto" => "lower(m.subject)",
        "dimensione" => "length(coalesce(m.body_text, '')) + (m.has_attachments * 1000000)",
        _ => "m.date",
    };
    let dir = if verso == "crescente" { "ASC" } else { "DESC" };
    format!("{colonna} {dir}, m.id {dir}")
}

/// Trasforma l'input dell'utente in una query FTS5 valida: ogni parola è
/// racchiusa fra virgolette (le virgolette interne sono raddoppiate) e i termini
/// sono uniti in AND.
fn fts_match_query(raw: &str) -> String {
    raw.split_whitespace()
        .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

/// Materializza le righe di un `query_map` in un vettore.
fn collect_rows(
    rows: rusqlite::MappedRows<'_, impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<MessageRow>>,
) -> Result<Vec<MessageRow>> {
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Costruisce una `MessageRow` a partire dalla riga selezionata (colonne in
/// `ROW_COLUMNS`).
fn row_from(row: &rusqlite::Row<'_>) -> rusqlite::Result<MessageRow> {
    Ok(MessageRow {
        id: row.get(0)?,
        account: row.get(1)?,
        folder: row.get(2)?,
        uid: row.get(3)?,
        message_id: row.get(4)?,
        subject: row.get(5)?,
        sender: row.get(6)?,
        recipients: row.get(7)?,
        date: row.get(8)?,
        seen: row.get(9)?,
        has_attachments: row.get(10)?,
        thread_key: row.get(11)?,
        body_text: row.get(12)?,
    })
}

/// Costruisce una `ThreadRow` dalla riga selezionata (colonne di
/// `thread_messages`: folder, uid, subject, sender, date, body_text).
fn recipe_thread(row: &rusqlite::Row<'_>) -> rusqlite::Result<ThreadRow> {
    Ok(ThreadRow {
        folder: row.get(0)?,
        uid: row.get(1)?,
        subject: row.get(2)?,
        sender: row.get(3)?,
        date: row.get(4)?,
        body_text: row.get(5)?,
    })
}

/// Costruisce una `ContattoRow` dalla riga selezionata (colonne di `contatti`).
fn contatto_from(row: &rusqlite::Row<'_>) -> rusqlite::Result<ContattoRow> {
    Ok(ContattoRow {
        id: row.get(0)?,
        nome: row.get(1)?,
        cognome: row.get(2)?,
        email: row.get(3)?,
        telefono: row.get(4)?,
        azienda: row.get(5)?,
        note: row.get(6)?,
        creato: row.get(7)?,
        modificato: row.get(8)?,
        ruolo: row.get(9)?,
        indirizzo: row.get(10)?,
        email_altre: serde_json::from_str(&row.get::<_, String>(11)?).unwrap_or_default(),
        telefoni: serde_json::from_str(&row.get::<_, String>(12)?).unwrap_or_default(),
        origine: row.get(13)?,
    })
}

/// Costruisce una `InvitoRiga` dalla riga selezionata (colonne di `inviti`).
fn invito_from(row: &rusqlite::Row<'_>) -> rusqlite::Result<InvitoRiga> {
    Ok(InvitoRiga {
        id: row.get(0)?,
        uid: row.get(1)?,
        sequenza: row.get(2)?,
        oggetto: row.get(3)?,
        organizzatore: row.get(4)?,
        organizzatore_nome: row.get(5)?,
        inizio: row.get(6)?,
        fine: row.get(7)?,
        luogo: row.get(8)?,
        giornata_intera: row.get::<_, i64>(9)? != 0,
        stato: row.get(10)?,
        metodo: row.get(11)?,
        rrule: row.get(12)?,
        descrizione: row.get(13)?,
        invitati: row.get(14)?,
        cartella: row.get(15)?,
        uid_messaggio: row.get(16)?,
        uscita: row.get::<_, i64>(17)? != 0,
    })
}

/// Secondi dall'epoca Unix, per i campi `creato`/`modificato` dei contatti.
fn adesso_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::Store;
    use tempfile::tempdir;

    /// Un database creato con lo schema **precedente** (senza `flagged`,
    /// `completato`, `categorie`) viene migrato all'apertura, senza perdere dati,
    /// e la migrazione è idempotente (riaprire non fa danni).
    #[test]
    fn un_database_vecchio_viene_migrato_senza_perdere_dati() {
        let dir = tempdir().unwrap();
        let percorso = dir.path().join("cache.db");

        // Schema storico: `messages` senza le colonne del blocco A, ma con
        // l'indice FTS e i trigger già presenti (come nella cache vera).
        {
            let conn = rusqlite::Connection::open(&percorso).unwrap();
            conn.execute_batch(
                "CREATE TABLE messages (
                   id INTEGER PRIMARY KEY, account TEXT, folder TEXT, uid TEXT,
                   message_id TEXT, subject TEXT, sender TEXT, recipients TEXT,
                   date INTEGER, seen INTEGER DEFAULT 0, has_attachments INTEGER DEFAULT 0,
                   thread_key TEXT, body_text TEXT, body_html TEXT,
                   UNIQUE(account, folder, uid));
                 CREATE VIRTUAL TABLE messages_fts USING fts5(subject, sender, body_text,
                   content='messages', content_rowid='id');
                 CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
                   INSERT INTO messages_fts(rowid, subject, sender, body_text)
                   VALUES (new.id, new.subject, new.sender, new.body_text);
                 END;
                 CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
                   INSERT INTO messages_fts(messages_fts, rowid, subject, sender, body_text)
                   VALUES ('delete', old.id, old.subject, old.sender, old.body_text);
                   INSERT INTO messages_fts(rowid, subject, sender, body_text)
                   VALUES (new.id, new.subject, new.sender, new.body_text);
                 END;",
            )
            .unwrap();
            conn.execute(
                "INSERT INTO messages (account, folder, uid, subject, date, seen)
                 VALUES ('acct', 'INBOX', '1', 'Messaggio storico', 1700000000, 1)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')",
                [],
            )
            .unwrap();
        }

        // Prima apertura: `migra` aggiunge le colonne mancanti.
        let store = Store::open(&percorso).unwrap();
        assert_eq!(store.count("INBOX").unwrap(), 1, "la riga storica resta");
        store.set_completato("acct", "INBOX", "1", true).unwrap();
        store
            .set_categorie("acct", "INBOX", "1", &["Lavoro".to_string()])
            .unwrap();
        assert!(store.completato("acct", "INBOX", "1").unwrap());
        assert_eq!(
            store.categorie("acct", "INBOX", "1").unwrap(),
            vec!["Lavoro".to_string()]
        );
        store.set_seen("acct", "INBOX", "1", false).unwrap();
        assert!(!store.list("INBOX", 0, 10).unwrap()[0].seen);

        // Seconda apertura: la migrazione è idempotente.
        let store2 = Store::open(&percorso).unwrap();
        assert_eq!(store2.count("INBOX").unwrap(), 1);
        assert!(store2.completato("acct", "INBOX", "1").unwrap());
        assert_eq!(
            store2.categorie("acct", "INBOX", "1").unwrap(),
            vec!["Lavoro".to_string()]
        );
    }

    /// Lo stesso indirizzo bloccato due volte resta una sola riga.
    #[test]
    fn il_mittente_bloccato_non_si_duplica() {
        let dir = tempdir().unwrap();
        let store = Store::open(&dir.path().join("cache.db")).unwrap();
        store
            .aggiungi_mittente_bloccato("Luca@Example.it")
            .unwrap();
        store
            .aggiungi_mittente_bloccato("luca@example.it")
            .unwrap();
        assert_eq!(
            store.mittenti_bloccati().unwrap(),
            vec!["luca@example.it".to_string()]
        );
    }

    /// Blocco L: un database con le tabelle `cartelle`, `conversazioni_ignorate`
    /// e `conferme` **senza** la colonna `account` viene migrato all'apertura: le
    /// righe esistenti restano (come dell'account predefinito) e la chiave è
    /// estesa con l'account. La migrazione è idempotente.
    #[test]
    fn le_tabelle_per_account_vengono_migrate_senza_perdere_dati() {
        let dir = tempdir().unwrap();
        let percorso = dir.path().join("cache.db");

        // Schema storico (blocco I1/I2): le tre tabelle senza `account`.
        {
            let conn = rusqlite::Connection::open(&percorso).unwrap();
            conn.execute_batch(
                "CREATE TABLE cartelle (nome TEXT PRIMARY KEY, preferita INTEGER DEFAULT 0,
                   aggiornato INTEGER DEFAULT 0);
                 CREATE TABLE conversazioni_ignorate (thread_key TEXT PRIMARY KEY,
                   creato INTEGER DEFAULT 0);
                 CREATE TABLE conferme (folder TEXT NOT NULL, uid TEXT NOT NULL, tipo TEXT NOT NULL,
                   inviata INTEGER NOT NULL DEFAULT 0, creato INTEGER NOT NULL DEFAULT 0,
                   PRIMARY KEY (folder, uid, tipo));
                 INSERT INTO cartelle (nome, preferita) VALUES ('Bozze', 1), ('Archivio', 0);
                 INSERT INTO conversazioni_ignorate (thread_key) VALUES ('t-1');
                 INSERT INTO conferme (folder, uid, tipo, inviata) VALUES ('INBOX', '5', 'lettura', 1);",
            )
            .unwrap();
        }

        let store = Store::open(&percorso).unwrap();
        // Le righe storiche sono dell'account predefinito (`''`) e restano leggibili.
        let reg = store.cartelle_registrate("").unwrap();
        assert_eq!(reg.len(), 2, "le cartelle storiche restano");
        assert_eq!(reg[0], ("Bozze".to_string(), true), "la preferita resta in alto");
        assert_eq!(store.conversazioni_ignorate("").unwrap(), vec!["t-1".to_string()]);
        assert_eq!(
            store.conferme_scelte("", "INBOX", "5").unwrap(),
            vec![("lettura".to_string(), true)]
        );

        // La chiave è ora per account: un secondo account è indipendente.
        store.registra_cartella("acct2", "Bozze").unwrap();
        store.set_cartella_preferita("acct2", "Bozze", true).unwrap();
        store.conversazione_ignora("acct2", "t-2", true).unwrap();
        store
            .conferma_registra("acct2", "INBOX", "5", "lettura", false, 1_700_000_000)
            .unwrap();
        assert_eq!(store.cartelle_preferite("acct2").unwrap(), vec!["Bozze".to_string()]);
        assert!(store.conversazioni_ignorate("").unwrap() == vec!["t-1".to_string()]);
        assert!(store.e_conversazione_ignorata("acct2", "t-1").unwrap() == false);
        assert_eq!(
            store.conferme_scelte("acct2", "INBOX", "5").unwrap(),
            vec![("lettura".to_string(), false)]
        );

        // Seconda apertura: idempotente, i dati restano.
        let store2 = Store::open(&percorso).unwrap();
        assert_eq!(store2.cartelle_registrate("").unwrap().len(), 2);
        assert_eq!(store2.conversazioni_ignorate("").unwrap(), vec!["t-1".to_string()]);
    }
}

//! Blocco K — operazioni sui messaggi **per account**.
//!
//! Due caselle reali hanno entrambe «Posta in arrivo» e gli stessi UID (1, 2,
//! 3…). Questi test verificano che un'operazione su un messaggio di una casella
//! **non** tocchi la riga omonima dell'altra: letto, contrassegnato, completato,
//! categorie, scadenza, sposta, copia, elimina, archivia, indesiderato, regole e
//! conversazioni. Coprono anche l'`accountId` inesistente (errore leggibile) e la
//! non regressione a una sola casella.
//!
//! Lavorano a livello di cache (nessuna rete), tranne i casi che passano dalle
//! operazioni combinate di `mail::ops`, provate con `FakeSource`.

use outlook_ai_lib::config::Account;
use outlook_ai_lib::mail::regole as motore;
use outlook_ai_lib::mail::sync::aggiorna_thread;
use outlook_ai_lib::mail::{ops, FakeSource};
use outlook_ai_lib::risolvi_account;
use outlook_ai_lib::store::{Header, Store};

fn cache_temp() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    (dir, store)
}

/// Una riga di cache per `(account, folder, uid)`.
fn riga(account: &str, folder: &str, uid: &str, oggetto: &str, mittente: &str) -> Header {
    Header {
        account: account.to_string(),
        folder: folder.to_string(),
        uid: uid.to_string(),
        message_id: Some(format!("<{account}-{uid}@example.it>")),
        subject: Some(oggetto.to_string()),
        sender: Some(mittente.to_string()),
        recipients: Some("io@example.it".to_string()),
        date: 1_700_000_000 + uid.parse::<i64>().unwrap_or(0),
        seen: false,
        has_attachments: false,
        thread_key: None,
        in_reply_to: None,
        references: None,
    }
}

/// Due caselle con la **stessa** cartella `INBOX` e lo **stesso** UID `1`.
fn due_caselle(store: &Store) {
    store
        .upsert_header(&riga("a", "INBOX", "1", "Piano Q4", "Anna <anna@x.it>"))
        .unwrap();
    store
        .upsert_header(&riga("b", "INBOX", "1", "Piano Q4", "Anna <anna@x.it>"))
        .unwrap();
}

/// Un account di prova completo (tutti i campi pubblici).
fn account(id: &str) -> Account {
    Account {
        id: id.to_string(),
        description: id.to_string(),
        full_name: format!("Utente {id}"),
        email: format!("{id}@example.it"),
        username: format!("{id}@example.it"),
        imap_host: "imaps.example.it".to_string(),
        imap_port: 993,
        imap_ssl: true,
        smtp_host: "smtps.example.it".to_string(),
        smtp_port: 465,
        smtp_ssl: true,
    }
}

/// La riga esiste in cache per `(account, folder, uid)`?
fn esiste(store: &Store, account: &str, folder: &str, uid: &str) -> bool {
    store
        .list_per_account(account, folder, 0, 1000, "data", "discendente")
        .unwrap()
        .iter()
        .any(|r| r.uid == uid)
}

// ---------------------------------------------------------------------------
// Stato locale: letto, contrassegnato, completato, categorie, scadenza.
// ---------------------------------------------------------------------------

#[test]
fn letto_di_una_casella_non_tocca_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle(&store);
    store.set_seen("a", "INBOX", "1", true).unwrap();
    assert!(store.flagged("b", "INBOX", "1").is_ok(), "la riga di b esiste");
    let riga_a = store.list_per_account("a", "INBOX", 0, 10, "data", "discendente").unwrap();
    let riga_b = store.list_per_account("b", "INBOX", 0, 10, "data", "discendente").unwrap();
    assert!(riga_a[0].seen, "a è letto");
    assert!(!riga_b[0].seen, "b resta da leggere");
}

#[test]
fn contrassegnato_e_completato_di_una_casella_non_toccano_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle(&store);
    store.set_flagged("a", "INBOX", "1", true).unwrap();
    store.set_completato("a", "INBOX", "1", true).unwrap();
    assert!(store.flagged("a", "INBOX", "1").unwrap());
    assert!(store.completato("a", "INBOX", "1").unwrap());
    assert!(!store.flagged("b", "INBOX", "1").unwrap(), "il contrassegno di b resta falso");
    assert!(!store.completato("b", "INBOX", "1").unwrap(), "il completato di b resta falso");
}

#[test]
fn categorie_di_una_casella_non_toccano_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle(&store);
    store
        .set_categorie("a", "INBOX", "1", &["Lavoro".to_string()])
        .unwrap();
    assert_eq!(store.categorie("a", "INBOX", "1").unwrap(), vec!["Lavoro".to_string()]);
    assert!(store.categorie("b", "INBOX", "1").unwrap().is_empty(), "b resta senza categorie");
    // Aggiungere a b non tocca a.
    store.aggiungi_categoria("b", "INBOX", "1", "Personale").unwrap();
    assert_eq!(store.categorie("a", "INBOX", "1").unwrap(), vec!["Lavoro".to_string()]);
    assert_eq!(store.categorie("b", "INBOX", "1").unwrap(), vec!["Personale".to_string()]);
}

#[test]
fn scadenza_di_una_casella_non_tocca_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle(&store);
    store
        .set_scadenza("a", "INBOX", "1", Some("2026-10-20T09:00:00"))
        .unwrap();
    assert_eq!(
        store.scadenza("a", "INBOX", "1").unwrap(),
        Some("2026-10-20T09:00:00".to_string())
    );
    assert_eq!(store.scadenza("b", "INBOX", "1").unwrap(), None, "b senza scadenza");
}

// ---------------------------------------------------------------------------
// Spostamento, copia, eliminazione (rimozione), archiviazione, indesiderato.
// ---------------------------------------------------------------------------

#[test]
fn sposta_di_una_casella_non_tocca_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle(&store);
    store.sposta("a", "INBOX", "1", "Archivio").unwrap();
    assert!(!esiste(&store, "a", "INBOX", "1"), "esce da INBOX di a");
    assert!(esiste(&store, "a", "Archivio", "1"), "compare in Archivio di a");
    assert!(esiste(&store, "b", "INBOX", "1"), "b resta in INBOX");
    assert!(!esiste(&store, "b", "Archivio", "1"), "b non compare in Archivio");
}

#[test]
fn copia_di_una_casella_non_tocca_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle(&store);
    store.copia("a", "INBOX", "1", "Archivio").unwrap();
    assert!(esiste(&store, "a", "INBOX", "1"), "l'originale di a resta");
    assert!(esiste(&store, "a", "Archivio", "1"), "la copia di a c'è");
    assert!(esiste(&store, "b", "INBOX", "1"), "b resta in INBOX");
    assert!(!esiste(&store, "b", "Archivio", "1"), "nessuna copia fantasma in b");
}

#[test]
fn rimozione_di_una_casella_non_tocca_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle(&store);
    store.rimuovi("a", "INBOX", "1").unwrap();
    assert!(!esiste(&store, "a", "INBOX", "1"));
    assert!(esiste(&store, "b", "INBOX", "1"), "b resta");
}

#[test]
fn indesiderato_di_una_casella_non_tocca_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle(&store);
    store.set_indesiderato("a", "INBOX", "1", true).unwrap();
    assert!(store.indesiderato("a", "INBOX", "1").unwrap());
    assert!(!store.indesiderato("b", "INBOX", "1").unwrap(), "b non è indesiderato");
}

// ---------------------------------------------------------------------------
// Operazioni combinate (rete + cache) via `FakeSource`: la cache è per account.
// ---------------------------------------------------------------------------

/// Semina `uid` in `INBOX` per entrambe le caselle, con l'UID del `FakeSource`.
fn semina_uid(store: &Store, uid: &str) {
    for acc in ["a", "b"] {
        store
            .upsert_header(&riga(acc, "INBOX", uid, &format!("Messaggio {uid}"), "Anna <anna@x.it>"))
            .unwrap();
    }
}

#[tokio::test]
async fn ops_sposta_tocca_solo_la_casella_indicata() {
    let (_dir, store) = cache_temp();
    semina_uid(&store, "101");
    let src = FakeSource::new();
    ops::sposta(&src, &store, "a", "INBOX", "101", "Posta inviata")
        .await
        .unwrap();
    assert!(!esiste(&store, "a", "INBOX", "101"));
    assert!(esiste(&store, "a", "Posta inviata", "101"));
    assert!(esiste(&store, "b", "INBOX", "101"), "b non è stato toccato");
}

#[tokio::test]
async fn ops_elimina_tocca_solo_la_casella_indicata() {
    let (_dir, store) = cache_temp();
    semina_uid(&store, "101");
    let src = FakeSource::new().con_cartelle(&["Posta eliminata"]);
    ops::elimina(&src, &store, "a", "INBOX", "101").await.unwrap();
    assert!(!esiste(&store, "a", "INBOX", "101"));
    assert!(esiste(&store, "a", "Posta eliminata", "101"));
    assert!(esiste(&store, "b", "INBOX", "101"), "b non è stato toccato");
}

#[tokio::test]
async fn ops_archivia_tocca_solo_la_casella_indicata() {
    let (_dir, store) = cache_temp();
    semina_uid(&store, "102");
    let src = FakeSource::new().con_cartelle(&["Archivio"]);
    ops::archivia(&src, &store, "a", "INBOX", "102").await.unwrap();
    assert!(esiste(&store, "a", "Archivio", "102"));
    assert!(esiste(&store, "b", "INBOX", "102"), "b non è stato toccato");
}

#[tokio::test]
async fn ops_indesiderato_tocca_solo_la_casella_indicata() {
    let (_dir, store) = cache_temp();
    semina_uid(&store, "103");
    let src = FakeSource::new().con_cartelle(&["Posta indesiderata"]);
    ops::indesiderato(&src, &store, "a", "INBOX", "103")
        .await
        .unwrap();
    assert!(esiste(&store, "a", "Posta indesiderata", "103"));
    assert!(esiste(&store, "b", "INBOX", "103"), "b non è stato toccato");
}

// ---------------------------------------------------------------------------
// `accountId` inesistente → errore leggibile.
// ---------------------------------------------------------------------------

#[test]
fn account_inesistente_da_un_errore_leggibile() {
    let accounts = vec![account("a"), account("b")];
    let err = risolvi_account(&accounts, Some("fantasma@example.it"), Some("a")).unwrap_err();
    assert!(
        err.contains("account non configurato") && err.contains("fantasma@example.it"),
        "l'errore nomina l'account non configurato: {err}"
    );
    // Un id assente ricade sul predefinito, non su un errore.
    assert_eq!(risolvi_account(&accounts, None, Some("b")).unwrap().id, "b");
    assert_eq!(risolvi_account(&accounts, Some(""), Some("b")).unwrap().id, "b");
    // Nessun account configurato: errore leggibile.
    let vuoto: Vec<Account> = Vec::new();
    assert!(risolvi_account(&vuoto, None, None).unwrap_err().contains("nessun account"));
}

// ---------------------------------------------------------------------------
// Conversazioni e fili: confinati all'account.
// ---------------------------------------------------------------------------

#[test]
fn la_stessa_conversazione_in_due_account_non_si_unisce() {
    let (_dir, store) = cache_temp();
    // stesso oggetto, due messaggi per casella, in due caselle diverse.
    for acc in ["a", "b"] {
        store
            .upsert_header(&riga(acc, "INBOX", "1", "Piano Q4", "Anna <anna@x.it>"))
            .unwrap();
        store
            .upsert_header(&riga(acc, "INBOX", "2", "Re: Piano Q4", "Anna <anna@x.it>"))
            .unwrap();
    }
    // Il raggruppamento gira **per account** (come fa il sync).
    aggiorna_thread(&store, "a", "INBOX").unwrap();
    aggiorna_thread(&store, "b", "INBOX").unwrap();

    // Dentro una casella i due messaggi sono una sola conversazione (2 messaggi).
    let solo_a = store.conversazioni_per_account("a", "INBOX", 0, 50).unwrap();
    assert_eq!(solo_a.len(), 1, "una sola conversazione in a");
    assert_eq!(solo_a[0].numero, 2, "i due messaggi dello stesso account si uniscono");

    // Fra le due caselle restano due conversazioni distinte (non una da quattro).
    let tutte = store.conversazioni("INBOX", 0, 50).unwrap();
    assert_eq!(tutte.len(), 2, "le due caselle non si fondono");
    assert!(tutte.iter().any(|c| c.account == "a" && c.numero == 2));
    assert!(tutte.iter().any(|c| c.account == "b" && c.numero == 2));

    // I messaggi di una conversazione sono confinati all'account.
    let chiave = solo_a[0].chiave.clone();
    let messaggi_a = store.messaggi_conversazione("a", "INBOX", &chiave).unwrap();
    assert_eq!(messaggi_a.len(), 2);
    assert!(messaggi_a.iter().all(|m| m.account == "a"), "solo righe di a");
}

// ---------------------------------------------------------------------------
// Regole: una regola dell'account A non agisce sui messaggi dell'account B.
// ---------------------------------------------------------------------------

#[test]
fn le_regole_dell_account_a_non_agiscono_sull_account_b() {
    let (_dir, store) = cache_temp();
    // Stesso messaggio, stesse condizioni, in due caselle.
    for acc in ["a", "b"] {
        store
            .upsert_header(&riga(acc, "INBOX", "1", "Piano Q4", "Anna <anna@x.it>"))
            .unwrap();
    }
    let regola = outlook_ai_lib::config::Regola {
        id: "r1".to_string(),
        nome: "Categorizza".to_string(),
        attiva: true,
        ordine: 0,
        condizioni: outlook_ai_lib::config::CondizioniRegola {
            oggetto_contiene: "piano".to_string(),
            ..Default::default()
        },
        azioni: vec![outlook_ai_lib::config::AzioneRegola {
            tipo: "categorizza".to_string(),
            valore: "Lavoro".to_string(),
        }],
        esecuzioni: 0,
        ultima_esecuzione: 0,
    };

    // La pianificazione legge solo i messaggi della casella A.
    let righe = store.messaggi_da_regole("a", "INBOX").unwrap();
    assert_eq!(righe.len(), 1, "solo il messaggio di a entra nel motore");
    let messaggi: Vec<motore::Messaggio> = righe.iter().map(Into::into).collect();
    let passi = motore::pianifica(&[regola], &messaggi);
    let valutati: Vec<String> = righe.iter().map(|r| r.uid.clone()).collect();
    // "Categorizza" non tocca il server: la fase di rete risponde `Locale`.
    let risposte = vec![motore::RispostaRete::Locale];
    motore::applica_cache(&store, "a", "INBOX", &passi, &risposte, &valutati).unwrap();

    assert_eq!(store.categorie("a", "INBOX", "1").unwrap(), vec!["Lavoro".to_string()]);
    assert!(store.categorie("b", "INBOX", "1").unwrap().is_empty(), "b non è stato toccato");
    // Il messaggio di b resta da valutare: la regola non l'ha consumato.
    assert_eq!(store.messaggi_da_regole("b", "INBOX").unwrap().len(), 1);
}

// ---------------------------------------------------------------------------
// Non regressione: con una sola casella i risultati sono quelli di prima.
// ---------------------------------------------------------------------------

#[test]
fn con_una_sola_casella_comportamento_invariato() {
    let (_dir, store) = cache_temp();
    let mut h = riga("acct", "INBOX", "1", "Piano Q4", "Anna <anna@x.it>");
    h.message_id = Some("<h@example.it>".to_string());
    store.upsert_header(&h).unwrap();

    // letto/contrassegnato/categorie/sposta sull'unico account agiscono come sempre.
    store.set_seen("acct", "INBOX", "1", true).unwrap();
    store.set_flagged("acct", "INBOX", "1", true).unwrap();
    store
        .set_categorie("acct", "INBOX", "1", &["Lavoro".to_string()])
        .unwrap();
    assert!(store.list("INBOX", 0, 10).unwrap()[0].seen);
    assert!(store.flagged("acct", "INBOX", "1").unwrap());
    store.sposta("acct", "INBOX", "1", "Archivio").unwrap();
    assert!(store.list("INBOX", 0, 10).unwrap().is_empty());
    assert_eq!(store.list("Archivio", 0, 10).unwrap().len(), 1);

    // L'elenco aggregato coincide con quello di un solo account (una casella).
    store.upsert_header(&h).unwrap();
    let solo = store
        .list_per_account("acct", "INBOX", 0, 10, "data", "discendente")
        .unwrap();
    let tutti = store
        .list_tutti_gli_account("INBOX", 0, 10, "data", "discendente")
        .unwrap();
    assert_eq!(solo.len(), tutti.len());
    assert_eq!(solo[0].uid, tutti[0].uid);
}

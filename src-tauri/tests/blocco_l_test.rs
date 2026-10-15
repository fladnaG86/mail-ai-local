//! Blocco L — scoping per account di **cartelle**, registro delle cartelle,
//! conferme di lettura e conversazioni ignorate.
//!
//! Due caselle reali hanno cartelle omonime («Posta in arrivo», «Posta
//! eliminata», «Archivio»…). Questi test verificano che un'operazione a livello
//! di cartella, una conferma registrata, una conversazione ignorata e una
//! cartella preferita di **una** casella non tocchino l'omonima dell'altra.
//! Coprono anche l'`accountId` inesistente (errore leggibile, per ognuno dei
//! comandi toccati) e la non regressione a una sola casella.
//!
//! Lavorano a livello di cache (nessuna rete), tranne i casi che passano dalle
//! operazioni combinate di `mail::ops`, provate con `FakeSource`.

use outlook_ai_lib::config::Account;
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
        message_id: Some(format!("<{account}-{folder}-{uid}@example.it>")),
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

/// Due caselle con le **stesse** cartelle e gli **stessi** UID: è il caso reale.
fn due_caselle_omonime(store: &Store) {
    for acc in ["a", "b"] {
        for cartella in ["INBOX", "Posta eliminata", "Archivio"] {
            store
                .upsert_header(&riga(acc, cartella, "1", "Piano Q4", "Anna <anna@x.it>"))
                .unwrap();
        }
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

// ---------------------------------------------------------------------------
// Operazioni sulle cartelle: una casella non tocca l'omonima dell'altra.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn svuota_cartella_di_una_casella_non_tocca_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle_omonime(&store);
    let src = FakeSource::new().con_cartelle(&["Posta eliminata"]);

    let n = ops::svuota_cartella(&src, &store, "a", "Posta eliminata")
        .await
        .unwrap();
    assert_eq!(n, 1, "ha rimosso solo la riga di a");
    assert!(!esiste(&store, "a", "Posta eliminata", "1"), "la Posta eliminata di a è svuotata");
    assert!(
        esiste(&store, "b", "Posta eliminata", "1"),
        "la Posta eliminata omonima di b resta intatta"
    );
    assert!(esiste(&store, "a", "INBOX", "1"), "INBOX di a non è toccata");
    assert!(esiste(&store, "b", "INBOX", "1"), "INBOX di b non è toccata");
}

#[tokio::test]
async fn elimina_cartella_di_una_casella_non_tocca_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle_omonime(&store);
    store.registra_cartella("a", "Archivio").unwrap();
    store.registra_cartella("b", "Archivio").unwrap();
    store.set_cartella_preferita("a", "Archivio", true).unwrap();
    let src = FakeSource::new().con_cartelle(&["Archivio"]);

    ops::elimina_cartella(&src, &store, "a", "Archivio").await.unwrap();

    assert!(!esiste(&store, "a", "Archivio", "1"), "Archivio di a sparisce dalla cache");
    assert!(
        !store.cartelle_registrate("a").unwrap().iter().any(|(n, _)| n == "Archivio"),
        "la voce di registro di a sparisce"
    );
    assert!(esiste(&store, "b", "Archivio", "1"), "Archivio di b resta");
    assert!(
        store.cartelle_registrate("b").unwrap().iter().any(|(n, _)| n == "Archivio"),
        "il registro di b non è toccato"
    );
}

#[tokio::test]
async fn rinomina_cartella_di_una_casella_non_tocca_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle_omonime(&store);
    store.registra_cartella("a", "Archivio").unwrap();
    store.registra_cartella("b", "Archivio").unwrap();
    let src = FakeSource::new().con_cartelle(&["Archivio"]);

    ops::rinomina_cartella(&src, &store, "a", "Archivio", "Archivio 2026")
        .await
        .unwrap();

    assert!(esiste(&store, "a", "Archivio 2026", "1"), "i messaggi di a seguono il nuovo nome");
    assert!(!esiste(&store, "a", "Archivio", "1"));
    assert!(esiste(&store, "b", "Archivio", "1"), "i messaggi di b restano in Archivio");
    assert!(!esiste(&store, "b", "Archivio 2026", "1"));
    assert!(store.cartelle_registrate("a").unwrap().iter().any(|(n, _)| n == "Archivio 2026"));
    assert!(store.cartelle_registrate("b").unwrap().iter().any(|(n, _)| n == "Archivio"));
}

#[tokio::test]
async fn segna_tutta_letta_di_una_casella_non_tocca_l_altra() {
    let (_dir, store) = cache_temp();
    due_caselle_omonime(&store);
    let src = FakeSource::new();

    let n = ops::segna_cartella_letta(&src, &store, "a", "INBOX").await.unwrap();
    assert_eq!(n, 1, "ha segnato solo la riga di a");

    let a = store.list_per_account("a", "INBOX", 0, 10, "data", "discendente").unwrap();
    let b = store.list_per_account("b", "INBOX", 0, 10, "data", "discendente").unwrap();
    assert!(a[0].seen, "INBOX di a è letto");
    assert!(!b[0].seen, "INBOX di b resta da leggere");
}

#[tokio::test]
async fn un_rifiuto_del_server_lascia_tutto_invariato() {
    let (_dir, store) = cache_temp();
    due_caselle_omonime(&store);
    let src = FakeSource::new().che_rifiuta("permesso negato dal server");

    assert!(ops::svuota_cartella(&src, &store, "a", "Posta eliminata").await.is_err());
    assert!(ops::elimina_cartella(&src, &store, "a", "Archivio").await.is_err());
    assert!(ops::rinomina_cartella(&src, &store, "a", "Archivio", "X").await.is_err());
    assert!(ops::segna_cartella_letta(&src, &store, "a", "INBOX").await.is_err());

    // Entrambe le caselle restano esattamente come prima.
    for acc in ["a", "b"] {
        for cartella in ["INBOX", "Posta eliminata", "Archivio"] {
            assert!(esiste(&store, acc, cartella, "1"), "{acc}/{cartella} resta");
        }
    }
    let b = store.list_per_account("b", "INBOX", 0, 10, "data", "discendente").unwrap();
    assert!(!b[0].seen, "INBOX di b resta da leggere");
}

// ---------------------------------------------------------------------------
// Conferme di lettura/recapito: la scelta vale per quella casella.
// ---------------------------------------------------------------------------

#[test]
fn la_scelta_della_conferma_e_per_account() {
    let (_dir, store) = cache_temp();
    store
        .conferma_registra("a", "INBOX", "5", "lettura", true, 1_700_000_000)
        .unwrap();
    store
        .conferma_registra("b", "INBOX", "5", "lettura", false, 1_700_000_000)
        .unwrap();

    assert_eq!(
        store.conferme_scelte("a", "INBOX", "5").unwrap(),
        vec![("lettura".to_string(), true)],
        "in a la conferma si invia"
    );
    assert_eq!(
        store.conferme_scelte("b", "INBOX", "5").unwrap(),
        vec![("lettura".to_string(), false)],
        "in b la stessa coppia cartella+UID non condivide la scelta"
    );
}

// ---------------------------------------------------------------------------
// Conversazioni ignorate: per account.
// ---------------------------------------------------------------------------

#[test]
fn ignorare_una_conversazione_in_una_casella_non_ignora_l_altra() {
    let (_dir, store) = cache_temp();
    store.conversazione_ignora("a", "thread-chiave", true).unwrap();
    assert!(store.e_conversazione_ignorata("a", "thread-chiave").unwrap());
    assert!(
        !store.e_conversazione_ignorata("b", "thread-chiave").unwrap(),
        "in b la stessa conversazione non è ignorata"
    );
    assert_eq!(store.conversazioni_ignorate("a").unwrap(), vec!["thread-chiave".to_string()]);
    assert!(store.conversazioni_ignorate("b").unwrap().is_empty());
    // E la sincronizzazione di b non trova nulla da spostare.
    store
        .upsert_header(&riga("b", "INBOX", "1", "Re: Piano", "anna@x.it"))
        .unwrap();
    store.set_thread_key("b", "INBOX", "1", "thread-chiave").unwrap();
    let uids_b = store
        .messaggi_di_conversazioni_ignorate("b", "INBOX", &store.conversazioni_ignorate("b").unwrap())
        .unwrap();
    assert!(uids_b.is_empty(), "b non ha conversazioni ignorate da gestire");
}

// ---------------------------------------------------------------------------
// Registro delle cartelle: per account e senza mischiare i Preferiti.
// ---------------------------------------------------------------------------

#[test]
fn il_registro_cartelle_e_per_account_e_non_mischia_i_preferiti() {
    let (_dir, store) = cache_temp();
    store.registra_cartella("a", "Archivio").unwrap();
    store.registra_cartella("a", "Bozze").unwrap();
    store.set_cartella_preferita("a", "Bozze", true).unwrap();
    store.registra_cartella("b", "Archivio").unwrap();

    assert_eq!(store.cartelle_preferite("a").unwrap(), vec!["Bozze".to_string()]);
    assert!(
        store.cartelle_preferite("b").unwrap().is_empty(),
        "i Preferiti di a non compaiono in b"
    );
    assert_eq!(
        store.cartelle_registrate("a").unwrap(),
        vec![("Bozze".to_string(), true), ("Archivio".to_string(), false)],
        "in a la preferita sta in alto"
    );
    assert_eq!(
        store.cartelle_registrate("b").unwrap(),
        vec![("Archivio".to_string(), false)],
        "in b solo le sue cartelle, senza la preferita di a"
    );
}

// ---------------------------------------------------------------------------
// `accountId` inesistente → errore leggibile.
// ---------------------------------------------------------------------------

/// L'id inesistente usato dai test: non è mai configurabile.
const FANTASMA: &str = "account-inesistente@example.invalid";

/// La convenzione è la stessa del blocco K: id assente → predefinito, id
/// inesistente → errore, nessun account → errore leggibile. Gli **stessi**
/// comandi sono provati uno per uno in `src/lib.rs` (`test_account_inesistente`),
/// dove sono visibili senza esporli fuori dal crate.
#[test]
fn la_convenzione_dell_account_e_quella_del_blocco_k() {
    let accounts = vec![account("a"), account("b")];
    let err = risolvi_account(&accounts, Some(FANTASMA), Some("a")).unwrap_err();
    assert!(err.contains("account non configurato") && err.contains(FANTASMA));
    assert_eq!(risolvi_account(&accounts, None, Some("b")).unwrap().id, "b");
    assert_eq!(risolvi_account(&accounts, Some(""), Some("b")).unwrap().id, "b");
    let vuoto: Vec<Account> = Vec::new();
    assert!(risolvi_account(&vuoto, None, None).unwrap_err().contains("nessun account"));
}

// ---------------------------------------------------------------------------
// Non regressione: con una sola casella tutto si comporta come prima.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn con_una_sola_casella_comportamento_invariato() {
    let (_dir, store) = cache_temp();
    store
        .upsert_header(&riga("acct", "INBOX", "1", "Piano Q4", "Anna <anna@x.it>"))
        .unwrap();
    store.registra_cartella("acct", "Bozze").unwrap();
    store.set_cartella_preferita("acct", "Bozze", true).unwrap();
    store.conversazione_ignora("acct", "t-1", true).unwrap();
    store
        .conferma_registra("acct", "INBOX", "1", "lettura", true, 1_700_000_000)
        .unwrap();

    // Le operazioni sull'unica casella agiscono come prima (per il predefinito).
    let src = FakeSource::new();
    let n = ops::segna_cartella_letta(&src, &store, "acct", "INBOX").await.unwrap();
    assert_eq!(n, 1);
    assert!(store.list("INBOX", 0, 10).unwrap()[0].seen);
    assert_eq!(store.cartelle_preferite("acct").unwrap(), vec!["Bozze".to_string()]);
    assert!(store.e_conversazione_ignorata("acct", "t-1").unwrap());
    assert_eq!(
        store.conferme_scelte("acct", "INBOX", "1").unwrap(),
        vec![("lettura".to_string(), true)]
    );
}

//! Test del blocco J — più caselle.
//!
//! Coprono: l'eliminazione di un account (solo i suoi messaggi, gli altri
//! intatti), l'account predefinito (salvataggio, rilettura, ricaduta sul primo,
//! azzeramento quando l'account sparisce), il raggruppamento delle cartelle per
//! account, la lista aggregata di più caselle (ordine per data, account di
//! provenienza) con il **non regresso** a un solo account, le conversazioni per
//! account e la sincronizzazione di tutti gli account con un fallito che non
//! ferma gli altri.

use outlook_ai_lib::config::{self, Account, Preferenze};
use outlook_ai_lib::mail::sync::{FolderSyncSummary, SyncSummary};
use outlook_ai_lib::store::{Header, Store};
use tempfile::tempdir;

// ---------------------------------------------------------------------------
// Aiutanti
// ---------------------------------------------------------------------------

fn account(id: &str, email: &str) -> Account {
    Account {
        id: id.to_string(),
        description: email.to_string(),
        full_name: "Mario Rossi".to_string(),
        email: email.to_string(),
        username: email.to_string(),
        imap_host: "imaps.example.it".to_string(),
        imap_port: 993,
        imap_ssl: true,
        smtp_host: "smtps.example.it".to_string(),
        smtp_port: 465,
        smtp_ssl: true,
    }
}

/// Intestazione di prova in una cartella di un account, con data e stato letti.
fn header(
    account_id: &str,
    folder: &str,
    uid: &str,
    date: i64,
    seen: bool,
) -> Header {
    Header {
        account: account_id.to_string(),
        folder: folder.to_string(),
        uid: uid.to_string(),
        message_id: Some(format!("<{account_id}-{uid}@example.it>")),
        subject: Some(format!("Oggetto {uid}")),
        sender: Some("Mario Rossi <mario@example.it>".to_string()),
        recipients: Some("mario@example.it".to_string()),
        date,
        seen,
        has_attachments: false,
        thread_key: None,
        in_reply_to: None,
        references: None,
    }
}

// ---------------------------------------------------------------------------
// account_elimina — cosa fa ai dati
// ---------------------------------------------------------------------------

#[test]
fn eliminare_un_account_rimuove_solo_i_suoi_messaggi() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    // Due caselle, ognuna con due messaggi in Posta in arrivo.
    for (acc, base) in [("a", 1_700_000_000_i64), ("b", 1_700_000_500_i64)] {
        store
            .upsert_header(&header(acc, "INBOX", "1", base, false))
            .unwrap();
        store
            .upsert_header(&header(acc, "INBOX", "2", base + 10, true))
            .unwrap();
    }

    let rimossi = store.elimina_account("a").unwrap();
    assert_eq!(rimossi, 2, "l'account eliminato perde i suoi due messaggi");

    // L'account eliminato non c'è più in nessuna cartella…
    assert_eq!(store.count_tutti_gli_account("INBOX").unwrap(), 2);
    assert_eq!(store.count_per_account("a", "INBOX").unwrap(), 0);
    // …e i messaggi dell'**altro** account sono intatti, riga per riga.
    let rimasti = store.list_per_account("b", "INBOX", 0, 10, "data", "discendente").unwrap();
    assert_eq!(rimasti.len(), 2, "i messaggi dell'altro account restano tutti");
    assert!(rimasti.iter().all(|m| m.account == "b"));
    assert_eq!(rimasti[0].uid, "2");
}

#[test]
fn eliminare_un_account_non_tocca_la_configurazione_degli_altri() {
    let dir = tempdir().unwrap();
    config::save_account(dir.path(), &account("a", "a@example.it")).unwrap();
    config::save_account(dir.path(), &account("b", "b@example.it")).unwrap();
    config::save_preferenze(dir.path(), &Preferenze::default()).unwrap();

    assert!(config::elimina_account(dir.path(), "a").unwrap(), "a c'era");
    let restanti = config::load_accounts(dir.path());
    assert_eq!(restanti.len(), 1);
    assert_eq!(restanti[0].id, "b", "l'altro account non si tocca");
    // Il file non contiene mai una password.
    let raw = std::fs::read_to_string(dir.path().join("config.json")).unwrap();
    assert!(!raw.to_lowercase().contains("password"));
}

#[test]
fn eliminare_un_account_inesistente_non_cambia_nulla() {
    let dir = tempdir().unwrap();
    config::save_account(dir.path(), &account("a", "a@example.it")).unwrap();
    assert!(!config::elimina_account(dir.path(), "fantasma").unwrap());
    assert_eq!(config::load_accounts(dir.path()).len(), 1);
}

#[test]
fn un_indirizzo_diverso_crea_una_riga_nuova() {
    // Il salvataggio è un upsert per id: un id diverso (un'altra casella) deve
    // aggiungere una riga, non sostituire quella esistente.
    let dir = tempdir().unwrap();
    config::save_account(dir.path(), &account("a", "a@example.it")).unwrap();
    config::save_account(dir.path(), &account("b", "b@example.it")).unwrap();
    let elenco = config::load_accounts(dir.path());
    assert_eq!(elenco.len(), 2, "due caselle distinte restano entrambe");
    // E risalvare la stessa non duplica (upsert).
    config::save_account(dir.path(), &account("b", "b@example.it")).unwrap();
    assert_eq!(config::load_accounts(dir.path()).len(), 2);
}

// ---------------------------------------------------------------------------
// account_predefinito
// ---------------------------------------------------------------------------

#[test]
fn l_account_predefinito_si_salva_e_si_rilegge() {
    let dir = tempdir().unwrap();
    config::save_account(dir.path(), &account("a", "a@example.it")).unwrap();
    config::save_account(dir.path(), &account("b", "b@example.it")).unwrap();

    config::set_account_predefinito(dir.path(), "b").unwrap();
    assert_eq!(
        config::load_preferenze(dir.path()).account_predefinito,
        "b",
        "la preferenza resta nel file"
    );
    assert_eq!(
        config::account_predefinito(dir.path()).map(|a| a.id),
        Some("b".to_string()),
        "l'account predefinito è quello scelto"
    );
}

#[test]
fn senza_scelta_e_predefinito_il_primo_account() {
    let dir = tempdir().unwrap();
    config::save_account(dir.path(), &account("a", "a@example.it")).unwrap();
    config::save_account(dir.path(), &account("b", "b@example.it")).unwrap();
    assert_eq!(
        config::account_predefinito(dir.path()).map(|a| a.id),
        Some("a".to_string())
    );
}

#[test]
fn un_predefinito_inesistente_ricade_sul_primo() {
    let dir = tempdir().unwrap();
    config::save_account(dir.path(), &account("a", "a@example.it")).unwrap();
    config::set_account_predefinito(dir.path(), "sparito").unwrap();
    assert_eq!(
        config::account_predefinito(dir.path()).map(|a| a.id),
        Some("a".to_string()),
        "un id senza account non deve lasciare l'app senza casella"
    );
}

#[test]
fn eliminare_il_predefinito_azzera_la_preferenza() {
    let dir = tempdir().unwrap();
    config::save_account(dir.path(), &account("a", "a@example.it")).unwrap();
    config::save_account(dir.path(), &account("b", "b@example.it")).unwrap();
    config::set_account_predefinito(dir.path(), "b").unwrap();

    config::elimina_account(dir.path(), "b").unwrap();
    assert_eq!(
        config::load_preferenze(dir.path()).account_predefinito,
        "",
        "la preferenza si azzera: all'avvio si aprirà il primo disponibile"
    );
    assert_eq!(
        config::account_predefinito(dir.path()).map(|a| a.id),
        Some("a".to_string())
    );
}

// ---------------------------------------------------------------------------
// cartelle raggruppate per account
// ---------------------------------------------------------------------------

#[test]
fn cartelle_elenco_raggruppa_per_account() {
    let accounts = vec![
        account("a", "a@example.it"),
        account("b", "b@example.it"),
    ];
    let registrate = vec![
        ("INBOX".to_string(), false),
        ("Posta inviata".to_string(), true),
    ];
    // Il contatore finto: 'a' ha INBOX con 3 non letti, 'b' ha INBOX e Bozze.
    // Il registro è per account (blocco L): solo 'a' ha le cartelle del server.
    let gruppi = outlook_ai_lib::gruppi_cartelle(
        &accounts,
        |id| if id == "a" { registrate.clone() } else { Vec::new() },
        "a",
        |id| {
            if id == "a" {
                vec![("INBOX".to_string(), 3)]
            } else {
                vec![("INBOX".to_string(), 0), ("Bozze".to_string(), 1)]
            }
        },
    );

    assert_eq!(gruppi.len(), 2, "un gruppo per casella");
    assert_eq!(gruppi[0].account, "a");
    assert!(gruppi[0].predefinito, "il predefinito è segnalato");
    assert!(!gruppi[1].predefinito);

    // Le cartelle di 'a': INBOX dai messaggi (3 non letti) + il registro del
    // server (Posta inviata, preferita in alto).
    let a: Vec<&str> = gruppi[0].cartelle.iter().map(|c| c.nome.as_str()).collect();
    assert!(a.contains(&"INBOX"), "INBOX c'è");
    assert!(a.contains(&"Posta inviata"), "il registro del predefinito c'è");
    let inbox_a = gruppi[0]
        .cartelle
        .iter()
        .find(|c| c.nome == "INBOX")
        .unwrap();
    assert_eq!(inbox_a.non_letti, 3, "i non letti vengono dalla cache");

    // 'b' (non predefinito) mostra solo le cartelle che ha in cache.
    let b: Vec<&str> = gruppi[1].cartelle.iter().map(|c| c.nome.as_str()).collect();
    assert_eq!(b, vec!["Bozze", "INBOX"], "solo le cartelle in cache, in ordine");
    assert_eq!(gruppi[1].cartelle.iter().find(|c| c.nome == "Bozze").unwrap().non_letti, 1);
}

#[test]
fn i_preferiti_restano_in_alto_nel_loro_account() {
    let accounts = vec![account("a", "a@example.it")];
    let registrate = vec![
        ("Archivio".to_string(), false),
        ("Posta in arrivo".to_string(), false),
        ("Importanti".to_string(), true),
    ];
    let gruppi = outlook_ai_lib::gruppi_cartelle(&accounts, |_| registrate.clone(), "a", |_| Vec::new());
    let nomi: Vec<&str> = gruppi[0].cartelle.iter().map(|c| c.nome.as_str()).collect();
    assert_eq!(
        nomi.first(),
        Some(&"Importanti"),
        "il preferito ★ sta in alto dentro il suo account"
    );
}

#[test]
fn i_non_letti_per_cartella_vengono_dalla_cache() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.upsert_header(&header("a", "INBOX", "1", 10, false)).unwrap();
    store.upsert_header(&header("a", "INBOX", "2", 20, false)).unwrap();
    store.upsert_header(&header("a", "INBOX", "3", 30, true)).unwrap();
    store.upsert_header(&header("a", "Bozze", "4", 40, false)).unwrap();
    // Un altro account non entra nel conteggio di 'a'.
    store.upsert_header(&header("b", "INBOX", "5", 50, false)).unwrap();

    let mut cartelle = store.cartelle_per_account("a").unwrap();
    cartelle.sort();
    assert_eq!(
        cartelle,
        vec![("Bozze".to_string(), 1), ("INBOX".to_string(), 2)],
        "due non letti in INBOX, uno in Bozze, e 'b' non conta"
    );
}

// ---------------------------------------------------------------------------
// mail_list: unione di tutte le caselle e non regresso a una sola
// ---------------------------------------------------------------------------

#[test]
fn la_posta_in_arrivo_di_tutte_le_caselle_si_unisce_per_data() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    // Due caselle, date intrecciate.
    store.upsert_header(&header("a", "INBOX", "1", 100, false)).unwrap();
    store.upsert_header(&header("a", "INBOX", "2", 300, true)).unwrap();
    store.upsert_header(&header("b", "INBOX", "1", 200, false)).unwrap();
    store.upsert_header(&header("b", "INBOX", "2", 400, true)).unwrap();

    let righe = store
        .list_tutti_gli_account("INBOX", 0, 50, "data", "discendente")
        .unwrap();
    let ordine: Vec<(String, i64)> = righe.iter().map(|m| (m.account.clone(), m.date)).collect();
    assert_eq!(
        ordine,
        vec![
            ("b".to_string(), 400),
            ("a".to_string(), 300),
            ("b".to_string(), 200),
            ("a".to_string(), 100),
        ],
        "unite e ordinate per data, con l'account di provenienza su ogni riga"
    );
    assert_eq!(store.count_tutti_gli_account("INBOX").unwrap(), 4);
}

#[test]
fn con_una_sola_casella_la_lista_e_identica_a_prima() {
    // Non regresso: con un solo account, la lista aggregata dà esattamente le
    // stesse righe (stesso ordine) della lista per cartella di sempre.
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    for (i, uid) in ["10", "11", "12"].iter().enumerate() {
        let mut h = header("a", "INBOX", uid, 1_700_000_000 + i as i64, i % 2 == 0);
        h.subject = Some(format!("INBOX {uid}"));
        store.upsert_header(&h).unwrap();
    }
    for (i, uid) in ["20", "21"].iter().enumerate() {
        let mut h = header("a", "Archivio", uid, 1_700_000_000 + i as i64, true);
        h.subject = Some(format!("Archivio {uid}"));
        store.upsert_header(&h).unwrap();
    }

    for (campo, verso) in [
        ("data", "discendente"),
        ("data", "crescente"),
        ("mittente", "crescente"),
        ("oggetto", "discendente"),
    ] {
        let vecchio = store.list_ordinato("INBOX", 0, 50, campo, verso).unwrap();
        let nuovo = store.list_tutti_gli_account("INBOX", 0, 50, campo, verso).unwrap();
        let uid = |v: &Vec<outlook_ai_lib::store::MessageRow>| {
            v.iter().map(|m| m.uid.clone()).collect::<Vec<_>>()
        };
        assert_eq!(uid(&vecchio), uid(&nuovo), "stesso ordine con {campo}/{verso}");
    }
    // Anche il conteggio resta lo stesso.
    assert_eq!(
        store.count("INBOX").unwrap(),
        store.count_tutti_gli_account("INBOX").unwrap()
    );
}

#[test]
fn la_lista_di_un_account_solo_e_la_sua() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.upsert_header(&header("a", "INBOX", "1", 100, false)).unwrap();
    store.upsert_header(&header("b", "INBOX", "1", 200, false)).unwrap();

    let di_a = store.list_per_account("a", "INBOX", 0, 50, "data", "discendente").unwrap();
    assert_eq!(di_a.len(), 1);
    assert_eq!(di_a[0].account, "a");
    // La stessa coppia (cartella, uid) in due caselle non si confonde.
    let di_b = store.list_per_account("b", "INBOX", 0, 50, "data", "discendente").unwrap();
    assert_eq!(di_b[0].account, "b");
    assert_eq!(di_b[0].date, 200);
}

// ---------------------------------------------------------------------------
// conversazioni su più account
// ---------------------------------------------------------------------------

#[test]
fn le_conversazioni_distinguono_le_caselle() {
    let dir = tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    // Stessa chiave di conversazione (stesso oggetto) in due caselle diverse.
    for acc in ["a", "b"] {
        let mut h1 = header(acc, "INBOX", "1", 100, false);
        h1.subject = Some("Piano Q4".to_string());
        let mut h2 = header(acc, "INBOX", "2", 200, true);
        h2.subject = Some("Piano Q4".to_string());
        store.upsert_header(&h1).unwrap();
        store.upsert_header(&h2).unwrap();
    }
    for acc in ["a", "b"] {
        let _ = outlook_ai_lib::mail::sync::aggiorna_thread(&store, acc, "INBOX").unwrap();
    }

    let tutte = store.conversazioni("INBOX", 0, 50).unwrap();
    assert_eq!(
        tutte.len(),
        2,
        "la stessa conversazione in due caselle resta due righe"
    );
    assert!(tutte.iter().any(|c| c.account == "a" && c.numero == 2));
    assert!(tutte.iter().any(|c| c.account == "b" && c.numero == 2));

    let solo_a = store.conversazioni_per_account("a", "INBOX", 0, 50).unwrap();
    assert_eq!(solo_a.len(), 1);
    assert_eq!(solo_a[0].account, "a");
    assert_eq!(solo_a[0].messaggi.len(), 2);
}

// ---------------------------------------------------------------------------
// mail_sync_tutti — un fallito non ferma gli altri
// ---------------------------------------------------------------------------

#[tokio::test]
async fn sync_tutti_riporta_l_esito_degli_altri_se_uno_fallisce() {
    let accounts = vec![
        account("ok1", "ok1@example.it"),
        account("rotto", "rotto@example.it"),
        account("ok2", "ok2@example.it"),
    ];
    let esiti = outlook_ai_lib::sync_tutti_con(accounts, |account| async move {
        if account.id == "rotto" {
            Err("login IMAP rifiutato: password errata".to_string())
        } else {
            Ok(SyncSummary {
                folders: vec![
                    FolderSyncSummary {
                        folder: "INBOX".to_string(),
                        new_messages: 2,
                    },
                    FolderSyncSummary {
                        folder: "Bozze".to_string(),
                        new_messages: 0,
                    },
                ],
            })
        }
    })
    .await;

    assert_eq!(esiti.len(), 3, "un esito per ogni account");
    // L'account fallito porta il suo errore, senza fermare gli altri.
    let rotto = esiti.iter().find(|e| e.account == "rotto").unwrap();
    assert!(!rotto.ok);
    assert!(rotto.errore.as_deref().unwrap().contains("login IMAP rifiutato"));

    let ok1 = esiti.iter().find(|e| e.account == "ok1").unwrap();
    assert!(ok1.ok, "il primo account è stato sincronizzato comunque");
    assert_eq!(ok1.nuovi, 2, "i messaggi nuovi sono sommati per cartella");
    assert_eq!(ok1.cartelle, 2);
    assert!(ok1.errore.is_none());

    let ok2 = esiti.iter().find(|e| e.account == "ok2").unwrap();
    assert!(ok2.ok, "anche l'account dopo quello fallito prosegue");
    assert_eq!(ok2.email, "ok2@example.it");
}

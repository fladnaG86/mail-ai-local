//! Test del blocco D, seconda metà: firme multiple con migrazione dalla firma
//! singola, firma predefinita per account, posta indesiderata (elenco, sblocco,
//! protezione durante la sincronizzazione), Privacy (svuota/esporta registro) e
//! Generale (svuota cache senza perdere configurazione, firme e registro).

use outlook_ai_lib::config::{self, firme_effettive, Firma, Preferenze};
use outlook_ai_lib::mail::{FakeSource, MessageHeader};
use outlook_ai_lib::store::{self, AuditEntry, Store};
use outlook_ai_lib::{
    registro_ia_esporta_in, stato_posta_indesiderata_da, svuota_cache_in, Impostazioni,
};

/// Un'intestazione di cache per una cartella.
fn header(account: &str, folder: &str, uid: &str, sender: &str) -> store::Header {
    store::Header {
        account: account.to_string(),
        folder: folder.to_string(),
        uid: uid.to_string(),
        message_id: Some(format!("<{uid}@example.it>")),
        subject: Some("Oggetto".to_string()),
        sender: Some(sender.to_string()),
        recipients: Some("mario@example.it".to_string()),
        date: 1_700_000_000,
        seen: false,
        has_attachments: false,
        thread_key: None,
        in_reply_to: None,
        references: None,
    }
}

// ---------------------------------------------------------------------------
// Firme
// ---------------------------------------------------------------------------

#[test]
fn migrazione_dalla_firma_singola_alle_firme_multiple() {
    let dir = tempfile::tempdir().unwrap();
    let vecchio = r#"{
        "theme": "dark",
        "preferenze": { "firmaDelMittente": "Mario Rossi\nResponsabile sistemi" }
    }"#;
    std::fs::write(dir.path().join("config.json"), vecchio).unwrap();

    // Alla lettura la firma singola diventa una firma vera, senza perdersi.
    let p = config::load_preferenze(dir.path());
    let eff = firme_effettive(&p);
    assert_eq!(eff.len(), 1, "la firma singola diventa una firma dell'elenco");
    assert_eq!(eff[0].id, "predefinita");
    assert_eq!(eff[0].contenuto, "Mario Rossi\nResponsabile sistemi");
    // Il campo storico resta leggibile (compatibilità), il tema/altro non si perde.
    assert_eq!(p.firma_del_mittente, "Mario Rossi\nResponsabile sistemi");
    assert_eq!(config::load_from(dir.path()).unwrap().theme, "dark");

    // Dopo un salvataggio non si duplica: ad ogni lettura resta una sola firma.
    config::save_preferenze(dir.path(), &p).unwrap();
    let rilette = firme_effettive(&config::load_preferenze(dir.path()));
    assert_eq!(rilette.len(), 1, "la migrazione non duplica la firma");
    assert_eq!(rilette[0].contenuto, "Mario Rossi\nResponsabile sistemi");
}

#[test]
fn firma_predefinita_per_account_rispettata() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.firme = vec![
        Firma {
            id: "lavoro".to_string(),
            nome: "Lavoro".to_string(),
            contenuto: "Cordiali saluti, Mario".to_string(),
            html: false,
        },
        Firma {
            id: "personale".to_string(),
            nome: "Personale".to_string(),
            contenuto: "Mario".to_string(),
            html: false,
        },
    ];
    p.firma_predefinita_per_account
        .insert("acc-lavoro".to_string(), "lavoro".to_string());
    // Un riferimento a una firma inesistente: alla lettura viene scartato.
    p.firma_predefinita_per_account
        .insert("acc-storto".to_string(), "inesistente".to_string());

    config::save_preferenze(dir.path(), &p).unwrap();
    let lette = config::load_preferenze(dir.path());
    assert_eq!(lette.firme.len(), 2);
    assert_eq!(
        lette
            .firma_predefinita_per_account
            .get("acc-lavoro")
            .map(String::as_str),
        Some("lavoro"),
        "la firma predefinita dell'account è rispettata"
    );
    assert!(
        !lette.firma_predefinita_per_account.contains_key("acc-storto"),
        "un riferimento a una firma inesistente viene scartato"
    );
}

#[test]
fn salvataggio_rifiuta_firme_con_id_duplicato() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    let f = Firma {
        id: "x".to_string(),
        nome: "A".to_string(),
        contenuto: "A".to_string(),
        html: false,
    };
    p.firme = vec![f.clone(), f];
    assert!(
        config::save_preferenze(dir.path(), &p).is_err(),
        "due firme con lo stesso id non vanno salvate"
    );
}

// ---------------------------------------------------------------------------
// Posta indesiderata: elenco, sblocco, protezione
// ---------------------------------------------------------------------------

#[test]
fn elenco_bloccati_e_sblocco() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store.aggiungi_mittente_bloccato("Spam@X.it").unwrap();
    store.aggiungi_mittente_bloccato("altro@y.it").unwrap();
    assert_eq!(store.mittenti_bloccati().unwrap(), vec!["altro@y.it", "spam@x.it"]);
    assert!(store.mittente_bloccato("SPAM@x.it").unwrap());

    // Sblocco: rimuove l'indirizzo.
    assert_eq!(store.rimuovi_mittente_bloccato("spam@x.it").unwrap(), 1);
    assert_eq!(store.mittenti_bloccati().unwrap(), vec!["altro@y.it"]);

    // Sbloccare un indirizzo non bloccato NON è un errore: rimuove zero righe.
    assert_eq!(store.rimuovi_mittente_bloccato("nessuno@z.it").unwrap(), 0);
    assert_eq!(store.rimuovi_mittente_bloccato("   ").unwrap(), 0);
}

#[tokio::test]
async fn protezione_attiva_sposta_il_messaggio_del_mittente_bloccato() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store
        .upsert_header(&header("acc", "INBOX", "201", "Spam <spam@x.it>"))
        .unwrap();
    store.aggiungi_mittente_bloccato("spam@x.it").unwrap();

    let bloccati = store.mittenti_bloccati().unwrap();
    let intestazioni = vec![MessageHeader {
        uid: "201".to_string(),
        message_id: None,
        subject: Some("Vinci un premio".to_string()),
        from: Some("Spam <spam@x.it>".to_string()),
        to: None,
        date: 1_700_000_000,
        seen: false,
        has_attachments: false,
        in_reply_to: None,
        references: None,
    }];
    let uids = outlook_ai_lib::mail::protezione::uids_da_mittenti_bloccati(&intestazioni, &bloccati);
    assert_eq!(uids, vec!["201"]);

    // La sorgente finta ha il messaggio in INBOX e la cartella di destinazione:
    // lo spostamento sul server riesce.
    let src = FakeSource::new().con_cartelle(&["Posta indesiderata"]);
    src.push_header("INBOX", intestazioni[0].clone());
    let spostati = outlook_ai_lib::mail::protezione::sposta_sul_server(
        &src,
        "INBOX",
        &uids,
        Some("Posta indesiderata"),
    )
    .await;
    let esito = outlook_ai_lib::mail::protezione::aggiorna_cache(
        &store,
        "acc",
        "INBOX",
        &uids,
        &spostati,
        Some("Posta indesiderata"),
        "attiva",
    )
    .unwrap();
    assert_eq!(esito.spostati, 1, "con protezione attiva il messaggio è spostato");
    assert_eq!(esito.marcati, 0);

    let inbox = store.list("INBOX", 0, 10).unwrap();
    assert!(inbox.is_empty(), "il messaggio ha lasciato la Posta in arrivo");
    let junk = store.list("Posta indesiderata", 0, 10).unwrap();
    assert_eq!(junk.len(), 1);
    assert_eq!(junk[0].uid, "201");
    assert!(!store.indesiderato("acc", "Posta indesiderata", "201").unwrap());
}

#[tokio::test]
async fn protezione_spenta_marca_soltanto_il_messaggio() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("cache.db")).unwrap();
    store
        .upsert_header(&header("acc", "INBOX", "202", "Spam <spam@x.it>"))
        .unwrap();
    store.aggiungi_mittente_bloccato("spam@x.it").unwrap();
    let bloccati = store.mittenti_bloccati().unwrap();
    let intestazioni = vec![MessageHeader {
        uid: "202".to_string(),
        message_id: None,
        subject: None,
        from: Some("Spam <spam@x.it>".to_string()),
        to: None,
        date: 1_700_000_000,
        seen: false,
        has_attachments: false,
        in_reply_to: None,
        references: None,
    }];
    let uids = outlook_ai_lib::mail::protezione::uids_da_mittenti_bloccati(&intestazioni, &bloccati);

    let esito = outlook_ai_lib::mail::protezione::aggiorna_cache(
        &store,
        "acc",
        "INBOX",
        &uids,
        &[],
        Some("Posta indesiderata"),
        "spenta",
    )
    .unwrap();
    assert_eq!(esito.marcati, 1, "con protezione spenta il messaggio è solo marcato");
    assert_eq!(esito.spostati, 0);
    // Resta in Posta in arrivo, con lo stato indesiderato.
    assert_eq!(store.list("INBOX", 0, 10).unwrap().len(), 1);
    assert!(store.indesiderato("acc", "INBOX", "202").unwrap());
}

#[test]
fn stato_posta_indesiderata_riporta_mittenti_protezione_e_ultima_azione() {
    let dir = tempfile::tempdir().unwrap();
    let percorso = dir.path().join("cache.db");
    {
        let store = Store::open(&percorso).unwrap();
        store.aggiungi_mittente_bloccato("spam@x.it").unwrap();
    }
    let mut p = Preferenze::default();
    p.protezione_posta_indesiderata = "spenta".to_string();
    p.protezione_ultima_azione = 1_700_000_000;
    config::save_preferenze(dir.path(), &p).unwrap();

    let stato = stato_posta_indesiderata_da(dir.path(), &percorso).unwrap();
    assert_eq!(stato.mittenti, vec!["spam@x.it"]);
    assert_eq!(stato.protezione, "spenta");
    assert_eq!(stato.ultima_azione, 1_700_000_000);
}

// ---------------------------------------------------------------------------
// Privacy (registro) e Generale (svuota cache)
// ---------------------------------------------------------------------------

#[test]
fn svuota_cache_rimuove_i_messaggi_ma_conserva_config_firme_e_registro() {
    let dir = tempfile::tempdir().unwrap();
    let percorso = dir.path().join("cache.db");

    // Configurazione con firme: non deve essere toccata.
    let mut p = Preferenze::default();
    p.firme = vec![Firma {
        id: "lavoro".to_string(),
        nome: "Lavoro".to_string(),
        contenuto: "Cordiali saluti".to_string(),
        html: false,
    }];
    config::save_preferenze(dir.path(), &p).unwrap();

    {
        let store = Store::open(&percorso).unwrap();
        store
            .upsert_header(&header("acc", "INBOX", "1", "a@b.it"))
            .unwrap();
        store
            .upsert_header(&header("acc", "INBOX", "2", "c@d.it"))
            .unwrap();
        store
            .audit_log(&AuditEntry {
                timestamp: 1_700_000_000,
                provider: "cloud".to_string(),
                modello: "m".to_string(),
                azione: "riassumi".to_string(),
                prompt_version: "v1".to_string(),
                hash_testo: format!("{:064x}", 7),
            })
            .unwrap();
        store.aggiungi_mittente_bloccato("spam@x.it").unwrap();
    }

    let rimossi = svuota_cache_in(&percorso).unwrap();
    assert_eq!(rimossi, 2, "due messaggi rimossi dalla cache");

    let store = Store::open(&percorso).unwrap();
    assert_eq!(store.list("INBOX", 0, 10).unwrap().len(), 0, "i messaggi sono spariti");
    // Il registro e i mittenti bloccati restano.
    assert_eq!(store.audit_all().unwrap().len(), 1, "il registro IA resta");
    assert_eq!(store.mittenti_bloccati().unwrap().len(), 1, "i bloccati restano");
    // La configurazione con le firme resta intatta.
    let rilette = config::load_preferenze(dir.path());
    assert_eq!(rilette.firme.len(), 1);
    assert_eq!(rilette.firme[0].contenuto, "Cordiali saluti");
}

#[test]
fn svuota_registro_toglie_le_voci_ma_non_i_messaggi() {
    let dir = tempfile::tempdir().unwrap();
    let percorso = dir.path().join("cache.db");
    let store = Store::open(&percorso).unwrap();
    store
        .upsert_header(&header("acc", "INBOX", "1", "a@b.it"))
        .unwrap();
    for i in 0..3 {
        store
            .audit_log(&AuditEntry {
                timestamp: 1_700_000_000 + i,
                provider: "cloud".to_string(),
                modello: "m".to_string(),
                azione: "riassumi".to_string(),
                prompt_version: "v1".to_string(),
                hash_testo: format!("{:064x}", i + 1),
            })
            .unwrap();
    }

    assert_eq!(store.svuota_registro().unwrap(), 3, "tre voci rimosse");
    assert!(store.audit_all().unwrap().is_empty(), "il registro è vuoto");
    assert_eq!(
        store.list("INBOX", 0, 10).unwrap().len(),
        1,
        "svuotare il registro non tocca i messaggi"
    );
}

#[test]
fn esporta_registro_scrive_le_impronte_e_mai_il_testo() {
    let dir = tempfile::tempdir().unwrap();
    let percorso = dir.path().join("cache.db");
    {
        let store = Store::open(&percorso).unwrap();
        store
            .audit_log(&AuditEntry {
                timestamp: 1_700_000_000,
                provider: "cloud".to_string(),
                modello: "openai/gpt-4o-mini".to_string(),
                azione: "riassumi".to_string(),
                prompt_version: "v1".to_string(),
                hash_testo: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
                    .to_string(),
            })
            .unwrap();
    }
    let destinazione = dir.path().join("registro.txt");
    let n = registro_ia_esporta_in(&percorso, &destinazione).unwrap();
    assert_eq!(n, 1);
    let testo = std::fs::read_to_string(&destinazione).unwrap();
    assert!(testo.contains("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
    assert!(testo.contains("openai/gpt-4o-mini"));
    assert!(testo.contains("riassumi"));
    assert!(testo.contains("mai il testo"), "il file dichiara cosa non contiene");
}

#[test]
fn impostazioni_salva_e_rilegge_le_nuove_preferenze() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Preferenze::default();
    p.firme = vec![Firma {
        id: "lavoro".to_string(),
        nome: "Lavoro".to_string(),
        contenuto: "Saluti".to_string(),
        html: true,
    }];
    p.firma_predefinita_per_account
        .insert("acc".to_string(), "lavoro".to_string());
    p.cartella_iniziale = "INBOX".to_string();
    p.protezione_posta_indesiderata = "attiva".to_string();
    p.protezione_ultima_azione = 42;
    let imp = Impostazioni {
        theme: "light".to_string(),
        preferenze: p.clone(),
    };
    outlook_ai_lib::impostazioni_salva_in(dir.path(), &imp).unwrap();
    let lette = outlook_ai_lib::impostazioni_leggi_da(dir.path()).unwrap();
    assert_eq!(lette.theme, "light");
    assert_eq!(lette.preferenze.firme, p.firme);
    assert_eq!(lette.preferenze.protezione_posta_indesiderata, "attiva");
    assert_eq!(lette.preferenze.protezione_ultima_azione, 42);
}

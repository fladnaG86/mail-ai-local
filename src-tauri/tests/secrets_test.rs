//! Test del modulo segreti: con il backend in memoria (niente Keychain reale),
//! set + get restituisce quanto salvato e il file di configurazione resta senza password.

use outlook_ai_lib::config::{self, Account};
use outlook_ai_lib::secrets;

fn account_di_prova() -> Account {
    Account {
        id: "mario".to_string(),
        description: "Posta lavorativa".to_string(),
        full_name: "Mario Rossi".to_string(),
        email: "mario.rossi@esempiogroup.it".to_string(),
        username: "mario.rossi@esempiogroup.it".to_string(),
        imap_host: "imaps.esempiohost.it".to_string(),
        imap_port: 993,
        imap_ssl: true,
        smtp_host: "smtps.esempiohost.it".to_string(),
        smtp_port: 465,
        smtp_ssl: true,
    }
}

#[test]
fn set_e_get_restituiscono_quanto_salvato() {
    let store = secrets::Store::in_memory_for_tests();
    store.set("acct:mario", "s3gr3t0").unwrap();
    assert_eq!(store.get("acct:mario").unwrap(), "s3gr3t0");
}

#[test]
fn delete_rimuove_il_segreto() {
    let store = secrets::Store::in_memory_for_tests();
    store.set("acct:mario", "s3gr3t0").unwrap();
    store.delete("acct:mario").unwrap();
    assert!(store.get("acct:mario").is_err(), "dopo delete il segreto non esiste più");
}

#[test]
fn secret_never_lands_in_config_file() {
    let store = secrets::Store::in_memory_for_tests();
    store.set("acct:mario", "s3gr3t0").unwrap();
    let dir = tempfile::tempdir().unwrap();
    config::save_account(dir.path(), &account_di_prova()).unwrap();
    let raw = std::fs::read_to_string(dir.path().join("config.json")).unwrap();
    assert!(
        !raw.contains("s3gr3t0"),
        "la password non deve finire nel file di configurazione"
    );
}

// ---------------------------------------------------------------------------
// Chiave OpenRouter (pannello Assistente IA, cloud)
// ---------------------------------------------------------------------------

/// La chiave del cloud ha un segreto suo nel Portachiavi, distinto da quelli
/// degli account: cancellare una casella non deve toccare la chiave, e
/// viceversa. La costante vive nel client IA, così il nome è uno solo.
#[test]
fn la_chiave_openrouter_ha_il_suo_segreto_e_non_si_mescola_agli_account() {
    let store = secrets::Store::in_memory_for_tests();
    store.set("acct:mario", "password-casella").unwrap();
    store.set(outlook_ai_lib::ai::client::SEGRETO_OPENROUTER, "sk-or-v1-abc").unwrap();

    assert_eq!(
        store.get(outlook_ai_lib::ai::client::SEGRETO_OPENROUTER).unwrap(),
        "sk-or-v1-abc"
    );

    // Cancellare l'account non porta via la chiave del cloud.
    store.delete("acct:mario").unwrap();
    assert_eq!(
        store.get(outlook_ai_lib::ai::client::SEGRETO_OPENROUTER).unwrap(),
        "sk-or-v1-abc",
        "la chiave del cloud è stata cancellata insieme all'account"
    );
}

// ---------------------------------------------------------------------------
// Prova della chiave cloud (pulsante «Prova la chiave»)
// ---------------------------------------------------------------------------

mod trasporto_finto {
    use outlook_ai_lib::ai::client::{ErroreAi, RichiestaHttp, RispostaHttp, Trasporto};
    use std::sync::{Arc, Mutex};

    /// Trasporto che non tocca la rete: registra la richiesta e risponde a comando.
    pub struct Finto {
        pub richieste: Arc<Mutex<Vec<RichiestaHttp>>>,
        pub stato: u16,
        pub corpo: String,
    }

    #[async_trait::async_trait]
    impl Trasporto for Finto {
        async fn invia(&self, richiesta: RichiestaHttp) -> Result<RispostaHttp, ErroreAi> {
            self.richieste.lock().unwrap().push(richiesta);
            Ok(RispostaHttp {
                stato: self.stato,
                corpo: self.corpo.clone(),
            })
        }
    }
}

/// Con una chiave valida il cloud risponde: la prova restituisce il testo.
#[tokio::test]
async fn la_prova_della_chiave_riporta_la_risposta_del_cloud() {
    use std::sync::{Arc, Mutex};
    let richieste = Arc::new(Mutex::new(Vec::new()));
    let trasporto = trasporto_finto::Finto {
        richieste: richieste.clone(),
        stato: 200,
        corpo: r#"{"choices":[{"message":{"content":"ok"}}]}"#.to_string(),
    };

    let esito = outlook_ai_lib::prova_chiave_cloud_con(trasporto, Some("sk-or-v1-abc".into()))
        .await
        .expect("con una chiave presente la prova deve riuscire");
    assert_eq!(esito, "ok");

    // La chiave è arrivata come Authorization Bearer, e l'endpoint è quello cloud.
    let inviata = richieste.lock().unwrap().pop().expect("una richiesta inviata");
    assert_eq!(inviata.chiave.as_deref(), Some("sk-or-v1-abc"));
    assert!(
        inviata.url.starts_with("https://openrouter.ai/"),
        "endpoint inatteso: {}",
        inviata.url
    );
}

/// Senza chiave la prova **non tocca la rete** e lo dice: è il caso di chi
/// preme «Prova la chiave» prima di averla salvata.
#[tokio::test]
async fn senza_chiave_la_prova_non_tocca_la_rete_e_lo_dichiara() {
    use std::sync::{Arc, Mutex};
    let richieste = Arc::new(Mutex::new(Vec::new()));
    let trasporto = trasporto_finto::Finto {
        richieste: richieste.clone(),
        stato: 200,
        corpo: r#"{"choices":[{"message":{"content":"ok"}}]}"#.to_string(),
    };

    let esito = outlook_ai_lib::prova_chiave_cloud_con(trasporto, None).await;
    assert!(
        matches!(esito, Err(outlook_ai_lib::ai::client::ErroreAi::ChiaveAssente)),
        "atteso ChiaveAssente, ottenuto {esito:?}"
    );
    assert!(
        richieste.lock().unwrap().is_empty(),
        "senza chiave non deve partire nessuna richiesta di rete"
    );
}

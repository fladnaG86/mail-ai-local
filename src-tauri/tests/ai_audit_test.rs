// Test del registro delle richieste IA inviate al cloud (task 6.3, Milestone 6).
// Coprono: una riga dopo una chiamata cloud autorizzata, con hash coerente e
// SENZA il testo; l'assenza di righe per le chiamate locali; la stabilità
// dell'hash nello stesso input.
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use outlook_ai_lib::ai::audit::{sha256_hex, RegistroStore};
use outlook_ai_lib::ai::client::{
    testo_inviato, Client, ErroreAi, MessaggioChat, Richiesta, RichiestaHttp, RispostaHttp,
    Trasporto,
};
use outlook_ai_lib::store::Store;
use tempfile::tempdir;

/// Trasporto di prova: nessuna rete, risposta fissa.
#[derive(Clone)]
struct TrasportoFinto {
    risposta: Arc<Mutex<RispostaHttp>>,
}

impl TrasportoFinto {
    fn ok(testo: &str) -> Self {
        let corpo = format!(
            r#"{{"choices":[{{"message":{{"content":{}}}}}]}}"#,
            serde_json::to_string(testo).unwrap()
        );
        TrasportoFinto {
            risposta: Arc::new(Mutex::new(RispostaHttp {
                stato: 200,
                corpo,
            })),
        }
    }
}

#[async_trait]
impl Trasporto for TrasportoFinto {
    async fn invia(&self, _richiesta: RichiestaHttp) -> Result<RispostaHttp, ErroreAi> {
        Ok(self.risposta.lock().unwrap().clone())
    }
}

/// Richiesta di prova con un testo riconoscibile, così si può verificare che non
/// finisca mai nel registro.
fn richiesta(provider: &str, consenso_cloud: bool, testo: &str) -> Richiesta {
    Richiesta {
        provider: provider.to_string(),
        endpoint: String::new(),
        modello: "modello-di-prova".to_string(),
        azione: "riassumi".to_string(),
        prompt_version: "v1".to_string(),
        temperatura: 0.2,
        consenso_cloud,
        messaggi: vec![MessaggioChat::utente(testo)],
    }
}

#[tokio::test]
async fn cloud_autorizzato_finisce_nel_registro_senza_testo() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("cache.db");

    let registro = RegistroStore::apri(&path).unwrap();
    let lettore = Store::open(&path).unwrap();
    let client = Client::con_registro(
        TrasportoFinto::ok("riassunto"),
        Some("chiave-finta".into()),
        Some(Box::new(registro)),
    );

    let segreto = "SEGRETO-DEL-THREAD-42";
    let r = richiesta("cloud", true, &format!("riassumi questo: {segreto}"));
    client.completa(&r).await.unwrap();

    let righe = lettore.audit_all().unwrap();
    assert_eq!(righe.len(), 1, "una chiamata cloud deve produrre una riga");
    let riga = &righe[0];

    // hash coerente con il testo effettivamente inviato.
    let atteso = sha256_hex(&testo_inviato(&r.messaggi));
    assert_eq!(riga.hash_testo, atteso, "l'hash deve corrispondere al testo inviato");
    assert_eq!(riga.provider, "cloud");
    assert_eq!(riga.modello, "modello-di-prova");
    assert_eq!(riga.azione, "riassumi");
    assert_eq!(riga.prompt_version, "v1");
    assert!(riga.timestamp > 0, "il registro deve avere data e ora");
    // mai il testo.
    assert!(!riga.hash_testo.contains(segreto));

    // Il file del database non deve contenere il testo della richiesta.
    let grezzo = std::fs::read(&path).unwrap();
    let contiene_segreto = grezzo
        .windows(segreto.len())
        .any(|finestra| finestra == segreto.as_bytes());
    assert!(
        !contiene_segreto,
        "il registro non deve contenere il testo della richiesta"
    );
}

#[tokio::test]
async fn chiamata_locale_non_finisce_nel_registro() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("cache.db");

    let registro = RegistroStore::apri(&path).unwrap();
    let lettore = Store::open(&path).unwrap();
    let client = Client::con_registro(
        TrasportoFinto::ok("risposta locale"),
        None,
        Some(Box::new(registro)),
    );

    client
        .completa(&richiesta("locale", false, "testo locale"))
        .await
        .unwrap();

    assert!(
        lettore.audit_all().unwrap().is_empty(),
        "le chiamate locali non devono finire nel registro"
    );
}

#[tokio::test]
async fn hash_stabile_su_due_chiamate_uguali() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("cache.db");

    let registro = RegistroStore::apri(&path).unwrap();
    let lettore = Store::open(&path).unwrap();
    let client = Client::con_registro(
        TrasportoFinto::ok("riassunto"),
        Some("chiave-finta".into()),
        Some(Box::new(registro)),
    );

    let r = richiesta("cloud", true, "stesso testo, stesso hash");
    client.completa(&r).await.unwrap();
    client.completa(&r).await.unwrap();

    let righe = lettore.audit_all().unwrap();
    assert_eq!(righe.len(), 2);
    assert_eq!(
        righe[0].hash_testo, righe[1].hash_testo,
        "stesso input deve dare lo stesso hash"
    );
    assert_eq!(righe[0].hash_testo, sha256_hex("stesso testo, stesso hash"));
}

// Test del client IA locale/cloud (task 6.2, Milestone 6), SENZA rete reale.
// Il trasporto HTTP è sostituito da un finto che registra le richieste: si
// verifica così che senza consenso il cloud non effettui alcuna chiamata, che
// con il consenso parta la richiesta attesa, che il percorso locale non richieda
// consenso e che un errore HTTP produca un errore leggibile (non un panic).
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use outlook_ai_lib::ai::client::{
    Client, ErroreAi, MessaggioChat, Richiesta, RichiestaHttp, RispostaHttp, Trasporto,
};

/// Trasporto di prova: registra le richieste inviate e restituisce una risposta
/// fissa. Condivisibile (`Arc`) così il test può ispezionare le richieste anche
/// dopo aver passato il trasporto al client.
#[derive(Clone)]
struct TrasportoFinto {
    richieste: Arc<Mutex<Vec<RichiestaHttp>>>,
    risposta: Arc<Mutex<RispostaHttp>>,
}

impl TrasportoFinto {
    /// Risposta 200 con un completamento OpenAI valido.
    fn ok(testo: &str) -> Self {
        let corpo = format!(
            r#"{{"choices":[{{"message":{{"content":{}}}}}]}}"#,
            serde_json::to_string(testo).unwrap()
        );
        TrasportoFinto::con_risposta(200, &corpo)
    }

    fn con_risposta(stato: u16, corpo: &str) -> Self {
        TrasportoFinto {
            richieste: Arc::new(Mutex::new(Vec::new())),
            risposta: Arc::new(Mutex::new(RispostaHttp {
                stato,
                corpo: corpo.to_string(),
            })),
        }
    }

    fn richieste(&self) -> Vec<RichiestaHttp> {
        self.richieste.lock().unwrap().clone()
    }
}

#[async_trait]
impl Trasporto for TrasportoFinto {
    async fn invia(&self, richiesta: RichiestaHttp) -> Result<RispostaHttp, ErroreAi> {
        self.richieste.lock().unwrap().push(richiesta);
        Ok(self.risposta.lock().unwrap().clone())
    }
}

/// Richiesta di prova, con endpoint vuoto per usare i predefiniti.
fn richiesta(provider: &str, consenso_cloud: bool) -> Richiesta {
    Richiesta {
        provider: provider.to_string(),
        endpoint: String::new(),
        modello: "modello-di-prova".to_string(),
        azione: "riassumi".to_string(),
        prompt_version: "v1".to_string(),
        temperatura: 0.2,
        consenso_cloud,
        messaggi: vec![
            MessaggioChat::sistema("istruzioni di sistema"),
            MessaggioChat::utente("corpo del thread"),
        ],
    }
}

#[tokio::test]
async fn cloud_senza_consenso_non_effettua_la_chiamata() {
    let trasporto = TrasportoFinto::ok("non deve arrivare");
    let client = Client::con_chiave(trasporto.clone(), Some("chiave-finta".into()));

    let esito = client.completa(&richiesta("cloud", false)).await;

    assert!(
        matches!(esito, Err(ErroreAi::ConsensoNecessario)),
        "senza consenso ci si aspetta ConsensoNecessario"
    );
    assert!(
        trasporto.richieste().is_empty(),
        "senza consenso il cloud non deve effettuare alcuna chiamata di rete"
    );
}

#[tokio::test]
async fn cloud_con_consenso_invia_modello_e_messaggi_attesi() {
    let trasporto = TrasportoFinto::ok("testo di risposta");
    let client = Client::con_chiave(trasporto.clone(), Some("chiave-finta".into()));

    let testo = client.completa(&richiesta("cloud", true)).await.unwrap();
    assert_eq!(testo, "testo di risposta");

    let inviate = trasporto.richieste();
    assert_eq!(inviate.len(), 1, "con il consenso parte una sola richiesta");
    assert!(inviate[0].url.ends_with("/chat/completions"));
    assert_eq!(inviate[0].chiave.as_deref(), Some("chiave-finta"));
    assert_eq!(inviate[0].corpo["model"], "modello-di-prova");
    assert_eq!(inviate[0].corpo["messages"][1]["content"], "corpo del thread");
    let temperatura = inviate[0].corpo["temperature"].as_f64().unwrap();
    assert!(
        (temperatura - 0.2).abs() < 1e-6,
        "la temperatura 0.2 (f32) deve arrivare nella richiesta"
    );
}

#[tokio::test]
async fn locale_non_richiede_consenso_ne_chiave() {
    let trasporto = TrasportoFinto::ok("risposta locale");
    let client = Client::new(trasporto.clone());

    let testo = client.completa(&richiesta("locale", false)).await.unwrap();
    assert_eq!(testo, "risposta locale");

    let inviate = trasporto.richieste();
    assert_eq!(inviate.len(), 1);
    assert!(inviate[0].chiave.is_none(), "il locale non usa alcuna chiave");
}

#[tokio::test]
async fn cloud_senza_chiave_non_effettua_la_chiamata() {
    let trasporto = TrasportoFinto::ok("non deve arrivare");
    let client = Client::con_chiave(trasporto.clone(), None);

    let esito = client.completa(&richiesta("cloud", true)).await;
    assert!(matches!(esito, Err(ErroreAi::ChiaveAssente)));
    assert!(trasporto.richieste().is_empty());
}

#[tokio::test]
async fn errore_http_produce_un_errore_leggibile() {
    let trasporto = TrasportoFinto::con_risposta(500, "errore interno del server");
    let client = Client::new(trasporto);

    match client.completa(&richiesta("locale", false)).await {
        Err(ErroreAi::Http { stato, .. }) => assert_eq!(stato, 500),
        altro => panic!("atteso ErroreAi::Http, ottenuto {altro:?}"),
    }
}

#[tokio::test]
async fn risposta_non_valida_non_manda_in_panic() {
    let trasporto = TrasportoFinto::con_risposta(200, "questo non è JSON");
    let client = Client::new(trasporto);

    match client.completa(&richiesta("locale", false)).await {
        Err(ErroreAi::RispostaNonValida(_)) => {}
        altro => panic!("atteso ErroreAi::RispostaNonValida, ottenuto {altro:?}"),
    }
}

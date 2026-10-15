//! Client dei modelli con **una sola interfaccia** per due destinazioni
//! (task 6.2, Milestone 6).
//!
//! - `provider = "locale"` — endpoint OpenAI-compatibile configurabile
//!   (predefinito `Splash-M1` su `http://127.0.0.1:8000/v1`, con `PORT` di default
//!   8000 e rotte `/v1/chat/completions`, `/v1/models`, `/v1/messages`; in
//!   alternativa Ollama è attivo su `11434` e parla anch'esso `/v1`). Nessun
//!   consenso richiesto: i dati non lasciano il Mac.
//! - `provider = "cloud"` — OpenRouter. **Regola non negoziabile**: senza il
//!   consenso esplicito si restituisce `ConsensoNecessario` **senza effettuare
//!   alcuna chiamata di rete**. La chiave arriva solo da `secrets` (Keychain),
//!   mai dalla configurazione, mai dal codice.
//!
//! Il trasporto HTTP è astratto dalla trait [`Trasporto`]: i test iniettano un
//! trasporto finto che registra le richieste, così nulla tocca la rete.

use async_trait::async_trait;
use serde::Serialize;
use serde_json::json;

use crate::ai::audit::{self, Registro, VoceAudit};

/// Endpoint predefinito del modello locale: il motore `Splash-M1` dell'utente
/// serve un'API OpenAI-compatibile su `http://127.0.0.1:8000/v1` (`PORT` di
/// default 8000). Configurabile. Su `11434` è disponibile Ollama, anch'esso `/v1`.
pub const ENDPOINT_LOCALE_DEFAULT: &str = "http://127.0.0.1:8000/v1";

/// Endpoint predefinito del cloud (OpenRouter, OpenAI-compatibile).
pub const ENDPOINT_CLOUD_DEFAULT: &str = "https://openrouter.ai/api/v1";

/// Chiave del segreto OpenRouter nel Keychain (vedi `secrets`).
pub const SEGRETO_OPENROUTER: &str = "openrouter";

/// Errori del client IA. Sono tutti leggibili e nessuno è un `panic`.
#[derive(Debug, thiserror::Error)]
pub enum ErroreAi {
    /// Il provider è cloud ma manca il consenso esplicito: **nessuna chiamata
    /// è stata effettuata**.
    #[error("consenso esplicito necessario per inviare i dati al cloud")]
    ConsensoNecessario,

    /// Provider cloud senza chiave OpenRouter nel Keychain.
    #[error("chiave OpenRouter assente nel Keychain")]
    ChiaveAssente,

    /// Provider sconosciuto.
    #[error("provider IA sconosciuto: {0}")]
    ProviderSconosciuto(String),

    /// Errore di trasporto (rete, TLS, connessione rifiutata).
    #[error("errore di rete verso il modello: {0}")]
    Rete(String),

    /// Il server ha risposto con uno stato di errore.
    #[error("il modello ha risposto con errore HTTP {stato}: {corpo}")]
    Http { stato: u16, corpo: String },

    /// La risposta non è interpretabile come completamento OpenAI.
    #[error("risposta del modello non valida: {0}")]
    RispostaNonValida(String),
}

/// Un messaggio della conversazione nel formato OpenAI (`role`, `content`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MessaggioChat {
    pub role: String,
    pub content: String,
}

impl MessaggioChat {
    pub fn sistema(contenuto: impl Into<String>) -> Self {
        MessaggioChat {
            role: "system".to_string(),
            content: contenuto.into(),
        }
    }

    pub fn utente(contenuto: impl Into<String>) -> Self {
        MessaggioChat {
            role: "user".to_string(),
            content: contenuto.into(),
        }
    }
}

/// Richiesta di completamento, uguale per locale e cloud: cambia solo il
/// destinatario e la richiesta di consenso.
#[derive(Debug, Clone)]
pub struct Richiesta {
    /// `"locale"` oppure `"cloud"`.
    pub provider: String,
    /// URL di base dell'endpoint OpenAI-compatibile (senza `/chat/completions`).
    pub endpoint: String,
    /// Nome del modello da usare.
    pub modello: String,
    /// Azione dell'assistente (per il registro), es. `"riassumi"`.
    pub azione: String,
    /// Versione dei prompt (`PROMPT_VERSION`), registrata nel log cloud.
    pub prompt_version: String,
    /// Temperatura del campionamento.
    pub temperatura: f32,
    /// Consenso esplicito all'invio al cloud (rilevante solo per il cloud).
    pub consenso_cloud: bool,
    /// Messaggi inviati al modello.
    pub messaggi: Vec<MessaggioChat>,
}

/// Richiesta HTTP così come la vede il trasporto: URL, chiave (Authorization
/// Bearer, se presente) e corpo JSON già costruito.
#[derive(Debug, Clone, PartialEq)]
pub struct RichiestaHttp {
    pub url: String,
    pub chiave: Option<String>,
    pub corpo: serde_json::Value,
}

/// Risposta HTTP grezza del trasporto.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RispostaHttp {
    pub stato: u16,
    pub corpo: String,
}

/// Trasporto HTTP. L'implementazione reale usa `reqwest`; i test ne iniettano una
/// che registra le richieste e non tocca la rete.
#[async_trait]
pub trait Trasporto: Send + Sync {
    async fn invia(&self, richiesta: RichiestaHttp) -> Result<RispostaHttp, ErroreAi>;
}

/// Trasporto reale basato su `reqwest` (TLS validato dal sistema).
pub struct TrasportoReqwest {
    client: reqwest::Client,
}

impl Default for TrasportoReqwest {
    fn default() -> Self {
        Self::new()
    }
}

impl TrasportoReqwest {
    pub fn new() -> Self {
        TrasportoReqwest {
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl Trasporto for TrasportoReqwest {
    async fn invia(&self, richiesta: RichiestaHttp) -> Result<RispostaHttp, ErroreAi> {
        let mut req = self.client.post(&richiesta.url).json(&richiesta.corpo);
        if let Some(chiave) = &richiesta.chiave {
            req = req.bearer_auth(chiave);
        }
        let risposta = req
            .send()
            .await
            .map_err(|e| ErroreAi::Rete(e.to_string()))?;
        let stato = risposta.status().as_u16();
        let corpo = risposta
            .text()
            .await
            .map_err(|e| ErroreAi::Rete(e.to_string()))?;
        Ok(RispostaHttp { stato, corpo })
    }
}

/// Client IA: una sola interfaccia per locale e cloud.
pub struct Client<T: Trasporto> {
    trasporto: T,
    /// Chiave OpenRouter (dal Keychain). `None` se non configurata.
    chiave_cloud: Option<String>,
    /// Registro delle richieste cloud. `None` = nessuna tracciabilità.
    registro: Option<Box<dyn Registro>>,
}

impl<T: Trasporto> Client<T> {
    /// Client senza chiave cloud né registro (utile ai test locali).
    pub fn new(trasporto: T) -> Self {
        Client {
            trasporto,
            chiave_cloud: None,
            registro: None,
        }
    }

    /// Client con la chiave OpenRouter letta dal Keychain.
    pub fn con_chiave(trasporto: T, chiave_cloud: Option<String>) -> Self {
        Client {
            trasporto,
            chiave_cloud,
            registro: None,
        }
    }

    /// Client con la chiave cloud e il registro delle richieste.
    pub fn con_registro(
        trasporto: T,
        chiave_cloud: Option<String>,
        registro: Option<Box<dyn Registro>>,
    ) -> Self {
        Client {
            trasporto,
            chiave_cloud,
            registro,
        }
    }

    /// Esegue il completamento. Unica porta verso il modello: sceglie l'endpoint
    /// in base al provider, impone il consenso per il cloud e, quando la
    /// richiesta parte davvero verso il cloud, la annota nel registro.
    pub async fn completa(&self, richiesta: &Richiesta) -> Result<String, ErroreAi> {
        let (url, chiave, cloud) = self.destinazione(richiesta)?;
        let corpo = corpo_openai(richiesta);
        let http = RichiestaHttp {
            url,
            chiave,
            corpo,
        };

        let risposta = self.trasporto.invia(http).await?;

        // Il testo è uscito dal Mac: si registra l'impronta **prima** di
        // valutarne l'esito, perché la tracciabilità riguarda la trasmissione.
        if cloud {
            self.annota(richiesta);
        }

        if !(200..300).contains(&risposta.stato) {
            return Err(ErroreAi::Http {
                stato: risposta.stato,
                corpo: risposta.corpo,
            });
        }

        estrai_testo(&risposta.corpo)
    }

    /// Calcola URL, chiave e natura (cloud sì/no) della destinazione, applicando
    /// la regola del consenso per il cloud.
    fn destinazione(&self, richiesta: &Richiesta) -> Result<(String, Option<String>, bool), ErroreAi> {
        match richiesta.provider.as_str() {
            "locale" => Ok((url_chat(&richiesta.endpoint, ENDPOINT_LOCALE_DEFAULT), None, false)),
            "cloud" => {
                // Regola non negoziabile: prima del consenso non si tocca la rete.
                if !richiesta.consenso_cloud {
                    return Err(ErroreAi::ConsensoNecessario);
                }
                let chiave = self
                    .chiave_cloud
                    .clone()
                    .ok_or(ErroreAi::ChiaveAssente)?;
                Ok((
                    url_chat(&richiesta.endpoint, ENDPOINT_CLOUD_DEFAULT),
                    Some(chiave),
                    true,
                ))
            }
            altro => Err(ErroreAi::ProviderSconosciuto(altro.to_string())),
        }
    }

    /// Scrive una riga nel registro: data/ora, provider, modello, azione,
    /// versione dei prompt e SHA-256 del testo inviato. **Mai il testo.**
    fn annota(&self, richiesta: &Richiesta) {
        if let Some(registro) = &self.registro {
            let voce = VoceAudit {
                provider: richiesta.provider.clone(),
                modello: richiesta.modello.clone(),
                azione: richiesta.azione.clone(),
                prompt_version: richiesta.prompt_version.clone(),
                hash_testo: audit::sha256_hex(&testo_inviato(&richiesta.messaggi)),
            };
            registro.registra(&voce);
        }
    }
}

/// Costruisce l'URL completo del completamento a partire da un endpoint di base,
/// ripiegando sul predefinito se vuoto.
fn url_chat(endpoint: &str, predefinito: &str) -> String {
    let base = if endpoint.trim().is_empty() {
        predefinito
    } else {
        endpoint
    };
    format!("{}/chat/completions", base.trim_end_matches('/'))
}

/// Corpo della richiesta nel formato OpenAI `chat/completions`.
fn corpo_openai(richiesta: &Richiesta) -> serde_json::Value {
    let messaggi: Vec<serde_json::Value> = richiesta
        .messaggi
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();
    json!({
        "model": richiesta.modello,
        "messages": messaggi,
        "temperature": richiesta.temperatura,
    })
}

/// Testo effettivamente inviato al modello: i contenuti dei messaggi in ordine,
/// usato per l'impronta nel registro (mai salvato come tale).
pub fn testo_inviato(messaggi: &[MessaggioChat]) -> String {
    messaggi
        .iter()
        .map(|m| m.content.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Estrae `choices[0].message.content` dalla risposta OpenAI.
fn estrai_testo(corpo: &str) -> Result<String, ErroreAi> {
    let json: serde_json::Value = serde_json::from_str(corpo)
        .map_err(|e| ErroreAi::RispostaNonValida(e.to_string()))?;
    json.get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| {
            ErroreAi::RispostaNonValida("manca choices[0].message.content".to_string())
        })
}

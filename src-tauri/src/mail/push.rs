//! Blocco W — posta in push con IMAP IDLE (RFC 2177).
//!
//! Il server avvisa appena arriva un messaggio, invece di aspettare il prossimo
//! giro del timer. Qui la parte **pura** e provabile:
//! - [`ciclo`]: connessione, attesa, riconnessione con ritardo crescente; è
//!   generico sul [`CanalePush`], così i test usano un canale finto e il kernel
//!   quello IMAP vero (`imap::ImapIdle`);
//! - [`riconcilia`]: quali caselle avviare e quali fermare.
//!
//! Il ciclo **non sincronizza**: segnala `NuoviDati` e la sincronizzazione resta
//! quella di sempre (`mail_sync`), con notifiche, regole e protezione.

use async_trait::async_trait;
use serde::Serialize;
use std::collections::BTreeSet;
use std::future::Future;
use std::time::Duration;

use crate::mail::{MailError, Result};

/// Durata massima di un `IDLE` prima di riaprirlo: la RFC 2177 chiede di
/// rinnovarlo prima dei 29 minuti, oltre i quali il server può chiudere.
pub const ATTESA_IDLE: Duration = Duration::from_secs(25 * 60);

/// Primo ritardo di riconnessione (secondi); raddoppia a ogni fallimento.
const RITARDO_MINIMO_S: u64 = 5;
/// Ritardo massimo di riconnessione (secondi).
const RITARDO_MASSIMO_S: u64 = 300;

/// Se il server, una volta connessi, offre `IDLE`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Supporto {
    Idle,
    NonSupportato,
}

/// Come è finita un'attesa.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Attesa {
    /// Il server ha segnalato qualcosa (messaggio nuovo, flag, eliminazione).
    NuoviDati,
    /// Scaduto [`ATTESA_IDLE`]: si riapre l'`IDLE`.
    Scaduta,
}

/// Il canale di una casella: connessione e attesa. Il vero è `imap::ImapIdle`.
#[async_trait]
pub trait CanalePush: Send {
    /// Si connette, seleziona la Posta in arrivo e, se il server lo offre, entra in `IDLE`.
    async fn connetti(&mut self) -> Result<Supporto>;
    /// Aspetta un avviso del server per al massimo `massimo`.
    async fn attendi(&mut self, massimo: Duration) -> Result<Attesa>;
}

/// Lo stato della casella, come lo mostra il pannello Sincronizzazione.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "stato", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum StatoPush {
    Connessione,
    Attivo,
    /// Il server non offre `IDLE`: resta la sincronizzazione a intervalli.
    NonSupportato,
    /// Errore temporaneo: si riprova fra `tra_secondi`.
    Riconnessione { errore: String, tra_secondi: u64 },
    /// Errore che riprovare non risolve (password rifiutata): il ciclo si ferma.
    Errore { errore: String },
}

/// Ciò che il ciclo comunica al kernel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventoPush {
    Stato(StatoPush),
    NuoviDati,
}

/// Ritardo prima del tentativo `tentativo` (da 0): 5 s, 10 s, 20 s… fino a 5 minuti.
pub fn ritardo_riconnessione(tentativo: u32) -> Duration {
    let fattore = 1u64.checked_shl(tentativo.min(32)).unwrap_or(u64::MAX);
    Duration::from_secs(RITARDO_MINIMO_S.saturating_mul(fattore).min(RITARDO_MASSIMO_S))
}

/// Le caselle da avviare (desiderate e non attive) e da fermare (attive e non
/// più desiderate), in ordine.
pub fn riconcilia(
    attivi: &BTreeSet<String>,
    desiderati: &BTreeSet<String>,
) -> (Vec<String>, Vec<String>) {
    (
        desiderati.difference(attivi).cloned().collect(),
        attivi.difference(desiderati).cloned().collect(),
    )
}

/// Il ciclo di una casella. `evento` riceve stati e avvisi e restituisce `false`
/// per fermare il ciclo (nel kernel il task si ferma invece con `abort`);
/// `dormi` attende il ritardo di riconnessione.
///
/// Si ferma da solo solo quando riprovare è inutile: server senza `IDLE` o
/// password rifiutata. Ogni altro errore riconnette con [`ritardo_riconnessione`],
/// che riparte da capo dopo una connessione riuscita.
pub async fn ciclo<C, E, D, F>(canale: &mut C, mut evento: E, mut dormi: D)
where
    C: CanalePush + ?Sized,
    E: FnMut(EventoPush) -> bool,
    D: FnMut(Duration) -> F,
    F: Future<Output = ()>,
{
    let mut tentativo: u32 = 0;
    loop {
        if !evento(EventoPush::Stato(StatoPush::Connessione)) {
            return;
        }
        let errore = match canale.connetti().await {
            Ok(Supporto::NonSupportato) => {
                evento(EventoPush::Stato(StatoPush::NonSupportato));
                return;
            }
            Err(MailError::Autenticazione(e)) => {
                evento(EventoPush::Stato(StatoPush::Errore {
                    errore: format!("autenticazione fallita: {e}"),
                }));
                return;
            }
            Err(e) => e.to_string(),
            Ok(Supporto::Idle) => {
                tentativo = 0;
                if !evento(EventoPush::Stato(StatoPush::Attivo)) {
                    return;
                }
                loop {
                    match canale.attendi(ATTESA_IDLE).await {
                        Ok(Attesa::NuoviDati) => {
                            if !evento(EventoPush::NuoviDati) {
                                return;
                            }
                        }
                        Ok(Attesa::Scaduta) => {}
                        Err(e) => break e.to_string(),
                    }
                }
            }
        };
        let ritardo = ritardo_riconnessione(tentativo);
        tentativo = tentativo.saturating_add(1);
        if !evento(EventoPush::Stato(StatoPush::Riconnessione {
            errore,
            tra_secondi: ritardo.as_secs(),
        })) {
            return;
        }
        dormi(ritardo).await;
    }
}

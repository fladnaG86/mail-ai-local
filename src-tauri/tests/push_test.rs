//! Test del blocco W1 — posta in push (IMAP IDLE), parte pura.
//!
//! Il ciclo `push::ciclo` è generico sul canale: qui un canale finto recita un
//! copione (connessione, attese, errori) e si verifica la sequenza degli eventi,
//! i ritardi di riconnessione e i casi di arresto (server senza IDLE, password
//! rifiutata). `dormi` è finta: registra i ritardi invece di aspettare.

use async_trait::async_trait;
use outlook_ai_lib::mail::push::{
    self, Attesa, CanalePush, EventoPush, StatoPush, Supporto, ATTESA_IDLE,
};
use outlook_ai_lib::mail::{MailError, Result};
use std::collections::{BTreeSet, VecDeque};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Un passo del copione del canale finto.
enum Passo {
    Connetti(Result<Supporto>),
    Attendi(Result<Attesa>),
}

struct CanaleFinto {
    copione: VecDeque<Passo>,
    /// Passi ancora da recitare, condiviso con `evento` per fermare il ciclo.
    restanti: Arc<AtomicUsize>,
    attese_chieste: Vec<Duration>,
}

impl CanaleFinto {
    fn new(passi: Vec<Passo>) -> Self {
        CanaleFinto {
            restanti: Arc::new(AtomicUsize::new(passi.len())),
            copione: passi.into(),
            attese_chieste: Vec::new(),
        }
    }

    fn prossimo(&mut self) -> Option<Passo> {
        let p = self.copione.pop_front();
        self.restanti.store(self.copione.len(), Ordering::SeqCst);
        p
    }
}

#[async_trait]
impl CanalePush for CanaleFinto {
    async fn connetti(&mut self) -> Result<Supporto> {
        match self.prossimo() {
            Some(Passo::Connetti(r)) => r,
            _ => panic!("il ciclo ha chiesto una connessione fuori copione"),
        }
    }
    async fn attendi(&mut self, massimo: Duration) -> Result<Attesa> {
        self.attese_chieste.push(massimo);
        match self.prossimo() {
            Some(Passo::Attendi(r)) => r,
            _ => panic!("il ciclo ha chiesto un'attesa fuori copione"),
        }
    }
}

/// Esegue il ciclo finché il copione ha passi: `evento` risponde `false` (ferma)
/// quando il canale non ha più nulla da recitare. Restituisce eventi e ritardi.
async fn esegui(canale: &mut CanaleFinto) -> (Vec<EventoPush>, Vec<Duration>) {
    let restanti = Arc::clone(&canale.restanti);
    let mut eventi = Vec::new();
    let mut ritardi = Vec::new();
    push::ciclo(
        canale,
        |e| {
            eventi.push(e);
            restanti.load(Ordering::SeqCst) > 0
        },
        |d| {
            ritardi.push(d);
            async {}
        },
    )
    .await;
    (eventi, ritardi)
}

fn rete(msg: &str) -> MailError {
    MailError::Rete(msg.into())
}

#[tokio::test]
async fn connesso_segnala_attivo_e_ogni_nuovo_dato() {
    let mut c = CanaleFinto::new(vec![
        Passo::Connetti(Ok(Supporto::Idle)),
        Passo::Attendi(Ok(Attesa::NuoviDati)),
        Passo::Attendi(Ok(Attesa::Scaduta)),
        Passo::Attendi(Ok(Attesa::NuoviDati)),
    ]);
    let (eventi, ritardi) = esegui(&mut c).await;
    assert_eq!(
        eventi,
        vec![
            EventoPush::Stato(StatoPush::Connessione),
            EventoPush::Stato(StatoPush::Attivo),
            EventoPush::NuoviDati,
            EventoPush::NuoviDati,
        ],
        "l'attesa scaduta riapre l'IDLE senza avvisi"
    );
    assert!(ritardi.is_empty());
    assert!(c.attese_chieste.iter().all(|d| *d == ATTESA_IDLE));
}

#[test]
fn l_attesa_resta_sotto_i_29_minuti_della_rfc_2177() {
    assert!(ATTESA_IDLE < Duration::from_secs(29 * 60));
}

#[tokio::test]
async fn un_server_senza_idle_ferma_il_ciclo_e_lo_dice() {
    let mut c = CanaleFinto::new(vec![Passo::Connetti(Ok(Supporto::NonSupportato))]);
    let (eventi, ritardi) = esegui(&mut c).await;
    assert_eq!(
        eventi,
        vec![
            EventoPush::Stato(StatoPush::Connessione),
            EventoPush::Stato(StatoPush::NonSupportato),
        ]
    );
    assert!(ritardi.is_empty(), "nessun tentativo ripetuto");
}

#[tokio::test]
async fn la_password_rifiutata_ferma_il_ciclo_senza_martellare_il_server() {
    let mut c = CanaleFinto::new(vec![Passo::Connetti(Err(MailError::Autenticazione(
        "LOGIN rifiutato".into(),
    )))]);
    let (eventi, ritardi) = esegui(&mut c).await;
    assert!(matches!(
        eventi.last(),
        Some(EventoPush::Stato(StatoPush::Errore { errore })) if errore.contains("LOGIN rifiutato")
    ));
    assert!(ritardi.is_empty());
}

#[tokio::test]
async fn un_errore_di_rete_riconnette_con_ritardo_crescente_che_si_azzera_dopo_il_successo() {
    let mut c = CanaleFinto::new(vec![
        Passo::Connetti(Err(rete("rete giù"))),
        Passo::Connetti(Err(rete("rete giù"))),
        Passo::Connetti(Ok(Supporto::Idle)),
        Passo::Attendi(Err(rete("connessione chiusa"))),
        Passo::Connetti(Ok(Supporto::Idle)),
        Passo::Attendi(Ok(Attesa::NuoviDati)),
    ]);
    let (eventi, ritardi) = esegui(&mut c).await;
    assert_eq!(
        ritardi,
        vec![
            push::ritardo_riconnessione(0),
            push::ritardo_riconnessione(1),
            // Dopo una connessione riuscita si riparte dal primo ritardo.
            push::ritardo_riconnessione(0),
        ]
    );
    let riconnessioni: Vec<_> = eventi
        .iter()
        .filter_map(|e| match e {
            EventoPush::Stato(StatoPush::Riconnessione { errore, tra_secondi }) => {
                Some((errore.clone(), *tra_secondi))
            }
            _ => None,
        })
        .collect();
    assert_eq!(riconnessioni.len(), 3);
    assert!(riconnessioni[2].0.contains("connessione chiusa"));
    assert_eq!(riconnessioni[0].1, push::ritardo_riconnessione(0).as_secs());
    assert_eq!(eventi.last(), Some(&EventoPush::NuoviDati));
}

#[test]
fn il_ritardo_raddoppia_da_5_secondi_fino_a_5_minuti() {
    let secondi: Vec<u64> = (0..9).map(|n| push::ritardo_riconnessione(n).as_secs()).collect();
    assert_eq!(secondi, vec![5, 10, 20, 40, 80, 160, 300, 300, 300]);
    assert_eq!(push::ritardo_riconnessione(u32::MAX).as_secs(), 300, "nessun trabocco");
}

fn insieme(v: &[&str]) -> BTreeSet<String> {
    v.iter().map(|s| s.to_string()).collect()
}

#[test]
fn riconcilia_avvia_i_mancanti_e_ferma_quelli_in_piu() {
    let (avvia, ferma) = push::riconcilia(&insieme(&["a", "b"]), &insieme(&["b", "c"]));
    assert_eq!(avvia, vec!["c".to_string()]);
    assert_eq!(ferma, vec!["a".to_string()]);
    let (avvia, ferma) = push::riconcilia(&insieme(&["a"]), &insieme(&[]));
    assert!(avvia.is_empty());
    assert_eq!(ferma, vec!["a".to_string()], "push spento: si ferma tutto");
}

#[test]
fn lo_stato_si_serializza_nella_forma_dell_interfaccia() {
    let json = serde_json::to_value(StatoPush::Riconnessione {
        errore: "rete giù".into(),
        tra_secondi: 20,
    })
    .unwrap();
    assert_eq!(
        json,
        serde_json::json!({ "stato": "riconnessione", "errore": "rete giù", "traSecondi": 20 })
    );
    assert_eq!(
        serde_json::to_value(StatoPush::Attivo).unwrap(),
        serde_json::json!({ "stato": "attivo" })
    );
}

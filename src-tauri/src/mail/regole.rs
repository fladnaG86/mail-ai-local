//! Motore locale delle regole sui messaggi in arrivo (blocco H).
//!
//! Replica **il comportamento** delle regole di Outlook sopra protocolli
//! standard (IMAP e cache locale), non il servizio lato Microsoft: le regole
//! girano sul Mac, durante `mail_sync`.
//!
//! - **Condizioni** (`mittente contiene`, `oggetto contiene`, `corpo contiene`,
//!   `destinatario contiene`, `con allegato sì/no`) combinate in **AND**: un
//!   campo vuoto è indifferente.
//! - **Azioni** (`sposta`, `contrassegna`, `categorizza`, `segna come letto`,
//!   `elimina`) applicate **nell'ordine dichiarato**.
//! - Una regola **disattivata non agisce**; i **messaggi già valutati** non
//!   vengono rielaborati (nessun doppio spostamento); se una regola **fallisce**
//!   (il server rifiuta) lo si registra e le altre proseguono.
//!
//! Le due fasi sono separate come nel resto del kernel: la rete
//! (`esegui_rete`, asincrona) non incrocia mai la cache (`applica_cache`,
//! sincrona), perché la connessione SQLite non è `Sync` e non deve restare presa
//! attraverso un `await` nel future di un comando Tauri.

use std::collections::HashMap;

use crate::config::{self, Regola};
use crate::mail::ops::{self, EsitoEliminazione};
use crate::mail::{FlagOp, MailSource};
use crate::store::{MessaggioRegoleRow, Store};

/// Il messaggio nella forma che una regola valuta (testo così com'è).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Messaggio {
    pub uid: String,
    pub mittente: String,
    pub oggetto: String,
    pub corpo: String,
    pub destinatario: String,
    pub ha_allegati: bool,
}

impl From<&MessaggioRegoleRow> for Messaggio {
    fn from(r: &MessaggioRegoleRow) -> Self {
        Messaggio {
            uid: r.uid.clone(),
            mittente: r.mittente.clone().unwrap_or_default(),
            oggetto: r.oggetto.clone().unwrap_or_default(),
            corpo: r.corpo.clone().unwrap_or_default(),
            destinatario: r.destinatario.clone().unwrap_or_default(),
            ha_allegati: r.ha_allegati,
        }
    }
}

/// Un'azione da eseguire su un messaggio.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Azione {
    /// Sposta in una cartella (destinazione).
    Sposta(String),
    /// Contrassegna (`\Flagged`).
    Contrassegna,
    /// Aggiunge una categoria.
    Categorizza(String),
    /// Segna come letto (`\Seen`).
    SegnaLetto,
    /// Elimina (posta eliminata, o rimozione definitiva se non c'è).
    Elimina,
}

impl Azione {
    /// Converte un'azione di configurazione; `None` per un tipo sconosciuto.
    pub fn da_config(a: &config::AzioneRegola) -> Option<Azione> {
        match a.tipo.as_str() {
            "sposta" => Some(Azione::Sposta(a.valore.clone())),
            "contrassegna" => Some(Azione::Contrassegna),
            "categorizza" => Some(Azione::Categorizza(a.valore.clone())),
            "segna_letto" => Some(Azione::SegnaLetto),
            "elimina" => Some(Azione::Elimina),
            _ => None,
        }
    }
}

/// Un passo del piano: un'azione di una regola su un messaggio.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Passo {
    pub regola_id: String,
    pub regola_nome: String,
    pub uid: String,
    pub azione: Azione,
}

/// Le regole **attive**, in ordine (`ordine` crescente; a parità l'inserimento).
pub fn regole_attive(regole: &[Regola]) -> Vec<&Regola> {
    let mut attive: Vec<&Regola> = regole.iter().filter(|r| r.attiva).collect();
    // L'ordinamento è stabile: a parità di `ordine` vince l'inserimento.
    attive.sort_by_key(|r| r.ordine);
    attive
}

/// Vero se il testo contiene il filtro (senza maiuscole). Un filtro vuoto è
/// indifferente: non restringe.
fn contiene(filtro: &str, valore: &str) -> bool {
    let f = filtro.trim();
    f.is_empty() || valore.to_lowercase().contains(&f.to_lowercase())
}

/// Vero se la condizione «con allegato» è rispettata.
fn allegato_ok(cond: &str, ha_allegati: bool) -> bool {
    match cond {
        "con" => ha_allegati,
        "senza" => !ha_allegati,
        _ => true,
    }
}

/// Vero se il messaggio soddisfa **tutte** le condizioni (AND).
pub fn condizioni_soddisfatte(c: &config::CondizioniRegola, m: &Messaggio) -> bool {
    contiene(&c.mittente_contiene, &m.mittente)
        && contiene(&c.oggetto_contiene, &m.oggetto)
        && contiene(&c.corpo_contiene, &m.corpo)
        && contiene(&c.destinatario_contiene, &m.destinatario)
        && allegato_ok(&c.allegato, m.ha_allegati)
}

/// Pianifica i passi: per ogni regola attiva in ordine, per ogni messaggio che
/// soddisfa le condizioni, le azioni nell'ordine dichiarato.
pub fn pianifica(regole: &[Regola], messaggi: &[Messaggio]) -> Vec<Passo> {
    let mut passi = Vec::new();
    for regola in regole_attive(regole) {
        for m in messaggi {
            if !condizioni_soddisfatte(&regola.condizioni, m) {
                continue;
            }
            for azione in &regola.azioni {
                if let Some(azione) = Azione::da_config(azione) {
                    passi.push(Passo {
                        regola_id: regola.id.clone(),
                        regola_nome: regola.nome.clone(),
                        uid: m.uid.clone(),
                        azione,
                    });
                }
            }
        }
    }
    passi
}

/// Esito della fase di rete per un passo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RispostaRete {
    /// L'azione non ha una parte di rete da fare qui: va applicata in cache.
    Locale,
    /// L'azione di rete è riuscita.
    Ok,
    /// L'azione di rete è fallita (non blocca le altre regole).
    Fallita(String),
    /// Eliminazione riuscita: spostato nella posta eliminata o rimosso.
    Eliminato(EsitoEliminazione),
    /// Saltata: un'azione precedente ha già spostato o eliminato il messaggio.
    Saltata,
}

/// Fase di **rete**: esegue solo le operazioni che toccano il server, nell'ordine
/// dei passi. Non tiene la cache: si collauda con `FakeSource`. Dopo uno
/// spostamento o un'eliminazione riusciti, i passi successivi sullo stesso
/// messaggio sono `Saltata` (il messaggio non è più nella cartella di partenza).
pub async fn esegui_rete(src: &dyn MailSource, folder: &str, passi: &[Passo]) -> Vec<RispostaRete> {
    let mut usciti: Vec<String> = Vec::new();
    let mut risposte = Vec::with_capacity(passi.len());
    for passo in passi {
        if usciti.contains(&passo.uid) {
            risposte.push(RispostaRete::Saltata);
            continue;
        }
        let risposta = match &passo.azione {
            Azione::Sposta(dest) => match ops::server_sposta(src, folder, &passo.uid, dest).await {
                Ok(()) => {
                    usciti.push(passo.uid.clone());
                    RispostaRete::Ok
                }
                Err(e) => RispostaRete::Fallita(e),
            },
            Azione::Contrassegna => {
                match ops::server_imposta_flag(src, folder, &passo.uid, FlagOp::Flagged, true).await {
                    Ok(()) => RispostaRete::Ok,
                    Err(e) => RispostaRete::Fallita(e),
                }
            }
            Azione::SegnaLetto => {
                match ops::server_imposta_flag(src, folder, &passo.uid, FlagOp::Seen, true).await {
                    Ok(()) => RispostaRete::Ok,
                    Err(e) => RispostaRete::Fallita(e),
                }
            }
            Azione::Categorizza(cat) => {
                // Le keyword non sono garantite: non falliscono mai e la
                // categoria resta comunque locale in cache.
                ops::server_categorie(src, folder, &passo.uid, &[cat.clone()]).await;
                RispostaRete::Locale
            }
            Azione::Elimina => match ops::server_elimina(src, folder, &passo.uid).await {
                Ok(esito) => {
                    usciti.push(passo.uid.clone());
                    RispostaRete::Eliminato(esito)
                }
                Err(e) => RispostaRete::Fallita(e),
            },
        };
        risposte.push(risposta);
    }
    risposte
}

/// Esito complessivo delle regole su una cartella.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct EsitoRegole {
    /// Quante azioni ha applicato ciascuna regola (per id).
    pub per_regola: HashMap<String, usize>,
    /// Gli errori, leggibili (una regola che fallisce non blocca le altre).
    pub fallimenti: Vec<String>,
    /// Quanti messaggi sono stati marcati come «valutati» (non più rielaborati).
    pub elaborati: usize,
}

/// Fase di **cache** (sincrona): marca i messaggi valutati e applica in cache le
/// azioni riuscite (o solo locali), nell'ordine dei passi. Un fallimento di rete
/// viene registrato e il passo saltato; le altre regole proseguono. I messaggi
/// valutati si marcano **prima** delle azioni: dopo uno spostamento la riga è
/// altrove e non si potrebbe più marcare per `(account, folder, uid)`.
///
/// Blocco K: ogni scrittura è confinata all'account (`account`), così una regola
/// che agisce sulla casella A non tocca le righe omonime della casella B.
pub fn applica_cache(
    cache: &Store,
    account: &str,
    folder: &str,
    passi: &[Passo],
    risposte: &[RispostaRete],
    valutati: &[String],
) -> Result<EsitoRegole, String> {
    let mut esito = EsitoRegole::default();

    // 1. Marca i messaggi valutati: nessun doppio spostamento.
    for uid in valutati {
        cache
            .segna_regole_applicate(account, folder, uid)
            .map_err(|e| e.to_string())?;
        esito.elaborati += 1;
    }

    // 2. Applica le azioni riuscite, nell'ordine dei passi.
    for (passo, risposta) in passi.iter().zip(risposte) {
        match risposta {
            RispostaRete::Fallita(e) => {
                esito.fallimenti.push(format!(
                    "Regola «{}»: {} (il resto delle regole prosegue).",
                    passo.regola_nome, e
                ));
                continue;
            }
            RispostaRete::Saltata => continue,
            // L'eliminazione segue l'esito reale del server: spostato nella posta
            // eliminata o rimosso definitivamente.
            RispostaRete::Eliminato(esito_elim) => {
                match esito_elim {
                    EsitoEliminazione::Spostato(dest) => {
                        cache
                            .sposta(account, folder, &passo.uid, dest)
                            .map_err(|e| e.to_string())?;
                    }
                    EsitoEliminazione::Rimosso { .. } => {
                        cache
                            .rimuovi(account, folder, &passo.uid)
                            .map_err(|e| e.to_string())?;
                    }
                }
                *esito.per_regola.entry(passo.regola_id.clone()).or_insert(0) += 1;
            }
            RispostaRete::Ok | RispostaRete::Locale => {
                if applica_azione(cache, account, folder, &passo.uid, &passo.azione)? {
                    *esito.per_regola.entry(passo.regola_id.clone()).or_insert(0) += 1;
                }
            }
        }
    }
    Ok(esito)
}

/// Applica una singola azione alla cache. Restituisce vero se ha agito.
/// L'eliminazione non passa di qui: segue l'esito della rete. Per account.
fn applica_azione(
    cache: &Store,
    account: &str,
    folder: &str,
    uid: &str,
    azione: &Azione,
) -> Result<bool, String> {
    match azione {
        Azione::Sposta(dest) => {
            cache
                .sposta(account, folder, uid, dest)
                .map_err(|e| e.to_string())?;
            Ok(true)
        }
        Azione::Contrassegna => {
            cache
                .set_flagged(account, folder, uid, true)
                .map_err(|e| e.to_string())?;
            Ok(true)
        }
        Azione::SegnaLetto => {
            cache
                .set_seen(account, folder, uid, true)
                .map_err(|e| e.to_string())?;
            Ok(true)
        }
        Azione::Categorizza(cat) => {
            cache
                .aggiungi_categoria(account, folder, uid, cat)
                .map_err(|e| e.to_string())?;
            Ok(true)
        }
        // Un'eliminazione senza esito di rete (non dovrebbe accadere) non agisce.
        Azione::Elimina => Ok(false),
    }
}

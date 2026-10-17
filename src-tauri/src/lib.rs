//! Kernel dell'applicazione: configurazione, segreti, posta, cache, assistente IA.
//! Ogni modulo espone funzioni testabili senza Tauri; i comandi IPC sono sottili.

pub mod ai;
pub mod composizione;
pub mod conferme;
pub mod config;
pub mod contatti;
pub mod inviti;
pub mod mail;
pub mod notifiche;
pub mod presend;
pub mod ricerca;
pub mod sanitize;
pub mod secrets;
pub mod send;
pub mod sendlater;
pub mod store;

use config::Account;
use mail::MailSource;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use tauri::{Emitter, Manager};

/// Cartella di configurazione dell'app (es. ~/Library/Application Support/outlook-ai su macOS).
pub fn app_config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("outlook-ai")
}

/// Percorso del database della cache locale dei messaggi.
fn cache_path() -> PathBuf {
    app_config_dir().join("cache.db")
}

/// Apre (o crea) la cache locale dei messaggi.
fn apri_cache() -> Result<store::Store, String> {
    store::Store::open(&cache_path()).map_err(|e| e.to_string())
}

/// Limite di intestazioni scaricate per cartella a ogni sincronizzazione.
const LIMITE_INTESTAZIONI: usize = 500;

/// Riga della lista messaggi, già pronta per l'interfaccia.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailRow {
    pub uid: String,
    /// Account di provenienza (blocco J): nella lista «Tutti gli account» due
    /// caselle possono avere lo stesso UID, quindi l'account identifica la riga.
    pub account: String,
    /// Cartella della riga (blocco J): serve alle azioni sul messaggio di una
    /// lista aggregata, dove la cartella non è più quella unica dell'app.
    pub folder: String,
    pub from: Option<String>,
    pub subject: Option<String>,
    /// Data in secondi dall'epoca Unix.
    pub date: i64,
    pub seen: bool,
    pub has_attachments: bool,
    /// Anteprima del testo del messaggio (dal corpo in cache, se già scaricato):
    /// la lista la mostra solo se la preferenza `letturaAnteprima` è attiva.
    pub anteprima: Option<String>,
    /// Chiave della conversazione (`thread_key`): serve a «Ignora conversazione»
    /// dal menu contestuale di un singolo messaggio.
    pub thread_key: Option<String>,
}

/// Lunghezza massima dell'anteprima mostrata in lista, in caratteri.
pub const ANTEPRIMA_LISTA_MAX: usize = 120;

/// Prepara l'anteprima di lista dal testo del corpo: spazi normalizzati,
/// troncata a `ANTEPRIMA_LISTA_MAX` caratteri con un'ellissi. `None` se vuoto.
pub fn anteprima_lista(body: Option<&str>) -> Option<String> {
    let compatto = body?.split_whitespace().collect::<Vec<_>>().join(" ");
    if compatto.is_empty() {
        return None;
    }
    if compatto.chars().count() > ANTEPRIMA_LISTA_MAX {
        let tagliata: String = compatto.chars().take(ANTEPRIMA_LISTA_MAX).collect();
        Some(format!("{tagliata}…"))
    } else {
        Some(compatto)
    }
}

impl MailRow {
    /// Costruisce una riga dell'interfaccia da una riga della cache.
    fn da_riga(r: store::MessageRow) -> Self {
        MailRow {
            uid: r.uid,
            account: r.account,
            folder: r.folder,
            from: r.sender.as_deref().map(mail::mime::decodifica_intestazione),
            subject: r.subject.as_deref().map(mail::mime::decodifica_intestazione),
            date: r.date,
            seen: r.seen,
            has_attachments: r.has_attachments,
            anteprima: anteprima_lista(r.body_text.as_deref()),
            thread_key: r.thread_key,
        }
    }
}

/// Una riga della lista raggruppata per conversazione (blocco H): il riepilogo
/// della conversazione (numero di messaggi, non letti) e i suoi messaggi, per
/// l'espansione nella lista.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversazioneRow {
    /// Chiave del gruppo (thread_key, oppure `uid:<uid>` per una riga isolata).
    pub chiave: String,
    /// Account di provenienza (blocco J): la lista aggregata può avere la stessa
    /// chiave in due caselle diverse.
    pub account: String,
    /// Quanti messaggi contiene la conversazione.
    pub numero: usize,
    /// Quanti messaggi non letti contiene.
    pub non_letti: usize,
    /// UID del messaggio più recente (il rappresentante mostrato da chiusa).
    pub uid: String,
    pub from: Option<String>,
    pub subject: Option<String>,
    pub date: i64,
    /// Vero se **tutti** i messaggi sono letti.
    pub seen: bool,
    /// Vero se **almeno un** messaggio ha allegati.
    pub has_attachments: bool,
    pub anteprima: Option<String>,
    /// I messaggi della conversazione, in ordine cronologico dal più vecchio.
    pub messaggi: Vec<MailRow>,
}

impl ConversazioneRow {
    /// Costruisce la riga dell'interfaccia da una conversazione della cache.
    fn da_riga(r: store::RigaConversazione) -> Self {
        ConversazioneRow {
            chiave: r.chiave,
            account: r.account,
            numero: r.numero,
            non_letti: r.non_letti,
            uid: r.uid,
            from: r.sender.as_deref().map(mail::mime::decodifica_intestazione),
            subject: r.subject.as_deref().map(mail::mime::decodifica_intestazione),
            date: r.date,
            seen: r.seen,
            has_attachments: r.has_attachments,
            anteprima: anteprima_lista(r.body_text.as_deref()),
            messaggi: r.messaggi.into_iter().map(MailRow::da_riga).collect(),
        }
    }
}

/// Legge un valore di configurazione per chiave (es. "theme").
#[tauri::command]
fn get_config(key: String) -> Option<String> {
    let dir = app_config_dir();
    match key.as_str() {
        "theme" => config::load_from(&dir).ok().map(|c| c.theme),
        _ => None,
    }
}

/// Scrive un valore di configurazione per chiave.
#[tauri::command]
fn set_config(key: String, value: String) -> Result<(), String> {
    let dir = app_config_dir();
    match key.as_str() {
        "theme" => config::set_theme(&dir, &value).map_err(|e| e.to_string()),
        _ => Err(format!("chiave di configurazione sconosciuta: {key}")),
    }
}

/// Salva un account nella configurazione e la password nel Keychain.
#[tauri::command]
fn account_save(account: Account, password: String) -> Result<(), String> {
    let dir = app_config_dir();
    config::save_account(&dir, &account).map_err(|e| e.to_string())?;
    secrets::Store::real()
        .set(&account.id, &password)
        .map_err(|e| e.to_string())
}

/// Elenco degli account configurati (senza password).
#[tauri::command]
fn account_list() -> Vec<Account> {
    config::load_accounts(&app_config_dir())
}

// ---------------------------------------------------------------------------
// Chiave OpenRouter (pannello Assistente IA, provider cloud).
//
// La chiave vive nel Portachiavi sotto `SEGRETO_OPENROUTER`, come le password
// delle caselle: **mai** in `config.json`. L'interfaccia non la riceve mai
// indietro — solo `ai_chiave_stato` dice se c'è. Si legge quando serve, al
// momento della chiamata (`ai_azione`).
// ---------------------------------------------------------------------------

/// Vero se una chiave OpenRouter è già nel Portachiavi. Non la restituisce:
/// l'interfaccia deve poter dire «c'è» senza mai maneggiare il segreto.
#[tauri::command]
fn ai_chiave_stato() -> bool {
    secrets::Store::real()
        .get(ai::client::SEGRETO_OPENROUTER)
        .map(|k| !k.trim().is_empty())
        .unwrap_or(false)
}

/// Salva la chiave OpenRouter nel Portachiavi. Una chiave vuota è rifiutata:
/// meglio un errore leggibile che un segreto vuoto salvato per sbaglio.
#[tauri::command]
fn ai_chiave_salva(chiave: String) -> Result<(), String> {
    let pulita = chiave.trim();
    if pulita.is_empty() {
        return Err("la chiave è vuota: incollala prima di salvare".to_string());
    }
    secrets::Store::real()
        .set(ai::client::SEGRETO_OPENROUTER, pulita)
        .map_err(|e| e.to_string())
}

/// Rimuove la chiave OpenRouter dal Portachiavi. Non è un errore se non c'era.
#[tauri::command]
fn ai_chiave_elimina() -> Result<(), String> {
    match secrets::Store::real().delete(ai::client::SEGRETO_OPENROUTER) {
        Ok(()) => Ok(()),
        // `NoEntry`: non c'era nulla da cancellare. L'esito voluto è lo stesso.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Manda al cloud una richiesta **minima** per verificare che la chiave nel
/// Portachiavi sia valida, senza toccare la posta: un solo messaggio utente e
/// nessun contesto di messaggi.
///
/// Separata da `ai_azione` di proposito: quella pretende un messaggio in cache
/// (`thread_messages`) e costruisce il prompt dell'azione. Qui non serve né
/// l'uno né l'altro — e il trasporto si può iniettare, così la prova gira senza
/// rete.
pub async fn prova_chiave_cloud_con<T: ai::client::Trasporto>(
    trasporto: T,
    chiave: Option<String>,
) -> Result<String, ai::client::ErroreAi> {
    let cliente = ai::client::Client::con_chiave(trasporto, chiave);
    let richiesta = ai::client::Richiesta {
        provider: "cloud".to_string(),
        endpoint: ai::client::ENDPOINT_CLOUD_DEFAULT.to_string(),
        // Modello minimo: qui si prova la chiave, non la qualità della risposta.
        modello: "openai/gpt-4o-mini".to_string(),
        azione: "prova_chiave".to_string(),
        prompt_version: ai::PROMPT_VERSION.to_string(),
        temperatura: 0.0,
        // La prova è un invio esplicito dell'utente: il consenso è il clic.
        consenso_cloud: true,
        messaggi: vec![ai::client::MessaggioChat::utente(
            "Rispondi con la sola parola: ok",
        )],
    };
    cliente.completa(&richiesta).await
}

/// Prova la chiave OpenRouter del Portachiavi (`ai_zione` non serve: nessun
/// messaggio). Restituisce l'esito leggibile, mai la chiave.
#[tauri::command]
async fn ai_chiave_prova() -> Result<String, String> {
    let chiave = secrets::Store::real()
        .get(ai::client::SEGRETO_OPENROUTER)
        .ok()
        .filter(|k| !k.trim().is_empty());
    if chiave.is_none() {
        return Err("nessuna chiave nel Portachiavi: salvala prima di provarla".to_string());
    }
    prova_chiave_cloud_con(ai::client::TrasportoReqwest::new(), chiave)
        .await
        .map(|testo| format!("Il cloud ha risposto: {}", testo.trim()))
        .map_err(|e| e.to_string())
}

/// Elimina un account: la sua voce in `config.json`, la sua password nel
/// Keychain e **solo i suoi** messaggi dalla cache locale.
///
/// **Cosa fa ai dati**: le righe della cache di quell'account vengono rimosse
/// (`store::Store::elimina_account` filtra su `account`); i messaggi degli
/// **altri** account restano intatti, così come la configurazione, le firme, i
/// contatti, le regole e il registro IA. Se l'account eliminato era quello
/// **predefinito**, la preferenza viene azzerata. Non tocca nulla sul server:
/// è la casella locale configurata che sparisce dall'app, non l'account di posta.
#[tauri::command]
fn account_elimina(id: String) -> Result<String, String> {
    let dir = app_config_dir();
    let rimosso = config::elimina_account(&dir, &id).map_err(|e| e.to_string())?;
    if !rimosso {
        return Err(format!("account non configurato: {id}"));
    }
    let rimossi_dalla_cache = {
        let cache = apri_cache()?;
        cache.elimina_account(&id).map_err(|e| e.to_string())?
    };
    // La password vive solo nel Keychain: si cancella qui, mai in un file.
    let _ = secrets::Store::real().delete(&id);
    Ok(format!(
        "Account eliminato: {rimossi_dalla_cache} messaggi rimossi dalla cache locale (solo di questo account)."
    ))
}

/// Segna l'account **predefinito** (quello aperto all'avvio). Con un id vuoto la
/// preferenza si azzera (torna il primo account configurato). Rifiuta un id che
/// non corrisponde a nessun account: la barra di stato non deve puntare al nulla.
#[tauri::command]
fn account_predefinito(id: String) -> Result<String, String> {
    let dir = app_config_dir();
    let id = id.trim().to_string();
    if !id.is_empty() && !config::load_accounts(&dir).iter().any(|a| a.id == id) {
        return Err(format!("account non configurato: {id}"));
    }
    config::set_account_predefinito(&dir, &id).map_err(|e| e.to_string())?;
    Ok(if id.is_empty() {
        "Nessun account predefinito: si aprirà il primo disponibile.".to_string()
    } else {
        format!("Account predefinito: {id}.")
    })
}

/// L'account predefinito, o il primo configurato se non ne è stato scelto uno.
/// `None` se non c'è nessuna casella. Lo usa l'avvio della finestra principale.
#[tauri::command]
fn account_predefinito_letto() -> Option<Account> {
    config::account_predefinito(&app_config_dir())
}

/// Nome dell'evento con cui `mail_sync` annuncia la cartella che sta scaricando.
pub const EVENTO_AVANZAMENTO_SYNC: &str = "sync-avanzamento";

/// Avanzamento di «Invia e ricevi»: la cartella `indice` (da 0) di `totale`
/// dell'account. Il pannello lo mostra nella barra di stato.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvanzamentoSync {
    pub account: String,
    pub cartella: String,
    pub indice: usize,
    pub totale: usize,
}

/// Sincronizza le intestazioni dell'account dalla sua casella IMAP.
///
/// Prima di ogni cartella emette `EVENTO_AVANZAMENTO_SYNC`: un evento perso non
/// ferma la sincronizzazione, toglie solo un passo alla barra.
///
/// La rete (asincrona) e la cache (sincrona) non si incrociano: si scaricano le
/// intestazioni di ogni cartella e solo dopo si scrive sulla connessione SQLite.
#[tauri::command]
async fn mail_sync(
    account_id: String,
    app: tauri::AppHandle,
) -> Result<mail::sync::SyncSummary, String> {
    let account = config::load_accounts(&app_config_dir())
        .into_iter()
        .find(|a| a.id == account_id)
        .ok_or_else(|| format!("account non configurato: {account_id}"))?;
    let sorgente = mail::imap::ImapSource::from_account(&account, &secrets::Store::real())
        .map_err(|e| e.to_string())?;

    let cartelle = sorgente.folders().await.map_err(|e| e.to_string())?;
    let nomi: Vec<String> = cartelle.iter().map(|c| c.name.clone()).collect();
    // Cartella della posta indesiderata, se il server ne ha una: è la destinazione
    // della protezione quando è attiva.
    let indesiderata = mail::ops::trova_cartella(&nomi, mail::ops::NOMI_INDESIDERATA);

    let pref = config::load_preferenze(&app_config_dir());
    let protezione = pref.protezione_posta_indesiderata.clone();

    let mut per_cartella = Vec::with_capacity(cartelle.len());
    let mut protetta = 0usize;
    // Messaggi nuovi candidati alla notifica (blocco E): la decisione si prende
    // **dopo** la sincronizzazione, fuori dal ciclo di rete.
    let mut candidati: Vec<notifiche::Candidato> = Vec::new();
    for (indice, cartella) in cartelle.iter().enumerate() {
        let _ = app.emit(
            EVENTO_AVANZAMENTO_SYNC,
            AvanzamentoSync {
                account: account_id.clone(),
                cartella: cartella.name.clone(),
                indice,
                totale: cartelle.len(),
            },
        );
        let headers = mail::sync::fetch_folder(&sorgente, &cartella.name, LIMITE_INTESTAZIONI)
            .await
            .map_err(|e| e.to_string())?;

        // 1. Cache: intestazioni + UID dei mittenti bloccati (nessun `await`).
        let uids_bloccati = {
            let cache = apri_cache()?;
            let bloccati = cache.mittenti_bloccati().unwrap_or_default();
            let uids = mail::protezione::uids_da_mittenti_bloccati(&headers, &bloccati);
            // La soglia del "nuovo" va letta **prima** dell'upsert: è la stessa
            // che `apply_folder` usa per contare i nuovi nel riepilogo.
            let massimo = cache.max_uid(&account_id, &cartella.name).unwrap_or(None);
            let riepilogo = mail::sync::apply_folder(&cache, &account_id, &cartella.name, &headers)
                .map_err(|e| e.to_string())?;
            // Blocco H: chiavi di conversazione della cartella, calcolate su
            // tutte le righe (anche quelle già in cache) subito dopo l'upsert.
            let _ = mail::sync::aggiorna_thread(&cache, &account_id, &cartella.name);
            // I nuovi messaggi della cartella, per la notifica. Di ciò che arriva
            // in Posta indesiderata non si notifica nulla.
            if indesiderata.as_deref() != Some(cartella.name.as_str()) {
                for h in &headers {
                    if !mail::sync::e_piu_recente(&h.uid, massimo) {
                        continue;
                    }
                    let mittente = h.from.clone().unwrap_or_default();
                    let bloccato = mail::ops::estrai_indirizzo(&mittente)
                        .map(|a| bloccati.iter().any(|b| b == &a))
                        .unwrap_or(false);
                    candidati.push(notifiche::Candidato {
                        mittente,
                        oggetto: h.subject.clone().unwrap_or_default(),
                        quando: h.date,
                        letto: h.seen,
                        mittente_bloccato: bloccato,
                        cartella_indesiderata: false,
                    });
                }
            }
            per_cartella.push(riepilogo);
            uids
        };

        // 2. Rete (protezione attiva): sposta sul server i messaggi bloccati.
        let spostati = if protezione == "attiva" && !uids_bloccati.is_empty() {
            mail::protezione::sposta_sul_server(
                &sorgente,
                &cartella.name,
                &uids_bloccati,
                indesiderata.as_deref(),
            )
            .await
        } else {
            Vec::new()
        };

        // 3. Cache: sposta o marca secondo l'esito.
        let cache = apri_cache()?;
        let esito = mail::protezione::aggiorna_cache(
            &cache,
            &account_id,
            &cartella.name,
            &uids_bloccati,
            &spostati,
            indesiderata.as_deref(),
            &protezione,
        )
        .map_err(|e| e.to_string())?;
        protetta += esito.spostati + esito.marcati;
    }

    // Blocco H: motore delle regole locali, **dopo** l'inserimento in cache e
    // fuori dal ciclo di rete, come la notifica del blocco E. Le regole agiscono
    // sui messaggi che non sono ancora stati valutati (`regole_applicate = 0`),
    // quindi un messaggio non viene mai elaborato due volte.
    let mut per_regola: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut fallimenti_regole: Vec<String> = Vec::new();
    if !pref.regole.is_empty() {
        for cartella in &cartelle {
            match applica_regole_cartella(&sorgente, &account_id, &cartella.name, &pref.regole).await
            {
                Ok(esito) => {
                    for (id, n) in esito.per_regola {
                        *per_regola.entry(id).or_insert(0) += n;
                    }
                    fallimenti_regole.extend(esito.fallimenti);
                }
                Err(e) => fallimenti_regole.push(e),
            }
        }
        // Le regole possono aver spostato messaggi fra cartelle: si ricalcolano
        // le chiavi di conversazione ovunque, così il raggruppamento resta giusto.
        {
            let cache = apri_cache()?;
            for cartella in &cartelle {
                let _ = mail::sync::aggiorna_thread(&cache, &account_id, &cartella.name);
            }
        }
    }

    // Statistiche di trasparenza: quante volte ogni regola ha agito e l'ultima
    // volta. Si scrivono in `config.json` solo se qualche regola ha agito.
    if !per_regola.is_empty() {
        let mut p = config::load_preferenze(&app_config_dir());
        let adesso = adesso_unix();
        for r in p.regole.iter_mut() {
            if let Some(n) = per_regola.get(&r.id) {
                r.esecuzioni += *n as i64;
                r.ultima_esecuzione = adesso;
            }
        }
        let _ = config::save_preferenze(&app_config_dir(), &p);
    }
    for f in &fallimenti_regole {
        eprintln!("regole: {f}");
    }

    // L'ultima volta che la protezione ha agito: lo legge il pannello.
    if protetta > 0 {
        let mut p = pref.clone();
        p.protezione_ultima_azione = adesso_unix();
        let _ = config::save_preferenze(&app_config_dir(), &p);
    }

    // Blocco I1: le cartelle viste vengono registrate nella cache (per la barra
    // laterale e i Preferiti), e i messaggi delle conversazioni ignorate sono
    // segnati letti e spostati in Posta eliminata.
    {
        let cache = apri_cache()?;
        for cartella in &cartelle {
            let _ = cache.registra_cartella(&account_id, &cartella.name);
        }
    }
    {
        let ignorate = {
            let cache = apri_cache()?;
            cache.conversazioni_ignorate(&account_id).unwrap_or_default()
        };
        if !ignorate.is_empty() {
            let eliminata = mail::ops::trova_cartella(&nomi, mail::ops::NOMI_ELIMINATA);
            for cartella in &cartelle {
                let uids = {
                    let cache = apri_cache()?;
                    cache
                        .messaggi_di_conversazioni_ignorate(&account_id, &cartella.name, &ignorate)
                        .unwrap_or_default()
                };
                for uid in uids {
                    // Prima il server (due fasi separate: la cache non resta
                    // aperta attraverso un `await`).
                    let segnato = mail::ops::server_imposta_flag(
                        &sorgente,
                        &cartella.name,
                        &uid,
                        mail::FlagOp::Seen,
                        true,
                    )
                    .await
                    .is_ok();
                    if segnato {
                        let cache = apri_cache()?;
                        let _ = mail::ops::cache_imposta_flag(
                            &cache,
                            &account_id,
                            &cartella.name,
                            &uid,
                            mail::FlagOp::Seen,
                            true,
                        );
                    }
                    if let Some(dest) = eliminata
                        .as_deref()
                        .filter(|d| !d.eq_ignore_ascii_case(&cartella.name))
                    {
                        if mail::ops::server_sposta(&sorgente, &cartella.name, &uid, dest)
                            .await
                            .is_ok()
                        {
                            let cache = apri_cache()?;
                            let _ = cache.sposta(&account_id, &cartella.name, &uid, dest);
                        }
                    }
                }
            }
        }
    }

    let riepilogo = mail::sync::SyncSummary {
        folders: per_cartella,
    };

    // Blocco E: la notifica si emette **dopo** la sincronizzazione, mai dentro il
    // ciclo di rete, e i messaggi nuovi sono quelli contati dal riepilogo.
    notifica_dopo_sync(&app, &pref, &candidati);

    Ok(riepilogo)
}

/// Esito della sincronizzazione di **un** account, per il riepilogo «Invia e
/// ricevi» su tutte le caselle (blocco J). Con `ok = false` l'`errore` dice
/// perché quella casella non si è aggiornata: le altre proseguono comunque.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsitoSyncAccount {
    pub account: String,
    pub email: String,
    pub ok: bool,
    /// Messaggi nuovi su tutte le cartelle (0 se l'account è fallito).
    pub nuovi: usize,
    /// Cartelle aggiornate (0 se l'account è fallito).
    pub cartelle: usize,
    pub errore: Option<String>,
}

/// Sincronizza **ogni** account configurato e restituisce un riepilogo per
/// account (blocco J). È l'azione di «Invia e ricevi» quando ci sono più
/// caselle.
///
/// **Un account che fallisce non blocca gli altri**: login rifiutato, rete o
/// server muto vengono riportati nell'`errore` di quell'account e il ciclo
/// prosegue. Il comando stesso riesce (restituisce sempre l'elenco) tranne che
/// per un errore di cache, che riguarderebbe tutti.
#[tauri::command]
async fn mail_sync_tutti(app: tauri::AppHandle) -> Result<Vec<EsitoSyncAccount>, String> {
    let accounts = config::load_accounts(&app_config_dir());
    Ok(sync_tutti_con(accounts, |account| {
        let app = app.clone();
        async move { mail_sync(account.id.clone(), app).await }
    })
    .await)
}

/// La parte **pura** di `mail_sync_tutti`: esegue la sincronizzazione di ogni
/// account con la funzione iniettata (`sincronizza`) e raccoglie un esito per
/// account. **Un account che fallisce non ferma gli altri**: il suo errore resta
/// nel suo `EsitoSyncAccount`, gli altri proseguono. I test iniettano una
/// sorgente finta (una che riesce, una che fallisce).
pub async fn sync_tutti_con<F, Fut>(
    accounts: Vec<Account>,
    mut sincronizza: F,
) -> Vec<EsitoSyncAccount>
where
    F: FnMut(Account) -> Fut,
    Fut: std::future::Future<Output = Result<mail::sync::SyncSummary, String>>,
{
    let mut out = Vec::with_capacity(accounts.len());
    for account in accounts {
        let id = account.id.clone();
        let email = account.email.clone();
        match sincronizza(account).await {
            Ok(riepilogo) => out.push(EsitoSyncAccount {
                account: id,
                email,
                ok: true,
                nuovi: riepilogo.new_messages(),
                cartelle: riepilogo.folders.len(),
                errore: None,
            }),
            Err(errore) => out.push(EsitoSyncAccount {
                account: id,
                email,
                ok: false,
                nuovi: 0,
                cartelle: 0,
                errore: Some(errore),
            }),
        }
    }
    out
}

/// Applica le regole locali a **una cartella**: pianifica dalla cache (sincrono),
/// esegue la rete (asincrono) e applica alla cache (sincrono). Le due fasi non
/// incrociano mai la cache, così il future del comando resta `Send`.
///
/// Un messaggio viene marcato «valutato» anche quando nessuna regola lo tocca:
/// le regole si applicano ai messaggi **in arrivo**, non a quelli già visti.
async fn applica_regole_cartella(
    sorgente: &mail::imap::ImapSource,
    account: &str,
    folder: &str,
    regole: &[config::Regola],
) -> Result<mail::regole::EsitoRegole, String> {
    // 1. Pianificazione (cache, nessun `await`).
    let (passi, valutati) = {
        let cache = apri_cache()?;
        let righe = cache
            .messaggi_da_regole(account, folder)
            .map_err(|e| e.to_string())?;
        if righe.is_empty() {
            return Ok(mail::regole::EsitoRegole::default());
        }
        let messaggi: Vec<mail::regole::Messaggio> = righe.iter().map(Into::into).collect();
        let passi = mail::regole::pianifica(regole, &messaggi);
        let valutati: Vec<String> = righe.iter().map(|r| r.uid.clone()).collect();
        (passi, valutati)
    };

    // 2. Rete (solo le operazioni che toccano il server).
    let risposte = mail::regole::esegui_rete(sorgente, folder, &passi).await;

    // 3. Cache (applica gli esiti e marca i messaggi valutati), per account.
    let cache = apri_cache()?;
    mail::regole::applica_cache(&cache, account, folder, &passi, &risposte, &valutati)
}

/// Emette la notifica di sistema dopo una sincronizzazione (blocco E).
///
/// La decisione se notificare è la funzione pura `notifiche::decidi`; qui si
/// legge solo lo stato della finestra e l'ora locale. I messaggi candidati sono
/// quelli che il riepilogo di sincronizzazione ha contato come nuovi (stessa
/// soglia dell'UID massimo in cache).
fn notifica_dopo_sync(
    app: &tauri::AppHandle,
    pref: &config::Preferenze,
    candidati: &[notifiche::Candidato],
) {
    if candidati.is_empty() {
        return;
    }
    let finestra_attiva = app
        .get_webview_window("main")
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false);
    let opz = notifiche::opzioni_da_preferenze(pref, finestra_attiva, notifiche::adesso_minuti());
    let decisione = notifiche::decidi(candidati, &opz);
    if !decisione.mostrare {
        return;
    }
    if let Some((titolo, corpo)) = notifiche::testo_da_decisione(&decisione, opz.anteprima) {
        let _ = notifiche::mostra(app, &titolo, &corpo, &pref.notifiche_suono);
    }
}

/// Mostra una notifica di **prova** (pulsante «Prova notifica» del pannello
/// «Notifiche e suoni»). È un'azione esplicita dell'utente: ignora di proposito
/// l'intervallo «non disturbare» e lo stato della finestra, così la prova si vede
/// sempre. Usa il suono scelto.
#[tauri::command]
fn notifica_prova(app: tauri::AppHandle) -> Result<String, String> {
    let pref = config::load_preferenze(&app_config_dir());
    let (titolo, corpo) = notifiche::testo_notifica(
        1,
        "Outlook AI",
        "Questa è una notifica di prova.",
        pref.notifiche_anteprima,
    );
    notifiche::mostra(&app, &titolo, &corpo, &pref.notifiche_suono)
}

/// Riproduce il suono scelto per la prova isolata («Prova» del pannello). Se non
/// è indicato un suono, usa quello salvato nelle preferenze.
#[tauri::command]
async fn suono_prova(suono: Option<String>) -> Result<String, String> {
    let nome = suono.unwrap_or_else(|| config::load_preferenze(&app_config_dir()).notifiche_suono);
    tokio::task::spawn_blocking(move || notifiche::suona(&nome))
        .await
        .map_err(|e| e.to_string())?
}

/// Pagina di messaggi di una cartella per la lista dell'interfaccia. L'ordine
/// arriva dalle preferenze («Ordina per» e verso, blocco I2) oppure dai due
/// argomenti, quando l'interfaccia li passa esplicitamente.
#[tauri::command]
fn mail_list(
    folder: String,
    offset: usize,
    limit: usize,
    account_id: Option<String>,
    ordina_per: Option<String>,
    ordina_verso: Option<String>,
) -> Result<Vec<MailRow>, String> {
    let cache = apri_cache()?;
    let (campo, verso) = match (ordina_per, ordina_verso) {
        (Some(c), Some(v)) => (c, v),
        _ => {
            let p = config::load_preferenze(&app_config_dir());
            (p.ordina_per, p.ordina_verso)
        }
    };
    // Con un account indicato si legge quella casella; senza, la posta di
    // **tutte** le caselle insieme (blocco J), con l'account su ogni riga.
    let righe = match account_id.as_deref().filter(|s| !s.is_empty()) {
        Some(id) => cache.list_per_account(id, &folder, offset, limit, &campo, &verso),
        None => cache.list_tutti_gli_account(&folder, offset, limit, &campo, &verso),
    }
    .map_err(|e| e.to_string())?;
    Ok(righe.into_iter().map(MailRow::da_riga).collect())
}

/// Pagina di **conversazioni** di una cartella (blocco H): la lista raggruppata
/// mostra una riga per conversazione, espandibile. Ogni conversazione porta i
/// suoi messaggi in ordine cronologico.
///
/// Con `accountId` si raggruppa la sola casella indicata; senza, si raggruppano
/// tutte le caselle (blocco J), con l'account su ogni riga. Con **una sola
/// casella** il risultato è identico a quello di sempre.
#[tauri::command]
fn mail_conversazioni(
    folder: String,
    offset: usize,
    limit: usize,
    account_id: Option<String>,
) -> Result<Vec<ConversazioneRow>, String> {
    let cache = apri_cache()?;
    let righe = match account_id.as_deref().filter(|s| !s.is_empty()) {
        Some(id) => cache.conversazioni_per_account(id, &folder, offset, limit),
        None => cache.conversazioni(&folder, offset, limit),
    }
    .map_err(|e| e.to_string())?;
    Ok(righe.into_iter().map(ConversazioneRow::da_riga).collect())
}

/// Numero di messaggi presenti in cache per una cartella (o per una sola
/// casella, con `accountId`).
#[tauri::command]
fn mail_count(folder: String, account_id: Option<String>) -> Result<u32, String> {
    let cache = apri_cache()?;
    let n = match account_id.as_deref().filter(|s| !s.is_empty()) {
        Some(id) => cache.count_per_account(id, &folder),
        None => cache.count_tutti_gli_account(&folder),
    }
    .map_err(|e| e.to_string())?;
    Ok(n as u32)
}

/// Un risultato della ricerca, pronto per la lista dell'interfaccia. I nomi
/// arrivano in camelCase (contratto Tauri), la data in ISO 8601 UTC e il
/// frammento di testo con il termine trovato fra « ».
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RisultatoRicerca {
    /// Casella di provenienza: la ricerca attraversa le caselle, quindi ogni
    /// risultato deve dire da quale viene (due caselle possono avere lo stesso
    /// `uid`). Senza, le azioni su un risultato in vista aggregata si fermano.
    pub account: String,
    pub folder: String,
    pub uid: String,
    pub oggetto: Option<String>,
    pub mittente: Option<String>,
    /// Data in ISO 8601 UTC (es. `2026-10-12T15:26:00Z`).
    pub data: String,
    /// Frammento di testo attorno alla corrispondenza, termine fra « ».
    pub anteprima: String,
    pub non_letto: bool,
    pub allegati: bool,
    pub contrassegnato: bool,
    pub completato: bool,
    pub categorie: Vec<String>,
    /// Data in secondi dall'epoca Unix: l'interfaccia riusa `formatDate` della
    /// lista, così i risultati hanno la stessa resa delle righe normali.
    pub timestamp: i64,
}

/// Risposta completa della ricerca: i risultati e l'eventuale avviso che FTS5
/// ha rifiutato l'espressione e si è cercato per sottostringa.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsitoRicerca {
    pub risultati: Vec<RisultatoRicerca>,
    pub nota: Option<String>,
}

/// Numero massimo di risultati restituiti da `mail_cerca` se non ne è chiesto uno.
pub const LIMITE_RICERCA_DEFAULT: u32 = 50;

/// Converte una riga di cache in un risultato per l'interfaccia: decodifica le
/// categorie dal JSON salvato e formatta la data in ISO 8601 UTC.
pub fn riga_ricerca_ipc(r: store::RigaRicerca) -> RisultatoRicerca {
    let categorie = r
        .categorie
        .as_deref()
        .and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
        .unwrap_or_default();
    RisultatoRicerca {
        account: r.account,
        folder: r.folder,
        uid: r.uid,
        oggetto: r.subject.as_deref().map(mail::mime::decodifica_intestazione),
        mittente: r.sender.as_deref().map(mail::mime::decodifica_intestazione),
        data: ricerca::iso_da_epoch(r.date),
        anteprima: r.anteprima,
        non_letto: !r.seen,
        allegati: r.has_attachments,
        contrassegnato: r.flagged,
        completato: r.completato,
        categorie,
        timestamp: r.date,
    }
}

/// Cerca nei messaggi in cache (blocco B). Il testo tollera gli errori di
/// sintassi di FTS5: in quel caso si ripiega sulla sottostringa e lo dice in
/// `nota`. `limite` è opzionale; `None` o `0` vale `LIMITE_RICERCA_DEFAULT`.
#[tauri::command]
fn mail_cerca(testo: String, limite: Option<u32>) -> Result<EsitoRicerca, String> {
    let limite = match limite {
        Some(n) if n > 0 => n as usize,
        _ => LIMITE_RICERCA_DEFAULT as usize,
    };
    let cache = apri_cache()?;
    let esito = cache.cerca(&testo, limite).map_err(|e| e.to_string())?;
    Ok(EsitoRicerca {
        risultati: esito.righe.into_iter().map(riga_ricerca_ipc).collect(),
        nota: esito.nota,
    })
}

/// Corpo di un messaggio pronto per l'interfaccia: HTML **già sanificato**,
/// testo di riserva e solo i metadati degli allegati (i byte si prendono al
/// salvataggio, mai prima).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailBody {
    pub html: String,
    pub text: String,
    pub attachments: Vec<MailAttachmentInfo>,
    /// Vero se nell'HTML sono state bloccate immagini remote: solo allora il
    /// pannello propone «Mostra immagini».
    pub immagini_bloccate: bool,
}

/// Metadati di un allegato, come mostrati sotto il corpo del messaggio.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailAttachmentInfo {
    /// Posizione dell'allegato nel messaggio: identifica il file da salvare.
    pub indice: usize,
    pub name: String,
    pub mime: String,
    pub size: usize,
}

/// Primo account configurato, o l'account **predefinito** se ne è stato scelto
/// uno (blocco J): è l'account che l'app usa quando il comando non ne indica uno.
fn primo_account() -> Result<Account, String> {
    config::account_predefinito(&app_config_dir())
        .ok_or_else(|| "nessun account configurato".to_string())
}

/// Risolve l'account su cui operare (blocco K), senza toccare il disco: è la
/// parte **pura** di `account_per_id`, provabile dai test di integrazione.
///
/// - `id` presente (non vuoto) → deve esistere fra `accounts`, altrimenti un
///   errore in italiano (`account non configurato: <id>`); **non** ricade sul
///   predefinito, così un id sbagliato non agisce su un'altra casella;
/// - `id` assente o vuoto → l'account `predefinito` se indicato e presente,
///   altrimenti il primo; con nessun account configurato è un errore leggibile.
pub fn risolvi_account<'a>(
    accounts: &'a [Account],
    id: Option<&str>,
    predefinito: Option<&str>,
) -> Result<&'a Account, String> {
    match id.filter(|s| !s.is_empty()) {
        Some(id) => accounts
            .iter()
            .find(|a| a.id == id)
            .ok_or_else(|| format!("account non configurato: {id}")),
        None => predefinito
            .filter(|s| !s.is_empty())
            .and_then(|p| accounts.iter().find(|a| a.id == p))
            .or_else(|| accounts.first())
            .ok_or_else(|| "nessun account configurato".to_string()),
    }
}

/// L'account indicato o, se assente/vuoto, il predefinito (blocco K). Un id
/// presente ma non configurato è un errore leggibile, non un silenzio.
fn account_per_id(id: Option<&str>) -> Result<Account, String> {
    let dir = app_config_dir();
    let accounts = config::load_accounts(&dir);
    let predefinito = config::account_predefinito(&dir).map(|a| a.id);
    risolvi_account(&accounts, id, predefinito.as_deref()).cloned()
}

/// Scarica il corpo grezzo (RFC 822) dalla cartella e dall'UID indicati,
/// dall'account indicato (o dal predefinito). Nella vista «Tutti gli account» la
/// stessa coppia (cartella, uid) esiste in più caselle: l'account è ciò che
/// sceglie da quale scaricare.
async fn corpo_grezzo(folder: &str, uid: &str, account_id: Option<&str>) -> Result<Vec<u8>, String> {
    let account = account_per_id(account_id)?;
    let sorgente = mail::imap::ImapSource::from_account(&account, &secrets::Store::real())
        .map_err(|e| e.to_string())?;
    sorgente.body(folder, uid).await.map_err(|e| e.to_string())
}

/// Compone il corpo per l'interfaccia: parsing MIME, sanitizzazione dell'HTML e
/// metadati degli allegati. Con `consenti_immagini` falso le immagini remote
/// restano bloccate (segnaposto); con vero il browser può richiederle.
pub fn componi_corpo(grezzo: &[u8], consenti_immagini: bool) -> MailBody {
    let corpo = mail::mime::analizza(grezzo);
    let html = sanitize::sanifica(corpo.html.as_deref().unwrap_or(""), consenti_immagini);
    let attachments = corpo
        .allegati
        .iter()
        .enumerate()
        .map(|(indice, a)| MailAttachmentInfo {
            indice,
            name: a.nome.clone(),
            mime: a.tipo.clone(),
            size: a.dimensione,
        })
        .collect();
    let immagini_bloccate = !consenti_immagini && html.contains(sanitize::SEGNAPOSTO_IMMAGINE);
    MailBody {
        html,
        text: corpo.testo.unwrap_or_default(),
        attachments,
        immagini_bloccate,
    }
}

/// Corpo del messaggio con le immagini remote **bloccate** (predefinito), a
/// meno che per questo messaggio l'utente non abbia già scelto «Mostra
/// immagini»: allora arrivano già consentite e il pulsante non si ripropone.
#[tauri::command]
async fn mail_body(
    folder: String,
    uid: String,
    account_id: Option<String>,
) -> Result<MailBody, String> {
    let account = account_per_id(account_id.as_deref())?;
    let consentite = apri_cache()?
        .immagini_consentite(&account.id, &folder, &uid)
        .unwrap_or(false);
    let grezzo = corpo_grezzo(&folder, &uid, Some(&account.id)).await?;
    Ok(componi_corpo(&grezzo, consentite))
}

/// Corpo del messaggio con le immagini remote **consentite**, per il pulsante
/// "Mostra immagini". La scelta resta in cache per questo messaggio: riaprendolo
/// le immagini si vedono subito, senza chiedere di nuovo.
#[tauri::command]
async fn mail_body_con_immagini(
    folder: String,
    uid: String,
    account_id: Option<String>,
) -> Result<MailBody, String> {
    let account = account_per_id(account_id.as_deref())?;
    let grezzo = corpo_grezzo(&folder, &uid, Some(&account.id)).await?;
    apri_cache()?
        .consenti_immagini(&account.id, &folder, &uid)
        .map_err(|e| e.to_string())?;
    Ok(componi_corpo(&grezzo, true))
}

/// Salva un allegato nella cartella Download dell'utente e ne restituisce il
/// percorso scritto. Nessun dialogo di scelta: nella v1 va in Download e il
/// percorso viene mostrato. Il file nasce solo su questa azione esplicita.
#[tauri::command]
async fn mail_allegato_salva(
    folder: String,
    uid: String,
    indice: usize,
    account_id: Option<String>,
) -> Result<String, String> {
    let grezzo = corpo_grezzo(&folder, &uid, account_id.as_deref()).await?;
    let corpo = mail::mime::analizza(&grezzo);
    let allegato = corpo
        .allegati
        .get(indice)
        .ok_or_else(|| format!("allegato {indice} inesistente nel messaggio"))?;

    let cartella =
        dirs::download_dir().ok_or_else(|| "cartella Download non trovata".to_string())?;
    std::fs::create_dir_all(&cartella).map_err(|e| e.to_string())?;
    let percorso = percorso_libero(&cartella, &nome_sicuro(&allegato.nome));
    std::fs::write(&percorso, &allegato.dati).map_err(|e| e.to_string())?;
    Ok(percorso.to_string_lossy().into_owned())
}

/// Riduce il nome dell'allegato a un nome file innocuo: niente percorso, niente
/// caratteri di controllo o separatori di volume.
fn nome_sicuro(nome: &str) -> String {
    let base = nome.rsplit(['/', '\\']).next().unwrap_or(nome).trim();
    let pulito: String = base
        .chars()
        .filter(|c| !c.is_control() && *c != ':')
        .collect();
    if pulito.is_empty() || pulito == "." || pulito == ".." {
        "allegato".to_string()
    } else {
        pulito
    }
}

/// Primo percorso libero nella cartella: se il nome esiste già aggiunge " (2)",
/// " (3)", … per non sovrascrivere un file dell'utente.
fn percorso_libero(cartella: &Path, nome: &str) -> PathBuf {
    let iniziale = cartella.join(nome);
    if !iniziale.exists() {
        return iniziale;
    }
    let percorso = Path::new(nome);
    let gambo = percorso
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "allegato".to_string());
    let estensione = percorso
        .extension()
        .map(|e| e.to_string_lossy().into_owned());
    for n in 2..1000 {
        let candidato = match &estensione {
            Some(ext) => format!("{gambo} ({n}).{ext}"),
            None => format!("{gambo} ({n})"),
        };
        let p = cartella.join(candidato);
        if !p.exists() {
            return p;
        }
    }
    iniziale
}

/// Bozza di risposta a un messaggio: destinatario, copie, oggetto prefissato e
/// corpo con il messaggio originale citato. `tutti` vero per "Rispondi a tutti"
/// (i To/Cc originali entrano in copia, meno il proprio indirizzo).
#[tauri::command]
async fn mail_bozza_risposta(
    folder: String,
    uid: String,
    tutti: bool,
    account_id: Option<String>,
) -> Result<send::BozzaRisposta, String> {
    let grezzo = corpo_grezzo(&folder, &uid, account_id.as_deref()).await?;
    // Il proprio indirizzo è quello dell'account del messaggio (o il predefinito),
    // così «Rispondi a tutti» non mette in copia il mittente sbagliato.
    let mio = account_per_id(account_id.as_deref())
        .map(|a| a.email)
        .unwrap_or_default();
    Ok(send::bozza_risposta(&grezzo, &mio, tutti))
}

/// Bozza di inoltro di un messaggio: oggetto prefissato e messaggio originale
/// citato come testo.
#[tauri::command]
async fn mail_bozza_inoltro(
    folder: String,
    uid: String,
    account_id: Option<String>,
) -> Result<send::BozzaInoltro, String> {
    let grezzo = corpo_grezzo(&folder, &uid, account_id.as_deref()).await?;
    Ok(send::bozza_inoltro(&grezzo))
}

/// Allegati di un messaggio originale, pronti per essere riportati in una bozza
/// di risposta/inoltro (come fa Outlook): nome, tipo MIME e contenuto base64.
/// Un messaggio senza allegati (o non interpretabile) dà un elenco vuoto.
#[tauri::command]
async fn mail_allegati_messaggio(
    folder: String,
    uid: String,
    account_id: Option<String>,
) -> Result<Vec<send::AllegatoInviato>, String> {
    let grezzo = corpo_grezzo(&folder, &uid, account_id.as_deref()).await?;
    Ok(send::allegati_per_bozza(&grezzo))
}

/// Invia un messaggio con SMTP/TLS usando la configurazione dell'account.
///
/// La validazione (destinatario presente, oggetto non vuoto) e il controllo del
/// limite degli allegati avvengono **prima** di contattare il server: se
/// falliscono, l'invio non parte e l'errore è chiaro in italiano. La password
/// arriva solo dal Keychain.
///
/// A invio riuscito il messaggio viene copiato in "Posta inviata" con IMAP
/// `APPEND`; se la copia non riesce, l'invio resta riuscito e l'esito lo dichiara
/// con una nota (non è un errore).
#[tauri::command]
async fn mail_invia(
    account_id: String,
    a: String,
    cc: String,
    ccn: String,
    oggetto: String,
    corpo_testo: String,
    corpo_html: String,
    allegati: Vec<send::AllegatoInviato>,
    conferma_lettura: Option<bool>,
    conferma_recapito: Option<bool>,
) -> Result<String, String> {
    componi_e_invia(
        &account_id,
        &a,
        &cc,
        &ccn,
        &oggetto,
        &corpo_testo,
        &corpo_html,
        &allegati,
        conferma_lettura.unwrap_or(false),
        conferma_recapito.unwrap_or(false),
    )
    .await
}

/// Compone e invia un messaggio con le conferme richieste. La usano il comando
/// `mail_invia` e il pianificatore di «Invia più tardi»: una sola strada verso
/// SMTP, così un invio programmato è identico a uno immediato.
#[allow(clippy::too_many_arguments)]
async fn componi_e_invia(
    account_id: &str,
    a: &str,
    cc: &str,
    ccn: &str,
    oggetto: &str,
    corpo_testo: &str,
    corpo_html: &str,
    allegati: &[send::AllegatoInviato],
    conferma_lettura: bool,
    conferma_recapito: bool,
) -> Result<String, String> {
    let account = config::load_accounts(&app_config_dir())
        .into_iter()
        .find(|x| x.id == account_id)
        .ok_or_else(|| format!("account non configurato: {account_id}"))?;

    let destinatari = send::dividi_indirizzi(a);
    let copia = send::dividi_indirizzi(cc);
    let nascosta = send::dividi_indirizzi(ccn);
    // Validazione pura prima di qualunque contatto con la rete.
    send::valida_invio(&destinatari, oggetto).map_err(|e| e.to_string())?;

    let mittente = format!("{} <{}>", account.full_name, account.email);
    let html = if corpo_html.trim().is_empty() {
        None
    } else {
        Some(corpo_html)
    };
    // Blocco I2: conferme richieste e indirizzo di risposta predefinito. Le
    // intestazioni compaiono solo se davvero chieste (vedi `intestazioni_extra`).
    let pref = config::load_preferenze(&app_config_dir());
    let extra = send::IntestazioniExtra {
        reply_to: if pref.risposta_predefinita.trim().is_empty() {
            None
        } else {
            Some(pref.risposta_predefinita.clone())
        },
        tracciamento: send::Tracciamento {
            conferma_lettura,
            conferma_recapito,
            indirizzo: account.email.clone(),
        },
    };
    let extra = if extra.reply_to.is_none() && !extra.tracciamento.richiesto() {
        None
    } else {
        Some(extra)
    };
    let messaggio = send::build_message_completo_con_extra(
        &mittente,
        &destinatari,
        &copia,
        &nascosta,
        oggetto,
        corpo_testo,
        html,
        None,
        allegati,
        extra.as_ref(),
    )
    .map_err(|e| e.to_string())?;

    let grezzo = messaggio.formatted();

    // La sorgente IMAP serve solo alla copia in "Posta inviata". Se non è
    // disponibile (password mancante), l'invio parte lo stesso.
    let sorgente = mail::imap::ImapSource::from_account(&account, &secrets::Store::real()).ok();
    let esito = send::invia_e_copia(
        sorgente.as_ref().map(|s| s as &dyn MailSource),
        || send::invia_messaggio(&account, &secrets::Store::real(), &messaggio).map(|_| ()),
        &grezzo,
    )
    .await
    .map_err(|e| e.to_string())?;

    // Blocco U5: i destinatari nuovi entrano in rubrica. È un di più: se non
    // riesce, l'invio resta riuscito.
    if pref.rubrica_aggiunta_automatica {
        let tutti: Vec<String> = destinatari.iter().chain(&copia).chain(&nascosta).cloned().collect();
        let _ = aggiungi_destinatari_in(&cache_path(), &tutti, &account.email);
    }

    Ok(esito.testo(&account))
}

/// Blocco U5: aggiunge alla rubrica i destinatari che non ci sono ancora (né
/// come email principale né come altra), con origine «automatico». I contatti
/// esistenti non si toccano. Restituisce quanti ne ha aggiunti.
pub fn aggiungi_destinatari_in(
    path_db: &Path,
    destinatari: &[String],
    escludi: &str,
) -> Result<usize, String> {
    let cache = store::Store::open(path_db).map_err(|e| e.to_string())?;
    let mut aggiunti = 0;
    for c in contatti::contatti_da_destinatari(destinatari, escludi) {
        if cache.contatto_per_email(&c.email).map_err(|e| e.to_string())?.is_some() {
            continue;
        }
        if cache.contatto_salva(&(&c).into()).is_ok() {
            aggiunti += 1;
        }
    }
    Ok(aggiunti)
}

/// Risultato di un'azione dell'assistente IA, pronto per l'interfaccia.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRisposta {
    /// Testo prodotto dal modello (JSON grezzo per l'azione "azioni").
    pub testo: String,
    /// Modello usato.
    pub modello: String,
    /// Quanti messaggi del thread sono entrati nel contesto.
    pub messaggi_usati: usize,
    /// Quanti messaggi più vecchi sono stati esclusi per budget di token.
    pub esclusi: usize,
    /// Destinazione usata: "locale" oppure "cloud".
    pub provider: String,
}

/// Budget di token del contesto del thread (dal più recente).
const BUDGET_TOKEN_CONTESTO: usize = ai::context::BUDGET_TOKEN_DEFAULT;

/// Esegue un'azione dell'assistente IA sul messaggio selezionato.
///
/// Azioni: `riassumi`, `azioni`, `traduci`, `bozza_risposta`. Il contesto del
/// thread è costruito con un budget di token e gli esclusi sono restituiti
/// all'interfaccia. Il provider è `locale` (predefinito) oppure `cloud`: per il
/// cloud il consenso esplicito è obbligatorio e la chiave arriva solo dal
/// Keychain; ogni richiesta cloud finisce nel registro (hash, mai il testo).
#[tauri::command]
async fn ai_azione(
    azione: String,
    folder: String,
    uid: String,
    provider: String,
    consenso_cloud: bool,
    account_id: Option<String>,
) -> Result<AiRisposta, String> {
    let account = account_per_id(account_id.as_deref())?;
    let az =
        ai::Azione::da_nome(&azione).ok_or_else(|| format!("azione IA sconosciuta: {azione}"))?;

    // 1. Messaggi del thread dalla cache, **dell'account del messaggio aperto**
    //    (blocco K): con più caselle che condividono cartella e UID, il contesto
    //    dell'assistente resta quello della casella giusta. La connessione
    //    SQLite non è `Sync`: non resta aperta attraverso gli `await`.
    let righe = {
        let cache = apri_cache()?;
        cache
            .thread_messages(&account.id, &folder, &uid)
            .map_err(|e| e.to_string())?
    };
    if righe.is_empty() {
        return Err(format!("messaggio non trovato in cache: {folder}/{uid}"));
    }

    // 2. Corpo: dalla cache se già scaricato, altrimenti dalla rete (IMAP).
    let mut messaggi = Vec::with_capacity(righe.len());
    for r in &righe {
        let testo = match &r.body_text {
            Some(t) => t.clone(),
            None => {
                let grezzo = corpo_grezzo(&r.folder, &r.uid, Some(&account.id)).await?;
                mail::mime::analizza(&grezzo).testo.unwrap_or_default()
            }
        };
        messaggi.push(ai::context::MessaggioThread {
            da: r.sender.clone().unwrap_or_default(),
            data: r.date,
            oggetto: r.subject.clone(),
            testo,
        });
    }

    // 3. Contesto entro il budget di token.
    let contesto = ai::context::costruisci(&messaggi, BUDGET_TOKEN_CONTESTO);

    // 4. Parametri dei template: il mittente è l'autore della mail più recente;
    //    per la traduzione il testo è quello del messaggio selezionato. Tono e
    //    lingue arrivano dalle preferenze (Milestone 8).
    let pref = config::load_preferenze(&app_config_dir());
    let parametri = ai::ParametriPrompt {
        mittente: messaggi.last().map(|m| m.da.clone()).unwrap_or_default(),
        nome_mittente_utente: account.full_name.clone(),
        tono: pref.tono_bozze.clone(),
        lingua_destinazione: pref.lingua_traduzione.clone(),
        lingua_risposte: pref.lingua_risposte.clone(),
    };
    let indice_selezionato = righe
        .iter()
        .position(|r| r.uid == uid)
        .unwrap_or(righe.len() - 1);
    let corpo_prompt = if az == ai::Azione::Traduci {
        messaggi[indice_selezionato].testo.as_str()
    } else {
        contesto.testo.as_str()
    };
    let prompt = ai::componi_prompt(az, corpo_prompt, &parametri);

    // 5. Destinazione e chiave. La chiave OpenRouter si legge SOLO dal Keychain.
    //    Endpoint e modelli vengono dalle preferenze (Milestone 8): l'endpoint
    //    locale e i nomi dei modelli sono configurabili; l'endpoint cloud resta
    //    fisso (OpenRouter) e non è modificabile dall'interfaccia.
    let cloud = provider == "cloud";
    let endpoint = if cloud {
        ai::client::ENDPOINT_CLOUD_DEFAULT.to_string()
    } else {
        pref.endpoint_locale.clone()
    };
    let modello = if cloud {
        pref.modello_cloud.clone()
    } else {
        pref.modello_locale.clone()
    };
    let chiave = if cloud {
        secrets::Store::real()
            .get(ai::client::SEGRETO_OPENROUTER)
            .ok()
    } else {
        None
    };

    // 6. Registro di tracciabilità delle richieste cloud (hash, mai il testo).
    //    Attivo di default; dalle impostazioni (Milestone 8) può essere spento,
    //    e in quel caso nessuna riga viene scritta, nemmeno per il cloud.
    let trasporto = ai::client::TrasportoReqwest::new();
    let registro: Option<Box<dyn ai::audit::Registro>> = if pref.registro_attivo {
        let store = ai::audit::RegistroStore::apri(&cache_path()).map_err(|e| e.to_string())?;
        Some(Box::new(store))
    } else {
        None
    };
    let cliente = ai::client::Client::con_registro(trasporto, chiave, registro);

    let richiesta = ai::client::Richiesta {
        provider: provider.clone(),
        endpoint: endpoint.to_string(),
        modello: modello.to_string(),
        azione: az.nome().to_string(),
        prompt_version: ai::PROMPT_VERSION.to_string(),
        temperatura: az.temperatura(),
        consenso_cloud,
        // Un solo messaggio utente: il template contiene già le istruzioni.
        messaggi: vec![ai::client::MessaggioChat::utente(prompt)],
    };
    let testo = cliente
        .completa(&richiesta)
        .await
        .map_err(|e| e.to_string())?;

    Ok(AiRisposta {
        testo,
        modello: modello.to_string(),
        messaggi_usati: contesto.messaggi_inclusi,
        esclusi: contesto.esclusi,
        provider,
    })
}

/// Controllo **prima dell'invio** (task 7.2, Milestone 7): restituisce gli
/// avvisi dei controlli strutturali (senza modello) e, **solo** se `con_tono` è
/// vero, quelli del tono via modello locale. Non chiama il modello con
/// `con_tono = false`. **Non blocca mai l'invio**: il risultato è un elenco di
/// avvisi senza alcun campo che impedisca di inviare, e un modello spento fa
/// semplicemente tacere il controllo del tono (nessun errore).
#[tauri::command]
async fn controllo_preinvio(
    a: String,
    cc: String,
    oggetto: String,
    corpo: String,
    numero_allegati: usize,
    con_tono: bool,
) -> Vec<presend::Avviso> {
    let ingresso = presend::Ingresso {
        a,
        cc,
        oggetto,
        corpo,
        numero_allegati,
    };
    // Deterministici sempre; tono solo su richiesta e solo col modello locale.
    if con_tono {
        let trasporto = ai::client::TrasportoReqwest::new();
        let cliente = ai::client::Client::new(trasporto);
        presend::esegui(&ingresso, true, &cliente).await
    } else {
        presend::controlla(&ingresso)
    }
}

// ---------------------------------------------------------------------------
// Impostazioni (Milestone 8): hub + pannello Assistente IA, firma del mittente,
// registro delle richieste cloud. La logica sta in funzioni pure che prendono
// cartella e percorso del database, così i test la esercitano su una cartella
// temporanea; i comandi IPC sono sottili wrapper su `app_config_dir()`.
// ---------------------------------------------------------------------------

/// Struttura completa delle impostazioni, come la legge e la scrive l'interfaccia:
/// tema + preferenze (firma, assistente, lingue). Nessuna password.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Impostazioni {
    /// Tema: "system" | "light" | "dark".
    pub theme: String,
    pub preferenze: config::Preferenze,
}

/// Legge le impostazioni da una cartella. Manca il file → default.
pub fn impostazioni_leggi_da(dir: &Path) -> Result<Impostazioni, String> {
    let cfg = config::load_from(dir).map_err(|e| e.to_string())?;
    Ok(Impostazioni {
        theme: cfg.theme,
        preferenze: cfg.preferenze,
    })
}

/// Salva le impostazioni: tema e preferenze, in un solo file atomico.
pub fn impostazioni_salva_in(dir: &Path, imp: &Impostazioni) -> Result<(), String> {
    config::set_theme(dir, &imp.theme).map_err(|e| e.to_string())?;
    config::save_preferenze(dir, &imp.preferenze).map_err(|e| e.to_string())?;
    Ok(())
}

/// Una riga del registro delle richieste inviate al cloud, pronta per l'elenco.
/// Non contiene MAI il testo: solo la sua impronta (SHA-256 abbreviato).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RigaRegistro {
    /// Secondi dall'epoca Unix.
    pub data: i64,
    pub provider: String,
    pub modello: String,
    pub azione: String,
    pub prompt_version: String,
    /// Impronta SHA-256 del testo inviato, abbreviata per la lettura.
    pub hash: String,
}

/// Limite predefinito di righe restituite dal registro.
pub const LIMITE_REGISTRO_DEFAULT: usize = 200;

/// Abbrevia l'impronta SHA-256 a 12 caratteri, per la lettura a schermo.
/// Il valore completo resta la garanzia tecnica; qui serve a riconoscere la riga.
fn abbrevia_hash(hash: &str) -> String {
    if hash.len() > 12 {
        format!("{}…", &hash[..12])
    } else {
        hash.to_string()
    }
}

/// Legge le ultime `limite` righe del registro dalla cache SQLite indicata.
/// Un registro vuoto (o un database appena creato) restituisce un elenco vuoto,
/// **non** un errore: nessuna richiesta cloud registrata è uno stato normale.
pub fn registro_ia_da(path_db: &Path, limite: usize) -> Result<Vec<RigaRegistro>, String> {
    let cache = store::Store::open(path_db).map_err(|e| e.to_string())?;
    let righe = cache.audit_last(limite).map_err(|e| e.to_string())?;
    Ok(righe
        .into_iter()
        .map(|r| RigaRegistro {
            data: r.timestamp,
            provider: r.provider,
            modello: r.modello,
            azione: r.azione,
            prompt_version: r.prompt_version,
            hash: abbrevia_hash(&r.hash_testo),
        })
        .collect())
}

/// Divide un comando configurato in programma e argomenti. Non interpreta una
/// shell: separa su spazi bianchi, come basta a `open -a Splash-M1`.
pub fn dividi_comando(comando: &str) -> Vec<String> {
    comando.split_whitespace().map(|s| s.to_string()).collect()
}

/// Tenta di avviare il motore locale col comando configurato, con un timeout.
///
/// L'esito è sempre una frase in italiano: se il comando fallisce, dice
/// esplicitamente di avviare il motore a mano. Nessun percorso di avvio è
/// inventato: l'unico comando è quello in `config.json`.
async fn avvia_motore_locale(comando: &str) -> Result<String, String> {
    let parti = dividi_comando(comando);
    let (programma, argomenti) = match parti.split_first() {
        Some((p, a)) => (p.clone(), a.to_vec()),
        None => {
            return Err(
                "Nessun comando di avvio configurato. Avvia il motore locale a mano: apri \
                 Splash-M1 dal Launchpad (o esegui \"open -a Splash-M1\" nel Terminale)."
                    .to_string(),
            );
        }
    };

    let esito = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        tokio::task::spawn_blocking(move || {
            std::process::Command::new(&programma)
                .args(&argomenti)
                .status()
        }),
    )
    .await;

    match esito {
        Ok(Ok(Ok(stato))) if stato.success() => Ok(
            "Motore locale avviato (Splash-M1). Attendi qualche secondo perché il modello \
             sia pronto sull'endpoint configurato, poi riprova l'azione."
                .to_string(),
        ),
        Ok(Ok(Ok(stato))) => Err(format!(
            "Il comando di avvio \"{comando}\" è terminato con esito {stato}. Avvia il motore \
             locale a mano: apri Splash-M1 dal Launchpad (o esegui \"open -a Splash-M1\" nel \
             Terminale)."
        )),
        Ok(Ok(Err(e))) => Err(format!(
            "Non è stato possibile avviare il motore locale: {e}. Avvialo a mano: apri \
             Splash-M1 dal Launchpad (o esegui \"open -a Splash-M1\" nel Terminale)."
        )),
        Ok(Err(e)) => Err(format!(
            "Avvio del modello locale non riuscito: {e}. Avvialo a mano: apri Splash-M1 dal \
             Launchpad (o esegui \"open -a Splash-M1\" nel Terminale)."
        )),
        Err(_) => Err(
            "Avvio del modello locale troppo lento (oltre 15 secondi): avvialo a mano. Apri \
             Splash-M1 dal Launchpad (o esegui \"open -a Splash-M1\" nel Terminale)."
                .to_string(),
        ),
    }
}

/// Legge la struttura completa delle impostazioni (tema + preferenze).
#[tauri::command]
fn impostazioni_leggi() -> Result<Impostazioni, String> {
    impostazioni_leggi_da(&app_config_dir())
}

/// Valida e salva tema e preferenze. Un valore non ammesso è un errore leggibile.
#[tauri::command]
fn impostazioni_salva(impostazioni: Impostazioni) -> Result<(), String> {
    impostazioni_salva_in(&app_config_dir(), &impostazioni)
}

/// Ultime richieste inviate al cloud (data, provider, modello, azione, versione
/// del prompt, impronta). **Mai il testo.** Un registro vuoto → elenco vuoto.
#[tauri::command]
fn registro_ia(limite: usize) -> Result<Vec<RigaRegistro>, String> {
    let limite = if limite == 0 {
        LIMITE_REGISTRO_DEFAULT
    } else {
        limite.min(1000)
    };
    registro_ia_da(&cache_path(), limite)
}

/// Tenta di avviare il motore locale con il comando configurato e l'esito in
/// italiano. Non lancia mai un processo se non richiesto esplicitamente.
#[tauri::command]
async fn assistente_avvia() -> Result<String, String> {
    let pref = config::load_preferenze(&app_config_dir());
    avvia_motore_locale(&pref.comando_avvio_locale).await
}

// ---------------------------------------------------------------------------
// Operazioni sui messaggi (blocco A): letto, contrassegnato, completato,
// categorie, sposta, elimina, archivia, indesiderato, elenco cartelle.
//
// Ogni comando segue la stessa regola: l'operazione di rete (asincrona) va
// prima, poi si apre la cache e si aggiorna. La connessione SQLite non è `Sync`
// e non resta mai aperta attraverso un `await`; le due fasi sono separate anche
// quando il server rifiuta: in quel caso l'errore è leggibile e la cache resta
// invariata. Le funzioni pure stanno in `mail::ops`.
// ---------------------------------------------------------------------------

/// Costruisce la sorgente IMAP del primo account configurato (password dal
/// Keychain). Errore leggibile se non c'è nessun account.
fn sorgente_imap() -> Result<mail::imap::ImapSource, String> {
    let account = primo_account()?;
    mail::imap::ImapSource::from_account(&account, &secrets::Store::real())
        .map_err(|e| e.to_string())
}

/// Sorgente IMAP dell'account indicato **o del predefinito** se `account_id` è
/// assente/vuoto, con l'account risolto (blocco K).
///
/// L'account risolto serve sia alla parte di rete (la casella giusta) sia a
/// quella di cache, che chiava le righe su `(account, folder, uid)`: con più
/// caselle che condividono cartella e UID, agire sull'una non tocca l'altra. Un
/// `account_id` presente ma **non configurato** è un errore in italiano, non un
/// silenzio (si ricade sul predefinito solo quando l'id è assente).
fn sorgente_imap_per(
    account_id: Option<&str>,
) -> Result<(Account, mail::imap::ImapSource), String> {
    let account = account_per_id(account_id)?;
    let sorgente = mail::imap::ImapSource::from_account(&account, &secrets::Store::real())
        .map_err(|e| e.to_string())?;
    Ok((account, sorgente))
}

/// Marca il messaggio come letto (`\Seen`) o da leggere, sul server e in cache.
///
/// `accountId` opzionale: se assente si usa l'account predefinito; se presente ma
/// non configurato il comando fallisce con un errore leggibile.
#[tauri::command]
async fn mail_set_seen(
    folder: String,
    uid: String,
    letto: bool,
    account_id: Option<String>,
) -> Result<(), String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    mail::ops::server_imposta_flag(&sorgente, &folder, &uid, mail::FlagOp::Seen, letto).await?;
    let cache = apri_cache()?;
    mail::ops::cache_imposta_flag(&cache, &account.id, &folder, &uid, mail::FlagOp::Seen, letto)
}

/// Contrassegna il messaggio (`\Flagged`) o toglie il contrassegno.
/// `accountId` opzionale: assente → account predefinito (blocco K).
#[tauri::command]
async fn mail_set_flag(
    folder: String,
    uid: String,
    contrassegnato: bool,
    account_id: Option<String>,
) -> Result<(), String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    mail::ops::server_imposta_flag(
        &sorgente,
        &folder,
        &uid,
        mail::FlagOp::Flagged,
        contrassegnato,
    )
    .await?;
    let cache = apri_cache()?;
    mail::ops::cache_imposta_flag(
        &cache,
        &account.id,
        &folder,
        &uid,
        mail::FlagOp::Flagged,
        contrassegnato,
    )
}

/// Segna il messaggio come completato (o da completare). È uno stato **locale**:
/// non tocca il server e vale anche offline. `accountId` opzionale: assente →
/// account predefinito (blocco K).
#[tauri::command]
fn mail_set_completato(
    folder: String,
    uid: String,
    completato: bool,
    account_id: Option<String>,
) -> Result<(), String> {
    let account = account_per_id(account_id.as_deref())?;
    let cache = apri_cache()?;
    mail::ops::set_completato(&cache, &account.id, &folder, &uid, completato)
}

/// Salva le categorie del messaggio in cache; se il server supporta le keyword
/// IMAP le prova anche lì, ma non è un errore quando non le supporta. Un elenco
/// vuoto rimuove le categorie. `accountId` opzionale: assente → predefinito.
#[tauri::command]
async fn mail_set_categorie(
    folder: String,
    uid: String,
    categorie: Vec<String>,
    account_id: Option<String>,
) -> Result<(), String> {
    // L'account può mancare (o la rete essere giù): le categorie sono locali,
    // quindi le keyword si tentano solo se c'è una sorgente, senza mai fallire.
    // Un `accountId` presente ma inesistente resta però un errore leggibile
    // (viene sollevato risolvendo l'account per la cache, più sotto).
    if let Ok((_account, sorgente)) = sorgente_imap_per(account_id.as_deref()) {
        mail::ops::server_categorie(&sorgente, &folder, &uid, &categorie).await;
    }
    let account = account_per_id(account_id.as_deref())?;
    let cache = apri_cache()?;
    mail::ops::cache_set_categorie(&cache, &account.id, &folder, &uid, &categorie)
}

/// Sposta il messaggio in un'altra cartella: prima sul server, poi in cache.
/// `accountId` opzionale: assente → account predefinito (blocco K).
#[tauri::command]
async fn mail_sposta(
    folder: String,
    uid: String,
    destinazione: String,
    account_id: Option<String>,
) -> Result<(), String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    mail::ops::server_sposta(&sorgente, &folder, &uid, &destinazione).await?;
    let cache = apri_cache()?;
    cache
        .sposta(&account.id, &folder, &uid, &destinazione)
        .map_err(|e| e.to_string())
}

/// Elimina il messaggio: lo sposta nella cartella della posta eliminata del
/// server; se non esiste, lo rimuove definitivamente (`\Deleted` + `EXPUNGE`).
/// `accountId` opzionale: assente → account predefinito (blocco K).
#[tauri::command]
async fn mail_elimina(
    folder: String,
    uid: String,
    account_id: Option<String>,
) -> Result<String, String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    match mail::ops::server_elimina(&sorgente, &folder, &uid).await? {
        mail::ops::EsitoEliminazione::Spostato(destinazione) => {
            let cache = apri_cache()?;
            cache
                .sposta(&account.id, &folder, &uid, &destinazione)
                .map_err(|e| e.to_string())?;
            Ok(format!("Messaggio spostato in «{destinazione}»."))
        }
        mail::ops::EsitoEliminazione::Rimosso { ripiego_ampio } => {
            let cache = apri_cache()?;
            cache
                .rimuovi(&account.id, &folder, &uid)
                .map_err(|e| e.to_string())?;
            // Il ripiego va detto: il server non supporta UID EXPUNGE, quindi la
            // pulizia ha riguardato anche altri messaggi già marcati eliminati.
            Ok(if ripiego_ampio {
                "Messaggio eliminato. Nota: il server non supporta UID EXPUNGE, quindi la \
                 pulizia ha interessato anche altri messaggi già marcati come eliminati."
                    .to_string()
            } else {
                "Messaggio eliminato.".to_string()
            })
        }
    }
}

/// Archivia il messaggio spostandolo nella cartella Archivio del server.
/// `accountId` opzionale: assente → account predefinito (blocco K).
#[tauri::command]
async fn mail_archivia(
    folder: String,
    uid: String,
    account_id: Option<String>,
) -> Result<(), String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    let archivio = mail::ops::server_archivia(&sorgente, &folder, &uid).await?;
    let cache = apri_cache()?;
    cache
        .sposta(&account.id, &folder, &uid, &archivio)
        .map_err(|e| e.to_string())
}

/// Segnala il messaggio come indesiderato: lo sposta nella posta indesiderata e
/// aggiunge il mittente all'elenco dei bloccati (senza duplicati).
/// `accountId` opzionale: assente → account predefinito (blocco K).
#[tauri::command]
async fn mail_indesiderato(
    folder: String,
    uid: String,
    account_id: Option<String>,
) -> Result<(), String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    // Il mittente si legge prima dello spostamento: dopo, la riga è altrove.
    let mittente = {
        let cache = apri_cache()?;
        cache
            .mittente(&account.id, &folder, &uid)
            .map_err(|e| e.to_string())?
    };
    let destinazione = mail::ops::server_indesiderato(&sorgente, &folder, &uid).await?;
    let cache = apri_cache()?;
    mail::ops::applica_indesiderato(
        &cache,
        &account.id,
        &folder,
        &uid,
        &destinazione,
        mittente.as_deref(),
    )
}

/// Elenco dei nomi delle cartelle del server, per il selettore "Sposta".
#[tauri::command]
async fn mail_cartelle() -> Result<Vec<String>, String> {
    let sorgente = sorgente_imap()?;
    mail::ops::cartelle(&sorgente).await
}

// ---------------------------------------------------------------------------
// Blocco I1 — operazioni su messaggi e cartelle: Rinvia, Inoltra come allegato,
// Copia nella cartella, Ignora conversazione, gestione cartelle, Preferiti,
// Salva come bozza, contrassegno con scadenza.
// ---------------------------------------------------------------------------

/// Normalizza un elenco di indirizzi consegnato dall'interfaccia (già una lista,
/// ma ogni voce può contenere più indirizzi separati da virgola o punto e
/// virgola), senza duplicati e senza voci vuote.
fn indirizzi_puliti(valori: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for valore in valori {
        for pezzo in send::dividi_indirizzi(valore) {
            if !out.iter().any(|x| x == &pezzo) {
                out.push(pezzo);
            }
        }
    }
    out
}

/// **Rinvia** un messaggio: lo ricostruisce come nuovo (oggetto senza prefissi di
/// risposta/inoltro, testo originale, allegati originali) e lo invia ai
/// destinatari indicati, come un invio nuovo. A invio riuscito ne salva la copia
/// in "Posta inviata" con la solita macchina di invio.
#[tauri::command]
async fn mail_rinvia(
    folder: String,
    uid: String,
    destinatari: Vec<String>,
    account_id: Option<String>,
) -> Result<String, String> {
    let account = account_per_id(account_id.as_deref())?;
    let destinatari = indirizzi_puliti(&destinatari);
    let grezzo = corpo_grezzo(&folder, &uid, account_id.as_deref()).await?;
    let bozza = send::bozza_rinvia(&grezzo);
    send::valida_invio(&destinatari, &bozza.oggetto).map_err(|e| e.to_string())?;

    let mittente = format!("{} <{}>", account.full_name, account.email);
    let messaggio = send::build_message_completo(
        &mittente,
        &destinatari,
        &[],
        &[],
        &bozza.oggetto,
        &bozza.corpo,
        None,
        None,
        &bozza.allegati,
    )
    .map_err(|e| e.to_string())?;
    let grezzo_out = messaggio.formatted();
    let sorgente = mail::imap::ImapSource::from_account(&account, &secrets::Store::real()).ok();
    let esito = send::invia_e_copia(
        sorgente.as_ref().map(|s| s as &dyn MailSource),
        || send::invia_messaggio(&account, &secrets::Store::real(), &messaggio).map(|_| ()),
        &grezzo_out,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(format!(
        "Messaggio rinviato a {} destinatari. {}",
        destinatari.len(),
        esito.testo(&account)
    ))
}

/// **Inoltra come allegato**: invia il messaggio originale come parte
/// `message/rfc822` (file `.eml`) con un breve testo esplicativo sopra.
#[tauri::command]
async fn mail_inoltra_allegato(
    folder: String,
    uid: String,
    destinatari: Vec<String>,
    account_id: Option<String>,
) -> Result<String, String> {
    let account = account_per_id(account_id.as_deref())?;
    let destinatari = indirizzi_puliti(&destinatari);
    let grezzo = corpo_grezzo(&folder, &uid, account_id.as_deref()).await?;
    let testo = send::testo_inoltro_allegato(&grezzo);
    let mittente = format!("{} <{}>", account.full_name, account.email);
    let messaggio = send::build_inoltro_allegato(&mittente, &destinatari, &grezzo, &testo)
        .map_err(|e| e.to_string())?;
    send::valida_invio(&destinatari, &send::prefisso_oggetto_inoltro(&grezzo))
        .map_err(|e| e.to_string())?;
    let grezzo_out = messaggio.formatted();
    let sorgente = mail::imap::ImapSource::from_account(&account, &secrets::Store::real()).ok();
    let esito = send::invia_e_copia(
        sorgente.as_ref().map(|s| s as &dyn MailSource),
        || send::invia_messaggio(&account, &secrets::Store::real(), &messaggio).map(|_| ()),
        &grezzo_out,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(format!(
        "Messaggio originale inoltrato come allegato .eml a {} destinatari. {}",
        destinatari.len(),
        esito.testo(&account)
    ))
}

/// **Copia nella cartella…**: `UID COPY` sul server; la cache riflette la copia
/// nella destinazione e l'originale **resta** (a differenza di `mail_sposta`).
/// `accountId` opzionale: assente → account predefinito (blocco K).
#[tauri::command]
async fn mail_copia(
    folder: String,
    uid: String,
    destinazione: String,
    account_id: Option<String>,
) -> Result<String, String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    mail::ops::server_copia(&sorgente, &folder, &uid, &destinazione).await?;
    let cache = apri_cache()?;
    cache
        .copia(&account.id, &folder, &uid, &destinazione)
        .map_err(|e| e.to_string())?;
    Ok(format!("Messaggio copiato in «{destinazione}»."))
}

/// **Ignora conversazione** / **Non ignorare più**: segna (o toglie) una
/// conversazione fra quelle ignorate **dell'account indicato** (blocco L). È
/// reversibile: al successivo «Invia e ricevi» i messaggi di una conversazione
/// ignorata vengono segnati letti e spostati in Posta eliminata. Ignorare una
/// conversazione in una casella non la ignora nell'altra.
#[tauri::command]
fn conversazione_ignora(
    thread_key: String,
    ignora: bool,
    account_id: Option<String>,
) -> Result<String, String> {
    let account = account_per_id(account_id.as_deref())?;
    let cache = apri_cache()?;
    cache
        .conversazione_ignora(&account.id, &thread_key, ignora)
        .map_err(|e| e.to_string())?;
    Ok(if ignora {
        "Conversazione ignorata: i suoi messaggi saranno segnati letti e spostati in Posta \
         eliminata al prossimo «Invia e ricevi». La scelta è reversibile con «Non ignorare più»."
            .to_string()
    } else {
        "Conversazione riattivata: non sarà più ignorata.".to_string()
    })
}

/// Le chiavi delle conversazioni ignorate **di un account** (l'interfaccia le usa
/// per sapere se la voce del menu è «Ignora conversazione» o «Non ignorare più»).
/// Blocco L: `accountId` opzionale (assente → predefinito; inesistente → errore).
#[tauri::command]
fn conversazioni_ignorate(account_id: Option<String>) -> Result<Vec<String>, String> {
    let account = account_per_id(account_id.as_deref())?;
    let cache = apri_cache()?;
    cache
        .conversazioni_ignorate(&account.id)
        .map_err(|e| e.to_string())
}

/// **Crea cartella**: `CREATE` sul server. Con un `genitore` la cartella nasce
/// dentro di lui, col separatore del server; senza, al primo livello, che sui
/// server «INBOX.» significa sotto INBOX (`ops::nome_completo_nuova`). Se il
/// server rifiuta, l'errore è leggibile e la cache non cambia. Blocco L:
/// `accountId` opzionale (assente → predefinito; inesistente → errore) e il
/// registro è quello **di quell'account**.
#[tauri::command]
async fn cartella_crea(
    nome: String,
    genitore: Option<String>,
    account_id: Option<String>,
) -> Result<String, String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    let genitore = genitore.as_deref().map(str::trim).filter(|g| !g.is_empty());
    let delimitatore = sorgente
        .delimitatore(genitore.unwrap_or("INBOX"))
        .await
        .unwrap_or(None);
    let esistenti: Vec<String> = apri_cache()?
        .cartelle_registrate(&account.id)
        .unwrap_or_default()
        .into_iter()
        .map(|(n, _)| n)
        .collect();
    let completo =
        mail::ops::nome_completo_nuova(&nome, genitore, delimitatore.as_deref(), &esistenti);
    mail::ops::server_crea_cartella(&sorgente, &completo).await?;
    let cache = apri_cache()?;
    cache
        .registra_cartella(&account.id, &completo)
        .map_err(|e| e.to_string())?;
    Ok(format!("Cartella «{completo}» creata."))
}

/// **Rinomina cartella**: `RENAME` sul server, poi cache (messaggi e registro)
/// **dell'account**. Blocco L: `accountId` opzionale.
#[tauri::command]
async fn cartella_rinomina(
    vecchio: String,
    nuovo: String,
    account_id: Option<String>,
) -> Result<String, String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    let completo = mail::ops::server_rinomina_cartella(&sorgente, &vecchio, &nuovo).await?;
    let cache = apri_cache()?;
    cache
        .rinomina_cartella_cache(&account.id, &vecchio, &completo)
        .map_err(|e| e.to_string())?;
    Ok(format!("Cartella «{vecchio}» rinominata in «{completo}»."))
}

/// **Elimina cartella**: `DELETE` sul server, poi cache **dell'account**.
/// L'interfaccia chiede conferma prima. Blocco L: `accountId` opzionale.
#[tauri::command]
async fn cartella_elimina(nome: String, account_id: Option<String>) -> Result<String, String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    mail::ops::server_elimina_cartella(&sorgente, &nome).await?;
    let cache = apri_cache()?;
    cache
        .elimina_cartella_cache(&account.id, &nome)
        .map_err(|e| e.to_string())?;
    Ok(format!("Cartella «{nome}» eliminata."))
}

/// **Svuota cartella** (o **Svuota Posta eliminata**): marca tutti i messaggi
/// `\Deleted` ed esegue `EXPUNGE` sul server, poi svuota la cache. L'interfaccia
/// chiede conferma prima. Blocco L: agisce **solo** sulla cartella dell'account
/// indicato, così svuotare la Posta eliminata di una casella non tocca l'omonima
/// dell'altra.
#[tauri::command]
async fn cartella_svuota(nome: String, account_id: Option<String>) -> Result<String, String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    mail::ops::server_svuota_cartella(&sorgente, &nome).await?;
    let cache = apri_cache()?;
    let n = cache
        .svuota_cartella_cache(&account.id, &nome)
        .map_err(|e| e.to_string())?;
    Ok(format!(
        "Cartella «{nome}» svuotata ({n} messaggi rimossi)."
    ))
}

/// **Segna tutti come già letti**: `\Seen` su tutti i messaggi della cartella
/// **dell'account indicato** (blocco L). Blocco L: `accountId` opzionale.
#[tauri::command]
async fn cartella_segna_tutta_letta(
    nome: String,
    account_id: Option<String>,
) -> Result<String, String> {
    let (account, sorgente) = sorgente_imap_per(account_id.as_deref())?;
    mail::ops::server_segna_tutta_letta(&sorgente, &nome).await?;
    let cache = apri_cache()?;
    let n = cache
        .segna_cartella_letta_cache(&account.id, &nome)
        .map_err(|e| e.to_string())?;
    Ok(format!(
        "Tutti i messaggi di «{nome}» sono segnati come già letti ({n})."
    ))
}

/// **Aggiungi a Preferiti** / **Rimuovi da Preferiti**: la barra laterale mostra
/// le preferite in alto. Blocco L: la scelta è **per account** (due caselle con
/// una cartella omonima non condividono la preferita); `accountId` opzionale.
#[tauri::command]
fn cartella_preferita(
    nome: String,
    preferita: bool,
    account_id: Option<String>,
) -> Result<String, String> {
    let account = account_per_id(account_id.as_deref())?;
    let cache = apri_cache()?;
    cache
        .set_cartella_preferita(&account.id, &nome, preferita)
        .map_err(|e| e.to_string())?;
    Ok(if preferita {
        format!("«{nome}» aggiunta ai Preferiti.")
    } else {
        format!("«{nome}» rimossa dai Preferiti.")
    })
}

/// Una cartella per la barra laterale: nome, stato di preferita e il numero di
/// messaggi **non letti** in cache per quell'account (blocco J).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CartellaIpc {
    pub nome: String,
    pub preferita: bool,
    /// Non letti dell'account in questa cartella (0 se la cartella non ha
    /// ancora messaggi in cache).
    pub non_letti: u32,
}

/// Le cartelle di **un account** della barra laterale raggruppata (blocco J).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CartelleAccountIpc {
    pub account: String,
    pub email: String,
    pub descrizione: String,
    /// Vero per l'account predefinito (quello aperto all'avvio).
    pub predefinito: bool,
    pub cartelle: Vec<CartellaIpc>,
}

/// L'elenco delle cartelle per la barra laterale, **raggruppate per account**
/// (blocco J):
///
/// - con `accountId` → solo quel gruppo (è la casella selezionata);
/// - senza → un gruppo per **ogni** casella configurata, con le sue cartelle e i
///   conteggi presi dalla cache.
///
/// Le cartelle con messaggi in cache portano il conteggio dei **non letti**
/// reale. Blocco L: il registro delle cartelle (tabella `cartelle`, popolata dal
/// `LIST` del server) è **per account**, quindi ogni casella mostra la propria
/// struttura (Posta in arrivo, Bozze, …) senza mescolarsi con le omonime delle
/// altre. Un `accountId` **presente ma non configurato** è un errore in italiano,
/// non un silenzio; senza account configurati l'elenco è vuoto.
#[tauri::command]
async fn cartelle_elenco(
    account_id: Option<String>,
    solo_cache: Option<bool>,
) -> Result<Vec<CartelleAccountIpc>, String> {
    let dir = app_config_dir();
    let accounts = config::load_accounts(&dir);
    let scelta = account_id.as_deref().filter(|s| !s.is_empty());
    let predefinito = config::account_predefinito(&dir);
    let predefinito_id = predefinito.as_ref().map(|a| a.id.clone()).unwrap_or_default();

    // Nessun account configurato e nessuno richiesto: nessuna cartella (non è un
    // errore). Un `accountId` esplicito inesistente è invece un errore leggibile.
    if accounts.is_empty() && scelta.is_none() {
        return Ok(Vec::new());
    }

    // Il server si interroga una volta sola, per l'account richiesto (o per il
    // predefinito): le cartelle viste si registrano nel registro **di quell'account**.
    let target = risolvi_account(&accounts, scelta, predefinito.as_ref().map(|a| a.id.as_str()))
        .cloned()?;
    // Con `soloCache` (all'avvio) non si tocca la rete: bastano le cartelle già
    // registrate, che la sincronizzazione tiene aggiornate.
    let da_server = !solo_cache.unwrap_or(false);
    let sorgente = if da_server {
        mail::imap::ImapSource::from_account(&target, &secrets::Store::real()).ok()
    } else {
        None
    };
    if let Some(sorgente) = sorgente {
        if let Ok(nomi) = mail::ops::cartelle(&sorgente).await {
            let cache = apri_cache()?;
            for nome in &nomi {
                let _ = cache.registra_cartella(&target.id, nome);
            }
        }
    }

    let cache = apri_cache()?;
    let scelti: Vec<Account> = accounts
        .into_iter()
        .filter(|a| scelta.is_none() || Some(a.id.as_str()) == scelta)
        .collect();

    Ok(gruppi_cartelle(
        &scelti,
        |id| cache.cartelle_registrate(id).unwrap_or_default(),
        &predefinito_id,
        |id| cache.cartelle_per_account(id).unwrap_or_default(),
    ))
}

/// Raggruppa per account le cartelle della barra laterale. È la parte **pura**
/// di `cartelle_elenco` (i test le passano contatori e registri finti):
///
/// - le cartelle con messaggi in cache portano il numero di **non letti** reale;
/// - il registro delle cartelle del server (`registrate_per_account`) è **per
///   account**: ogni casella mostra la propria struttura, senza fondere le
///   cartelle omonime di caselle diverse (blocco L);
/// - i **Preferiti** restano in alto dentro il loro account.
pub fn gruppi_cartelle(
    accounts: &[Account],
    registrate_per_account: impl Fn(&str) -> Vec<(String, bool)>,
    predefinito_id: &str,
    conta_messaggi: impl Fn(&str) -> Vec<(String, u32)>,
) -> Vec<CartelleAccountIpc> {
    let mut out: Vec<CartelleAccountIpc> = Vec::new();
    for acc in accounts {
        let mut cartelle: Vec<CartellaIpc> = Vec::new();
        for (nome, non_letti) in conta_messaggi(&acc.id) {
            cartelle.push(CartellaIpc {
                nome,
                preferita: false,
                non_letti,
            });
        }
        // Il registro **dell'account**: le cartelle note dal server, con le
        // preferite; quelle non già in cache vengono aggiunte (0 non letti).
        for (nome, preferita) in registrate_per_account(&acc.id) {
            match cartelle.iter_mut().find(|c| c.nome == nome) {
                Some(c) => c.preferita = preferita,
                None => cartelle.push(CartellaIpc {
                    nome,
                    preferita,
                    non_letti: 0,
                }),
            }
        }
        // Preferite in alto, poi in ordine alfabetico (come la barra laterale).
        cartelle.sort_by(|a, b| {
            b.preferita
                .cmp(&a.preferita)
                .then_with(|| a.nome.to_lowercase().cmp(&b.nome.to_lowercase()))
        });
        out.push(CartelleAccountIpc {
            account: acc.id.clone(),
            email: acc.email.clone(),
            descrizione: if acc.description.trim().is_empty() {
                acc.email.clone()
            } else {
                acc.description.clone()
            },
            predefinito: acc.id == predefinito_id,
            cartelle,
        });
    }
    out
}

/// **Salva come bozza**: `APPEND` in «Bozze» con il flag `\Draft`. Non invia
/// nulla e non richiede destinatari (una bozza può essere scritta prima di
/// scegliere a chi mandarla).
#[tauri::command]
async fn mail_salva_bozza(
    a: String,
    cc: String,
    ccn: String,
    oggetto: String,
    corpo_testo: String,
    allegati: Vec<send::AllegatoInviato>,
) -> Result<String, String> {
    let account = primo_account()?;
    let mittente = format!("{} <{}>", account.full_name, account.email);
    let destinatari = send::dividi_indirizzi(&a);
    let copia = send::dividi_indirizzi(&cc);
    let nascosta = send::dividi_indirizzi(&ccn);
    let messaggio = send::build_bozza(
        &mittente,
        &destinatari,
        &copia,
        &nascosta,
        &oggetto,
        &corpo_testo,
        None,
        None,
        &allegati,
    )
    .map_err(|e| e.to_string())?;
    let grezzo = messaggio.formatted();

    let sorgente = sorgente_imap()?;
    let nomi = mail::ops::cartelle(&sorgente).await?;
    let bozze = mail::ops::trova_cartella(&nomi, mail::ops::NOMI_BOZZE).ok_or_else(|| {
        "cartella «Bozze» non trovata sul server: crea una cartella «Bozze» per salvare le \
         bozze"
            .to_string()
    })?;
    sorgente
        .salva_bozza(&bozze, &grezzo)
        .await
        .map_err(|e| e.to_string())?;
    Ok(format!("Bozza salvata in «{bozze}» con il flag \\Draft."))
}

/// **Contrassegno con scadenza**: salva (o rimuove) la data del contrassegno. La
/// data è metadato locale (Colonna `scadenza`); il flag `\Flagged` lo porta anche
/// il server, dove disponibile, con un tentativo non fatale. `accountId`
/// opzionale: assente → account predefinito (blocco K).
#[tauri::command]
async fn mail_set_scadenza(
    folder: String,
    uid: String,
    scadenza: Option<String>,
    account_id: Option<String>,
) -> Result<String, String> {
    let account = account_per_id(account_id.as_deref())?;
    if let Ok(sorgente) = mail::imap::ImapSource::from_account(&account, &secrets::Store::real()) {
        let valore = scadenza.is_some();
        let _ =
            mail::ops::server_imposta_flag(&sorgente, &folder, &uid, mail::FlagOp::Flagged, valore)
                .await;
    }
    let cache = apri_cache()?;
    mail::ops::set_scadenza(&cache, &account.id, &folder, &uid, scadenza.as_deref())?;
    Ok(match scadenza.filter(|s| !s.trim().is_empty()) {
        Some(s) => format!("Contrassegno impostato per {s}."),
        None => "Contrassegno rimosso.".to_string(),
    })
}

/// Le date proposte dal sottomenu «Contrassegna», calcolate dalla **funzione
/// pura** `mail::scadenza`. `offset_minuti` è lo scostamento locale da UTC in
/// minuti (a est positivo), che l'interfaccia ricava dall'orologio.
#[tauri::command]
fn mail_scadenza_proponi(tipo: String, offset_minuti: i64) -> Result<String, String> {
    let tipo = mail::scadenza::TipoScadenza::da_id(&tipo)
        .ok_or_else(|| format!("voce di contrassegno sconosciuta: {tipo}"))?;
    let ora = mail::scadenza::OraLocale::da_unix(adesso_unix(), offset_minuti * 60);
    Ok(mail::scadenza::proponi(tipo, ora))
}

/// Le voci del sottomenu «Contrassegna», con identificatore ed etichetta esatta
/// del riferimento. L'interfaccia le disegna così come arrivano.
#[tauri::command]
fn scadenze_voci() -> Vec<(String, String)> {
    mail::scadenza::voci_sottomenu()
        .iter()
        .map(|(id, etichetta)| (id.to_string(), etichetta.to_string()))
        .collect()
}

/// Elenco dei mittenti bloccati (dal più recente segnalato come indesiderato).
/// Un errore di cache restituisce un elenco vuoto: non c'è nulla da bloccare.
#[tauri::command]
fn mittenti_bloccati() -> Vec<String> {
    match apri_cache() {
        Ok(cache) => cache.mittenti_bloccati().unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Secondi dall'epoca Unix, per i timestamp di stato (mai per i dati dell'utente).
fn adesso_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Sblocca un mittente: lo toglie dall'elenco dei bloccati. Restituisce quanti
/// indirizzi ha rimosso; sbloccare un indirizzo **non** bloccato non è un errore.
#[tauri::command]
fn mail_sblocca_mittente(indirizzo: String) -> Result<usize, String> {
    let cache = apri_cache()?;
    cache
        .rimuovi_mittente_bloccato(&indirizzo)
        .map_err(|e| e.to_string())
}

/// Stato del pannello Posta indesiderata: mittenti bloccati, livello di
/// protezione in vigore e ultima volta che la protezione ha agito (0 = mai).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatoPostaIndesiderata {
    pub mittenti: Vec<String>,
    pub protezione: String,
    pub ultima_azione: i64,
}

/// Legge lo stato della posta indesiderata (cache + preferenze).
pub fn stato_posta_indesiderata_da(
    dir: &Path,
    path_db: &Path,
) -> Result<StatoPostaIndesiderata, String> {
    let cache = store::Store::open(path_db).map_err(|e| e.to_string())?;
    let mittenti = cache.mittenti_bloccati().map_err(|e| e.to_string())?;
    let pref = config::load_preferenze(dir);
    Ok(StatoPostaIndesiderata {
        mittenti,
        protezione: pref.protezione_posta_indesiderata,
        ultima_azione: pref.protezione_ultima_azione,
    })
}

/// Stato della posta indesiderata per l'interfaccia.
#[tauri::command]
fn posta_indesiderata_stato() -> Result<StatoPostaIndesiderata, String> {
    stato_posta_indesiderata_da(&app_config_dir(), &cache_path())
}

/// Svuota il registro delle richieste IA. Restituisce quante voci ha rimosso.
#[tauri::command]
fn registro_ia_svuota() -> Result<usize, String> {
    let cache = apri_cache()?;
    cache.svuota_registro().map_err(|e| e.to_string())
}

/// Esporta il registro delle richieste IA in un file di testo (una riga per
/// voce, tabulazioni fra i campi). **Solo impronte e metadati**, mai il testo.
/// Restituisce quante voci ha scritto.
pub fn registro_ia_esporta_in(path_db: &Path, destinazione: &Path) -> Result<usize, String> {
    let cache = store::Store::open(path_db).map_err(|e| e.to_string())?;
    let righe = cache.audit_all().map_err(|e| e.to_string())?;
    let mut testo = String::from(
        "# Registro delle richieste IA inviate al cloud\n         # Contiene SOLO impronte SHA-256 e metadati: mai il testo dei messaggi.\n         # Data e ora\tProvider\tModello\tAzione\tVersione prompt\tImpronta SHA-256\n",
    );
    for r in &righe {
        testo.push_str(&format!(
            "{}\t{}\t{}\t{}\t{}\t{}\n",
            ricerca::iso_da_epoch(r.timestamp),
            r.provider,
            r.modello,
            r.azione,
            r.prompt_version,
            r.hash_testo,
        ));
    }
    std::fs::write(destinazione, testo).map_err(|e| e.to_string())?;
    Ok(righe.len())
}

/// Esporta il registro in un file nella cartella Download e ne restituisce il
/// percorso scritto.
#[tauri::command]
fn registro_ia_esporta() -> Result<String, String> {
    let cartella =
        dirs::download_dir().ok_or_else(|| "cartella Download non trovata".to_string())?;
    std::fs::create_dir_all(&cartella).map_err(|e| e.to_string())?;
    let percorso = percorso_libero(&cartella, &format!("registro-ia-{}.txt", adesso_unix()));
    registro_ia_esporta_in(&cache_path(), &percorso)?;
    Ok(percorso.to_string_lossy().into_owned())
}

/// Svuota la cache dei **messaggi**: rimuove i messaggi salvati ma **non** tocca
/// configurazione, firme, elenco dei mittenti bloccati né registro IA.
pub fn svuota_cache_in(path_db: &Path) -> Result<usize, String> {
    let cache = store::Store::open(path_db).map_err(|e| e.to_string())?;
    cache.svuota_messaggi().map_err(|e| e.to_string())
}

/// Stato della cache locale per il pannello «Archiviazione» (blocco N):
/// dimensione del file su disco (byte) e numero di messaggi in cache.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatoArchiviazione {
    pub byte: u64,
    pub messaggi: i64,
    pub percorso: String,
}

/// Calcola lo stato della cache locale dal percorso del database (parte
/// collaudabile dai test su una cartella temporanea).
pub fn archiviazione_stato_da(path_db: &Path) -> Result<StatoArchiviazione, String> {
    // Si apre prima il database (crea il file se manca) e poi se ne misura la
    // dimensione: misurarla prima darebbe 0 su una cache non ancora creata.
    let cache = store::Store::open(path_db).map_err(|e| e.to_string())?;
    let messaggi = cache.conta_tutti().map_err(|e| e.to_string())?;
    let byte = std::fs::metadata(path_db).map(|m| m.len()).unwrap_or(0);
    Ok(StatoArchiviazione {
        byte,
        messaggi,
        percorso: path_db.to_string_lossy().into_owned(),
    })
}

/// Stato della cache locale (dimensione e numero di messaggi).
#[tauri::command]
fn archiviazione_stato() -> Result<StatoArchiviazione, String> {
    archiviazione_stato_da(&cache_path())
}

/// Svuota la cache dei messaggi e restituisce l'esito leggibile.
#[tauri::command]
fn svuota_cache() -> Result<String, String> {
    let n = svuota_cache_in(&cache_path())?;
    Ok(format!(
        "Cache dei messaggi svuotata: {n} messaggi rimossi. Configurazione, firme, \
         mittenti bloccati e registro IA non sono stati toccati."
    ))
}

// ---------------------------------------------------------------------------
// Rubrica dei contatti e completamento dei destinatari (blocco F).
//
// La logica pura (vCard e ordinamento dei suggerimenti) sta in `contatti`; la
// persistenza in `store`; qui i comandi IPC sono sottili wrapper sulla cache.
// I comandi prendono il percorso del database come parametro nelle varianti
// `*_in`/`*_da`, così i test li esercitano su una cartella temporanea.
// ---------------------------------------------------------------------------

/// Limite predefinito di suggerimenti restituiti alla composizione.
pub const LIMITE_SUGGERIMENTI_DEFAULT: usize = 10;

/// Elenco dei contatti per l'interfaccia (con o senza filtro di ricerca).
pub fn contatti_elenco_da(
    path_db: &Path,
    filtro: Option<&str>,
) -> Result<Vec<contatti::Contatto>, String> {
    let cache = store::Store::open(path_db).map_err(|e| e.to_string())?;
    let righe = cache.contatti(filtro).map_err(|e| e.to_string())?;
    Ok(righe.into_iter().map(contatti::Contatto::from).collect())
}

/// Elenco dei contatti della rubrica.
#[tauri::command]
fn contatti_elenco(filtro: Option<String>) -> Result<Vec<contatti::Contatto>, String> {
    contatti_elenco_da(&cache_path(), filtro.as_deref())
}

/// Salva un contatto, senza duplicarlo se l'email è già in rubrica.
pub fn contatto_salva_in(
    path_db: &Path,
    c: &contatti::Contatto,
) -> Result<contatti::EsitoSalvataggio, String> {
    let cache = store::Store::open(path_db).map_err(|e| e.to_string())?;
    let input: store::ContattoInput = c.into();
    let (id, aggiornato) = cache.contatto_salva(&input).map_err(|e| e.to_string())?;
    Ok(contatti::EsitoSalvataggio { id, aggiornato })
}

/// Salva (o aggiorna) un contatto della rubrica.
#[tauri::command]
fn contatto_salva(contatto: contatti::Contatto) -> Result<contatti::EsitoSalvataggio, String> {
    contatto_salva_in(&cache_path(), &contatto)
}

/// Elimina un contatto. Restituisce quante righe ha rimosso.
#[tauri::command]
fn contatto_elimina(id: i64) -> Result<usize, String> {
    let cache = apri_cache()?;
    cache.contatto_elimina(id).map_err(|e| e.to_string())
}

/// Importa un testo vCard (una o più schede) nella rubrica.
pub fn contatti_importa_vcard_in(
    path_db: &Path,
    testo: &str,
) -> Result<contatti::EsitoImport, String> {
    let cache = store::Store::open(path_db).map_err(|e| e.to_string())?;
    let parse = contatti::importa_vcard(testo);
    let mut importati = 0usize;
    let mut aggiornati = 0usize;
    let mut conflitti: Vec<String> = Vec::new();
    for scheda in &parse.schede {
        let input: store::ContattoInput = (&scheda.contatto).into();
        // Un indirizzo già di un altro contatto salta solo quella scheda.
        let (_id, agg) = match cache.contatto_salva(&input) {
            Ok(esito) => esito,
            Err(store::StoreError::Contatto(motivo)) => {
                conflitti.push(format!("{}: {motivo}", scheda.contatto.email.trim()));
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };
        if agg {
            aggiornati += 1;
        } else {
            importati += 1;
        }
    }
    Ok(contatti::EsitoImport {
        schede: parse.schede.len(),
        importati,
        aggiornati,
        senza_email: parse.senza_email,
        ignorati: parse.ignorati,
        conflitti,
    })
}

/// Importa un file vCard (`.vcf`) nella rubrica. Le proprietà non lette sono
/// dichiarate in `ignorati`; le schede senza email sono contate in `senzaEmail`.
#[tauri::command]
fn contatti_importa_vcard(testo: String) -> Result<contatti::EsitoImport, String> {
    contatti_importa_vcard_in(&cache_path(), &testo)
}

/// Esporta tutta la rubrica in un file vCard. Restituisce quanti contatti ha
/// scritto.
pub fn contatti_esporta_vcard_in(path_db: &Path, destinazione: &Path) -> Result<usize, String> {
    let cache = store::Store::open(path_db).map_err(|e| e.to_string())?;
    let righe = cache.contatti(None).map_err(|e| e.to_string())?;
    let elenco: Vec<contatti::Contatto> = righe.into_iter().map(Into::into).collect();
    std::fs::write(destinazione, contatti::esporta_vcard(&elenco)).map_err(|e| e.to_string())?;
    Ok(elenco.len())
}

/// Esporta la rubrica in un file `.vcf` nella cartella Download e ne restituisce
/// il percorso scritto (leggibile da Contatti di macOS).
#[tauri::command]
fn contatti_esporta_vcard() -> Result<String, String> {
    let cartella =
        dirs::download_dir().ok_or_else(|| "cartella Download non trovata".to_string())?;
    std::fs::create_dir_all(&cartella).map_err(|e| e.to_string())?;
    let percorso = percorso_libero(&cartella, &format!("rubrica-{}.vcf", adesso_unix()));
    contatti_esporta_vcard_in(&cache_path(), &percorso)?;
    Ok(percorso.to_string_lossy().into_owned())
}

/// Suggerimenti per il completamento dei destinatari: rubrica + indirizzi già
/// visti nella cache, deduplicati e ordinati per pertinenza.
pub fn contatti_suggerisci_da(
    path_db: &Path,
    testo: &str,
    limite: usize,
) -> Result<Vec<contatti::Suggerimento>, String> {
    let cache = store::Store::open(path_db).map_err(|e| e.to_string())?;
    let rubrica: Vec<contatti::Contatto> = cache
        .contatti(None)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(Into::into)
        .collect();
    let indirizzi = cache.indirizzi_messaggi().map_err(|e| e.to_string())?;
    // Blocco U: i gruppi che corrispondono vengono per primi.
    let gruppi = cache.gruppi().map_err(|e| e.to_string())?;
    let mut tutti = contatti::suggerimenti_gruppi(&gruppi, testo);
    tutti.extend(contatti::suggerisci_da(&rubrica, &indirizzi, testo, limite));
    tutti.truncate(limite.max(1));
    Ok(tutti)
}

/// I gruppi di contatti della rubrica (blocco U).
#[tauri::command]
fn gruppi_elenco() -> Result<Vec<contatti::Gruppo>, String> {
    apri_cache()?.gruppi().map_err(|e| e.to_string())
}

/// Salva un gruppo (nuovo o esistente); restituisce l'id.
#[tauri::command]
fn gruppo_salva(gruppo: contatti::Gruppo) -> Result<i64, String> {
    apri_cache()?.gruppo_salva(&gruppo).map_err(|e| e.to_string())
}

/// Elimina un gruppo (i contatti dei membri restano in rubrica).
#[tauri::command]
fn gruppo_elimina(id: i64) -> Result<usize, String> {
    apri_cache()?.gruppo_elimina(id).map_err(|e| e.to_string())
}

/// Suggerimenti di destinatari per i campi A/Cc/Ccn della composizione.
#[tauri::command]
fn contatti_suggerisci(
    testo: String,
    limite: Option<u32>,
) -> Result<Vec<contatti::Suggerimento>, String> {
    let limite = match limite {
        Some(n) if n > 0 => n as usize,
        _ => LIMITE_SUGGERIMENTI_DEFAULT,
    };
    contatti_suggerisci_da(&cache_path(), &testo, limite)
}

// ---------------------------------------------------------------------------
// Blocco H — gestione delle regole locali (pannello «Regole»).
//
// Le regole vivono in `config.json` (preferenze) e si normalizzano/validano in
// `config`. I comandi restituiscono sempre l'elenco aggiornato, così il pannello
// ridisegna senza una seconda lettura.
// ---------------------------------------------------------------------------

/// L'elenco delle regole salvate (già normalizzate in lettura).
#[tauri::command]
fn regole_elenco() -> Vec<config::Regola> {
    config::load_preferenze(&app_config_dir()).regole
}

/// Genera un id di regola non ancora usato.
fn id_regola_nuovo(regole: &[config::Regola]) -> String {
    let mut n = regole.len() + 1;
    loop {
        let candidato = format!("regola{n}");
        if !regole.iter().any(|r| r.id == candidato) {
            return candidato;
        }
        n += 1;
    }
}

/// Crea o aggiorna una regola. Un `id` vuoto ne genera uno nuovo; un `id` già
/// presente sostituisce la regola. Restituisce l'elenco aggiornato e ordinato.
pub fn regola_salva_in(dir: &Path, regola: &config::Regola) -> Result<Vec<config::Regola>, String> {
    let mut pref = config::load_preferenze(dir);
    let mut nuova = regola.clone();
    if nuova.id.trim().is_empty() {
        nuova.id = id_regola_nuovo(&pref.regole);
    }
    // Se è nuova e non ha un ordine, la si mette in coda.
    if !pref.regole.iter().any(|r| r.id == nuova.id) && nuova.ordine == 0 {
        nuova.ordine = pref.regole.len() as i64;
    }
    if let Some(pos) = pref.regole.iter().position(|r| r.id == nuova.id) {
        // Si conservano le statistiche esistenti se la regola non le porta.
        if nuova.esecuzioni == 0 && nuova.ultima_esecuzione == 0 {
            nuova.esecuzioni = pref.regole[pos].esecuzioni;
            nuova.ultima_esecuzione = pref.regole[pos].ultima_esecuzione;
        }
        pref.regole[pos] = nuova;
    } else {
        pref.regole.push(nuova);
    }
    pref.regole = config::normalizza_regole(&pref.regole);
    config::save_preferenze(dir, &pref).map_err(|e| e.to_string())?;
    Ok(pref.regole)
}

/// Crea o aggiorna una regola.
#[tauri::command]
fn regola_salva(regola: config::Regola) -> Result<Vec<config::Regola>, String> {
    regola_salva_in(&app_config_dir(), &regola)
}

/// Elimina una regola. Restituisce l'elenco aggiornato (eliminare una regola
/// assente non è un errore).
pub fn regola_elimina_in(dir: &Path, id: &str) -> Result<Vec<config::Regola>, String> {
    let mut pref = config::load_preferenze(dir);
    pref.regole.retain(|r| r.id != id);
    config::save_preferenze(dir, &pref).map_err(|e| e.to_string())?;
    Ok(pref.regole)
}

/// Elimina una regola per id.
#[tauri::command]
fn regola_elimina(id: String) -> Result<Vec<config::Regola>, String> {
    regola_elimina_in(&app_config_dir(), &id)
}

/// Riordina le regole secondo l'elenco di id (la posizione diventa l'`ordine`).
/// Gli id non presenti restano in coda, nell'ordine precedente.
pub fn regole_riordina_in(dir: &Path, ids: &[String]) -> Result<Vec<config::Regola>, String> {
    let mut pref = config::load_preferenze(dir);
    for (pos, id) in ids.iter().enumerate() {
        if let Some(r) = pref.regole.iter_mut().find(|r| &r.id == id) {
            r.ordine = pos as i64;
        }
    }
    pref.regole = config::normalizza_regole(&pref.regole);
    config::save_preferenze(dir, &pref).map_err(|e| e.to_string())?;
    Ok(pref.regole)
}

/// Riordina le regole in base all'elenco di id.
#[tauri::command]
fn regole_riordina(ids: Vec<String>) -> Result<Vec<config::Regola>, String> {
    regole_riordina_in(&app_config_dir(), &ids)
}

// ---------------------------------------------------------------------------
// Blocco G (versione **inviti**): inviti di riunione per posta.
//
// Il parser e la costruzione iCalendar stanno in `inviti` (logica pura); qui i
// comandi IPC leggono dalla cache e usano la macchina di invio già esistente
// (`send.rs`) per consegnare la richiesta o la risposta. **Nessuna risposta
// parte mai da sé**: solo quando l'utente preme un pulsante.
//
// Dichiarato: questa è una versione a **inviti**, non un calendario. Non ci sono
// viste mese/settimana/giorno, né il calcolo delle occorrenze di una ricorrenza,
// né promemoria. Le prove su cartella temporanea usano le varianti `*_da`.
// ---------------------------------------------------------------------------

/// Un invito di riunione, pronto per l'interfaccia. Le date sono in secondi
/// dall'epoca Unix; `notaRicorrenza` è valorizzata solo per una ricorrenza
/// complessa (dice che la v1 mostra la sola prima occorrenza).
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvitoIpc {
    pub id: i64,
    pub uid: String,
    pub sequenza: i64,
    pub oggetto: String,
    pub organizzatore: String,
    pub organizzatore_nome: String,
    pub inizio: i64,
    pub fine: Option<i64>,
    pub giornata_intera: bool,
    pub luogo: String,
    pub stato: String,
    pub metodo: String,
    pub descrizione: String,
    pub nota_ricorrenza: Option<String>,
    pub invitati: Vec<inviti::Invitato>,
    pub cartella: String,
    pub uid_messaggio: String,
    /// Vero se l'invito l'abbiamo creato noi (non si risponde ai propri inviti).
    pub uscita: bool,
}

/// Converte una riga di cache in un invito per l'interfaccia: decodifica gli
/// invitati dal JSON e ricalcola la dichiarazione sulla ricorrenza.
pub fn invito_ipc(r: store::InvitoRiga) -> InvitoIpc {
    let invitati: Vec<inviti::Invitato> = serde_json::from_str(&r.invitati).unwrap_or_default();
    let nota_ricorrenza = r.rrule.as_deref().and_then(inviti::nota_ricorrenza);
    InvitoIpc {
        id: r.id,
        uid: r.uid,
        sequenza: r.sequenza,
        oggetto: r.oggetto,
        organizzatore: r.organizzatore,
        organizzatore_nome: r.organizzatore_nome,
        inizio: r.inizio,
        fine: r.fine,
        giornata_intera: r.giornata_intera,
        luogo: r.luogo,
        stato: r.stato,
        metodo: r.metodo,
        descrizione: r.descrizione,
        nota_ricorrenza,
        invitati,
        cartella: r.cartella,
        uid_messaggio: r.uid_messaggio,
        uscita: r.uscita,
    }
}

/// Converte un invito (parlato o costruito) nella riga da salvare in cache.
fn riga_invito(
    inv: &inviti::Invito,
    cartella: &str,
    uid_messaggio: &str,
    uscita: bool,
) -> store::InvitoRiga {
    store::InvitoRiga {
        id: 0,
        uid: inv.uid.clone(),
        sequenza: inv.sequenza,
        oggetto: inv.oggetto.clone(),
        organizzatore: inv.organizzatore.clone(),
        organizzatore_nome: inv.organizzatore_nome.clone(),
        inizio: inv.inizio,
        fine: inv.fine,
        luogo: inv.luogo.clone(),
        giornata_intera: inv.giornata_intera,
        stato: inviti::stato_da_metodo(&inv.metodo).to_string(),
        metodo: inv.metodo.clone(),
        rrule: inv.rrule.clone(),
        descrizione: inv.descrizione.clone(),
        invitati: serde_json::to_string(&inv.invitati).unwrap_or_else(|_| "[]".to_string()),
        cartella: cartella.to_string(),
        uid_messaggio: uid_messaggio.to_string(),
        uscita,
    }
}

/// L'inverso di [`riga_invito`]: dalla riga di cache all'invito, per generare la
/// risposta (`METHOD:REPLY`) senza rileggere il messaggio.
fn invito_da_riga(r: &store::InvitoRiga) -> inviti::Invito {
    let invitati: Vec<inviti::Invitato> = serde_json::from_str(&r.invitati).unwrap_or_default();
    inviti::Invito {
        metodo: r.metodo.clone(),
        uid: r.uid.clone(),
        sequenza: r.sequenza,
        oggetto: r.oggetto.clone(),
        inizio: r.inizio,
        fine: r.fine,
        giornata_intera: r.giornata_intera,
        dtstamp: None,
        luogo: r.luogo.clone(),
        organizzatore: r.organizzatore.clone(),
        organizzatore_nome: r.organizzatore_nome.clone(),
        invitati,
        descrizione: r.descrizione.clone(),
        rrule: r.rrule.clone(),
        nota_ricorrenza: r.rrule.as_deref().and_then(inviti::nota_ricorrenza),
    }
}

/// Da «Nome Cognome <utente@host>» (o dal solo indirizzo) alla coppia
/// `(indirizzo, nome)` usata da `ORGANIZER`/`ATTENDEE`.
fn coppia_da_indirizzo(testo: &str) -> (String, String) {
    let t = testo.trim();
    let email = mail::ops::estrai_indirizzo(t).unwrap_or_default();
    let nome = match t.find('<') {
        Some(i) => t[..i].trim().trim_matches('"').to_string(),
        None => String::new(),
    };
    (email, nome)
}

/// Frase in italiano dell'azione compiuta rispondendo a un invito.
fn verbo_risposta(risposta: &str) -> &'static str {
    match inviti::stato_da_risposta(risposta) {
        Some("accettato") => "accetta",
        Some("tentativo") => "propone un tentativo per",
        Some("rifiutato") => "rifiuta",
        _ => "risponde a",
    }
}

/// L'elenco degli inviti dalla cache al percorso indicato (usato dai test con
/// una cartella temporanea).
pub fn inviti_elenco_da(path: &Path, filtro: Option<&str>) -> Result<Vec<InvitoIpc>, String> {
    let cache = store::Store::open(path).map_err(|e| e.to_string())?;
    let righe = cache.inviti(filtro).map_err(|e| e.to_string())?;
    Ok(righe.into_iter().map(invito_ipc).collect())
}

/// L'elenco degli inviti di riunione, ordinato per data di inizio. Con `filtro`
/// valorizzato si tiene solo quello stato.
#[tauri::command]
fn inviti_elenco(filtro: Option<String>) -> Result<Vec<InvitoIpc>, String> {
    inviti_elenco_da(&cache_path(), filtro.as_deref())
}

/// Se il messaggio aperto porta un invito `text/calendar`, lo legge, lo salva in
/// cache (aggiornando la riga se l'`UID` esiste) e lo restituisce. `None` per un
/// messaggio senza invito: è il caso normale e non è un errore.
#[tauri::command]
async fn invito_da_messaggio(
    folder: String,
    uid: String,
    account_id: Option<String>,
) -> Result<Option<InvitoIpc>, String> {
    let grezzo = corpo_grezzo(&folder, &uid, account_id.as_deref()).await?;
    let Some(testo) = inviti::testo_calendario(&grezzo) else {
        return Ok(None);
    };
    let mut elenco = inviti::analizza(&testo);
    if elenco.is_empty() {
        return Ok(None);
    }
    let inv = elenco.remove(0);
    if inv.uid.trim().is_empty() {
        return Err("l'invito non porta un UID: non si può salvarlo".to_string());
    }
    let riga = riga_invito(&inv, &folder, &uid, false);
    let id = {
        let cache = apri_cache()?;
        cache.salva_invito(&riga).map_err(|e| e.to_string())?
    };
    let cache = apri_cache()?;
    let salvato = cache
        .invito_per_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "invito salvato ma non rileggibile".to_string())?;
    Ok(Some(invito_ipc(salvato)))
}

/// Risponde a un invito: genera un `METHOD:REPLY` con il `PARTSTAT` giusto e lo
/// invia **all'organizzatore** usando la macchina di invio esistente. Aggiorna
/// lo stato in cache. Se l'invito l'ha creato l'utente, non c'è a chi rispondere.
#[tauri::command]
async fn invito_rispondi(id_invito: i64, risposta: String) -> Result<String, String> {
    let (riga, partstat, stato) = {
        let cache = apri_cache()?;
        let riga = cache
            .invito_per_id(id_invito)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("invito non trovato: {id_invito}"))?;
        let partstat = inviti::partstat_da_risposta(&risposta)
            .ok_or_else(|| format!("risposta non valida: {risposta}"))?;
        let stato = inviti::stato_da_risposta(&risposta)
            .ok_or_else(|| format!("risposta non valida: {risposta}"))?;
        (riga, partstat, stato)
    };
    if riga.uscita {
        return Err(
            "questo invito è stato creato da te: non c'è un organizzatore a cui rispondere"
                .to_string(),
        );
    }
    if riga.organizzatore.trim().is_empty() {
        return Err(
            "l'invito non porta l'organizzatore: non so a chi inviare la risposta".to_string(),
        );
    }

    let account = primo_account()?;
    let inv = invito_da_riga(&riga);
    let ics = inviti::genera_risposta(
        &inv,
        partstat,
        &account.email,
        &account.full_name,
        adesso_unix(),
    );
    let allegato = send::AllegatoInviato {
        nome: "risposta-invito.ics".to_string(),
        mime: "text/calendar".to_string(),
        contenuto: send::codifica_base64(ics.as_bytes()),
        content_id: None,
    };
    let oggetto = if riga.oggetto.trim().is_empty() {
        "Risposta a un invito di riunione".to_string()
    } else {
        format!("Re: {}", riga.oggetto)
    };
    let corpo = format!(
        "{} {} la richiesta di riunione «{}» ({}).",
        account.full_name,
        verbo_risposta(&risposta),
        riga.oggetto,
        riga.uid
    );
    let mittente = format!("{} <{}>", account.full_name, account.email);
    let messaggio = send::build_message_completo(
        &mittente,
        &[riga.organizzatore.clone()],
        &[],
        &[],
        &oggetto,
        &corpo,
        None,
        None,
        &[allegato],
    )
    .map_err(|e| e.to_string())?;
    let grezzo = messaggio.formatted();
    let sorgente = mail::imap::ImapSource::from_account(&account, &secrets::Store::real()).ok();
    let esito = send::invia_e_copia(
        sorgente.as_ref().map(|s| s as &dyn MailSource),
        || send::invia_messaggio(&account, &secrets::Store::real(), &messaggio).map(|_| ()),
        &grezzo,
    )
    .await
    .map_err(|e| e.to_string())?;

    {
        let cache = apri_cache()?;
        cache
            .imposta_stato_invito(&riga.uid, stato)
            .map_err(|e| e.to_string())?;
    }
    Ok(format!(
        "Risposta «{}» inviata all'organizzatore {} con un METHOD:REPLY. {}",
        stato,
        riga.organizzatore,
        esito.testo(&account)
    ))
}

/// Crea una riunione e invia l'invito in uscita (`METHOD:REQUEST`) con un UID
/// nuovo, `ORGANIZER` = utente e un `ATTENDEE` per ogni invitato. L'invito parte
/// come allegato `text/calendar` con la macchina di invio esistente; una copia
/// entra nell'agenda come invito **in uscita**.
#[tauri::command]
async fn invito_crea(
    dati_riunione: inviti::DatiRiunione,
    destinatari: Vec<String>,
) -> Result<String, String> {
    if dati_riunione.oggetto.trim().is_empty() {
        return Err("oggetto mancante: scrivere un oggetto per la riunione".to_string());
    }
    if dati_riunione.inizio <= 0 {
        return Err("data di inizio mancante: indicare giorno e ora della riunione".to_string());
    }
    let invitati: Vec<(String, String)> = destinatari
        .iter()
        .map(|s| coppia_da_indirizzo(s))
        .filter(|(email, _)| !email.is_empty() && email.contains('@'))
        .collect();
    if invitati.is_empty() {
        return Err("indicare almeno un invitato valido (con indirizzo email)".to_string());
    }

    let account = primo_account()?;
    let uid = inviti::uid_nuovo();
    let dtstamp = adesso_unix();
    let mut dati = dati_riunione.clone();
    dati.fine = dati.fine.filter(|f| *f >= dati.inizio);
    let ics = inviti::genera_invito(
        &dati,
        &uid,
        &account.email,
        &account.full_name,
        &invitati,
        dtstamp,
    );

    let allegato = send::AllegatoInviato {
        nome: "invito.ics".to_string(),
        mime: "text/calendar".to_string(),
        contenuto: send::codifica_base64(ics.as_bytes()),
        content_id: None,
    };
    let corpo = if dati.descrizione.trim().is_empty() {
        format!(
            "{} ti invita alla riunione «{}».",
            account.full_name, dati.oggetto
        )
    } else {
        dati.descrizione.clone()
    };
    let mittente = format!("{} <{}>", account.full_name, account.email);
    let messaggio = send::build_message_completo(
        &mittente,
        &destinatari,
        &[],
        &[],
        &dati.oggetto,
        &corpo,
        None,
        None,
        &[allegato],
    )
    .map_err(|e| e.to_string())?;
    let grezzo = messaggio.formatted();
    let sorgente = mail::imap::ImapSource::from_account(&account, &secrets::Store::real()).ok();
    let esito = send::invia_e_copia(
        sorgente.as_ref().map(|s| s as &dyn MailSource),
        || send::invia_messaggio(&account, &secrets::Store::real(), &messaggio).map(|_| ()),
        &grezzo,
    )
    .await
    .map_err(|e| e.to_string())?;

    // L'invito creato entra nell'agenda come invito in uscita (uscita = true).
    let inv = inviti::Invito {
        metodo: "REQUEST".to_string(),
        uid,
        sequenza: 0,
        oggetto: dati.oggetto.clone(),
        inizio: dati.inizio,
        fine: dati.fine,
        giornata_intera: dati.giornata_intera,
        dtstamp: Some(dtstamp),
        luogo: dati.luogo.clone(),
        organizzatore: account.email.clone(),
        organizzatore_nome: account.full_name.clone(),
        invitati: invitati
            .iter()
            .map(|(email, nome)| inviti::Invitato {
                indirizzo: email.clone(),
                nome: nome.clone(),
                partstat: "NEEDS-ACTION".to_string(),
            })
            .collect(),
        descrizione: dati.descrizione.clone(),
        rrule: None,
        nota_ricorrenza: None,
    };
    if let Ok(cache) = apri_cache() {
        let _ = cache.salva_invito(&riga_invito(&inv, "Posta inviata", "", true));
    }

    Ok(format!(
        "Invito inviato a {} invitati. {}",
        invitati.len(),
        esito.testo(&account)
    ))
}

// ---------------------------------------------------------------------------
// Blocco I2 — Vista, ricerca avanzata, formattazione, invio programmato,
// conferme e impostazioni personali. La logica pura vive nei moduli
// `composizione`, `sendlater`, `conferme`; qui stanno i comandi e il file I/O.
// ---------------------------------------------------------------------------

/// Secondi dall'epoca Unix adesso, con ripiego a 0 se l'orologio è prima del 1970.
pub fn adesso_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Nome del file della coda degli invii programmati (dati locali, mai password).
const INVII_FILE: &str = "invii_programmati.json";

/// Legge la coda degli invii programmati dalla cartella indicata. File assente o
/// illeggibile → coda vuota (uno stato normale: non si è mai programmato nulla).
pub fn invii_leggi_da(dir: &Path) -> Vec<sendlater::InvioProgrammato> {
    match std::fs::read_to_string(dir.join(INVII_FILE)) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Scrive la coda in modo atomico (file temporaneo + rinomina), come `config`.
pub fn invii_salva_in(dir: &Path, coda: &[sendlater::InvioProgrammato]) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string_pretty(coda).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{INVII_FILE}.tmp"));
    std::fs::write(&tmp, raw).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(INVII_FILE)).map_err(|e| e.to_string())
}

/// Dati di un nuovo invio programmato, come li manda l'interfaccia.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NuovoInvioProgrammato {
    /// Secondi dall'epoca Unix in cui inviare.
    pub quando: i64,
    pub account_id: String,
    pub a: String,
    pub cc: String,
    pub ccn: String,
    pub oggetto: String,
    pub corpo_testo: String,
    pub corpo_html: String,
    #[serde(default)]
    pub allegati: Vec<send::AllegatoInviato>,
    #[serde(default)]
    pub conferma_lettura: bool,
    #[serde(default)]
    pub conferma_recapito: bool,
}

/// Programma un invio. Rifiuta una data già passata e i campi obbligatori
/// mancanti con un messaggio leggibile; il messaggio resta in coda locale e parte
/// mentre l'app è aperta. Restituisce l'invio programmato salvato.
#[tauri::command]
fn invio_programma(dati: NuovoInvioProgrammato) -> Result<sendlater::InvioProgrammato, String> {
    let destinatari = send::dividi_indirizzi(&dati.a);
    send::valida_invio(&destinatari, &dati.oggetto).map_err(|e| e.to_string())?;
    let adesso = adesso_epoch();
    if dati.quando <= adesso {
        return Err(
            "Scegli un'ora futura per l'invio programmato: quella indicata è già passata."
                .to_string(),
        );
    }
    let inv = sendlater::InvioProgrammato {
        id: format!("{}-{}", dati.quando, adesso),
        quando: dati.quando,
        account_id: dati.account_id,
        a: dati.a,
        cc: dati.cc,
        ccn: dati.ccn,
        oggetto: dati.oggetto,
        corpo_testo: dati.corpo_testo,
        corpo_html: dati.corpo_html,
        allegati: dati.allegati,
        conferma_lettura: dati.conferma_lettura,
        conferma_recapito: dati.conferma_recapito,
        creato: adesso,
    };
    let dir = app_config_dir();
    let mut coda = invii_leggi_da(&dir);
    sendlater::aggiungi(&mut coda, inv.clone());
    invii_salva_in(&dir, &coda)?;
    Ok(inv)
}

/// Gli invii ancora in coda (dal più imminente), con l'ora attuale del kernel.
#[tauri::command]
fn invii_programmati_elenco() -> Vec<sendlater::InvioProgrammato> {
    sendlater::in_coda(&invii_leggi_da(&app_config_dir()), adesso_epoch())
}

/// Annulla un invio programmato. Vero se è stato tolto.
#[tauri::command]
fn invio_programmato_annulla(id: String) -> Result<bool, String> {
    let dir = app_config_dir();
    let mut coda = invii_leggi_da(&dir);
    let tolto = sendlater::annulla(&mut coda, &id);
    if tolto {
        invii_salva_in(&dir, &coda)?;
    }
    Ok(tolto)
}

/// Invia gli invii dovuti e li toglie dalla coda. Gli invii che falliscono
/// (account assente, rete giù) **restano in coda** e si ritentano al giro dopo:
/// non si perde un messaggio per un errore di rete momentaneo.
async fn elabora_invii_dovuti() {
    let dir = app_config_dir();
    let coda = invii_leggi_da(&dir);
    let dovuti = sendlater::dovuti(&coda, adesso_epoch());
    if dovuti.is_empty() {
        return;
    }
    let mut rimasti = coda.clone();
    for inv in dovuti {
        let esito = componi_e_invia(
            &inv.account_id,
            &inv.a,
            &inv.cc,
            &inv.ccn,
            &inv.oggetto,
            &inv.corpo_testo,
            &inv.corpo_html,
            &inv.allegati,
            inv.conferma_lettura,
            inv.conferma_recapito,
        )
        .await;
        if esito.is_ok() {
            sendlater::annulla(&mut rimasti, &inv.id);
        }
    }
    let _ = invii_salva_in(&dir, &rimasti);
}

/// Lo stato delle conferme per un messaggio in arrivo: cosa chiede e cosa
/// l'utente ha già deciso (blocco I2).
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatoConferme {
    pub lettura: bool,
    pub recapito: bool,
    pub indirizzo: Option<String>,
    /// `Some(true/false)` se l'utente ha già scelto; `None` se deve ancora farlo.
    pub lettura_inviata: Option<bool>,
    pub recapito_inviata: Option<bool>,
}

/// Riconosce la richiesta di conferma di un messaggio in cache e vi unisce la
/// scelta già registrata **per quell'account** (blocco L). Scarica le
/// intestazioni dal server (il corpo non serve). Nessuna conferma parte da sé.
/// `accountId` opzionale: assente → default; inesistente → errore leggibile.
#[tauri::command]
async fn conferme_stato(
    folder: String,
    uid: String,
    account_id: Option<String>,
) -> Result<StatoConferme, String> {
    let account = account_per_id(account_id.as_deref())?;
    let grezzo = corpo_grezzo(&folder, &uid, Some(&account.id)).await?;
    let intestazioni = conferme::intestazioni_da_grezzo(&grezzo);
    let richiesta = conferme::riconosci_richiesta(&intestazioni);
    let scelte = {
        let cache = apri_cache()?;
        cache
            .conferme_scelte(&account.id, &folder, &uid)
            .map_err(|e| e.to_string())?
    };
    let scelta = |tipo: &str| scelte.iter().find(|(t, _)| t == tipo).map(|(_, v)| *v);
    Ok(StatoConferme {
        lettura: richiesta.lettura,
        recapito: richiesta.recapito,
        indirizzo: richiesta.indirizzo,
        lettura_inviata: scelta("lettura"),
        recapito_inviata: scelta("recapito"),
    })
}

/// Registra la scelta dell'utente e, se «Invia la conferma», manda davvero la
/// risposta MDN. La scelta resta in cache **per quell'account** in ogni caso
/// (anche «Non inviare»): la stessa coppia cartella+UID in un'altra casella ha la
/// sua (blocco L). `accountId` opzionale: assente → default; inesistente → errore.
#[tauri::command]
async fn conferma_rispondi(
    folder: String,
    uid: String,
    tipo: String,
    invia: bool,
    account_id: Option<String>,
) -> Result<String, String> {
    let account = account_per_id(account_id.as_deref())?;
    let adesso = adesso_epoch();
    {
        let cache = apri_cache()?;
        cache
            .conferma_registra(&account.id, &folder, &uid, &tipo, invia, adesso)
            .map_err(|e| e.to_string())?;
    }
    if !invia {
        return Ok("Scelta registrata: nessuna conferma inviata.".to_string());
    }
    // Invia la MDN: si rilegge la richiesta per avere l'indirizzo aggiornato.
    let grezzo = corpo_grezzo(&folder, &uid, Some(&account.id)).await?;
    let richiesta = conferme::riconosci_richiesta(&conferme::intestazioni_da_grezzo(&grezzo));
    let mittente = format!("{} <{}>", account.full_name, account.email);
    let oggetto = {
        let cache = apri_cache()?;
        cache
            .thread_messages(&account.id, &folder, &uid)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|r| r.uid == uid)
            .and_then(|r| r.subject)
            .unwrap_or_default()
    };
    let mdn = conferme::componi_mdn(&richiesta, &oggetto, &mittente)
        .ok_or_else(|| "il messaggio non chiede più la conferma".to_string())?;
    invia_mdn(&account, &mdn).await
}

/// Costruisce e invia la risposta MDN (RFC 8098). Il contenuto è il campo
/// `message/disposition-notification` con la disposizione corretta.
async fn invia_mdn(account: &Account, mdn: &conferme::Mdn) -> Result<String, String> {
    use lettre::message::header::{HeaderName, HeaderValue};
    let from = lettre::message::Mailbox::from_str(&account.email)
        .map_err(|_| format!("indirizzo mittente non valido: {}", account.email))?;
    let to = lettre::message::Mailbox::from_str(&mdn.a)
        .map_err(|_| format!("indirizzo destinatario non valido: {}", mdn.a))?;
    let mut builder = lettre::Message::builder()
        .from(from)
        .to(to)
        .subject(mdn.oggetto.clone());
    for (nome, valore) in &mdn.intestazioni {
        // `From` è già impostato dal builder: si saltano i duplicati.
        if nome.eq_ignore_ascii_case("from") {
            continue;
        }
        if let Ok(nome_h) = HeaderName::new_from_ascii(nome.clone()) {
            builder = builder.raw_header(HeaderValue::new(nome_h, valore.clone()));
        }
    }
    let messaggio = builder
        .body(mdn.corpo.clone())
        .map_err(|e| format!("costruzione della conferma non riuscita: {e}"))?;
    let account = account.clone();
    tokio::task::spawn_blocking(move || {
        send::invia_messaggio(&account, &secrets::Store::real(), &messaggio)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    Ok("Conferma inviata.".to_string())
}

/// Stile CSS dello zoom del corpo di composizione (`ChunkZoom`).
#[tauri::command]
fn composizione_stile_zoom(percent: i64, base_px: i64) -> String {
    composizione::stile_zoom(percent, base_px)
}

/// Markup HTML del comando di formattazione. `None` per un comando sconosciuto.
#[tauri::command]
fn composizione_formatta(comando: String, testo: String, colore: Option<String>) -> Option<String> {
    composizione::markup_formattazione(&comando, &testo, colore.as_deref())
}

/// Elenco delle scorciatoie da tastiera **effettivamente attive** nel programma,
/// ricavate dai gestori presenti nel codice dell'interfaccia (blocco I2, pannello
/// «Scelte rapide da tastiera»). L'interfaccia le mostra; qui resta la
/// dichiarazione, così il pannello non inventa tasti.
#[tauri::command]
fn scelte_rapide() -> Vec<ScorciatoiaIpc> {
    scorciatoie_attive()
}

/// Una scorciatoia da tastiera attiva: tasti + a cosa serve.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScorciatoiaIpc {
    pub tasti: String,
    pub azione: String,
    pub contesto: String,
}

/// Le scorciatoie attive nel programma. Ogni voce corrisponde a un gestore
/// `keydown` reale in `src/main.js` / `src/views/compose.js`.
pub fn scorciatoie_attive() -> Vec<ScorciatoiaIpc> {
    vec![
        ScorciatoiaIpc {
            tasti: "⌘ ,".to_string(),
            azione: "Apri le Impostazioni".to_string(),
            contesto: "Finestra principale".to_string(),
        },
        ScorciatoiaIpc {
            tasti: "Esc".to_string(),
            azione: "Chiudi la ricerca in corso".to_string(),
            contesto: "Campo Cerca".to_string(),
        },
        ScorciatoiaIpc {
            tasti: "Invio".to_string(),
            azione: "Esegui la ricerca subito".to_string(),
            contesto: "Campo Cerca".to_string(),
        },
        ScorciatoiaIpc {
            tasti: "⌘ ↩".to_string(),
            azione: "Invia il messaggio dal corpo".to_string(),
            contesto: "Composizione".to_string(),
        },
        ScorciatoiaIpc {
            tasti: "⌘ S".to_string(),
            azione: "Salva come bozza (cartella Bozze)".to_string(),
            contesto: "Composizione".to_string(),
        },
        ScorciatoiaIpc {
            tasti: "⌘ W".to_string(),
            azione: "Chiudi la finestra di composizione".to_string(),
            contesto: "Composizione".to_string(),
        },
        ScorciatoiaIpc {
            tasti: "Esc".to_string(),
            azione: "Chiudi la composizione".to_string(),
            contesto: "Composizione".to_string(),
        },
        ScorciatoiaIpc {
            tasti: "↑ ↓".to_string(),
            azione: "Scegli un suggerimento fra i destinatari".to_string(),
            contesto: "Composizione · A/Cc/Ccn".to_string(),
        },
        ScorciatoiaIpc {
            tasti: "Invio".to_string(),
            azione: "Conferma il suggerimento selezionato".to_string(),
            contesto: "Composizione · A/Cc/Ccn".to_string(),
        },
    ]
}

// ---------------------------------------------------------------------------
// Blocco M — diagnostica della connessione.
//
// Perché: l'app sapeva dire «sincronizzazione non riuscita» senza dire *dove* si
// era fermata. `diagnostica_account` e `diagnostica_smtp` provano i passi in
// ordine e si fermano al primo errore, riportando **il testo esatto del server**;
// il riepilogo finale dice a quale passo e per quale causa.
//
// La password arriva **solo** dal Portachiavi (`secrets::Store::real()`) e non
// compare mai in un esito: `mail::diagnostica` sostituisce i segreti noti in ogni
// testo prodotto. La diagnostica non legge né scrive la cache: funziona anche
// quando la sincronizzazione è rotta, e anche se la password non è ancora stata
// salvata (in quel caso lo dice il solo passo `accesso`).
// ---------------------------------------------------------------------------

/// Diagnostica della **ricezione** dell'account: nome server, connessione, certificato,
/// saluto e capacità, accesso e cartelle — nell'ordine, fermandosi al primo errore.
#[tauri::command]
async fn diagnostica_account(
    account_id: String,
) -> Result<mail::diagnostica::DiagnosticaEsito, String> {
    let account = account_per_id(Some(&account_id))?;
    let fonte = mail::diagnostica::DiagnosticaImap::from_account(&account, &secrets::Store::real());
    Ok(mail::diagnostica::esegui_diagnostica(
        &fonte,
        &mail::diagnostica::PASSI_RICEZIONE,
        "IMAP",
    )
    .await)
}

/// Diagnostica dell'**invio** dell'account: connessione, `EHLO`, TLS (implicito o
/// `STARTTLS`) e `AUTH`. **Non invia nulla**: si ferma all'autenticazione.
#[tauri::command]
async fn diagnostica_smtp(
    account_id: String,
) -> Result<mail::diagnostica::DiagnosticaEsito, String> {
    let account = account_per_id(Some(&account_id))?;
    let fonte = mail::diagnostica::DiagnosticaSmtp::from_account(&account, &secrets::Store::real());
    Ok(mail::diagnostica::esegui_diagnostica(
        &fonte,
        &mail::diagnostica::PASSI_INVIO,
        "SMTP",
    )
    .await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Blocco I2: avvia il pianificatore degli invii programmati. Gira
            // mentre l'app è aperta; un invio dovuto parte entro ~30 secondi.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    elabora_invii_dovuti().await;
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                    let _ = &handle; // il pianificatore resta legato all'app aperta
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            account_save,
            account_list,
            account_elimina,
            account_predefinito,
            account_predefinito_letto,
            ai_chiave_stato,
            ai_chiave_salva,
            ai_chiave_elimina,
            ai_chiave_prova,
            mail_sync,
            mail_sync_tutti,
            mail_list,
            mail_conversazioni,
            mail_count,
            mail_cerca,
            mail_body,
            mail_body_con_immagini,
            mail_allegato_salva,
            mail_bozza_risposta,
            mail_bozza_inoltro,
            mail_allegati_messaggio,
            mail_invia,
            ai_azione,
            controllo_preinvio,
            impostazioni_leggi,
            impostazioni_salva,
            registro_ia,
            assistente_avvia,
            mail_set_seen,
            mail_set_flag,
            mail_set_completato,
            mail_set_categorie,
            mail_sposta,
            mail_elimina,
            mail_archivia,
            mail_indesiderato,
            mail_cartelle,
            mittenti_bloccati,
            mail_sblocca_mittente,
            posta_indesiderata_stato,
            registro_ia_svuota,
            registro_ia_esporta,
            svuota_cache,
            archiviazione_stato,
            notifica_prova,
            suono_prova,
            contatti_elenco,
            contatto_salva,
            contatto_elimina,
            contatti_importa_vcard,
            contatti_esporta_vcard,
            contatti_suggerisci,
            gruppi_elenco,
            gruppo_salva,
            gruppo_elimina,
            regole_elenco,
            regola_salva,
            regola_elimina,
            regole_riordina,
            inviti_elenco,
            invito_da_messaggio,
            invito_rispondi,
            invito_crea,
            mail_rinvia,
            mail_inoltra_allegato,
            mail_copia,
            conversazione_ignora,
            conversazioni_ignorate,
            cartella_crea,
            cartella_rinomina,
            cartella_elimina,
            cartella_svuota,
            cartella_segna_tutta_letta,
            cartella_preferita,
            cartelle_elenco,
            mail_salva_bozza,
            mail_set_scadenza,
            mail_scadenza_proponi,
            scadenze_voci,
            invio_programma,
            invii_programmati_elenco,
            invio_programmato_annulla,
            conferme_stato,
            conferma_rispondi,
            composizione_stile_zoom,
            composizione_formatta,
            scelte_rapide,
            diagnostica_account,
            diagnostica_smtp
        ])
        .run(tauri::generate_context!())
        .expect("errore nell'avvio dell'applicazione");
}

// ---------------------------------------------------------------------------
// Blocco L — ogni comando "per account" rifiuta un `accountId` inesistente.
//
// I comandi non sono `pub` (Tauri genera macro omonime e non ammette comandi
// pubblici), quindi questa verifica vive dentro il crate, dove i comandi sono
// visibili. La risoluzione è la stessa `account_per_id` di ogni comando: un id
// presente ma non configurato dà un errore leggibile, mai un silenzio.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod test_account_inesistente {
    use super::*;

    /// Un id che non è mai configurabile: il test è deterministico anche se la
    /// macchina ha account veri configurati (li legge soltanto, non li tocca).
    const FANTASMA: &str = "account-inesistente@example.invalid";

    fn atteso<T>(esito: Result<T, String>) -> bool {
        matches!(esito, Err(e) if e.contains("account non configurato") && e.contains(FANTASMA))
    }

    fn id() -> Option<String> {
        Some(FANTASMA.to_string())
    }

    #[tokio::test]
    async fn i_comandi_sulle_cartelle_rifiutano_un_account_inesistente() {
        assert!(atteso(cartella_crea("Nuova".into(), None, id()).await), "cartella_crea");
        assert!(
            atteso(cartella_rinomina("A".into(), "B".into(), id()).await),
            "cartella_rinomina"
        );
        assert!(atteso(cartella_elimina("Archivio".into(), id()).await), "cartella_elimina");
        assert!(
            atteso(cartella_svuota("Posta eliminata".into(), id()).await),
            "cartella_svuota"
        );
        assert!(
            atteso(cartella_segna_tutta_letta("INBOX".into(), id()).await),
            "cartella_segna_tutta_letta"
        );
        assert!(atteso(cartelle_elenco(id(), None).await), "cartelle_elenco");
    }

    #[test]
    fn i_comandi_sincroni_rifiutano_un_account_inesistente() {
        assert!(atteso(cartella_preferita("Bozze".into(), true, id())), "cartella_preferita");
        assert!(
            atteso(conversazione_ignora("thread".into(), true, id())),
            "conversazione_ignora"
        );
        assert!(atteso(conversazioni_ignorate(id())), "conversazioni_ignorate");
    }

    #[tokio::test]
    async fn i_comandi_sulle_conferme_rifiutano_un_account_inesistente() {
        assert!(
            atteso(conferme_stato("INBOX".into(), "1".into(), id()).await),
            "conferme_stato"
        );
        assert!(
            atteso(conferma_rispondi("INBOX".into(), "1".into(), "lettura".into(), false, id()).await),
            "conferma_rispondi"
        );
    }
}

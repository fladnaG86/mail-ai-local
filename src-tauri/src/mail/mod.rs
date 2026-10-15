//! Astrazione della sorgente di posta (task 3.1, Milestone 3).
//!
//! Tutto il kernel parla con la posta attraverso il trait `MailSource`: così la
//! sincronizzazione e i comandi Tauri si possono collaudare senza rete, usando
//! `FakeSource`. L'unica implementazione reale è `imap::ImapSource`.
//!
//! Blocco A (operazioni sui messaggi): il trait porta anche le operazioni di
//! modifica — flag, spostamento, eliminazione, keyword — così le stesse regole
//! valgono su IMAP vero e sulla sorgente finta. Le operazioni sono retro-
//! compatibili: hanno un'implementazione predefinita che fallisce con un errore
//! leggibile, quindi ogni altra sorgente resta valida.

use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Mutex;

pub mod conversazioni;
pub mod diagnostica;
pub mod imap;
pub mod mime;
pub mod ops;
pub mod protezione;
pub mod regole;
pub mod scadenza;
pub mod sync;

use crate::store;

/// Cartella di posta con i contatori mostrati nella barra laterale.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Folder {
    /// Nome della cartella così come lo espone il server (es. "INBOX").
    pub name: String,
    /// Messaggi non letti.
    pub unread: u32,
    /// Messaggi totali.
    pub total: u32,
}

/// Intestazione di un messaggio: quanto basta per la lista, senza il corpo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessageHeader {
    /// Identificatore univoco nel contesto della cartella (`UID` IMAP).
    pub uid: String,
    /// `Message-ID` dell'intestazione RFC 2822, quando presente.
    pub message_id: Option<String>,
    pub subject: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    /// Data in secondi dall'epoca Unix.
    pub date: i64,
    /// Vero se il messaggio è già stato letto (flag `\Seen`).
    pub seen: bool,
    /// Vero se il messaggio ha allegati (dalla struttura MIME).
    pub has_attachments: bool,
    /// `In-Reply-To` dell'intestazione RFC 2822: l'identificatore del messaggio
    /// a cui questo risponde. Serve al raggruppamento in conversazioni.
    pub in_reply_to: Option<String>,
    /// Campo `References` grezzo (identificatori separati da spazi), quando
    /// disponibile: rafforza il raggruppamento per References.
    pub references: Option<String>,
}

/// Flag di sistema modificabile sui messaggi.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlagOp {
    /// Letto / da leggere (`\Seen`).
    Seen,
    /// Contrassegnato (`\Flagged`), il "segnalibro" di Outlook.
    Flagged,
}

/// Errore comune a tutta la posta.
#[derive(Debug, thiserror::Error)]
pub enum MailError {
    #[error("errore di rete: {0}")]
    Rete(String),
    #[error("autenticazione fallita: {0}")]
    Autenticazione(String),
    #[error("errore IMAP: {0}")]
    Imap(String),
    #[error("errore di cache: {0}")]
    Cache(#[from] store::StoreError),
}

/// Risultato delle operazioni di posta.
pub type Result<T> = std::result::Result<T, MailError>;

/// Sorgente di posta. L'implementazione reale è `imap::ImapSource`; i test usano
/// `FakeSource`. `Send + Sync` perché le implementazioni vengono mosse fra i
/// thread del runtime asincrono e condivise fra le chiamate.
///
/// L'elenco delle cartelle, le intestazioni e il corpo servono alla lettura; le
/// operazioni di modifica hanno un'implementazione predefinita che segnala il
/// non-supporto, così il trait resta estendibile senza rompere chi lo implementa.
#[async_trait]
pub trait MailSource: Send + Sync {
    /// Elenco delle cartelle visibili con i contatori.
    async fn folders(&self) -> Result<Vec<Folder>>;

    /// Intestazioni dei messaggi di una cartella, al massimo `limit` (0 = tutte),
    /// a partire dalle più recenti.
    async fn headers(&self, folder: &str, limit: usize) -> Result<Vec<MessageHeader>>;

    /// Corpo grezzo (RFC 822) di un messaggio, identificato dalla cartella e dal
    /// suo `UID`. La cartella è esplicita: la v1 leggeva sempre la INBOX, anche
    /// quando il messaggio stava altrove (`mail_body(folder, uid)` la corregge).
    async fn body(&self, folder: &str, uid: &str) -> Result<Vec<u8>>;

    /// Imposta (o toglie) un flag di sistema con `UID STORE`, sempre per UID.
    /// Predefinito: la sorgente non sa modificare i flag.
    async fn imposta_flag(
        &self,
        _folder: &str,
        _uid: &str,
        _flag: FlagOp,
        _valore: bool,
    ) -> Result<()> {
        Err(MailError::Imap(
            "questa sorgente di posta non supporta la modifica dei flag".to_string(),
        ))
    }

    /// Sposta un messaggio in un'altra cartella. Predefinito: non supportato.
    async fn sposta(&self, _folder: &str, _uid: &str, _destinazione: &str) -> Result<()> {
        Err(MailError::Imap(
            "questa sorgente di posta non supporta lo spostamento dei messaggi".to_string(),
        ))
    }

    /// Rimuove definitivamente il messaggio dalla cartella (`\Deleted` +
    /// `EXPUNGE`): è il ripiego di `mail_elimina` quando manca una cartella
    /// della posta eliminata. Predefinito: non supportato.
    ///
    /// Il valore restituito è `true` quando il server **non** supporta
    /// `UID EXPUNGE` e si è dovuto ripiegare su un `EXPUNGE` che ripulisce tutti
    /// i messaggi marcati `\Deleted` della casella: chi chiama deve dirlo
    /// all'utente invece di farlo in silenzio.
    async fn elimina_definitivamente(&self, _folder: &str, _uid: &str) -> Result<bool> {
        Err(MailError::Imap(
            "questa sorgente di posta non supporta l'eliminazione dei messaggi".to_string(),
        ))
    }

    /// Aggiunge una keyword IMAP al messaggio (le "categorie" di Outlook).
    /// Restituisce `true` se il server l'ha accettata, `false` se non supporta
    /// le keyword: **non è un errore**, perché le categorie restano locali.
    /// Predefinito: nessun supporto, `false`.
    async fn aggiungi_keyword(&self, _folder: &str, _uid: &str, _keyword: &str) -> Result<bool> {
        Ok(false)
    }

    /// **Aggiunge** un messaggio grezzo (RFC 822) a una cartella con IMAP
    /// `APPEND`. È l'operazione che salva la copia in "Posta inviata" dopo un
    /// invio riuscito: solo aggiunta, non modifica né sposta nulla.
    /// Predefinito: non supportato.
    async fn aggiungi_a_cartella(&self, _folder: &str, _contenuto: &[u8]) -> Result<()> {
        Err(MailError::Imap(
            "questa sorgente di posta non supporta il salvataggio nelle cartelle".to_string(),
        ))
    }

    /// **Crea** una cartella sul server (IMAP `CREATE`). Predefinito: non supportato.
    async fn crea_cartella(&self, _nome: &str) -> Result<()> {
        Err(MailError::Imap(
            "questa sorgente di posta non supporta la creazione delle cartelle".to_string(),
        ))
    }

    /// **Rinomina** una cartella sul server (IMAP `RENAME`). Predefinito: non supportato.
    async fn rinomina_cartella(&self, _vecchio: &str, _nuovo: &str) -> Result<()> {
        Err(MailError::Imap(
            "questa sorgente di posta non supporta la rinomina delle cartelle".to_string(),
        ))
    }

    /// **Elimina** una cartella sul server (IMAP `DELETE`). Predefinito: non supportato.
    async fn elimina_cartella(&self, _nome: &str) -> Result<()> {
        Err(MailError::Imap(
            "questa sorgente di posta non supporta l'eliminazione delle cartelle".to_string(),
        ))
    }

    /// **Svuota** una cartella: marca tutti i messaggi `\Deleted` ed esegue
    /// `EXPUNGE`. Predefinito: non supportato.
    async fn svuota_cartella(&self, _nome: &str) -> Result<()> {
        Err(MailError::Imap(
            "questa sorgente di posta non supporta lo svuotamento delle cartelle".to_string(),
        ))
    }

    /// **Segna tutti come già letti** una cartella (`\Seen` su tutti i messaggi).
    /// Predefinito: non supportato.
    async fn segna_tutta_letta(&self, _nome: &str) -> Result<()> {
        Err(MailError::Imap(
            "questa sorgente di posta non supporta la lettura in blocco".to_string(),
        ))
    }

    /// **Copia** un messaggio in un'altra cartella (IMAP `UID COPY`), senza
    /// toccare l'originale. Predefinito: non supportato.
    async fn copia(&self, _folder: &str, _uid: &str, _destinazione: &str) -> Result<()> {
        Err(MailError::Imap(
            "questa sorgente di posta non supporta la copia dei messaggi".to_string(),
        ))
    }

    /// **Salva una bozza**: `APPEND` in una cartella con il flag `\Draft`.
    /// Predefinito: non supportato.
    async fn salva_bozza(&self, _folder: &str, _contenuto: &[u8]) -> Result<()> {
        Err(MailError::Imap(
            "questa sorgente di posta non supporta il salvataggio delle bozze".to_string(),
        ))
    }
}

/// Sorgente finta per i test: cartelle e messaggi fissi, nessun accesso alla rete.
///
/// È compilata sempre (non dietro `#[cfg(test)]`) perché i test di integrazione
/// in `tests/` vedono la libreria come normale dipendenza, senza `cfg(test)`:
/// stesso motivo di `secrets::Store::in_memory_for_tests`.
///
/// I costruttori con catena (`con_cartelle`, `che_rifiuta`, `con_keyword`)
/// servono ai test del blocco A: cartelle di sistema a piacere, un server che
/// rifiuta le operazioni e un server che accetta le keyword.
pub struct FakeSource {
    cartelle: Mutex<Vec<Folder>>,
    intestazioni: Mutex<HashMap<String, Vec<MessageHeader>>>,
    /// Stato non portato da `MessageHeader` (contrassegnato e keyword), per
    /// chiave `(cartella, uid)`. Il flag `\Flagged` vive qui.
    extra: Mutex<HashMap<(String, String), Vec<String>>>,
    /// Se valorizzato, ogni operazione di modifica fallisce con questo messaggio:
    /// prova che l'errore è leggibile e che la cache non cambia.
    rifiuto: Option<String>,
    /// Se vero il server accetta le keyword IMAP; se falso `aggiungi_keyword`
    /// risponde `false` come un server senza supporto (non è un errore).
    keyword_supportate: bool,
    /// Copie salvate con `aggiungi_a_cartella` (APPEND), in ordine: cartella e
    /// byte. Serve a provare che la copia in "Posta inviata" sia avvenuta.
    copie: Mutex<Vec<(String, Vec<u8>)>>,
    /// Bozze salvate con `salva_bozza` (APPEND con `\Draft`): cartella, flag e byte.
    bozze: Mutex<Vec<(String, String, Vec<u8>)>>,
}

impl FakeSource {
    /// Sorgente di prova: INBOX con 3 messaggi (UID 101, 102, 103) e una
    /// "Posta inviata" vuota.
    pub fn new() -> Self {
        let inbox = vec![
            MessageHeader {
                uid: "101".to_string(),
                message_id: Some("<101@example.it>".to_string()),
                subject: Some("Piano manutenzione Q4".to_string()),
                from: Some("Luca Bianchi <luca@example.it>".to_string()),
                to: Some("mario@example.it".to_string()),
                date: 1_700_000_100,
                seen: false,
                has_attachments: false,
                in_reply_to: None,
                references: None,
            },
            MessageHeader {
                uid: "102".to_string(),
                message_id: Some("<102@example.it>".to_string()),
                subject: Some("Preventivo per il capannone".to_string()),
                from: Some("Beta <info@beta.example.it>".to_string()),
                to: Some("mario@example.it".to_string()),
                date: 1_700_000_200,
                seen: true,
                has_attachments: true,
                in_reply_to: None,
                references: None,
            },
            MessageHeader {
                uid: "103".to_string(),
                message_id: Some("<103@example.it>".to_string()),
                subject: Some("Riunione di lunedi".to_string()),
                from: Some("marco.ferrari@esempiogroup.it".to_string()),
                to: Some("mario@example.it".to_string()),
                date: 1_700_000_300,
                seen: true,
                has_attachments: false,
                in_reply_to: None,
                references: None,
            },
        ];
        let mut mappa = HashMap::new();
        mappa.insert("INBOX".to_string(), inbox);
        mappa.insert("Posta inviata".to_string(), Vec::new());
        FakeSource {
            cartelle: Mutex::new(vec![
                Folder {
                    name: "INBOX".to_string(),
                    unread: 1,
                    total: 3,
                },
                Folder {
                    name: "Posta inviata".to_string(),
                    unread: 0,
                    total: 0,
                },
            ]),
            intestazioni: Mutex::new(mappa),
            extra: Mutex::new(HashMap::new()),
            rifiuto: None,
            keyword_supportate: false,
            copie: Mutex::new(Vec::new()),
            bozze: Mutex::new(Vec::new()),
        }
    }

    /// Aggiunge cartelle (vuote) dopo quelle predefinite: servono a provare le
    /// scelte di "Posta eliminata", "Archivio" e "Posta indesiderata".
    pub fn con_cartelle(self, nomi: &[&str]) -> Self {
        {
            let mut mappa = self
                .intestazioni
                .lock()
                .expect("mutex della sorgente finta");
            for nome in nomi {
                mappa.entry(nome.to_string()).or_default();
            }
        }
        for nome in nomi {
            self.cartelle
                .lock()
                .expect("mutex delle cartelle finte")
                .push(Folder {
                    name: nome.to_string(),
                    unread: 0,
                    total: 0,
                });
        }
        self
    }

    /// Fa fallire ogni operazione di modifica con il messaggio dato: simula un
    /// server che rifiuta (cartella in sola lettura, permessi mancanti, …).
    pub fn che_rifiuta(mut self, messaggio: &str) -> Self {
        self.rifiuto = Some(messaggio.to_string());
        self
    }

    /// Il server dichiara di supportare le keyword IMAP.
    pub fn con_keyword(mut self) -> Self {
        self.keyword_supportate = true;
        self
    }

    /// Copie salvate con `aggiungi_a_cartella` (APPEND), in ordine: cartella e
    /// byte. Serve a provare che la copia in "Posta inviata" sia avvenuta.
    pub fn copie(&self) -> Vec<(String, Vec<u8>)> {
        self.copie.lock().expect("mutex delle copie finte").clone()
    }

    /// Bozze salvate con `salva_bozza` (APPEND con `\Draft`).
    pub fn bozze(&self) -> Vec<(String, Vec<u8>)> {
        self.bozze
            .lock()
            .expect("mutex delle bozze finte")
            .iter()
            .map(|(f, _, b)| (f.clone(), b.clone()))
            .collect()
    }

    /// Bozze salvate con `salva_bozza`, con il flag usato (`\Draft`).
    pub fn bozze_con_flag(&self) -> Vec<(String, String, Vec<u8>)> {
        self.bozze.lock().expect("mutex delle bozze finte").clone()
    }

    /// Aggiunge un messaggio in coda a una cartella: simula l'arrivo di posta.
    pub fn push_header(&self, folder: &str, header: MessageHeader) {
        let mut mappa = self
            .intestazioni
            .lock()
            .expect("mutex della sorgente finta");
        mappa.entry(folder.to_string()).or_default().push(header);
    }

    /// Fallisce con il messaggio di rifiuto, se impostato.
    fn controlla_rifiuto(&self) -> Result<()> {
        match &self.rifiuto {
            Some(m) => Err(MailError::Imap(m.clone())),
            None => Ok(()),
        }
    }
}

impl Default for FakeSource {
    fn default() -> Self {
        FakeSource::new()
    }
}

#[async_trait]
impl MailSource for FakeSource {
    async fn folders(&self) -> Result<Vec<Folder>> {
        Ok(self
            .cartelle
            .lock()
            .expect("mutex delle cartelle finte")
            .clone())
    }

    async fn headers(&self, folder: &str, limit: usize) -> Result<Vec<MessageHeader>> {
        let mappa = self
            .intestazioni
            .lock()
            .expect("mutex della sorgente finta");
        let mut righe = mappa.get(folder).cloned().unwrap_or_default();
        if limit > 0 && righe.len() > limit {
            // Si tengono le più recenti, che stanno in coda alla lista.
            righe = righe.split_off(righe.len() - limit);
        }
        Ok(righe)
    }

    async fn body(&self, folder: &str, uid: &str) -> Result<Vec<u8>> {
        Ok(format!("Corpo del messaggio {folder}/{uid}").into_bytes())
    }

    async fn imposta_flag(
        &self,
        folder: &str,
        uid: &str,
        flag: FlagOp,
        valore: bool,
    ) -> Result<()> {
        self.controlla_rifiuto()?;
        {
            let mut mappa = self
                .intestazioni
                .lock()
                .expect("mutex della sorgente finta");
            let lista = mappa.get_mut(folder).ok_or_else(|| {
                MailError::Imap(format!("cartella inesistente sul server: {folder}"))
            })?;
            let header = lista.iter_mut().find(|h| h.uid == uid).ok_or_else(|| {
                MailError::Imap(format!("messaggio {uid} non presente in {folder}"))
            })?;
            if flag == FlagOp::Seen {
                header.seen = valore;
            }
        }
        // `\Seen` vive nell'intestazione; `\Flagged` nello stato extra.
        if flag == FlagOp::Flagged {
            let nome = "\\Flagged".to_string();
            let mut extra = self.extra.lock().expect("mutex dello stato finto");
            let voci = extra
                .entry((folder.to_string(), uid.to_string()))
                .or_default();
            if valore {
                if !voci.contains(&nome) {
                    voci.push(nome);
                }
            } else {
                voci.retain(|f| f != &nome);
            }
        }
        Ok(())
    }

    async fn sposta(&self, folder: &str, uid: &str, destinazione: &str) -> Result<()> {
        self.controlla_rifiuto()?;
        {
            let mut mappa = self
                .intestazioni
                .lock()
                .expect("mutex della sorgente finta");
            if !mappa.contains_key(destinazione) {
                return Err(MailError::Imap(format!(
                    "cartella di destinazione inesistente sul server: {destinazione}"
                )));
            }
            let lista = mappa.get_mut(folder).ok_or_else(|| {
                MailError::Imap(format!("cartella inesistente sul server: {folder}"))
            })?;
            let posizione = lista.iter().position(|h| h.uid == uid).ok_or_else(|| {
                MailError::Imap(format!("messaggio {uid} non presente in {folder}"))
            })?;
            let header = lista.remove(posizione);
            mappa
                .get_mut(destinazione)
                .expect("destinazione verificata sopra")
                .push(header);
        }
        // Lo stato extra segue il messaggio nella nuova cartella.
        let mut extra = self.extra.lock().expect("mutex dello stato finto");
        if let Some(stato) = extra.remove(&(folder.to_string(), uid.to_string())) {
            extra.insert((destinazione.to_string(), uid.to_string()), stato);
        }
        Ok(())
    }

    async fn elimina_definitivamente(&self, folder: &str, uid: &str) -> Result<bool> {
        self.controlla_rifiuto()?;
        {
            let mut mappa = self
                .intestazioni
                .lock()
                .expect("mutex della sorgente finta");
            let lista = mappa.get_mut(folder).ok_or_else(|| {
                MailError::Imap(format!("cartella inesistente sul server: {folder}"))
            })?;
            let posizione = lista.iter().position(|h| h.uid == uid).ok_or_else(|| {
                MailError::Imap(format!("messaggio {uid} non presente in {folder}"))
            })?;
            lista.remove(posizione);
        }
        self.extra
            .lock()
            .expect("mutex dello stato finto")
            .remove(&(folder.to_string(), uid.to_string()));
        // La sorgente finta non ha un EXPUNGE "ampio": nessun ripiego da segnalare.
        Ok(false)
    }

    async fn aggiungi_keyword(&self, folder: &str, uid: &str, keyword: &str) -> Result<bool> {
        if !self.keyword_supportate {
            return Ok(false);
        }
        self.controlla_rifiuto()?;
        let mut extra = self.extra.lock().expect("mutex dello stato finto");
        let voci = extra
            .entry((folder.to_string(), uid.to_string()))
            .or_default();
        if !voci.iter().any(|k| k == keyword) {
            voci.push(keyword.to_string());
        }
        Ok(true)
    }

    async fn aggiungi_a_cartella(&self, folder: &str, contenuto: &[u8]) -> Result<()> {
        self.controlla_rifiuto()?;
        {
            let mappa = self
                .intestazioni
                .lock()
                .expect("mutex della sorgente finta");
            if !mappa.contains_key(folder) {
                return Err(MailError::Imap(format!(
                    "cartella inesistente sul server: {folder}"
                )));
            }
        }
        self.copie
            .lock()
            .expect("mutex delle copie finte")
            .push((folder.to_string(), contenuto.to_vec()));
        Ok(())
    }

    async fn crea_cartella(&self, nome: &str) -> Result<()> {
        self.controlla_rifiuto()?;
        let mut cartelle = self.cartelle.lock().expect("mutex delle cartelle finte");
        if cartelle.iter().any(|c| c.name == nome) {
            return Err(MailError::Imap(format!(
                "cartella già esistente sul server: {nome}"
            )));
        }
        cartelle.push(Folder {
            name: nome.to_string(),
            unread: 0,
            total: 0,
        });
        self.intestazioni
            .lock()
            .expect("mutex della sorgente finta")
            .entry(nome.to_string())
            .or_default();
        Ok(())
    }

    async fn rinomina_cartella(&self, vecchio: &str, nuovo: &str) -> Result<()> {
        self.controlla_rifiuto()?;
        {
            let mut cartelle = self.cartelle.lock().expect("mutex delle cartelle finte");
            let pos = cartelle.iter().position(|c| c.name == vecchio).ok_or_else(|| {
                MailError::Imap(format!("cartella inesistente sul server: {vecchio}"))
            })?;
            cartelle[pos].name = nuovo.to_string();
        }
        {
            let mut mappa = self
                .intestazioni
                .lock()
                .expect("mutex della sorgente finta");
            let contenuto = mappa.remove(vecchio).unwrap_or_default();
            mappa.insert(nuovo.to_string(), contenuto);
        }
        // Lo stato extra segue i messaggi nella cartella rinominata.
        let mut extra = self.extra.lock().expect("mutex dello stato finto");
        let chiavi: Vec<(String, String)> = extra
            .keys()
            .filter(|(f, _)| f == vecchio)
            .cloned()
            .collect();
        for (f, uid) in chiavi {
            if let Some(stato) = extra.remove(&(f, uid.clone())) {
                extra.insert((nuovo.to_string(), uid), stato);
            }
        }
        Ok(())
    }

    async fn elimina_cartella(&self, nome: &str) -> Result<()> {
        self.controlla_rifiuto()?;
        {
            let mut cartelle = self.cartelle.lock().expect("mutex delle cartelle finte");
            let prima = cartelle.len();
            cartelle.retain(|c| c.name != nome);
            if cartelle.len() == prima {
                return Err(MailError::Imap(format!(
                    "cartella inesistente sul server: {nome}"
                )));
            }
        }
        self.intestazioni
            .lock()
            .expect("mutex della sorgente finta")
            .remove(nome);
        self.extra
            .lock()
            .expect("mutex dello stato finto")
            .retain(|(f, _), _| f != nome);
        Ok(())
    }

    async fn svuota_cartella(&self, nome: &str) -> Result<()> {
        self.controlla_rifiuto()?;
        {
            let mut mappa = self
                .intestazioni
                .lock()
                .expect("mutex della sorgente finta");
            let lista = mappa.get_mut(nome).ok_or_else(|| {
                MailError::Imap(format!("cartella inesistente sul server: {nome}"))
            })?;
            lista.clear();
        }
        self.extra
            .lock()
            .expect("mutex dello stato finto")
            .retain(|(f, _), _| f != nome);
        Ok(())
    }

    async fn segna_tutta_letta(&self, nome: &str) -> Result<()> {
        self.controlla_rifiuto()?;
        let mut mappa = self
            .intestazioni
            .lock()
            .expect("mutex della sorgente finta");
        let lista = mappa.get_mut(nome).ok_or_else(|| {
            MailError::Imap(format!("cartella inesistente sul server: {nome}"))
        })?;
        for h in lista.iter_mut() {
            h.seen = true;
        }
        Ok(())
    }

    async fn copia(&self, folder: &str, uid: &str, destinazione: &str) -> Result<()> {
        self.controlla_rifiuto()?;
        {
            let mut mappa = self
                .intestazioni
                .lock()
                .expect("mutex della sorgente finta");
            if !mappa.contains_key(destinazione) {
                return Err(MailError::Imap(format!(
                    "cartella di destinazione inesistente sul server: {destinazione}"
                )));
            }
            let header = mappa
                .get(folder)
                .and_then(|l| l.iter().find(|h| h.uid == uid))
                .cloned()
                .ok_or_else(|| {
                    MailError::Imap(format!("messaggio {uid} non presente in {folder}"))
                })?;
            mappa
                .get_mut(destinazione)
                .expect("destinazione verificata sopra")
                .push(header);
        }
        // L'originale resta: la sua copia porta con sé lo stato extra.
        let extra = self.extra.lock().expect("mutex dello stato finto");
        if let Some(stato) = extra.get(&(folder.to_string(), uid.to_string())).cloned() {
            drop(extra);
            self.extra
                .lock()
                .expect("mutex dello stato finto")
                .insert((destinazione.to_string(), uid.to_string()), stato);
        }
        Ok(())
    }

    async fn salva_bozza(&self, folder: &str, contenuto: &[u8]) -> Result<()> {
        self.controlla_rifiuto()?;
        {
            let mappa = self
                .intestazioni
                .lock()
                .expect("mutex della sorgente finta");
            if !mappa.contains_key(folder) {
                return Err(MailError::Imap(format!(
                    "cartella inesistente sul server: {folder}"
                )));
            }
        }
        self.bozze
            .lock()
            .expect("mutex delle bozze finte")
            .push((folder.to_string(), "\\Draft".to_string(), contenuto.to_vec()));
        Ok(())
    }
}

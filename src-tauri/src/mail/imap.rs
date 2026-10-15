//! Client IMAP reale (task 3.2, Milestone 3): elenco cartelle, intestazioni e
//! corpo grezzo.
//!
//! Il TLS è obbligatorio: il validatore è quello di sistema (`native-tls`),
//! quindi un certificato non valido interrompe la connessione. Non esiste alcuna
//! opzione "ignora certificato". La password arriva solo dal Keychain
//! (`secrets::Store`), mai dalla configurazione su disco.

use async_trait::async_trait;
use futures::TryStreamExt;
use tokio::net::TcpStream;
use tokio_native_tls::TlsStream;

use crate::config::Account;
use crate::mail::{FlagOp, Folder, MailError, MailSource, MessageHeader, Result};
use crate::secrets;
use async_imap::imap_proto::{BodyContentCommon, BodyStructure};
use async_imap::types::Flag;

/// Parametri di connessione ricavati dalla configurazione dell'account.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConnectionParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    /// Sempre `true`: nella v1 il TLS è obbligatorio, non esiste l'opzione
    /// "ignora certificato". Il campo è esplicito perché sia verificabile.
    pub tls: bool,
}

impl ConnectionParams {
    /// Costruisce i parametri di connessione. Rifiuta gli account senza SSL:
    /// la v1 parla solo IMAPS (TLS implicito), mai in chiaro.
    pub fn from_account(account: &Account) -> Result<Self> {
        if !account.imap_ssl {
            return Err(MailError::Rete(
                "TLS obbligatorio per IMAP: attivare l'opzione SSL nelle impostazioni dell'account"
                    .to_string(),
            ));
        }
        Ok(ConnectionParams {
            host: account.imap_host.clone(),
            port: account.imap_port,
            username: account.username.clone(),
            tls: true,
        })
    }
}

/// Tipo della sessione autenticata su TLS (IMAPS).
type ImapSession = async_imap::Session<TlsStream<TcpStream>>;

/// Sorgente reale: dialoga con il server IMAP dell'account.
pub struct ImapSource {
    params: ConnectionParams,
    password: String,
}

impl ImapSource {
    /// Costruisce la sorgente da parametri già pronti e password.
    pub fn new(params: ConnectionParams, password: String) -> Self {
        ImapSource { params, password }
    }

    /// Prepara il client leggendo la password dal Keychain.
    pub fn from_account(account: &Account, secrets: &secrets::Store) -> Result<Self> {
        let params = ConnectionParams::from_account(account)?;
        let password = secrets.get(&account.id).map_err(|e| {
            MailError::Autenticazione(format!(
                "password non trovata nel Keychain per l'account {}: {e}",
                account.id
            ))
        })?;
        Ok(ImapSource::new(params, password))
    }

    /// Apre la connessione TLS e autentica con nome utente e password.
    async fn connect(&self) -> Result<ImapSession> {
        let tcp = TcpStream::connect((self.params.host.as_str(), self.params.port))
            .await
            .map_err(|e| {
                MailError::Rete(format!(
                    "connessione a {}:{} non riuscita: {e}",
                    self.params.host, self.params.port
                ))
            })?;
        let connettore = native_tls::TlsConnector::builder()
            .build()
            .map_err(|e| MailError::Rete(format!("TLS non inizializzabile: {e}")))?;
        let connettore = tokio_native_tls::TlsConnector::from(connettore);
        let flusso = connettore
            .connect(&self.params.host, tcp)
            .await
            .map_err(|e| {
                MailError::Rete(format!(
                    "handshake TLS con {} non riuscito: {e}",
                    self.params.host
                ))
            })?;
        let client = async_imap::Client::new(flusso);
        let sessione = client
            .login(&self.params.username, &self.password)
            .await
            .map_err(|(e, _client)| MailError::Autenticazione(e.to_string()))?;
        Ok(sessione)
    }
}

#[async_trait]
impl MailSource for ImapSource {
    async fn folders(&self) -> Result<Vec<Folder>> {
        let mut sessione = self.connect().await?;
        let nomi: Vec<async_imap::types::Name> = sessione
            .list(None, Some("*"))
            .await
            .map_err(errore_imap)?
            .try_collect()
            .await
            .map_err(errore_imap)?;

        let mut cartelle = Vec::new();
        for nome in nomi {
            // Le cartelle solo-contenitore non si possono aprire: si saltano.
            if nome
                .attributes()
                .contains(&async_imap::types::NameAttribute::NoSelect)
            {
                continue;
            }
            let nome_cartella = nome.name().to_string();
            // `examine` (non `select`) non altera lo stato della casella.
            let mailbox = sessione
                .examine(&nome_cartella)
                .await
                .map_err(errore_imap)?;
            let non_letti = sessione.search("UNSEEN").await.map_err(errore_imap)?.len() as u32;
            cartelle.push(Folder {
                name: nome_cartella,
                unread: non_letti,
                total: mailbox.exists,
            });
        }
        let _ = sessione.logout().await;
        Ok(cartelle)
    }

    async fn headers(&self, folder: &str, limit: usize) -> Result<Vec<MessageHeader>> {
        let mut sessione = self.connect().await?;
        let mailbox = sessione.select(folder).await.map_err(errore_imap)?;
        let totale = mailbox.exists as usize;
        if totale == 0 {
            let _ = sessione.logout().await;
            return Ok(Vec::new());
        }
        // Intervallo di numeri di sequenza: gli ultimi `limit` (0 = tutti).
        let inizio = if limit == 0 || limit >= totale {
            1
        } else {
            totale - limit + 1
        };
        let intervallo = format!("{inizio}:{totale}");
        let flusso = sessione
            .fetch(
                &intervallo,
                "(UID FLAGS INTERNALDATE ENVELOPE BODYSTRUCTURE)",
            )
            .await
            .map_err(errore_imap)?;
        let elementi: Vec<async_imap::types::Fetch> =
            flusso.try_collect().await.map_err(errore_imap)?;

        let mut intestazioni = Vec::with_capacity(elementi.len());
        for elemento in elementi {
            let uid = match elemento.uid {
                Some(u) => u.to_string(),
                None => continue,
            };
            let visto = elemento.flags().any(|f| f == async_imap::types::Flag::Seen);
            let data = elemento.internal_date().map(|d| d.timestamp()).unwrap_or(0);
            let (oggetto, da, a, message_id, in_reply_to) = match elemento.envelope() {
                Some(env) => (
                    testo(env.subject.as_deref()),
                    env.from.as_deref().map(indirizzi),
                    env.to.as_deref().map(indirizzi),
                    testo(env.message_id.as_deref()),
                    // L'ENVELOPE porta In-Reply-To (l'identificatore del messaggio
                    // a cui questo risponde): è la base del raggruppamento.
                    testo(env.in_reply_to.as_deref()),
                ),
                None => (None, None, None, None, None),
            };
            intestazioni.push(MessageHeader {
                uid,
                message_id,
                subject: oggetto,
                from: da,
                to: a,
                date: data,
                seen: visto,
                // Gli allegati si deducono dalla struttura MIME (BODYSTRUCTURE),
                // non sono più sempre falsi.
                has_attachments: elemento.bodystructure().is_some_and(struttura_ha_allegati),
                in_reply_to,
                // Il campo References non è nell'ENVELOPE: per leggerlo servirebbe
                // un fetch dell'intestazione dedicato. Il raggruppamento usa
                // In-Reply-To (disponibile) e, in mancanza, l'oggetto normalizzato.
                references: None,
            });
        }
        let _ = sessione.logout().await;
        Ok(intestazioni)
    }

    async fn body(&self, folder: &str, uid: &str) -> Result<Vec<u8>> {
        // La cartella arriva dal chiamante: non si assume più la INBOX.
        let mut sessione = self.connect().await?;
        sessione.select(folder).await.map_err(errore_imap)?;
        let flusso = sessione
            .uid_fetch(uid, "(BODY.PEEK[])")
            .await
            .map_err(errore_imap)?;
        let elementi: Vec<async_imap::types::Fetch> =
            flusso.try_collect().await.map_err(errore_imap)?;
        let corpo = elementi
            .first()
            .and_then(|f| f.body())
            .map(|b| b.to_vec())
            .ok_or_else(|| MailError::Imap(format!("nessun corpo per l'UID {uid}")))?;
        let _ = sessione.logout().await;
        Ok(corpo)
    }

    async fn imposta_flag(
        &self,
        folder: &str,
        uid: &str,
        flag: FlagOp,
        valore: bool,
    ) -> Result<()> {
        // La sessione è nuova a ogni chiamata: si seleziona la cartella giusta e
        // si agisce sempre per UID, mai per numero di sequenza.
        let mut sessione = self.connect().await?;
        sessione.select(folder).await.map_err(errore_imap)?;
        let nome = match flag {
            FlagOp::Seen => "\\Seen",
            FlagOp::Flagged => "\\Flagged",
        };
        // `+FLAGS` aggiunge, `-FLAGS` toglie; `SILENT` evita di rispedire i flag.
        let segno = if valore { "+" } else { "-" };
        let comando = format!("{segno}FLAGS.SILENT ({nome})");
        let flusso = sessione
            .uid_store(uid, comando.as_str())
            .await
            .map_err(errore_imap)?;
        let _: Vec<_> = flusso.try_collect().await.map_err(errore_imap)?;
        let _ = sessione.logout().await;
        Ok(())
    }

    async fn sposta(&self, folder: &str, uid: &str, destinazione: &str) -> Result<()> {
        // async-imap non espone UID MOVE: si usa la sequenza standard UID COPY +
        // \Deleted + EXPUNGE, che funziona su qualunque server IMAP4rev1.
        let mut sessione = self.connect().await?;
        sessione.select(folder).await.map_err(errore_imap)?;
        sessione.uid_copy(uid, destinazione).await.map_err(|e| {
            MailError::Imap(format!(
                "spostamento in \"{destinazione}\" non riuscito: {e}"
            ))
        })?;
        // In `sposta` il ripiego ampio non cambia l'esito per l'utente: il
        // messaggio è stato copiato nella destinazione in ogni caso.
        segna_eliminato_e_espungi(&mut sessione, uid).await?;
        let _ = sessione.logout().await;
        Ok(())
    }

    async fn elimina_definitivamente(&self, folder: &str, uid: &str) -> Result<bool> {
        let mut sessione = self.connect().await?;
        sessione.select(folder).await.map_err(errore_imap)?;
        let ripiego_ampio = segna_eliminato_e_espungi(&mut sessione, uid).await?;
        let _ = sessione.logout().await;
        Ok(ripiego_ampio)
    }

    async fn aggiungi_keyword(&self, folder: &str, uid: &str, keyword: &str) -> Result<bool> {
        let mut sessione = self.connect().await?;
        let casella = sessione.select(folder).await.map_err(errore_imap)?;
        // Le keyword sono garantite solo se il server le dichiara nei flag
        // permanenti (`\*` o una keyword già presente). Altrimenti non è un
        // errore: le categorie restano locali in cache.
        if !keyword_supportate(&casella.permanent_flags) {
            let _ = sessione.logout().await;
            return Ok(false);
        }
        let comando = format!("+FLAGS.SILENT ({keyword})");
        let flusso = sessione
            .uid_store(uid, comando.as_str())
            .await
            .map_err(errore_imap)?;
        let _: Vec<_> = flusso.try_collect().await.map_err(errore_imap)?;
        let _ = sessione.logout().await;
        Ok(true)
    }

    async fn aggiungi_a_cartella(&self, folder: &str, contenuto: &[u8]) -> Result<()> {
        // APPEND: solo aggiunta di un messaggio grezzo alla cartella, senza
        // selezionarla e senza toccare i flag (il server la marcherà da sé).
        let mut sessione = self.connect().await?;
        sessione
            .append(folder, None, None, contenuto)
            .await
            .map_err(|e| {
                MailError::Imap(format!(
                    "salvataggio del messaggio in \"{folder}\" non riuscito: {e}"
                ))
            })?;
        let _ = sessione.logout().await;
        Ok(())
    }

    async fn crea_cartella(&self, nome: &str) -> Result<()> {
        let nome = nome.trim();
        if nome.is_empty() {
            return Err(MailError::Imap(
                "il nome della cartella è vuoto: non c'è nulla da creare".to_string(),
            ));
        }
        let mut sessione = self.connect().await?;
        sessione.create(nome).await.map_err(|e| {
            MailError::Imap(format!("creazione della cartella \"{nome}\" non riuscita: {e}"))
        })?;
        let _ = sessione.logout().await;
        Ok(())
    }

    async fn rinomina_cartella(&self, vecchio: &str, nuovo: &str) -> Result<()> {
        if nuovo.trim().is_empty() {
            return Err(MailError::Imap(
                "il nuovo nome della cartella è vuoto: non c'è nulla da rinominare".to_string(),
            ));
        }
        let mut sessione = self.connect().await?;
        sessione.rename(vecchio, nuovo).await.map_err(|e| {
            MailError::Imap(format!(
                "rinomina di \"{vecchio}\" in \"{nuovo}\" non riuscita: {e}"
            ))
        })?;
        let _ = sessione.logout().await;
        Ok(())
    }

    async fn elimina_cartella(&self, nome: &str) -> Result<()> {
        let mut sessione = self.connect().await?;
        sessione.delete(nome).await.map_err(|e| {
            MailError::Imap(format!("eliminazione della cartella \"{nome}\" non riuscita: {e}"))
        })?;
        let _ = sessione.logout().await;
        Ok(())
    }

    async fn svuota_cartella(&self, nome: &str) -> Result<()> {
        let mut sessione = self.connect().await?;
        let casella = sessione.select(nome).await.map_err(errore_imap)?;
        if casella.exists == 0 {
            let _ = sessione.logout().await;
            return Ok(());
        }
        // Tutti i messaggi: `\Deleted` e `EXPUNGE`. `STORE` per numero di
        // sequenza è corretto per una casella appena selezionata (1:*).
        let flusso = sessione
            .store("1:*", "+FLAGS.SILENT (\\Deleted)")
            .await
            .map_err(errore_imap)?;
        let _: Vec<_> = flusso.try_collect().await.map_err(errore_imap)?;
        let flusso = sessione.expunge().await.map_err(errore_imap)?;
        let _: Vec<_> = flusso.try_collect().await.map_err(errore_imap)?;
        let _ = sessione.logout().await;
        Ok(())
    }

    async fn segna_tutta_letta(&self, nome: &str) -> Result<()> {
        let mut sessione = self.connect().await?;
        let casella = sessione.select(nome).await.map_err(errore_imap)?;
        if casella.exists == 0 {
            let _ = sessione.logout().await;
            return Ok(());
        }
        let flusso = sessione
            .store("1:*", "+FLAGS.SILENT (\\Seen)")
            .await
            .map_err(errore_imap)?;
        let _: Vec<_> = flusso.try_collect().await.map_err(errore_imap)?;
        let _ = sessione.logout().await;
        Ok(())
    }

    async fn copia(&self, folder: &str, uid: &str, destinazione: &str) -> Result<()> {
        // UID COPY, **senza** `\Deleted` né `EXPUNGE`: l'originale resta dove
        // sta. È la differenza sostanziale rispetto a `sposta`.
        let mut sessione = self.connect().await?;
        sessione.select(folder).await.map_err(errore_imap)?;
        sessione.uid_copy(uid, destinazione).await.map_err(|e| {
            MailError::Imap(format!(
                "copia in \"{destinazione}\" non riuscita: {e}"
            ))
        })?;
        let _ = sessione.logout().await;
        Ok(())
    }

    async fn salva_bozza(&self, folder: &str, contenuto: &[u8]) -> Result<()> {
        let mut sessione = self.connect().await?;
        sessione
            .append(folder, Some("\\Draft"), None, contenuto)
            .await
            .map_err(|e| {
                MailError::Imap(format!(
                    "salvataggio della bozza in \"{folder}\" non riuscito: {e}"
                ))
            })?;
        let _ = sessione.logout().await;
        Ok(())
    }
}

/// Marca il messaggio `\Deleted` ed esegue `EXPUNGE` per UID.
///
/// Con la capacità `UIDPLUS` si usa `UID EXPUNGE`, che rimuove **solo** il
/// messaggio indicato; senza di essa si ripiega su `EXPUNGE`, che rimuove tutti
/// i messaggi marcati `\Deleted` nella casella selezionata (è il ripiego
/// documentato, non silenzioso).
async fn segna_eliminato_e_espungi(sessione: &mut ImapSession, uid: &str) -> Result<bool> {
    let flusso = sessione
        .uid_store(uid, "+FLAGS.SILENT (\\Deleted)")
        .await
        .map_err(errore_imap)?;
    let _: Vec<_> = flusso.try_collect().await.map_err(errore_imap)?;

    let uidplus = sessione
        .capabilities()
        .await
        .map(|c| c.has_str("UIDPLUS"))
        .unwrap_or(false);
    if uidplus {
        let flusso = sessione.uid_expunge(uid).await.map_err(errore_imap)?;
        let _: Vec<_> = flusso.try_collect().await.map_err(errore_imap)?;
    } else {
        // Ripiego ampio: `EXPUNGE` senza UID ripulisce tutti i messaggi marcati
        // `\Deleted` nella casella selezionata, non solo questo. Lo segnaliamo
        // a chi chiama perché possa dirlo all'utente.
        let flusso = sessione.expunge().await.map_err(errore_imap)?;
        let _: Vec<_> = flusso.try_collect().await.map_err(errore_imap)?;
    }
    Ok(!uidplus)
}

/// Vero se la casella dichiara di poter memorizzare keyword personalizzate:
/// il flag permanente `\*` (`Flag::MayCreate`) o una keyword già presente.
fn keyword_supportate(permanenti: &[Flag<'_>]) -> bool {
    permanenti
        .iter()
        .any(|f| matches!(f, Flag::MayCreate) || matches!(f, Flag::Custom(_)))
}

/// Converte un errore del client IMAP nell'errore del modulo.
fn errore_imap(e: async_imap::error::Error) -> MailError {
    MailError::Imap(e.to_string())
}

/// Converte i byte di un campo dell'envelope in `String` (UTF-8 con perdite).
fn testo(valore: Option<&[u8]>) -> Option<String> {
    valore.map(|b| String::from_utf8_lossy(b).into_owned())
}

/// Formatta un elenco di indirizzi IMAP come "Nome <utente@host>".
fn indirizzi(addrs: &[async_imap::imap_proto::Address<'_>]) -> String {
    addrs
        .iter()
        .map(format_address)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Formatta un singolo indirizzo IMAP.
fn format_address(a: &async_imap::imap_proto::Address<'_>) -> String {
    let mailbox = a
        .mailbox
        .as_deref()
        .map(|b| String::from_utf8_lossy(b).into_owned())
        .unwrap_or_default();
    let host = a
        .host
        .as_deref()
        .map(|b| String::from_utf8_lossy(b).into_owned())
        .unwrap_or_default();
    let nome = a
        .name
        .as_deref()
        .map(|b| String::from_utf8_lossy(b).into_owned());
    let indirizzo = if host.is_empty() {
        mailbox
    } else {
        format!("{mailbox}@{host}")
    };
    match nome {
        Some(n) if !n.is_empty() => format!("{n} <{indirizzo}>"),
        _ => indirizzo,
    }
}

/// Vero se la struttura MIME (BODYSTRUCTURE) contiene almeno un allegato.
///
/// Le parti di corpo (`text/plain`, `text/html`) non contano come allegati; lo
/// sono invece le parti con `Content-Disposition: attachment`, quelle non di
/// testo che portano un nome file (`name`/`filename`) e i messaggi incorporati.
fn struttura_ha_allegati(bs: &BodyStructure<'_>) -> bool {
    match bs {
        // In un contenitore basta che una parte figlia sia un allegato.
        BodyStructure::Multipart { bodies, .. } => bodies.iter().any(struttura_ha_allegati),
        // Messaggio inoltrato come parte: è un allegato a tutti gli effetti.
        BodyStructure::Message { .. } => true,
        // text/plain o text/html: sono il corpo, non un allegato.
        BodyStructure::Text { .. } => false,
        BodyStructure::Basic { common, .. } => e_allegato(common),
    }
}

/// Vero se una parte singola non testuale è un allegato.
fn e_allegato(common: &BodyContentCommon<'_>) -> bool {
    if let Some(d) = &common.disposition {
        if d.ty.eq_ignore_ascii_case("attachment") {
            return true;
        }
    }
    // Un nome file fra i parametri segnala l'allegato anche senza disposizione
    // esplicita; le immagini inline con solo Content-ID non ci finiscono.
    common.ty.params.as_ref().is_some_and(|params| {
        params
            .iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("name") || k.eq_ignore_ascii_case("filename"))
    })
}

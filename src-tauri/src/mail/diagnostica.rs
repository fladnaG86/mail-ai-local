//! Blocco M — diagnostica della connessione.
//!
//! Perché esiste: fino a qui l'app sapeva dire «sincronizzazione non riuscita»
//! senza dire **dove** si era fermata. Questo modulo prova i passi di una
//! connessione di posta **in ordine** —
//!
//! `nome server` → `connessione` → `certificato` → `saluto del server` →
//! `accesso` → `cartelle`
//!
//! — e si ferma al **primo errore**, riportando per ognuno il **testo esatto**
//! del server o dell'errore di rete, in chiaro. Il riepilogo finale è una frase
//! leggibile («La diagnostica si ferma al passo 5 (accesso): …»).
//!
//! Proprietà volute:
//! - **non dipende dalla cache**: ogni passo apre la propria connessione e non
//!   legge né scrive il database locale, quindi la diagnostica funziona anche
//!   quando la sincronizzazione è rotta;
//! - **funziona anche senza password**: i primi quattro passi non ne hanno
//!   bisogno; solo `accesso` (e quindi `cartelle`) la richiede, e se manca dal
//!   Portachiavi lo dice in italiano invece di fallire in silenzio;
//! - **la password non compare mai in un esito**: arriva dal Portachiavi e ogni
//!   testo prodotto passa da [`occulta`], che sostituisce i segreti noti.
//!
//! Il TLS è quello di sistema (`native-tls`), lo stesso del client IMAP: non
//! esiste alcuna opzione che disattivi la verifica dei certificati, quindi un
//! certificato non valido interrompe l'handshake e finisce nel passo
//! `certificato` con il motivo.

use async_trait::async_trait;
use base64::Engine as _;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::{lookup_host, TcpStream};
use tokio_native_tls::TlsStream;
use x509_parser::parse_x509_certificate;

use crate::config::Account;
use crate::secrets;

// ---------------------------------------------------------------------------
// I passi
// ---------------------------------------------------------------------------

/// Un passo della diagnostica. I nomi sono quelli che l'interfaccia mostra
/// all'utente, in italiano.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Passo {
    /// Risoluzione del nome del server (`imaps.esempiohost.it` → indirizzo IP).
    NomeServer,
    /// Apertura della connessione TCP sulla porta indicata.
    Connessione,
    /// Handshake TLS e validità del certificato (soggetto, scadenza).
    Certificato,
    /// Banner iniziale del server e capacità dichiarate.
    Saluto,
    /// `LOGIN` (IMAP) o `AUTH` (SMTP) con utente e password dal Portachiavi.
    Accesso,
    /// `LIST` (IMAP) e numero di cartelle trovate, con i nomi.
    Cartelle,
}

impl Passo {
    /// Etichetta italiana del passo, quella mostrata in finestra.
    pub fn nome(self) -> &'static str {
        match self {
            Passo::NomeServer => "nome server",
            Passo::Connessione => "connessione",
            Passo::Certificato => "certificato",
            Passo::Saluto => "saluto del server",
            Passo::Accesso => "accesso",
            Passo::Cartelle => "cartelle",
        }
    }
}

/// Ordine dei passi della **ricezione** (IMAP), dal primo all'ultimo.
pub const PASSI_RICEZIONE: [Passo; 6] = [
    Passo::NomeServer,
    Passo::Connessione,
    Passo::Certificato,
    Passo::Saluto,
    Passo::Accesso,
    Passo::Cartelle,
];

/// Ordine dei passi dell'**invio** (SMTP). Nessi `cartelle`: l'invio non ne ha.
pub const PASSI_INVIO: [Passo; 5] = [
    Passo::NomeServer,
    Passo::Connessione,
    Passo::Certificato,
    Passo::Saluto,
    Passo::Accesso,
];

/// Esito di un singolo passo, con il testo da mostrare all'utente.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PassoEsito {
    /// Nome del passo (vedi [`Passo::nome`]).
    pub passo: String,
    /// `"ok"` oppure `"errore"`.
    pub esito: String,
    /// Testo del server o dell'errore di rete, **in chiaro**.
    pub dettaglio: String,
}

/// Esito completo della diagnostica: i passi provati e il riepilogo leggibile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticaEsito {
    /// `"IMAP"` (ricezione) oppure `"SMTP"` (invio).
    pub protocollo: String,
    /// I passi provati, nell'ordine: si fermano al primo errore.
    pub passi: Vec<PassoEsito>,
    /// Vero se la sequenza si è fermata prima dell'ultimo passo.
    pub interrotto: bool,
    /// Frase finale leggibile, con il passo di arresto e la causa.
    pub riepilogo: String,
}

/// Chi sa eseguire i passi. L'implementazione reale parla con il server; i test
/// usano una sorgente finta, così la logica della sequenza si collauda senza
/// rete.
#[async_trait]
pub trait PassiDiagnostica: Send + Sync {
    /// Esegue un passo: il testo da mostrare, oppure la causa dell'errore.
    async fn esegui(&self, passo: Passo) -> Result<String, String>;

    /// I segreti da non far comparire **mai** nei testi prodotti (la password).
    /// Predefinito: nessuno, così una sorgente finta che non ne ha non deve
    /// implementare nulla.
    fn segreti_da_occultare(&self) -> Vec<String> {
        Vec::new()
    }
}

// ---------------------------------------------------------------------------
// La sequenza (pura, testabile senza rete)
// ---------------------------------------------------------------------------

/// Sostituisce ogni segreto noto con un segnaposto. È la rete di sicurezza che
/// impedisce alla password di comparire in un esito, in un log o in un testo
/// copiato negli appunti.
///
/// I segreti più corti di 3 caratteri non vengono sostituiti: rimpiazzare una
/// stringa di uno o due caratteri distruggerebbe il messaggio senza guadagnare
/// sicurezza (nessun codice di questo modulo mette la password in un testo — la
/// sostituzione è la seconda linea di difesa, non la prima).
pub fn occulta(testo: &str, segreti: &[String]) -> String {
    let mut out = testo.to_string();
    for s in segreti {
        if s.chars().count() < 3 {
            continue;
        }
        out = out.replace(s.as_str(), "••••••");
    }
    out
}

/// La frase finale della diagnostica. `interrotto` vero significa che la
/// sequenza si è fermata su un errore, e in quel caso il testo **nomina il
/// passo** e **la causa**.
pub fn riepilogo_diagnostica(passi: &[PassoEsito], totale: usize, interrotto: bool) -> String {
    if !interrotto {
        return format!(
            "Tutti i passi sono andati a buon fine ({totale} su {totale}). \
             La connessione, il certificato e l'accesso funzionano: se la posta non \
             arriva, il problema non è la connessione."
        );
    }
    match passi.last() {
        Some(p) => format!(
            "La diagnostica si ferma al passo {} ({}): {}",
            passi.len(),
            p.passo,
            p.dettaglio
        ),
        None => "La diagnostica non ha potuto provare nessun passo.".to_string(),
    }
}

/// Esegue i passi **nell'ordine dato**, fermandosi al primo errore. Ogni testo
/// prodotto passa da [`occulta`] con i segreti dichiarati dalla sorgente.
pub async fn esegui_diagnostica(
    fonte: &dyn PassiDiagnostica,
    ordine: &[Passo],
    protocollo: &str,
) -> DiagnosticaEsito {
    let segreti = fonte.segreti_da_occultare();
    let mut passi: Vec<PassoEsito> = Vec::new();
    let mut interrotto = false;

    for passo in ordine {
        match fonte.esegui(*passo).await {
            Ok(dettaglio) => passi.push(PassoEsito {
                passo: passo.nome().to_string(),
                esito: "ok".to_string(),
                dettaglio: occulta(&dettaglio, &segreti),
            }),
            Err(dettaglio) => {
                passi.push(PassoEsito {
                    passo: passo.nome().to_string(),
                    esito: "errore".to_string(),
                    dettaglio: occulta(&dettaglio, &segreti),
                });
                interrotto = true;
                break;
            }
        }
    }

    let riepilogo = riepilogo_diagnostica(&passi, ordine.len(), interrotto);
    DiagnosticaEsito {
        protocollo: protocollo.to_string(),
        passi,
        interrotto,
        riepilogo,
    }
}

// ---------------------------------------------------------------------------
// Aiutanti di rete e di protocollo (usati da IMAP e da SMTP)
// ---------------------------------------------------------------------------

/// Risolve un nome di server negli indirizzi IP che gli corrispondono.
pub async fn risolvi_nome(host: &str, port: u16) -> Result<Vec<String>, String> {
    let indirizzi = lookup_host((host, port))
        .await
        .map_err(|e| format!("non è stato possibile risolvere il nome «{host}»: {e}"))?;
    let mut ip: Vec<String> = Vec::new();
    for a in indirizzi {
        let s = a.ip().to_string();
        if !ip.contains(&s) {
            ip.push(s);
        }
    }
    Ok(ip)
}

/// Apre la connessione TCP sulla porta indicata, con errore leggibile.
async fn apri_tcp(host: &str, port: u16) -> Result<TcpStream, String> {
    TcpStream::connect((host, port))
        .await
        .map_err(|e| format!("connessione a {host}:{port} non riuscita: {e}"))
}

/// Handshake TLS con il validatore di sistema (nessuna scorciatoia: un
/// certificato non valido fa fallire il passo).
async fn handshake_tls(host: &str, tcp: TcpStream) -> Result<TlsStream<TcpStream>, String> {
    let connettore = native_tls::TlsConnector::builder()
        .build()
        .map_err(|e| format!("TLS non inizializzabile: {e}"))?;
    let connettore = tokio_native_tls::TlsConnector::from(connettore);
    connettore
        .connect(host, tcp)
        .await
        .map_err(|e| format!("handshake TLS con {host} non riuscito: {e}"))
}

/// Descrive il certificato presentato dal server: soggetto, emittente,
/// validità e giorni che mancano alla scadenza. Errore se scaduto o non ancora
/// valido (in pratica l'handshake lo ha già rifiutato; qui resta la spiegazione).
pub fn descrivi_certificato(cert: &native_tls::Certificate) -> Result<String, String> {
    let der = cert
        .to_der()
        .map_err(|e| format!("certificato del server non leggibile: {e}"))?;
    let (_resto, x509) =
        parse_x509_certificate(&der).map_err(|e| format!("certificato non decodificabile: {e}"))?;
    let validita = x509.validity();
    let dal = validita
        .not_before
        .to_rfc2822()
        .unwrap_or_else(|_| validita.not_before.to_string());
    let al = validita
        .not_after
        .to_rfc2822()
        .unwrap_or_else(|_| validita.not_after.to_string());
    let adesso = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    if adesso < validita.not_before.timestamp() {
        return Err(format!(
            "il certificato non è ancora valido: valido dal {dal} al {al}"
        ));
    }
    if adesso > validita.not_after.timestamp() {
        return Err(format!("il certificato è scaduto il {al}"));
    }
    let giorni = (validita.not_after.timestamp() - adesso) / 86_400;
    Ok(format!(
        "certificato valido: soggetto «{}», rilasciato da «{}», valido dal {dal} al {al} (scade fra {giorni} giorni)",
        x509.subject(),
        x509.issuer()
    ))
}

/// Legge una riga terminata da `\n`; errore leggibile se il server chiude la
/// connessione senza rispondere.
async fn leggi_riga<S>(br: &mut BufReader<S>) -> Result<String, String>
where
    S: AsyncRead + Unpin,
{
    let mut buf: Vec<u8> = Vec::new();
    let letti = br
        .read_until(b'\n', &mut buf)
        .await
        .map_err(|e| format!("lettura dal server non riuscita: {e}"))?;
    if letti == 0 {
        return Err("il server ha chiuso la connessione senza rispondere".to_string());
    }
    Ok(String::from_utf8_lossy(&buf)
        .trim_end_matches(['\r', '\n'])
        .to_string())
}

/// Invia una riga con la terminazione di protocollo.
async fn invia_riga<S>(br: &mut BufReader<S>, riga: &str) -> Result<(), String>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    br.get_mut()
        .write_all(format!("{riga}\r\n").as_bytes())
        .await
        .map_err(|e| format!("invio al server non riuscito: {e}"))
}

/// Legge una risposta IMAP fino alla riga con il tag (`a2 OK …`).
async fn risposta_imap<S>(br: &mut BufReader<S>, tag: &str) -> Result<Vec<String>, String>
where
    S: AsyncRead + Unpin,
{
    let inizio_tag = format!("{tag} ");
    let mut righe: Vec<String> = Vec::new();
    loop {
        let riga = leggi_riga(br).await?;
        let chiude = riga.starts_with(&inizio_tag) || riga == tag;
        righe.push(riga);
        if chiude {
            return Ok(righe);
        }
        if righe.len() > 500 {
            return Err("risposta del server troppo lunga per essere una risposta IMAP".to_string());
        }
    }
}

/// Lo stato (`OK` / `NO` / `BAD`) della riga con il tag.
fn stato_risposta(righe: &[String], tag: &str) -> String {
    righe
        .iter()
        .rev()
        .find_map(|r| {
            let mut it = r.splitn(3, ' ');
            if it.next() == Some(tag) {
                it.next().map(|s| s.to_uppercase())
            } else {
                None
            }
        })
        .unwrap_or_default()
}

/// Toglie il tag di protocollo dalla riga, per mostrare il testo del server.
fn togli_tag(riga: &str, tag: &str) -> String {
    riga.strip_prefix(&format!("{tag} "))
        .unwrap_or(riga)
        .to_string()
}

/// Mette un argomento IMAP fra virgolette, con la fuga prevista.
fn quota(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Estrae i nomi delle cartelle dalle righe `* LIST (…) "/" "Nome"`: l'ultimo
/// campo fra virgolette è il nome. Funzione pura, collaudata senza rete.
pub fn estrai_cartelle(righe: &[String]) -> Vec<String> {
    righe
        .iter()
        .filter(|r| r.to_uppercase().starts_with("* LIST"))
        .filter_map(|r| campi_tra_virgolette(r).pop())
        .collect()
}

/// I campi fra virgolette di una riga, con la fuga `\"` risolta.
fn campi_tra_virgolette(riga: &str) -> Vec<String> {
    let mut fuori: Vec<String> = Vec::new();
    let mut corrente: Option<String> = None;
    let mut iter = riga.chars();
    while let Some(c) = iter.next() {
        match c {
            '"' => match corrente.take() {
                None => corrente = Some(String::new()),
                Some(s) => fuori.push(s),
            },
            '\\' if corrente.is_some() => {
                if let Some(n) = iter.next() {
                    if let Some(s) = corrente.as_mut() {
                        s.push(n);
                    }
                }
            }
            _ => {
                if let Some(s) = corrente.as_mut() {
                    s.push(c);
                }
            }
        }
    }
    fuori
}

/// I meccanismi di accesso dichiarati dalla risposta `EHLO`. Funzione pura.
pub fn meccanismi_auth(capacita: &str) -> Vec<String> {
    let mut fuori: Vec<String> = Vec::new();
    for riga in capacita.split(" · ") {
        let u = riga.to_uppercase();
        let resto = if let Some(r) = u.strip_prefix("250-AUTH") {
            r
        } else if let Some(r) = u.strip_prefix("AUTH") {
            r
        } else {
            continue;
        };
        let resto = resto.trim_start_matches(['=', ' ', '-']);
        for m in resto.split_whitespace() {
            let m = m.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_');
            if !m.is_empty() && !fuori.iter().any(|x: &String| x == m) {
                fuori.push(m.to_string());
            }
        }
    }
    fuori
}

/// Il nome da dichiarare in `EHLO`: il dominio dell'indirizzo, o `localhost`.
fn nome_ehlo(account: &Account) -> String {
    account
        .email
        .split_once('@')
        .map(|(_, d)| d.trim().to_string())
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| "localhost".to_string())
}

/// Il messaggio con cui si dichiara che la password non è nel Portachiavi.
fn password_assente() -> String {
    "nessuna password nel Portachiavi di macOS per questo account: aprila dalla \
     finestra Account e salvala, oppure premi «Prova connessione…» dopo averla salvata"
        .to_string()
}

// ---------------------------------------------------------------------------
// Diagnostica della ricezione (IMAP)
// ---------------------------------------------------------------------------

/// Diagnostica di una casella IMAP: i passi parlano direttamente il protocollo,
/// così il testo riportato è quello del server, non una sua parafrasi.
pub struct DiagnosticaImap {
    host: String,
    port: u16,
    username: String,
    /// `None` se il Portachiavi non ha una password per l'account: i primi
    /// quattro passi funzionano lo stesso, solo `accesso` lo segnala.
    password: Option<String>,
}

impl DiagnosticaImap {
    /// Costruisce la diagnostica da parametri già pronti. La password si passa
    /// **solo** qui, presa dal Portachiavi.
    pub fn new(host: String, port: u16, username: String, password: Option<String>) -> Self {
        DiagnosticaImap {
            host,
            port,
            username,
            password,
        }
    }

    /// Costruisce la diagnostica dell'account, leggendo la password dal
    /// Portachiavi. **Non fallisce** se la password manca: lo dirà il passo
    /// `accesso`.
    pub fn from_account(account: &Account, secrets: &secrets::Store) -> Self {
        DiagnosticaImap::new(
            account.imap_host.clone(),
            account.imap_port,
            account.username.clone(),
            secrets.get(&account.id).ok(),
        )
    }

    async fn nome_server(&self) -> Result<String, String> {
        let ip = risolvi_nome(&self.host, self.port).await?;
        if ip.is_empty() {
            return Err(format!(
                "il nome «{}» non corrisponde a nessun indirizzo",
                self.host
            ));
        }
        Ok(format!("{} → {}", self.host, ip.join(", ")))
    }

    async fn connessione(&self) -> Result<String, String> {
        let tcp = apri_tcp(&self.host, self.port).await?;
        let remoto = tcp
            .peer_addr()
            .map(|a| a.to_string())
            .unwrap_or_else(|_| format!("{}:{}", self.host, self.port));
        Ok(format!(
            "connessione TCP aperta con {remoto} ({}:{})",
            self.host, self.port
        ))
    }

    /// Apre la connessione cifrata e legge il banner iniziale del server.
    async fn apri_sessione(&self) -> Result<(BufReader<TlsStream<TcpStream>>, String), String> {
        let tcp = apri_tcp(&self.host, self.port).await?;
        let flusso = handshake_tls(&self.host, tcp).await?;
        let mut br = BufReader::new(flusso);
        let banner = leggi_riga(&mut br).await?;
        Ok((br, banner))
    }

    async fn certificato(&self) -> Result<String, String> {
        let tcp = apri_tcp(&self.host, self.port).await?;
        let flusso = handshake_tls(&self.host, tcp).await?;
        let cert = flusso
            .get_ref()
            .peer_certificate()
            .map_err(|e| format!("certificato del server non leggibile: {e}"))?
            .ok_or_else(|| {
                format!(
                    "il server {}:{} non ha presentato alcun certificato",
                    self.host, self.port
                )
            })?;
        descrivi_certificato(&cert)
    }

    async fn saluto(&self) -> Result<String, String> {
        let (mut br, banner) = self.apri_sessione().await?;
        let su = banner.to_uppercase();
        if !su.starts_with("* OK") && !su.starts_with("* PREAUTH") {
            return Err(format!("il server non ha salutato come previsto: {banner}"));
        }
        invia_riga(&mut br, "a1 CAPABILITY").await?;
        let righe = risposta_imap(&mut br, "a1").await?;
        let capacita = righe
            .iter()
            .find_map(|r| {
                if r.to_uppercase().starts_with("* CAPABILITY") {
                    Some(r[12..].trim().to_string())
                } else {
                    None
                }
            })
            .unwrap_or_default();
        Ok(format!("{banner} · capacità dichiarate: {capacita}"))
    }

    /// Esegue `LOGIN` sulla sessione già aperta. **Errore con il testo esatto
    /// del server** se l'accesso è rifiutato.
    async fn login(
        &self,
        br: &mut BufReader<TlsStream<TcpStream>>,
    ) -> Result<String, String> {
        let password = self.password.clone().ok_or_else(password_assente)?;
        invia_riga(
            br,
            &format!(
                "a2 LOGIN {} {}",
                quota(&self.username),
                quota(&password)
            ),
        )
        .await?;
        let righe = risposta_imap(br, "a2").await?;
        let stato = stato_risposta(&righe, "a2");
        let risposta = togli_tag(righe.last().map(|s| s.as_str()).unwrap_or(""), "a2");
        if stato == "OK" {
            Ok(format!(
                "accesso riuscito come «{}»: {risposta}",
                self.username
            ))
        } else {
            Err(format!("il server ha rifiutato l'accesso: {risposta}"))
        }
    }

    async fn accesso(&self) -> Result<String, String> {
        let (mut br, _banner) = self.apri_sessione().await?;
        self.login(&mut br).await
    }

    async fn cartelle(&self) -> Result<String, String> {
        let (mut br, _banner) = self.apri_sessione().await?;
        self.login(&mut br).await?;
        invia_riga(&mut br, "a3 LIST \"\" \"*\"").await?;
        let righe = risposta_imap(&mut br, "a3").await?;
        if stato_risposta(&righe, "a3") != "OK" {
            let testo = togli_tag(righe.last().map(|s| s.as_str()).unwrap_or(""), "a3");
            return Err(format!("il server non ha elencato le cartelle: {testo}"));
        }
        let nomi = estrai_cartelle(&righe);
        if nomi.is_empty() {
            return Err("il server non ha elencato nessuna cartella".to_string());
        }
        Ok(format!(
            "{} cartelle trovate: {}",
            nomi.len(),
            nomi.join(", ")
        ))
    }
}

#[async_trait]
impl PassiDiagnostica for DiagnosticaImap {
    async fn esegui(&self, passo: Passo) -> Result<String, String> {
        match passo {
            Passo::NomeServer => self.nome_server().await,
            Passo::Connessione => self.connessione().await,
            Passo::Certificato => self.certificato().await,
            Passo::Saluto => self.saluto().await,
            Passo::Accesso => self.accesso().await,
            Passo::Cartelle => self.cartelle().await,
        }
    }

    fn segreti_da_occultare(&self) -> Vec<String> {
        self.password.clone().into_iter().collect()
    }
}

// ---------------------------------------------------------------------------
// Diagnostica dell'invio (SMTP)
// ---------------------------------------------------------------------------

/// Il canale SMTP: in chiaro (prima di `STARTTLS`) o cifrato (TLS implicito, o
/// dopo `STARTTLS`).
enum Canale {
    Chiaro(BufReader<TcpStream>),
    Tls(BufReader<TlsStream<TcpStream>>),
}

impl Canale {
    async fn leggi(&mut self) -> Result<String, String> {
        match self {
            Canale::Chiaro(br) => leggi_riga(br).await,
            Canale::Tls(br) => leggi_riga(br).await,
        }
    }

    async fn invia(&mut self, riga: &str) -> Result<(), String> {
        match self {
            Canale::Chiaro(br) => invia_riga(br, riga).await,
            Canale::Tls(br) => invia_riga(br, riga).await,
        }
    }

    /// Legge una risposta SMTP, che può essere su più righe (`250-…` continua,
    /// `250 …` chiude). Restituisce il codice e il testo completo.
    async fn risposta(&mut self) -> Result<(u16, String), String> {
        let mut testo = String::new();
        for _ in 0..200 {
            let riga = self.leggi().await?;
            if !testo.is_empty() {
                testo.push_str(" · ");
            }
            testo.push_str(&riga);
            let tre: String = riga.chars().take(3).collect();
            let codice = tre
                .parse::<u16>()
                .map_err(|_| format!("risposta del server non leggibile: {riga}"))?;
            let chiude = riga.len() < 4 || riga.as_bytes()[3] == b' ';
            if chiude {
                return Ok((codice, testo));
            }
        }
        Err("risposta del server troppo lunga per essere una risposta SMTP".to_string())
    }

    /// Restituisce la connessione TCP nuda, per l'upgrade `STARTTLS`.
    fn estrai_tcp(self) -> Result<TcpStream, String> {
        match self {
            Canale::Chiaro(br) => Ok(br.into_inner()),
            Canale::Tls(_) => Err("connessione già cifrata: niente STARTTLS".to_string()),
        }
    }
}

/// Diagnostica dell'**invio**: connessione, `EHLO`, TLS (implicito o
/// `STARTTLS`) e `AUTH`. **Non invia nulla**: si ferma all'autenticazione.
pub struct DiagnosticaSmtp {
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    /// Vero per TLS implicito (porta 465), falso per `STARTTLS` (porta 587).
    ssl: bool,
    ehlo: String,
}

/// Una sessione SMTP pronta: il canale, il saluto ricevuto e le capacità
/// dichiarate con `EHLO`.
struct SessioneSmtp {
    canale: Canale,
    saluto: String,
    capacita: String,
}

impl DiagnosticaSmtp {
    /// Costruisce la diagnostica da parametri già pronti.
    pub fn new(
        host: String,
        port: u16,
        username: String,
        password: Option<String>,
        ssl: bool,
    ) -> Self {
        let ehlo = username
            .split_once('@')
            .map(|(_, d)| d.trim().to_string())
            .filter(|d| !d.is_empty())
            .unwrap_or_else(|| "localhost".to_string());
        DiagnosticaSmtp {
            host,
            port,
            username,
            password,
            ssl,
            ehlo,
        }
    }

    /// Costruisce la diagnostica dell'account, con la password dal Portachiavi.
    pub fn from_account(account: &Account, secrets: &secrets::Store) -> Self {
        DiagnosticaSmtp {
            host: account.smtp_host.clone(),
            port: account.smtp_port,
            username: account.username.clone(),
            password: secrets.get(&account.id).ok(),
            ssl: account.smtp_ssl,
            ehlo: nome_ehlo(account),
        }
    }

    async fn nome_server(&self) -> Result<String, String> {
        let ip = risolvi_nome(&self.host, self.port).await?;
        if ip.is_empty() {
            return Err(format!(
                "il nome «{}» non corrisponde a nessun indirizzo",
                self.host
            ));
        }
        Ok(format!("{} → {}", self.host, ip.join(", ")))
    }

    async fn connessione(&self) -> Result<String, String> {
        let tcp = apri_tcp(&self.host, self.port).await?;
        let remoto = tcp
            .peer_addr()
            .map(|a| a.to_string())
            .unwrap_or_else(|_| format!("{}:{}", self.host, self.port));
        Ok(format!(
            "connessione TCP aperta con {remoto} ({}:{})",
            self.host, self.port
        ))
    }

    async fn ehlo(&self, canale: &mut Canale) -> Result<String, String> {
        canale.invia(&format!("EHLO {}", self.ehlo)).await?;
        let (codice, testo) = canale.risposta().await?;
        if codice != 250 {
            return Err(format!("il server ha rifiutato EHLO: {testo}"));
        }
        Ok(testo)
    }

    /// Apre la sessione fino a `EHLO` (con `STARTTLS` se l'account non usa TLS
    /// implicito). Legge il saluto e le capacità: nessun comando di posta.
    async fn apri_sessione(&self) -> Result<SessioneSmtp, String> {
        let tcp = apri_tcp(&self.host, self.port).await?;
        let mut canale = if self.ssl {
            Canale::Tls(BufReader::new(handshake_tls(&self.host, tcp).await?))
        } else {
            Canale::Chiaro(BufReader::new(tcp))
        };
        let (codice, saluto) = canale.risposta().await?;
        if codice != 220 {
            return Err(format!("il server non ha salutato come previsto: {saluto}"));
        }
        let mut capacita = self.ehlo(&mut canale).await?;

        if !self.ssl {
            canale.invia("STARTTLS").await?;
            let (c, t) = canale.risposta().await?;
            if c != 220 {
                return Err(format!("il server ha rifiutato STARTTLS: {t}"));
            }
            let tcp = canale.estrai_tcp()?;
            let flusso = handshake_tls(&self.host, tcp).await?;
            canale = Canale::Tls(BufReader::new(flusso));
            // Dopo STARTTLS il server ripete le capacità, che cambiano (compaiono
            // i meccanismi di accesso): si rilegge.
            capacita = self.ehlo(&mut canale).await?;
        }

        Ok(SessioneSmtp {
            canale,
            saluto,
            capacita,
        })
    }

    async fn saluto(&self) -> Result<String, String> {
        let sessione = self.apri_sessione().await?;
        Ok(format!(
            "{} · capacità dichiarate: {}",
            sessione.saluto, sessione.capacita
        ))
    }

    async fn accesso(&self) -> Result<String, String> {
        let mut sessione = self.apri_sessione().await?;
        let password = self.password.clone().ok_or_else(password_assente)?;
        let meccanismi = meccanismi_auth(&sessione.capacita);

        let (codice, testo) = if meccanismi.iter().any(|m| m == "PLAIN") || meccanismi.is_empty() {
            let blob = base64::engine::general_purpose::STANDARD
                .encode(format!("\0{}\0{}", self.username, password));
            sessione.canale.invia(&format!("AUTH PLAIN {blob}")).await?;
            sessione.canale.risposta().await?
        } else if meccanismi.iter().any(|m| m == "LOGIN") {
            sessione.canale.invia("AUTH LOGIN").await?;
            let (c, t) = sessione.canale.risposta().await?;
            if c != 334 {
                return Err(format!("il server non ha proseguito con AUTH LOGIN: {t}"));
            }
            sessione.canale.invia(&b64(&self.username)).await?;
            let (c2, t2) = sessione.canale.risposta().await?;
            if c2 != 334 {
                return Err(format!("il server ha interrotto AUTH LOGIN: {t2}"));
            }
            sessione.canale.invia(&b64(&password)).await?;
            sessione.canale.risposta().await?
        } else {
            return Err(format!(
                "il server non dichiara un metodo di accesso fra quelli supportati (dichiarati: {})",
                meccanismi.join(" ")
            ));
        };

        if codice == 235 {
            Ok(format!(
                "accesso riuscito come «{}»: {testo}",
                self.username
            ))
        } else {
            Err(format!("il server ha rifiutato l'accesso: {testo}"))
        }
    }

    async fn certificato(&self) -> Result<String, String> {
        let flusso = if self.ssl {
            let tcp = apri_tcp(&self.host, self.port).await?;
            handshake_tls(&self.host, tcp).await?
        } else {
            let tcp = apri_tcp(&self.host, self.port).await?;
            let mut canale = Canale::Chiaro(BufReader::new(tcp));
            let (c, t) = canale.risposta().await?;
            if c != 220 {
                return Err(format!("il server non ha salutato come previsto: {t}"));
            }
            self.ehlo(&mut canale).await?;
            canale.invia("STARTTLS").await?;
            let (c2, t2) = canale.risposta().await?;
            if c2 != 220 {
                return Err(format!("il server ha rifiutato STARTTLS: {t2}"));
            }
            let tcp = canale.estrai_tcp()?;
            handshake_tls(&self.host, tcp).await?
        };
        let cert = flusso
            .get_ref()
            .peer_certificate()
            .map_err(|e| format!("certificato del server non leggibile: {e}"))?
            .ok_or_else(|| {
                format!(
                    "il server {}:{} non ha presentato alcun certificato",
                    self.host, self.port
                )
            })?;
        descrivi_certificato(&cert)
    }
}

/// Codifica base64 di una stringa (per `AUTH LOGIN`).
fn b64(s: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(s)
}

#[async_trait]
impl PassiDiagnostica for DiagnosticaSmtp {
    async fn esegui(&self, passo: Passo) -> Result<String, String> {
        match passo {
            Passo::NomeServer => self.nome_server().await,
            Passo::Connessione => self.connessione().await,
            Passo::Certificato => self.certificato().await,
            Passo::Saluto => self.saluto().await,
            Passo::Accesso => self.accesso().await,
            Passo::Cartelle => Err("l'invio non prova il passo «cartelle»".to_string()),
        }
    }

    fn segreti_da_occultare(&self) -> Vec<String> {
        let mut fuori: Vec<String> = self.password.clone().into_iter().collect();
        if let Some(p) = &self.password {
            // Anche la forma che viaggia sul filo (`AUTH PLAIN` la codifica
            // base64): se un server la ripetesse in un errore, resterebbe
            // comunque nascosta.
            fuori.push(b64(&format!("\0{}\0{}", self.username, p)));
        }
        fuori
    }
}

// ---------------------------------------------------------------------------
// Funzioni pure: si collaudano senza rete
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test_puri {
    use super::*;

    #[test]
    fn l_ordine_dei_passi_e_quello_previsto() {
        let ricezione: Vec<&str> = PASSI_RICEZIONE.iter().map(|p| p.nome()).collect();
        assert_eq!(
            ricezione,
            vec![
                "nome server",
                "connessione",
                "certificato",
                "saluto del server",
                "accesso",
                "cartelle"
            ]
        );
        let invio: Vec<&str> = PASSI_INVIO.iter().map(|p| p.nome()).collect();
        assert_eq!(
            invio,
            vec![
                "nome server",
                "connessione",
                "certificato",
                "saluto del server",
                "accesso"
            ]
        );
    }

    #[test]
    fn le_cartelle_si_estraggano_dalle_righe_list_con_le_virgolette() {
        let righe = vec![
            "* OK [CAPABILITY IMAP4rev1] Dovecot ready.".to_string(),
            "* LIST (\\HasNoChildren) \"/\" \"INBOX\"".to_string(),
            "* LIST (\\HasChildren) \"/\" \"Archivio\"".to_string(),
            "* LIST () \"/\" \"Posta inviata 2024\"".to_string(),
            "a3 OK List completed.".to_string(),
        ];
        assert_eq!(
            estrai_cartelle(&righe),
            vec!["INBOX", "Archivio", "Posta inviata 2024"]
        );
    }

    #[test]
    fn i_nomi_con_accenti_e_spazi_restano_interi() {
        let righe = vec!["* LIST () \"/\" \"Cartella è già più grande\"".to_string()];
        assert_eq!(estrai_cartelle(&righe), vec!["Cartella è già più grande"]);
    }

    #[test]
    fn i_meccanismi_di_accesso_si_leggono_dalla_risposta_ehlo() {
        let risposta = "250-mail.example.it · 250-STARTTLS · 250-AUTH PLAIN LOGIN CRAM-MD5 · 250 SIZE 100000";
        assert_eq!(
            meccanismi_auth(risposta),
            vec!["PLAIN", "LOGIN", "CRAM-MD5"]
        );
        // Stile «vecchio» con il segno di uguale.
        assert_eq!(meccanismi_auth("250-AUTH=PLAIN LOGIN"), vec!["PLAIN", "LOGIN"]);
        // Nessun meccanismo dichiarato.
        assert!(meccanismi_auth("250 SIZE 100000").is_empty());
    }

    #[test]
    fn la_password_non_sopravvive_a_occulta() {
        let testo = "il server ha rifiutato l'accesso: NO [AUTHENTICATIONFAILED] segreta";
        let pulito = occulta(testo, &["segreta".to_string()]);
        assert!(!pulito.contains("segreta"), "testo prodotto: {pulito}");
        assert!(pulito.contains("AUTHENTICATIONFAILED"));
    }

    #[test]
    fn il_riepilogo_nomina_passo_e_causa() {
        let passi = vec![
            PassoEsito {
                passo: "nome server".into(),
                esito: "ok".into(),
                dettaglio: "imaps.esempiohost.it → 192.0.2.42".into(),
            },
            PassoEsito {
                passo: "accesso".into(),
                esito: "errore".into(),
                dettaglio: "il server ha rifiutato l'accesso: NO [AUTHENTICATIONFAILED]".into(),
            },
        ];
        let r = riepilogo_diagnostica(&passi, 6, true);
        assert!(r.contains("passo 2"), "riepilogo: {r}");
        assert!(r.contains("accesso"), "riepilogo: {r}");
        assert!(r.contains("AUTHENTICATIONFAILED"), "riepilogo: {r}");
    }
}

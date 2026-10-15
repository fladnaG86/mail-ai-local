//! Inviti di riunione nel formato iCalendar (blocco G, versione **inviti**).
//!
//! Questo modulo è **tutto logica pura**: non tocca la rete né la cache. Sa
//! leggere un allegato `text/calendar` (o `application/ics`) e crearne uno in
//! uscita, senza dipendere da alcuna libreria di calendario.
//!
//! Cosa copre la v1 (ed è dichiarato):
//! - le proprietà `METHOD`, `UID`, `SEQUENCE`, `SUMMARY`, `DTSTART`, `DTEND`,
//!   `DTSTAMP`, `LOCATION`, `ORGANIZER`, `ATTENDEE`, `DESCRIPTION`, `RRULE`;
//! - il **folding** delle righe (una riga di continuazione comincia con spazio o
//!   tabulazione) e l'**unescaping** (`\n`, `\,`, `\;`, `\\`);
//! - le date in **UTC** (`Z`), con **offset** esplicito (`+HHMM`/`-HHMM`) e
//!   **solo-data** (evento di giornata intera). Un `TZID` non è risolvibile senza
//!   un database dei fusi: la data è letta come ora locale/UTC e lo si dichiara.
//! - la risposta con `METHOD:REPLY` e `PARTSTAT=ACCEPTED|TENTATIVE|DECLINED`.
//!
//! Cosa **non** c'è: le griglie mese/settimana/giorno, il calcolo delle
//! occorrenze di una ricorrenza, i promemoria. Una `RRULE` è letta e descritta;
//! se è complessa lo si dichiara e si mostra la **prima** occorrenza.

use std::sync::atomic::{AtomicU64, Ordering};

/// Prodotto che ha generato il file iCalendar.
pub const PRODID: &str = "-//Outlook AI//Inviti di riunione v1//IT";

/// Stati di un invito (colonna `stato` della tabella `inviti`).
pub const STATI_INVITO: [&str; 5] = ["in_attesa", "accettato", "tentativo", "rifiutato", "annullato"];

/// Un invitato: indirizzo, nome leggibile e il `PARTSTAT` dichiarato.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Invitato {
    pub indirizzo: String,
    pub nome: String,
    /// `PARTSTAT` (es. `NEEDS-ACTION`, `ACCEPTED`). Mai vuoto.
    pub partstat: String,
}

impl Default for Invitato {
    fn default() -> Self {
        Invitato {
            indirizzo: String::new(),
            nome: String::new(),
            partstat: "NEEDS-ACTION".to_string(),
        }
    }
}

/// Un invito di riunione, così come esce dal parser o come lo si costruisce in
/// uscita. Le date sono in **secondi dall'epoca Unix**.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Invito {
    /// `REQUEST`, `CANCEL` o `REPLY` (maiuscolo; `REQUEST` se assente).
    pub metodo: String,
    pub uid: String,
    pub sequenza: i64,
    pub oggetto: String,
    pub inizio: i64,
    /// Fine dell'evento, quando `DTEND` c'è.
    pub fine: Option<i64>,
    /// Vero per un evento di giornata intera (`DTSTART;VALUE=DATE`).
    pub giornata_intera: bool,
    /// `DTSTAMP`, quando presente.
    pub dtstamp: Option<i64>,
    pub luogo: String,
    /// Indirizzo dell'organizzatore (senza `mailto:`).
    pub organizzatore: String,
    /// Nome leggibile dell'organizzatore (`CN`), se dichiarato.
    pub organizzatore_nome: String,
    pub invitati: Vec<Invitato>,
    pub descrizione: String,
    /// Regola di ricorrenza grezza (`RRULE`), se presente.
    pub rrule: Option<String>,
    /// Dichiarazione sulla ricorrenza: `None` se semplice (o assente), il testo
    /// spiega invece cosa la v1 **non** fa con una ricorrenza complessa.
    pub nota_ricorrenza: Option<String>,
}

impl Invito {
    /// Un invito vuoto con il metodo indicato.
    fn vuoto(metodo: &str) -> Invito {
        Invito {
            metodo: metodo.to_string(),
            uid: String::new(),
            sequenza: 0,
            oggetto: String::new(),
            inizio: 0,
            fine: None,
            giornata_intera: false,
            dtstamp: None,
            luogo: String::new(),
            organizzatore: String::new(),
            organizzatore_nome: String::new(),
            invitati: Vec::new(),
            descrizione: String::new(),
            rrule: None,
            nota_ricorrenza: None,
        }
    }
}

/// Dati di una riunione in uscita (dal modulo dell'interfaccia).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatiRiunione {
    pub oggetto: String,
    /// Inizio in secondi dall'epoca Unix.
    pub inizio: i64,
    /// Fine in secondi dall'epoca Unix (facoltativa).
    pub fine: Option<i64>,
    pub luogo: String,
    /// Messaggio accompagnatorio (corpo dell'invito).
    pub descrizione: String,
    pub giornata_intera: bool,
}

// ---------------------------------------------------------------------------
// Folding delle righe e unescaping
// ---------------------------------------------------------------------------

/// Scioglie il **folding** delle righe: una riga che comincia con spazio o
/// tabulazione è la continuazione della precedente (RFC 5545 §3.1). Le righe
/// vuote vengono scartate (non portano proprietà).
pub fn srotola(testo: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for riga in testo.split('\n') {
        let riga = riga.strip_suffix('\r').unwrap_or(riga);
        if let Some(resto) = riga
            .strip_prefix(' ')
            .or_else(|| riga.strip_prefix('\t'))
        {
            if let Some(ultima) = out.last_mut() {
                ultima.push_str(resto);
                continue;
            }
        }
        if riga.is_empty() {
            continue;
        }
        out.push(riga.to_string());
    }
    out
}

/// Scioglie gli escape di un valore testuale iCalendar: `\n`/`\N` → a capo,
/// `\,` → virgola, `\;` → punto e virgola, `\\` → barra rovesciata. Ogni altra
/// sequenza resta com'è (una barra sola non è un escape valido e non si perde).
pub fn srotola_valore(valore: &str) -> String {
    let mut out = String::with_capacity(valore.len());
    let mut chars = valore.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('n') | Some('N') => out.push('\n'),
            Some(',') => out.push(','),
            Some(';') => out.push(';'),
            Some('\\') => out.push('\\'),
            Some(altro) => {
                // Sequenza non riconosciuta: la barra si conserva.
                out.push('\\');
                out.push(altro);
            }
            None => out.push('\\'),
        }
    }
    out
}

/// Applica gli escape a un valore testuale iCalendar (l'inverso di
/// [`srotola_valore`]): barra, punto e virgola, virgola e a capo.
pub fn esc(testo: &str) -> String {
    let mut out = String::with_capacity(testo.len());
    for c in testo.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            ';' => out.push_str("\\;"),
            ',' => out.push_str("\\,"),
            '\n' | '\r' => out.push_str("\\n"),
            altro => out.push(altro),
        }
    }
    out
}

/// Scompone una riga in `(nome, parametri, valore)`. Il nome è maiuscolo; i
/// parametri sono coppie `CHIAVE → valore` (le virgolette si tolgono).
fn componi_riga(riga: &str) -> (String, Vec<(String, String)>, String) {
    // Il valore comincia dopo il primo `:` non racchiuso fra virgolette.
    let mut in_quote = false;
    let mut taglio = None;
    for (i, c) in riga.char_indices() {
        match c {
            '"' => in_quote = !in_quote,
            ':' if !in_quote => {
                taglio = Some(i);
                break;
            }
            _ => {}
        }
    }
    let (testa, valore) = match taglio {
        Some(i) => (&riga[..i], &riga[i + 1..]),
        None => (riga, ""),
    };
    let mut pezzi = testa.split(';');
    let nome = pezzi.next().unwrap_or("").trim().to_ascii_uppercase();
    let params = pezzi
        .filter_map(|p| {
            let (k, v) = p.split_once('=')?;
            Some((
                k.trim().to_ascii_uppercase(),
                v.trim().trim_matches('"').to_string(),
            ))
        })
        .collect();
    (nome, params, valore.to_string())
}

/// Il valore di un parametro, se presente.
fn param<'a>(params: &'a [(String, String)], chiave: &str) -> Option<&'a str> {
    params
        .iter()
        .find(|(k, _)| k == chiave)
        .map(|(_, v)| v.as_str())
}

// ---------------------------------------------------------------------------
// Date: giorni civili ↔ secondi dall'epoca (nessuna dipendenza esterna)
// ---------------------------------------------------------------------------

/// Giorni dal 1970-01-01 per una data civile (algoritmo di Howard Hinnant).
fn giorni_da_civile(anno: i64, mese: i64, giorno: i64) -> i64 {
    let y = if mese <= 2 { anno - 1 } else { anno };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if mese > 2 { mese - 3 } else { mese + 9 };
    let doy = (153 * mp + 2) / 5 + giorno - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// L'inverso: dalla data civile ai secondi dell'epoca (mezzanotte UTC).
fn dati_da_valore(anno: i64, mese: i64, giorno: i64) -> i64 {
    giorni_da_civile(anno, mese, giorno) * 86_400
}

/// Data civile `(anno, mese, giorno)` da giorni dall'epoca.
fn civile_da_giorni(giorni: i64) -> (i64, i64, i64) {
    let z = giorni + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// Una data iCalendar interpretata: i secondi dall'epoca e se è di giornata
/// intera. Il suffisso `note` dichiara ciò che non si è potuto risolvere
/// (per esempio un `TZID`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataLetta {
    pub epoch: i64,
    pub giornata_intera: bool,
    pub nota: Option<String>,
}

/// Interpreta un valore `DTSTART`/`DTEND`/`DTSTAMP`.
///
/// - solo-data (`YYYYMMDD`, o `VALUE=DATE`): giornata intera, mezzanotte UTC;
/// - `YYYYMMDDTHHMMSSZ`: UTC;
/// - `YYYYMMDDTHHMMSS+HHMM` / `-HHMM`: con offset esplicito;
/// - senza suffisso o con `TZID`: ora locale/UTC «flottante» — non si risolve il
///   fuso e lo si dichiara.
pub fn analizza_data(valore: &str, params: &[(String, String)]) -> DataLetta {
    let v = valore.trim();
    let mut nota = None;

    let solo_data = param(params, "VALUE")
        .map(|x| x.eq_ignore_ascii_case("DATE"))
        .unwrap_or(false);
    if solo_data || (v.len() == 8 && v.chars().all(|c| c.is_ascii_digit())) {
        if let Some(epoch) = leggi_solo_data(v) {
            return DataLetta {
                epoch,
                giornata_intera: true,
                nota,
            };
        }
        return DataLetta {
            epoch: 0,
            giornata_intera: true,
            nota: Some("data di giornata intera non interpretabile".to_string()),
        };
    }

    // Data + ora, con eventuale suffisso di zona.
    let Some((data, resto)) = v.split_once('T') else {
        return DataLetta {
            epoch: 0,
            giornata_intera: false,
            nota: Some(format!("data non interpretabile: «{valore}»")),
        };
    };
    let base = match leggi_solo_data(data) {
        Some(e) => e,
        None => {
            return DataLetta {
                epoch: 0,
                giornata_intera: false,
                nota: Some(format!("data non interpretabile: «{valore}»")),
            };
        }
    };
    let (ormi, suffisso) = if let Some(x) = resto.strip_suffix('Z').or_else(|| resto.strip_suffix('z'))
    {
        (x, Some("Z".to_string()))
    } else if let Some(pos) = resto
        .char_indices()
        .find(|(_, c)| *c == '+' || *c == '-')
        .map(|(i, _)| i)
    {
        let (a, b) = resto.split_at(pos);
        (a, Some(b.to_string()))
    } else {
        (resto, None)
    };
    let secondi_giorno = leggi_ora(ormi).unwrap_or(0);
    let mut epoch = base + secondi_giorno;

    match suffisso.as_deref() {
        Some("Z") => {}
        Some(off) if off.len() == 5 => {
            // Offset `+HHMM`/`-HHMM`: si sottrae per tornare in UTC.
            let segno = if off.starts_with('-') { -1 } else { 1 };
            let ore: i64 = off[1..3].parse().unwrap_or(0);
            let minuti: i64 = off[3..5].parse().unwrap_or(0);
            epoch -= segno * (ore * 3600 + minuti * 60);
        }
        _ => {
            // Flottante o con TZID: non si risolve il fuso.
            let tzid = param(params, "TZID");
            nota = Some(match tzid {
                Some(t) => format!(
                    "Data nel fuso «{t}»: senza database dei fusi viene letta come ora locale."
                ),
                None => "Data senza fuso (ora locale) letta come ora locale.".to_string(),
            });
        }
    }

    DataLetta {
        epoch,
        giornata_intera: false,
        nota,
    }
}

/// `YYYYMMDD` → secondi dell'epoca a mezzanotte UTC.
fn leggi_solo_data(v: &str) -> Option<i64> {
    if v.len() != 8 || !v.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let anno: i64 = v[0..4].parse().ok()?;
    let mese: i64 = v[4..6].parse().ok()?;
    let giorno: i64 = v[6..8].parse().ok()?;
    if !(1..=12).contains(&mese) || !(1..=31).contains(&giorno) {
        return None;
    }
    Some(dati_da_valore(anno, mese, giorno))
}

/// `HHMMSS` → secondi dalla mezzanotte (i secondi mancanti valgono 0).
fn leggi_ora(v: &str) -> Option<i64> {
    if v.len() < 4 || v.len() > 6 || !v.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let ore: i64 = v[0..2].parse().ok()?;
    let minuti: i64 = v[2..4].parse().ok()?;
    let secondi: i64 = if v.len() >= 6 {
        v[4..6].parse().ok()?
    } else {
        0
    };
    Some(ore * 3600 + minuti * 60 + secondi)
}

/// Secondi dall'epoca → stringa `YYYYMMDDTHHMMSSZ` (UTC).
pub fn data_utc(epoch: i64) -> String {
    let giorni = epoch.div_euclid(86_400);
    let resto = epoch.rem_euclid(86_400);
    let (anno, mese, giorno) = civile_da_giorni(giorni);
    let ore = resto / 3600;
    let minuti = (resto % 3600) / 60;
    let secondi = resto % 60;
    format!(
        "{anno:04}{mese:02}{giorno:02}T{ore:02}{minuti:02}{secondi:02}Z"
    )
}

/// Secondi dall'epoca → stringa `YYYYMMDD` (solo-data, per gli eventi di
/// giornata intera).
pub fn data_solo(epoch: i64) -> String {
    let giorni = epoch.div_euclid(86_400);
    let (anno, mese, giorno) = civile_da_giorni(giorni);
    format!("{anno:04}{mese:02}{giorno:02}")
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/// Analizza un testo iCalendar e restituisce gli inviti (`VEVENT`) che contiene,
/// nell'ordine in cui compaiono. Un testo senza `VEVENT` dà un elenco vuoto.
///
/// Il `METHOD` è a livello di `VCALENDAR`: vale per tutti gli eventi del file.
pub fn analizza(testo: &str) -> Vec<Invito> {
    let righe = srotola(testo);
    let mut metodo = "REQUEST".to_string();
    let mut corrente: Option<Invito> = None;
    let mut out: Vec<Invito> = Vec::new();

    for riga in &righe {
        let (nome, params, valore) = componi_riga(riga);
        match nome.as_str() {
            "BEGIN" if valore.eq_ignore_ascii_case("VEVENT") => {
                corrente = Some(Invito::vuoto(&metodo));
            }
            "END" if valore.eq_ignore_ascii_case("VEVENT") => {
                if let Some(mut inv) = corrente.take() {
                    if inv.giornata_intera && inv.fine.is_none() {
                        // Regola RFC 5545 §3.6.1: un evento di giornata intera
                        // senza DTEND dura un giorno.
                        inv.fine = Some(inv.inizio + 86_400);
                    }
                    out.push(inv);
                }
            }
            "METHOD" => {
                metodo = valore.trim().to_ascii_uppercase();
                if let Some(c) = corrente.as_mut() {
                    c.metodo = metodo.clone();
                }
            }
            _ => {
                if let Some(c) = corrente.as_mut() {
                    leggi_proprieta(c, &nome, &params, &valore);
                }
            }
        }
    }
    out
}

/// Applica una proprietà all'invito in costruzione.
fn leggi_proprieta(c: &mut Invito, nome: &str, params: &[(String, String)], valore: &str) {
    match nome {
        "UID" => c.uid = valore.trim().to_string(),
        "SEQUENCE" => c.sequenza = valore.trim().parse().unwrap_or(0),
        "SUMMARY" => c.oggetto = srotola_valore(valore),
        "DTSTART" => {
            let d = analizza_data(valore, params);
            c.inizio = d.epoch;
            c.giornata_intera = d.giornata_intera;
        }
        "DTEND" => {
            let d = analizza_data(valore, params);
            if d.epoch > 0 {
                c.fine = Some(d.epoch);
            }
        }
        "DTSTAMP" => {
            let d = analizza_data(valore, params);
            if d.epoch > 0 {
                c.dtstamp = Some(d.epoch);
            }
        }
        "LOCATION" => c.luogo = srotola_valore(valore),
        "DESCRIPTION" => c.descrizione = srotola_valore(valore),
        "ORGANIZER" => {
            c.organizzatore = indirizzo_da(valore);
            c.organizzatore_nome = param(params, "CN").unwrap_or("").to_string();
        }
        "ATTENDEE" => {
            c.invitati.push(Invitato {
                indirizzo: indirizzo_da(valore),
                nome: param(params, "CN").unwrap_or("").to_string(),
                partstat: param(params, "PARTSTAT")
                    .filter(|p| !p.trim().is_empty())
                    .unwrap_or("NEEDS-ACTION")
                    .to_ascii_uppercase(),
            });
        }
        "RRULE" => {
            let r = valore.trim().to_string();
            c.nota_ricorrenza = nota_ricorrenza(&r);
            c.rrule = Some(r);
        }
        _ => {}
    }
}

/// Estrae l'indirizzo da `mailto:utente@host` (o da una URI già nuda).
fn indirizzo_da(valore: &str) -> String {
    let v = valore.trim();
    let senza_mailto = v
        .strip_prefix("mailto:")
        .or_else(|| v.strip_prefix("MAILTO:"))
        .unwrap_or(v);
    senza_mailto.trim().to_string()
}

// ---------------------------------------------------------------------------
// Ricorrenze: cosa la v1 fa e cosa dichiara di non fare
// ---------------------------------------------------------------------------

/// Dichiarazione sulla ricorrenza. `None` per una ricorrenza **semplice**
/// (`FREQ` con, al più, `INTERVAL`/`COUNT`/`UNTIL`): la prima occorrenza è
/// l'evento stesso. Con regole più ricche (`BYDAY`, `BYMONTH`, `BYSETPOS`, …)
/// il testo dice che la v1 mostra **solo la prima occorrenza** e non calcola le
/// altre.
pub fn nota_ricorrenza(rrule: &str) -> Option<String> {
    let r = rrule.trim();
    if r.is_empty() {
        return None;
    }
    let chiavi: Vec<String> = r
        .split(';')
        .filter_map(|p| p.split_once('='))
        .map(|(k, _)| k.trim().to_ascii_uppercase())
        .collect();
    let complesse = [
        "BYDAY",
        "BYMONTHDAY",
        "BYMONTH",
        "BYYEARDAY",
        "BYWEEKNO",
        "BYSETPOS",
        "BYHOUR",
        "BYMINUTE",
        "WKST",
    ];
    let quali: Vec<&str> = complesse
        .iter()
        .filter(|k| chiavi.iter().any(|x| x == **k))
        .copied()
        .collect();
    if quali.is_empty() {
        None
    } else {
        Some(format!(
            "Ricorrenza complessa ({}): la v1 mostra solo la prima occorrenza, non calcola le altre.",
            quali.join(", ")
        ))
    }
}

/// Una descrizione breve della ricorrenza, per l'interfaccia (es. «settimanale,
/// 5 volte»). `None` se non è una ricorrenza.
pub fn descrivi_ricorrenza(rrule: &str) -> Option<String> {
    let r = rrule.trim();
    if r.is_empty() {
        return None;
    }
    let mut freq = String::new();
    let mut intervallo = 1i64;
    let mut count: Option<i64> = None;
    for p in r.split(';') {
        let Some((k, v)) = p.split_once('=') else {
            continue;
        };
        match k.trim().to_ascii_uppercase().as_str() {
            "FREQ" => {
                freq = match v.trim().to_ascii_uppercase().as_str() {
                    "DAILY" => "giornaliera",
                    "WEEKLY" => "settimanale",
                    "MONTHLY" => "mensile",
                    "YEARLY" => "annuale",
                    "HOURLY" => "oraria",
                    _ => "ricorrente",
                }
                .to_string()
            }
            "INTERVAL" => intervallo = v.trim().parse().unwrap_or(1),
            "COUNT" => count = v.trim().parse().ok(),
            _ => {}
        }
    }
    if freq.is_empty() {
        return None;
    }
    let mut out = freq;
    if intervallo > 1 {
        out.push_str(&format!(" ogni {intervallo}"));
    }
    if let Some(n) = count {
        out.push_str(&format!(", {n} volte"));
    }
    Some(out)
}

// ---------------------------------------------------------------------------
// Risposta e costruzione dell'invito in uscita
// ---------------------------------------------------------------------------

/// Mappa una risposta dell'utente sul `PARTSTAT` iCalendar. Accetta sia le
/// parole italiane del pannello sia direttamente il `PARTSTAT`.
pub fn partstat_da_risposta(risposta: &str) -> Option<&'static str> {
    match risposta.trim().to_ascii_lowercase().as_str() {
        "accettato" | "accepted" => Some("ACCEPTED"),
        "tentativo" | "tentative" => Some("TENTATIVE"),
        "rifiutato" | "declined" => Some("DECLINED"),
        _ => None,
    }
}

/// Mappa una risposta dell'utente sullo **stato** salvato in cache.
pub fn stato_da_risposta(risposta: &str) -> Option<&'static str> {
    match risposta.trim().to_ascii_lowercase().as_str() {
        "accettato" | "accepted" => Some("accettato"),
        "tentativo" | "tentative" => Some("tentativo"),
        "rifiutato" | "declined" => Some("rifiutato"),
        _ => None,
    }
}

/// Lo stato iniziale di un invito in arrivo: `annullato` per un `CANCEL`,
/// altrimenti `in_attesa`.
pub fn stato_da_metodo(metodo: &str) -> &'static str {
    if metodo.eq_ignore_ascii_case("CANCEL") {
        "annullato"
    } else {
        "in_attesa"
    }
}

/// Un `UID` nuovo per un invito in uscita: unico senza rete né database (millis
/// più un contatore atomico per non ripetersi a parità di millisecondo).
pub fn uid_nuovo() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    static CONTATORE: AtomicU64 = AtomicU64::new(0);
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let n = CONTATORE.fetch_add(1, Ordering::Relaxed);
    format!("{millis}-{n}-invito@outlook-ai.local")
}

/// Righe `BEGIN`/`END` comuni. Costruisce l'involucro `VCALENDAR` con il metodo.
fn involucro(metodo: &str, corpo: &str) -> String {
    format!(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:{PRODID}\r\nCALSCALE:GREGORIAN\r\nMETHOD:{metodo}\r\n{corpo}END:VCALENDAR\r\n"
    )
}

/// Costruisce un invito in uscita (`METHOD:REQUEST`) con organizzatore e
/// invitati. `destinatari` è l'elenco degli indirizzi degli invitati.
pub fn genera_invito(
    dati: &DatiRiunione,
    uid: &str,
    organizzatore: &str,
    organizzatore_nome: &str,
    invitati: &[(String, String)],
    dtstamp: i64,
) -> String {
    let mut ev = String::new();
    ev.push_str("BEGIN:VEVENT\r\n");
    ev.push_str(&format!("UID:{}\r\n", esc(uid)));
    ev.push_str("SEQUENCE:0\r\n");
    ev.push_str(&format!("DTSTAMP:{}\r\n", data_utc(dtstamp)));
    if dati.giornata_intera {
        ev.push_str(&format!("DTSTART;VALUE=DATE:{}\r\n", data_solo(dati.inizio)));
        let fine = dati.fine.unwrap_or(dati.inizio + 86_400);
        ev.push_str(&format!("DTEND;VALUE=DATE:{}\r\n", data_solo(fine)));
    } else {
        ev.push_str(&format!("DTSTART:{}\r\n", data_utc(dati.inizio)));
        let fine = dati.fine.unwrap_or(dati.inizio + 3600);
        ev.push_str(&format!("DTEND:{}\r\n", data_utc(fine)));
    }
    ev.push_str(&format!("SUMMARY:{}\r\n", esc(&dati.oggetto)));
    if !dati.luogo.trim().is_empty() {
        ev.push_str(&format!("LOCATION:{}\r\n", esc(dati.luogo.trim())));
    }
    if !dati.descrizione.trim().is_empty() {
        ev.push_str(&format!("DESCRIPTION:{}\r\n", esc(dati.descrizione.trim())));
    }
    if !organizzatore.trim().is_empty() {
        if organizzatore_nome.trim().is_empty() {
            ev.push_str(&format!("ORGANIZER:mailto:{}\r\n", organizzatore.trim()));
        } else {
            ev.push_str(&format!(
                "ORGANIZER;CN={}:mailto:{}\r\n",
                esc(organizzatore_nome.trim()),
                organizzatore.trim()
            ));
        }
    }
    for (indirizzo, nome) in invitati {
        let ind = indirizzo.trim();
        if ind.is_empty() {
            continue;
        }
        if nome.trim().is_empty() {
            ev.push_str(&format!(
                "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:{ind}\r\n"
            ));
        } else {
            ev.push_str(&format!(
                "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN={}:mailto:{ind}\r\n",
                esc(nome.trim())
            ));
        }
    }
    ev.push_str("END:VEVENT\r\n");
    involucro("REQUEST", &ev)
}

/// Costruisce la risposta a un invito (`METHOD:REPLY`) con lo stesso `UID` e il
/// `PARTSTAT` richiesto. Non invia nulla: la consegna la fa il comando IPC.
pub fn genera_risposta(
    invito: &Invito,
    partstat: &str,
    attendee: &str,
    attendee_nome: &str,
    dtstamp: i64,
) -> String {
    let mut ev = String::new();
    ev.push_str("BEGIN:VEVENT\r\n");
    ev.push_str(&format!("UID:{}\r\n", esc(&invito.uid)));
    ev.push_str(&format!("SEQUENCE:{}\r\n", invito.sequenza));
    ev.push_str(&format!("DTSTAMP:{}\r\n", data_utc(dtstamp)));
    if !invito.oggetto.trim().is_empty() {
        ev.push_str(&format!("SUMMARY:{}\r\n", esc(&invito.oggetto)));
    }
    if !invito.organizzatore.trim().is_empty() {
        ev.push_str(&format!(
            "ORGANIZER:mailto:{}\r\n",
            invito.organizzatore.trim()
        ));
    }
    let nome_param = if attendee_nome.trim().is_empty() {
        String::new()
    } else {
        format!(";CN={}", esc(attendee_nome.trim()))
    };
    ev.push_str(&format!(
        "ATTENDEE;PARTSTAT={partstat}{nome_param}:mailto:{}\r\n",
        attendee.trim()
    ));
    ev.push_str("END:VEVENT\r\n");
    involucro("REPLY", &ev)
}

// ---------------------------------------------------------------------------
// Riconoscimento dell'allegato calendario in un messaggio
// ---------------------------------------------------------------------------

/// Cerca una parte calendario nel messaggio grezzo (RFC 822) e ne restituisce il
/// testo. Guarda prima gli allegati `text/calendar`/`application/ics` (o con
/// nome `.ics`), poi il testo del corpo se contiene direttamente un
/// `BEGIN:VCALENDAR`. `None` se il messaggio non porta alcun invito.
pub fn testo_calendario(grezzo: &[u8]) -> Option<String> {
    let corpo = crate::mail::mime::analizza(grezzo);
    for a in &corpo.allegati {
        let tipo_cal = a.tipo.to_ascii_lowercase().contains("calendar")
            || a.tipo.eq_ignore_ascii_case("application/ics");
        let nome_cal = a.nome.to_ascii_lowercase().ends_with(".ics");
        if tipo_cal || nome_cal {
            return Some(String::from_utf8_lossy(&a.dati).into_owned());
        }
    }
    for testo in [corpo.testo.as_deref(), corpo.html.as_deref()] {
        if let Some(t) = testo {
            if t.contains("BEGIN:VCALENDAR") {
                return Some(t.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un invito di riferimento con folding, escape e `DTSTART` in UTC. Si usa
    /// `concat!` per non far mangiare a Rust gli spazi iniziali delle righe di
    /// continuazione (che sono significativi per il folding iCalendar).
    const INVITO: &str = concat!(
        "BEGIN:VCALENDAR\r\n",
        "VERSION:2.0\r\n",
        "METHOD:REQUEST\r\n",
        "BEGIN:VEVENT\r\n",
        "UID:abc-123@example.it\r\n",
        "SEQUENCE:2\r\n",
        "DTSTAMP:20261010T080000Z\r\n",
        "DTSTART:20261015T130000Z\r\n",
        "DTEND:20261015T143000Z\r\n",
        "SUMMARY:Manutenzione Q4\\, impianto VED\r\n",
        "LOCATION:Capannone 3\r\n",
        "ORGANIZER;CN=Luca Bianchi:mailto:luca@example.it\r\n",
        "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=Mario Rossi:mailto:mar\r\n",
        " io@example.it\r\n",
        "DESCRIPTION:Piano\\ncon dettagli\\; verifica\\, poi invio\r\n",
        "END:VEVENT\r\n",
        "END:VCALENDAR\r\n",
    );

    #[test]
    fn il_folding_e_gli_escape_si_sciolgono() {
        let inviti = analizza(INVITO);
        assert_eq!(inviti.len(), 1);
        let i = &inviti[0];
        assert_eq!(i.metodo, "REQUEST");
        assert_eq!(i.uid, "abc-123@example.it");
        assert_eq!(i.sequenza, 2);
        // Folding: l'indirizzo dell'invitato è stato ricomposto.
        assert_eq!(i.invitati[0].indirizzo, "mario@example.it");
        assert_eq!(i.invitati[0].nome, "Mario Rossi");
        // Escape: virgola e a capo.
        assert_eq!(i.oggetto, "Manutenzione Q4, impianto VED");
        assert_eq!(i.descrizione, "Piano\ncon dettagli; verifica, poi invio");
        assert_eq!(i.luogo, "Capannone 3");
    }

    #[test]
    fn le_date_si_leggono_in_utc_offset_e_giornata_intera() {
        // UTC
        let d = analizza_data("20261015T130000Z", &[]);
        assert_eq!(d.epoch, dati_da_valore(2026, 10, 15) + 13 * 3600);
        assert!(!d.giornata_intera);
        // Offset +02:00 → 11:00 UTC.
        let d = analizza_data("20261015T130000+0200", &[]);
        assert_eq!(d.epoch, dati_da_valore(2026, 10, 15) + 11 * 3600);
        // Solo-data → giornata intera a mezzanotte UTC.
        let d = analizza_data("20261015", &[]);
        assert_eq!(d.epoch, dati_da_valore(2026, 10, 15));
        assert!(d.giornata_intera);
        // VALUE=DATE con parametri.
        let d = analizza_data(
            "20261015",
            &[("VALUE".to_string(), "DATE".to_string())],
        );
        assert!(d.giornata_intera);
        // Un giorno senza DTEND dura un giorno (regola RFC).
        let solo = "BEGIN:VEVENT\r\nUID:x\r\nDTSTART;VALUE=DATE:20261015\r\nEND:VEVENT\r\n";
        let inv = &analizza(solo)[0];
        assert_eq!(inv.fine, Some(dati_da_valore(2026, 10, 15) + 86_400));
    }

    #[test]
    fn una_ricorrenza_semplice_non_produce_nota_complessa() {
        assert_eq!(nota_ricorrenza("FREQ=WEEKLY;COUNT=5"), None);
        assert_eq!(descrivi_ricorrenza("FREQ=WEEKLY;COUNT=5").as_deref(), Some("settimanale, 5 volte"));
        let nota = nota_ricorrenza("FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=1").unwrap();
        assert!(nota.contains("solo la prima occorrenza"));
        assert!(nota.contains("BYDAY"));
    }

    #[test]
    fn un_cancel_ha_metodo_cancel_e_stato_annullato() {
        let testo =
            "BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\nBEGIN:VEVENT\r\nUID:x@example\r\nSEQUENCE:3\r\nSUMMARY:Annullata\r\nDTSTART:20261015T130000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let inv = &analizza(testo)[0];
        assert_eq!(inv.metodo, "CANCEL");
        assert_eq!(stato_da_metodo(&inv.metodo), "annullato");
    }

    #[test]
    fn la_risposta_ha_metodo_reply_uid_e_partstat_giusti() {
        let inv = &analizza(INVITO)[0];
        let ics = genera_risposta(inv, "ACCEPTED", "mario@example.it", "Mario", 1_700_000_000);
        assert!(ics.contains("METHOD:REPLY"));
        assert!(ics.contains("UID:abc-123@example.it"));
        assert!(ics.contains("PARTSTAT=ACCEPTED"));
        assert!(ics.contains("mailto:mario@example.it"));
        assert!(ics.contains("ORGANIZER:mailto:luca@example.it"));
        // E il round-trip: rileggendo la risposta, UID e metodo sono quelli.
        let rilette = analizza(&ics);
        assert_eq!(rilette[0].uid, "abc-123@example.it");
        assert_eq!(rilette[0].metodo, "REPLY");
        assert_eq!(partstat_da_risposta("rifiutato"), Some("DECLINED"));
        assert_eq!(stato_da_risposta("tentativo"), Some("tentativo"));
    }

    #[test]
    fn l_invito_in_uscita_ha_uid_nuovo_e_organizzatore() {
        let dati = DatiRiunione {
            oggetto: "Riunione; verifica".to_string(),
            inizio: dati_da_valore(2026, 10, 20) + 9 * 3600,
            fine: Some(dati_da_valore(2026, 10, 20) + 10 * 3600),
            luogo: "Sala 1".to_string(),
            descrizione: "Punto, settimanale".to_string(),
            giornata_intera: false,
        };
        let uid = "uid-di-prova@outlook-ai.local";
        let ics = genera_invito(
            &dati,
            uid,
            "mario@example.it",
            "Mario Rossi",
            &[("luca@example.it".to_string(), "Luca".to_string())],
            1_700_000_000,
        );
        assert!(ics.contains("METHOD:REQUEST"));
        assert!(ics.contains(&format!("UID:{uid}")));
        assert!(ics.contains("ORGANIZER;CN=Mario Rossi:mailto:mario@example.it"));
        assert!(ics.contains("ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=Luca:mailto:luca@example.it"));
        // Il round-trip rilegge esattamente i campi scritti.
        let inv = &analizza(&ics)[0];
        assert_eq!(inv.uid, uid);
        assert_eq!(inv.oggetto, "Riunione; verifica");
        assert_eq!(inv.luogo, "Sala 1");
        assert_eq!(inv.invitati[0].indirizzo, "luca@example.it");
        assert_eq!(inv.inizio, dati.inizio);
        assert!(uid_nuovo().ends_with("@outlook-ai.local"));
    }
}

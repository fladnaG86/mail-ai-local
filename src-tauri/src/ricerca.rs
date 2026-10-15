//! Ricerca (blocco B): interpretazione della query dell'utente in stile
//! Outlook, costruzione dell'espressione per l'indice FTS5 e costruzione
//! dell'anteprima evidenziata.
//!
//! Tutto ciò che è *puro* vive qui — analisi dei prefissi (`da:`, `oggetto:`,
//! `con:allegato`, `non:letto`), anteprima attorno alla corrispondenza e
//! formattazione ISO della data — così è collaudabile senza database e senza
//! interfaccia. La consultazione vera della cache (FTS5 con ripiego su LIKE)
//! sta in `store::Store::cerca`.
//!
//! Regola della tolleranza: l'espressione di ricerca libera dell'utente viene
//! passata **così com'è** a FTS5, per non togliere gli operatori che l'utente
//! può voler usare; se FTS5 la rifiuta (errore di sintassi) `Store::cerca`
//! ripiega su una ricerca per sottostringa e lo dichiara nel campo `nota` della
//! risposta. La ricerca non va mai in errore per colpa di una query scritta male.

/// Lunghezza massima approssimativa dell'anteprima, in caratteri.
pub const ANTEPRIMA_MAX: usize = 200;

/// Query interpretata: i prefissi in stile Outlook separati dal testo libero.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Query {
    /// Testo libero (le parole senza prefisso), così come scritto dall'utente.
    pub testo: String,
    /// Valore del prefisso `da:` (ricerca sul mittente).
    pub da: Option<String>,
    /// Valore del prefisso `oggetto:` (ricerca sull'oggetto).
    pub oggetto: Option<String>,
    /// Valore del prefisso `a:` (ricerca sul destinatario).
    pub a: Option<String>,
    /// `con:allegato` — solo i messaggi con allegati.
    pub con_allegato: bool,
    /// `senza:allegato` — solo i messaggi **senza** allegati.
    pub senza_allegato: bool,
    /// `non:letto` — solo i messaggi non letti.
    pub non_letto: bool,
    /// `dopo:AAAA-MM-GG` — solo i messaggi con data **successiva** a questa.
    pub dopo: Option<i64>,
    /// `prima:AAAA-MM-GG` — solo i messaggi con data **precedente** a questa.
    pub prima: Option<i64>,
}

impl Query {
    /// Vero quando l'utente non ha scritto nulla di utile.
    pub fn vuota(&self) -> bool {
        self.testo.trim().is_empty()
            && self.da.is_none()
            && self.oggetto.is_none()
            && self.a.is_none()
            && !self.con_allegato
            && !self.senza_allegato
            && !self.non_letto
            && self.dopo.is_none()
            && self.prima.is_none()
    }

    /// Termine da evidenziare nell'anteprima: la prima parola libera, altrimenti
    /// il valore di `oggetto:` o `da:`. Stringa vuota se non c'è nulla.
    pub fn termine_evidenza(&self) -> String {
        self.testo
            .split_whitespace()
            .next()
            .map(|s| s.to_string())
            .or_else(|| self.oggetto.clone())
            .or_else(|| self.da.clone())
            .or_else(|| self.a.clone())
            .unwrap_or_default()
    }
}

/// Interpreta la stringa di ricerca dell'utente.
///
/// Riconosce i prefissi `da:`, `oggetto:`, `a:`, `con:allegato`, `senza:allegato`,
/// `non:letto`, `dopo:AAAA-MM-GG`, `prima:AAAA-MM-GG` (senza distinzione di
/// maiuscole). Un prefisso `con:` o `non:` con un valore diverso non viene
/// riconosciuto e resta testo libero: meglio cercare quella parola che scartarla
/// in silenzio. Una data non valida in `dopo:`/`prima:` resta testo libero.
pub fn analizza_query(raw: &str) -> Query {
    let mut q = Query::default();
    let mut testo = Vec::new();
    for token in raw.split_whitespace() {
        let minuscolo = token.to_lowercase();
        if let Some(resto) = token
            .strip_prefix("da:")
            .or_else(|| token.strip_prefix("DA:"))
        {
            if !resto.is_empty() {
                q.da = Some(resto.to_string());
                continue;
            }
        }
        if let Some(resto) = token
            .strip_prefix("oggetto:")
            .or_else(|| token.strip_prefix("Oggetto:"))
            .or_else(|| token.strip_prefix("OGGETTO:"))
        {
            if !resto.is_empty() {
                q.oggetto = Some(resto.to_string());
                continue;
            }
        }
        if let Some(resto) = token
            .strip_prefix("a:")
            .or_else(|| token.strip_prefix("A:"))
        {
            if !resto.is_empty() {
                q.a = Some(resto.to_string());
                continue;
            }
        }
        if minuscolo == "con:allegato" || minuscolo == "con:allegati" {
            q.con_allegato = true;
            continue;
        }
        if minuscolo == "senza:allegato" || minuscolo == "senza:allegati" {
            q.senza_allegato = true;
            continue;
        }
        if minuscolo == "non:letto" || minuscolo == "non:letti" {
            q.non_letto = true;
            continue;
        }
        if let Some(resto) = minuscolo.strip_prefix("dopo:") {
            if let Some(sec) = epoch_da_data(resto) {
                q.dopo = Some(sec);
                continue;
            }
        }
        if let Some(resto) = minuscolo.strip_prefix("prima:") {
            if let Some(sec) = epoch_da_data(resto) {
                q.prima = Some(sec);
                continue;
            }
        }
        testo.push(token.to_string());
    }
    q.testo = testo.join(" ");
    q
}

/// Campi del modulo «Ricerca avanzata…» (blocco I2): da, oggetto, a, con allegato
/// sì/no, non letti, periodo da/a. Tutti stringhe vuote = nessun filtro.
///
/// La costruzione della query è **pura**: produce la stessa sintassi a prefissi
/// che `analizza_query` sa leggere, quindi il motore FTS5 resta uno solo.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CampiAvanzati {
    pub da: String,
    pub oggetto: String,
    pub a: String,
    /// `Some(true)` = con allegato, `Some(false)` = senza allegato, `None` = non
    /// specificato (nessun filtro sugli allegati).
    pub con_allegato: Option<bool>,
    pub non_letti: bool,
    /// Inizio periodo in `AAAA-MM-GG` (vuoto = nessuno).
    pub periodo_da: String,
    /// Fine periodo in `AAAA-MM-GG` (vuoto = nessuno).
    pub periodo_a: String,
}

/// Costruisce la stringa di ricerca dai campi del modulo avanzato. I campi
/// vuoti si omettono; una data non valida si omette (meglio che una query
/// muta). Con tutti i campi vuoti restituisce la stringa vuota.
pub fn costruisci_query_avanzata(c: &CampiAvanzati) -> String {
    let mut parti: Vec<String> = Vec::new();
    let valore = |s: &str| s.trim().replace(char::is_whitespace, " ");
    let da = valore(&c.da);
    if !da.is_empty() {
        parti.push(format!("da:{da}"));
    }
    let oggetto = valore(&c.oggetto);
    if !oggetto.is_empty() {
        parti.push(format!("oggetto:{oggetto}"));
    }
    let a = valore(&c.a);
    if !a.is_empty() {
        parti.push(format!("a:{a}"));
    }
    match c.con_allegato {
        Some(true) => parti.push("con:allegato".to_string()),
        Some(false) => parti.push("senza:allegato".to_string()),
        None => {}
    }
    if c.non_letti {
        parti.push("non:letto".to_string());
    }
    if epoch_da_data(&c.periodo_da).is_some() {
        parti.push(format!("dopo:{}", c.periodo_da.trim()));
    }
    if epoch_da_data(&c.periodo_a).is_some() {
        parti.push(format!("prima:{}", c.periodo_a.trim()));
    }
    parti.join(" ")
}

/// Data `AAAA-MM-GG` (o `AAAA-MM-GGTHH:MM:SS`) → secondi dall'epoca Unix (UTC).
/// `None` se la data non è nel formato atteso o non è una data reale.
pub fn epoch_da_data(s: &str) -> Option<i64> {
    let s = s.trim();
    let mut parti = s.splitn(2, 'T');
    let giorno = parti.next()?;
    let orario = parti.next();
    let d: Vec<&str> = giorno.split('-').collect();
    if d.len() != 3 {
        return None;
    }
    let anno: i64 = d[0].parse().ok()?;
    let mese: i64 = d[1].parse().ok()?;
    let giorno_m: i64 = d[2].parse().ok()?;
    if !(1..=12).contains(&mese) || !(1..=31).contains(&giorno_m) {
        return None;
    }
    let mut sec = giorni_da_civile(anno, mese, giorno_m) * 86_400;
    if let Some(h) = orario {
        let p: Vec<&str> = h.split(':').collect();
        let ore: i64 = p.first().and_then(|x| x.parse().ok()).unwrap_or(0);
        let minuti: i64 = p.get(1).and_then(|x| x.parse().ok()).unwrap_or(0);
        let secondi: i64 = p.get(2).and_then(|x| x.parse().ok()).unwrap_or(0);
        sec += ore * 3600 + minuti * 60 + secondi;
    }
    Some(sec)
}

/// Giorni dall'epoca per una data civile (inverso di `data_civile`).
fn giorni_da_civile(anno: i64, mese: i64, giorno: i64) -> i64 {
    let y = if mese <= 2 { anno - 1 } else { anno };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if mese > 2 { mese - 3 } else { mese + 9 };
    let doy = (153 * mp + 2) / 5 + giorno - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Espressione passata a `MATCH` dell'indice FTS5: il testo libero così com'è,
/// per lasciare all'utente gli operatori di FTS5 (frasi, `OR`, prefissi `*`).
pub fn espressione_fts(testo: &str) -> String {
    testo.trim().to_string()
}

/// Parole su cui costruire la ricerca per sottostringa (ripiego). I token fatti
/// di soli segni (`"`, `*`, `(`, …) — avanzi di sintassi FTS5 — vengono scartati:
/// altrimenti farebbero fallire per costruzione un confronto `LIKE`.
pub fn parole_sottostringa(testo: &str) -> Vec<String> {
    testo
        .split_whitespace()
        .filter(|w| w.chars().any(|c| c.is_alphanumeric()))
        .map(|w| w.to_string())
        .collect()
}

/// Anteprima attorno alla corrispondenza: un frammento di circa `ANTEPRIMA_MAX`
/// caratteri con il termine cercato racchiuso fra « ». Cerca prima nel corpo,
/// poi nell'oggetto; se non trova il termine restituisce l'inizio del corpo.
pub fn anteprima(corpo: Option<&str>, oggetto: Option<&str>, termine: &str) -> String {
    let testo = normalizza(corpo.unwrap_or(""));
    let term = termine.trim();
    if term.is_empty() {
        return taglia(&testo, ANTEPRIMA_MAX);
    }
    if let Some((start, len)) = trova_ci(&testo, term) {
        return finestra_evidenziata(&testo, start, len);
    }
    let ogg = normalizza(oggetto.unwrap_or(""));
    if let Some((start, len)) = trova_ci(&ogg, term) {
        return finestra_evidenziata(&ogg, start, len);
    }
    taglia(&testo, ANTEPRIMA_MAX)
}

/// Data in secondi dall'epoca Unix → stringa ISO 8601 in UTC
/// (`2026-10-12T15:26:00Z`). Nessuna dipendenza esterna: calcolo diretto.
pub fn iso_da_epoch(secondi: i64) -> String {
    let giorni = secondi.div_euclid(86_400);
    let resto = secondi.rem_euclid(86_400);
    let (ore, minuti, sec) = (resto / 3600, (resto % 3600) / 60, resto % 60);
    let (anno, mese, giorno) = data_civile(giorni);
    format!("{anno:04}-{mese:02}-{giorno:02}T{ore:02}:{minuti:02}:{sec:02}Z")
}

/// Giorno civile (anno, mese, giorno) dal numero di giorni dall'epoca
/// (algoritmo di Howard Hinnant, valido per date reali).
fn data_civile(giorni: i64) -> (i64, i64, i64) {
    let z = giorni + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let anno = if m <= 2 { y + 1 } else { y };
    (anno, m, d)
}

/// Sostituisce a capo e tabulazioni con spazi e comprime gli spazi ripetuti.
fn normalizza(testo: &str) -> String {
    let mut out = String::with_capacity(testo.len());
    let mut spazio = false;
    for c in testo.chars() {
        if c.is_whitespace() {
            spazio = true;
        } else {
            if spazio && !out.is_empty() {
                out.push(' ');
            }
            spazio = false;
            out.push(c);
        }
    }
    out
}

/// Primi `max` caratteri, con i puntini se il testo è stato tagliato.
fn taglia(testo: &str, max: usize) -> String {
    let t: Vec<char> = testo.chars().collect();
    if t.len() <= max {
        return testo.to_string();
    }
    let mut out: String = t[..max].iter().collect();
    out.push('…');
    out
}

/// Posizione (in caratteri) e lunghezza della prima occorrenza di `term` in
/// `testo`, senza distinzione di maiuscole.
fn trova_ci(testo: &str, term: &str) -> Option<(usize, usize)> {
    let t: Vec<char> = testo.chars().collect();
    let m: Vec<char> = term.chars().collect();
    if m.is_empty() || m.len() > t.len() {
        return None;
    }
    let confronto: Vec<char> = m
        .iter()
        .map(|c| c.to_lowercase().next().unwrap_or(*c))
        .collect();
    for start in 0..=(t.len() - m.len()) {
        let finestra: Vec<char> = t[start..start + m.len()]
            .iter()
            .map(|c| c.to_lowercase().next().unwrap_or(*c))
            .collect();
        if finestra == confronto {
            return Some((start, m.len()));
        }
    }
    None
}

/// Frammento attorno alla corrispondenza, termine fra « », con ellissi ai bordi
/// quando il testo è troncato.
fn finestra_evidenziata(testo: &str, start: usize, mlen: usize) -> String {
    let t: Vec<char> = testo.chars().collect();
    let inizio = start.saturating_sub(60);
    let fine = (start + mlen + 140).min(t.len());
    let mut out = String::new();
    if inizio > 0 {
        out.push('…');
    }
    out.extend(&t[inizio..start]);
    out.push('«');
    out.extend(&t[start..start + mlen]);
    out.push('»');
    out.extend(&t[start + mlen..fine]);
    if fine < t.len() {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn i_prefissi_stile_outlook_vengono_separati_dal_testo() {
        let q = analizza_query("da:luca oggetto:piano non:letto con:allegato manutenzione");
        assert_eq!(q.da.as_deref(), Some("luca"));
        assert_eq!(q.oggetto.as_deref(), Some("piano"));
        assert!(q.non_letto);
        assert!(q.con_allegato);
        assert_eq!(q.testo, "manutenzione");
    }

    #[test]
    fn un_prefisso_sconosciuto_resta_testo_libero() {
        let q = analizza_query("con:tutto Deleghe");
        assert!(!q.con_allegato);
        assert_eq!(q.testo, "con:tutto Deleghe");
    }

    #[test]
    fn l_anteprima_evidenzia_il_termine_fra_virgolette() {
        let corpo = "Buongiorno, come concordato preparo il piano di manutenzione per il fermo impianto di dicembre.";
        let a = anteprima(Some(corpo), Some("Piano Q4"), "manutenzione");
        assert!(a.contains("«manutenzione»"), "anteprima: {a}");
        assert!(a.len() <= ANTEPRIMA_MAX + 20, "anteprima troppo lunga: {a}");
    }

    #[test]
    fn l_anteprima_ripiega_sull_oggetto_quando_il_corpo_non_contiene_il_termine() {
        let a = anteprima(
            Some("corpo senza la parola"),
            Some("Riunione Q4"),
            "riunione",
        );
        assert!(a.contains("«Riunione»"), "anteprima: {a}");
    }

    #[test]
    fn la_data_diventa_iso_utc() {
        assert_eq!(iso_da_epoch(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_da_epoch(1_760_000_000), "2025-10-09T08:53:20Z");
    }
}

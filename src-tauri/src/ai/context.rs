//! Costruzione del contesto del thread con budget di token (task 6.1, Milestone 6).
//!
//! Il contesto che entra nel prompt è costruito dai messaggi del thread **dal più
//! recente all'indietro**: si accumulano finché il budget di token regge e si
//! smette al primo messaggio che non entra più. I messaggi esclusi sono sempre
//! i più vecchi (un blocco contiguo in testa al thread), così il testo può
//! dichiararli all'utente con la formula "esclusi N messaggi precedenti".
//!
//! La stima dei token è deliberatamente grossolana e prudente (caratteri/4 con un
//! margine di sicurezza del 15% più un overhead fisso per messaggio): non serve
//! il conteggio esatto del tokenizer, serve non sfondare la finestra del modello.
//!
//! Il testo prodotto è numerato `[1]`, `[2]`, … **dal più vecchio incluso al più
//! recente**, perché i prompt (`docs/ai-prompts.md`) chiedono al modello di citare
//! la fonte con quell'indice e presentano il thread "dal più vecchio al più
//! recente".

/// Un messaggio del thread, nella forma minimale che serve al contesto.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessaggioThread {
    /// Mittente come mostrato nella lista (es. `Mario Rossi <mario@example.it>`).
    pub da: String,
    /// Data di ricezione in secondi dall'epoca Unix (UTC).
    pub data: i64,
    /// Oggetto del messaggio, se presente.
    pub oggetto: Option<String>,
    /// Testo del corpo, già estratto dal MIME.
    pub testo: String,
}

/// Contesto pronto da inserire nel prompt, con la contabilità delle esclusioni.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Contesto {
    /// Testo numerato dei messaggi inclusi, dal più vecchio al più recente.
    pub testo: String,
    /// Quanti messaggi del thread sono entrati nel contesto.
    pub messaggi_inclusi: usize,
    /// Quanti messaggi (i più vecchi) sono stati esclusi per budget.
    pub esclusi: usize,
}

/// Budget di token predefinito per il contesto di un thread.
pub const BUDGET_TOKEN_DEFAULT: usize = 8000;

/// Rapporto stimato fra caratteri e token (stima grezza, all'italiana).
const CARATTERI_PER_TOKEN: f64 = 4.0;

/// Margine di sicurezza sulla stima: meglio tagliare un messaggio di troppo che
/// sfondare la finestra del modello.
const MARGINE: f64 = 1.15;

/// Overhead fisso stimato per messaggio (righe `Da:`/`Data:`/`Oggetto:` e
/// separatori), in token.
const OVERHEAD_MESSAGGIO: usize = 20;

/// Stima il numero di token di un testo: caratteri/4, con il margine di sicurezza.
pub fn stima_token(testo: &str) -> usize {
    let caratteri = testo.chars().count() as f64;
    (caratteri / CARATTERI_PER_TOKEN * MARGINE).ceil() as usize
}

/// Costruisce il contesto del thread entro il budget di token indicato.
///
/// I messaggi vanno passati in ordine cronologico (il più vecchio per primo).
/// Il messaggio più recente entra **sempre**, anche se da solo supera il budget:
/// un contesto vuoto non servirebbe a nulla e l'assistente deve poter vedere
/// almeno l'ultima mail. `esclusi` conta quanti messaggi più vecchi sono rimasti
/// fuori.
pub fn costruisci(messaggi: &[MessaggioThread], budget_token: usize) -> Contesto {
    let totale = messaggi.len();
    if totale == 0 {
        return Contesto {
            testo: String::new(),
            messaggi_inclusi: 0,
            esclusi: 0,
        };
    }

    // Prima passata: dalla coda (più recente) verso la testa, si somma il costo
    // stimato finché resta sotto il budget. `inclusi_da` è l'indice del più
    // vecchio messaggio che entra.
    let mut usati = 0usize;
    let mut inclusi_da = totale;
    for i in (0..totale).rev() {
        let costo = stima_token(&blocco(&messaggi[i], 0)) + OVERHEAD_MESSAGGIO;
        // L'ultimo messaggio (il più recente) entra sempre.
        if inclusi_da == totale {
            usati += costo;
            inclusi_da = i;
            continue;
        }
        if usati + costo > budget_token {
            break;
        }
        usati += costo;
        inclusi_da = i;
    }

    // Seconda passata: rendering con gli indici definitivi (dal più vecchio
    // incluso, che è `[1]`, al più recente).
    let mut testo = String::new();
    for (pos, m) in messaggi[inclusi_da..].iter().enumerate() {
        if pos > 0 {
            testo.push('\n');
        }
        testo.push_str(&blocco(m, pos + 1));
    }

    Contesto {
        testo,
        messaggi_inclusi: totale - inclusi_da,
        esclusi: inclusi_da,
    }
}

/// Rende un messaggio come blocco numerato del contesto.
fn blocco(m: &MessaggioThread, indice: usize) -> String {
    let oggetto = m
        .oggetto
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "(nessun oggetto)".to_string());
    format!(
        "[{indice}] Da: {}\nData: {}\nOggetto: {}\n{}",
        m.da,
        formatta_data(m.data),
        oggetto,
        m.testo
    )
}

/// Formatta una data Unix (UTC) come `AAAA-MM-GG HH:MM`, senza dipendenze
/// esterne.
fn formatta_data(epoch: i64) -> String {
    let giorni = epoch.div_euclid(86_400);
    let secondi = epoch.rem_euclid(86_400);
    let (anno, mese, giorno) = civile_da_giorni(giorni);
    format!(
        "{anno:04}-{mese:02}-{giorno:02} {:02}:{:02}",
        secondi / 3600,
        (secondi % 3600) / 60
    )
}

/// Converte i giorni trascorsi dall'epoca in (anno, mese, giorno) — algoritmo
/// civile di Howard Hinnant, valido anche per date precedenti al 1970.
fn civile_da_giorni(giorni: i64) -> (i64, u32, u32) {
    let z = giorni + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn data_unix_formattata_in_utc() {
        // 2023-11-14 22:13:20 UTC
        assert_eq!(formatta_data(1_700_000_000), "2023-11-14 22:13");
    }

    #[test]
    fn stima_con_margine_maggiore_dei_caratteri_quarti() {
        assert!(stima_token("aaaa") >= 1);
        // 400 caratteri -> ~100 token grezzi, un po' di più col margine.
        assert!(stima_token(&"a".repeat(400)) >= 115);
    }
}

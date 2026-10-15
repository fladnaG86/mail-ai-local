//! Assistente IA in lettura (Milestone 6): contesto del thread con budget di
//! token, client locale/cloud con consenso obbligatorio per il cloud, registro
//! di tracciabilità senza contenuti, e i template dei prompt versionati.
//!
//! I template vivono qui come **costanti versionate** (`PROMPT_VERSION`):
//! cambiarli è una modifica al comportamento dell'app e va rivista come il
//! codice. La fonte è `docs/ai-prompts.md`; qui i testi sono identici, con i
//! segnaposto `{contesto}`, `{mittente}`, `{tono}`, `{nome_mittente_utente}`,
//! `{lingua_destinazione}`, `{testo}`.

pub mod audit;
pub mod client;
pub mod context;

/// Versione dei template dei prompt. Registrata nel log cloud insieme all'hash
/// del testo inviato (spec §6).
pub const PROMPT_VERSION: &str = "v1";

/// Temperatura per riassunto, estrazione azioni e controllo del tono.
pub const TEMPERATURA_BASSA: f32 = 0.2;

/// Temperatura per le bozze di risposta.
pub const TEMPERATURA_BOZZA: f32 = 0.5;

/// Modello locale predefinito. È solo un default: il modello resta configurabile
/// (Milestone 8) e nessun nome è obbligatorio.
pub const MODELLO_LOCALE_DEFAULT: &str = "thinkingcap-27b";

/// Modello cloud predefinito (OpenRouter).
pub const MODELLO_CLOUD_DEFAULT: &str = "openai/gpt-4o-mini";

/// Tono predefinito della bozza (`formale | diretto | breve`).
pub const TONO_DEFAULT: &str = "diretto";

/// Lingua di destinazione predefinita per la traduzione.
pub const LINGUA_DESTINAZIONE_DEFAULT: &str = "inglese";

/// Riassunto del thread (`docs/ai-prompts.md` §1).
pub const TEMPLATE_RIASSUNTO: &str = r#"Sei un assistente che aiuta un sistemista a leggere la posta di lavoro. Riassumi il thread qui sotto.

Regole:
- Scrivi in {lingua_risposte}, al massimo 6 righe.
- Indica in modo esplicito: cosa è stato chiesto, chi lo ha chiesto, entro quando, cosa manca.
- Ogni frase che riporta un fatto cita la fonte con l'indice del messaggio, per esempio [2].
- Se un'informazione non c'è nel thread, scrivi "non è indicato nel thread". Non dedurre date, importi
  o nomi che non compaiono.
- Non aggiungere commenti, saluti o premesse.

Thread (dal più vecchio al più recente):
{contesto}

Rispondi in questo formato:
RIASSUNTO: <testo>
AZIONI: <elenco puntato con almeno una fonte ciascuno, oppure "nessuna">"#;

/// Bozza di risposta alla mail più recente (`docs/ai-prompts.md` §2).
pub const TEMPLATE_BOZZA: &str = r#"Scrivi la bozza di risposta alla mail più recente del thread.

Contesto:
- Mittente a cui rispondere: {mittente}
- Tono richiesto: {tono}   (formale | diretto | breve)
- Chi scrive: {nome_mittente_utente}
- Lingua: {lingua_risposte}

Regole:
- Massimo 8 righe, nessun allegato, nessuna promessa che non sia nel thread.
- Se servono informazioni che non hai (date, importi, disponibilità), lascia un segnaposto esplicito
  fra parentesi quadre, per esempio [data da confermare], invece di inventare.
- Non inventare nomi di colleghi, reparti o progetti.
- Non firmare: la firma la aggiunge il client.
- Rispondi SOLO con il testo della mail, senza oggetto e senza commenti.

Thread:
{contesto}"#;

/// Estrazione di azioni e scadenze in JSON (`docs/ai-prompts.md` §3).
pub const TEMPLATE_AZIONI: &str = r#"Estrai le azioni e le scadenze dal thread qui sotto.

Restituisci SOLO un oggetto JSON con questa forma:
{
  "azioni": [
    { "cosa": "testo breve", "chi": "persona o 'io'", "entro": "AAAA-MM-GG oppure null",
      "fonte": 2, "testo_originale": "frase esatta del messaggio" }
  ],
  "scadenze_assenti": "true se il thread parla di una scadenza senza darne la data"
}

Regole:
- Nessuna azione dedotta dal tono: solo azioni scritte nel thread.
- "chi" è una persona o "io"; se non è indicato, usa "io" solo se il contesto è chiaro.
- "entro" compilato solo se la data è scritta nel messaggio, altrimenti null.
- "fonte" è l'indice del messaggio ([1], [2], …).
- "testo_originale" è la frase esatta del messaggio da cui proviene l'azione.
- I valori testuali sono in {lingua_risposte}; le chiavi JSON restano in italiano.
- Se non c'è alcuna azione, "azioni" è un elenco vuoto. Non aggiungere commenti fuori dal JSON.

Thread (dal più vecchio al più recente):
{contesto}"#;

/// Traduzione di un messaggio (`docs/ai-prompts.md` §4).
pub const TEMPLATE_TRADUCI: &str = r#"Traduci in {lingua_destinazione} il messaggio qui sotto. Conserva la formattazione, non tradurre i nomi
propri, gli indirizzi email, i codici e i numeri di pratica. Non aggiungere commenti.

Messaggio:
{testo}"#;

/// Le quattro azioni IA in lettura.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Azione {
    /// Riassunto del thread con le fonti.
    Riassumi,
    /// Estrazione di azioni e scadenze (output JSON grezzo).
    Azioni,
    /// Traduzione di un messaggio.
    Traduci,
    /// Bozza di risposta alla mail più recente.
    BozzaRisposta,
}

impl Azione {
    /// Riconosce l'azione dal nome usato dall'interfaccia.
    pub fn da_nome(nome: &str) -> Option<Azione> {
        match nome {
            "riassumi" => Some(Azione::Riassumi),
            "azioni" => Some(Azione::Azioni),
            "traduci" => Some(Azione::Traduci),
            "bozza_risposta" => Some(Azione::BozzaRisposta),
            _ => None,
        }
    }

    /// Nome dell'azione, come compare nel registro e nel comando IPC.
    pub fn nome(&self) -> &'static str {
        match self {
            Azione::Riassumi => "riassumi",
            Azione::Azioni => "azioni",
            Azione::Traduci => "traduci",
            Azione::BozzaRisposta => "bozza_risposta",
        }
    }

    /// Temperatura di campionamento: bassa per riassunto/azioni/traduzione,
    /// 0.5 per le bozze.
    pub fn temperatura(&self) -> f32 {
        match self {
            Azione::BozzaRisposta => TEMPERATURA_BOZZA,
            _ => TEMPERATURA_BASSA,
        }
    }

    /// Vero se l'azione restituisce al client il JSON grezzo del modello
    /// (la formattazione la fa l'interfaccia).
    pub fn output_strutturato(&self) -> bool {
        matches!(self, Azione::Azioni)
    }
}

/// Lingua predefinita delle risposte dell'assistente (impostazione dell'utente).
pub const LINGUA_RISPOSTE_DEFAULT: &str = "italiano";

/// Parametri dei template che non sono il contesto del thread.
#[derive(Debug, Clone)]
pub struct ParametriPrompt {
    /// Mittente a cui rispondere (bozza).
    pub mittente: String,
    /// Nome di chi scrive (bozza).
    pub nome_mittente_utente: String,
    /// Tono richiesto (bozza).
    pub tono: String,
    /// Lingua di destinazione (traduzione).
    pub lingua_destinazione: String,
    /// Lingua in cui l'assistente deve rispondere (riassunto, azioni, bozza).
    pub lingua_risposte: String,
}

impl Default for ParametriPrompt {
    fn default() -> Self {
        ParametriPrompt {
            mittente: String::new(),
            nome_mittente_utente: String::new(),
            tono: TONO_DEFAULT.to_string(),
            lingua_destinazione: LINGUA_DESTINAZIONE_DEFAULT.to_string(),
            lingua_risposte: LINGUA_RISPOSTE_DEFAULT.to_string(),
        }
    }
}

/// Compone il testo del prompt dell'azione a partire dal contesto del thread.
///
/// Per la traduzione `contesto` è il testo (numerato) del thread: il template
/// traduce il messaggio più recente che l'interfaccia ha selezionato.
pub fn componi_prompt(azione: Azione, contesto: &str, p: &ParametriPrompt) -> String {
    match azione {
        Azione::Riassumi => TEMPLATE_RIASSUNTO
            .replace("{lingua_risposte}", &p.lingua_risposte)
            .replace("{contesto}", contesto),
        Azione::Azioni => TEMPLATE_AZIONI
            .replace("{lingua_risposte}", &p.lingua_risposte)
            .replace("{contesto}", contesto),
        Azione::Traduci => TEMPLATE_TRADUCI
            .replace("{lingua_destinazione}", &p.lingua_destinazione)
            .replace("{testo}", contesto),
        Azione::BozzaRisposta => TEMPLATE_BOZZA
            .replace("{mittente}", &p.mittente)
            .replace("{tono}", &p.tono)
            .replace("{nome_mittente_utente}", &p.nome_mittente_utente)
            .replace("{lingua_risposte}", &p.lingua_risposte)
            .replace("{contesto}", contesto),
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn la_lingua_delle_risposte_entra_nei_prompt_e_non_resta_segnaposto() {
        let p = ParametriPrompt {
            lingua_risposte: "inglese".to_string(),
            tono: "breve".to_string(),
            ..Default::default()
        };
        for azione in [Azione::Riassumi, Azione::Azioni, Azione::BozzaRisposta] {
            let prompt = componi_prompt(azione, "thread di prova", &p);
            assert!(
                prompt.contains("inglese"),
                "{azione:?} deve usare la lingua delle risposte indicata dall'utente"
            );
            assert!(
                !prompt.contains("{lingua_risposte}") && !prompt.contains("{tono}"),
                "{azione:?} non deve lasciare segnaposto nel prompt"
            );
        }
    }

    #[test]
    fn riconosce_le_quattro_azioni() {
        for nome in ["riassumi", "azioni", "traduci", "bozza_risposta"] {
            let az = Azione::da_nome(nome).expect("azione nota");
            assert_eq!(az.nome(), nome);
        }
        assert!(Azione::da_nome("invia").is_none());
    }

    #[test]
    fn temperature_per_azione() {
        assert_eq!(Azione::Riassumi.temperatura(), 0.2);
        assert_eq!(Azione::Azioni.temperatura(), 0.2);
        assert_eq!(Azione::Traduci.temperatura(), 0.2);
        assert_eq!(Azione::BozzaRisposta.temperatura(), 0.5);
    }

    #[test]
    fn il_prompt_contiene_il_contesto_e_non_lascia_segnaposto() {
        let p = ParametriPrompt::default();
        let testo = componi_prompt(Azione::Riassumi, "ciao", &p);
        assert!(testo.contains("ciao"));
        assert!(testo.contains("RIASSUNTO:"));
        assert!(!testo.contains("{contesto}"));
    }
}

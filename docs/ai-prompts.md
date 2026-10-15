# Prompt dell'assistente IA

Questi sono i template usati dal kernel (`src-tauri/src/ai/actions.rs`). Vivono nel codice come costanti
versionate: cambiarli è una modifica al comportamento dell'app, quindi va rivista come il codice.

## Regole comuni a tutti i prompt

1. **Nessuna invenzione.** Se l'informazione non è nel contesto fornito, il modello lo dice: "non è
   indicato nel thread". I test devono verificare questo comportamento su un thread che non contiene la
   risposta.
2. **Ogni affermazione cita il messaggio** da cui proviene, con l'indice che forniamo noi (`[1]`, `[2]`, …),
   non con una data o un nome che il modello potrebbe sbagliare.
3. **Nessuna azione sul sistema**: il modello produce testo, non comandi, non invii, non modifiche.
4. **Lingua**: italiano, salvo richiesta esplicita di traduzione.
5. **Nessun dato personale inutile**: nel contesto entrano solo i messaggi del thread, non la rubrica, non
   gli altri messaggi della casella.
6. **Budget**: il contesto è costruito da `ai/context.rs` con un tetto di token; i messaggi esclusi sono
   dichiarati all'utente ("esclusi 12 messaggi precedenti").

## 1 · Riassumi thread

```
Sei un assistente che aiuta un sistemista a leggere la posta di lavoro. Riassumi il thread qui sotto.

Regole:
- Scrivi in italiano, al massimo 6 righe.
- Indica in modo esplicito: cosa è stato chiesto, chi lo ha chiesto, entro quando, cosa manca.
- Ogni frase che riporta un fatto cita la fonte con l'indice del messaggio, per esempio [2].
- Se un'informazione non c'è nel thread, scrivi "non è indicato nel thread". Non dedurre date, importi
  o nomi che non compaiono.
- Non aggiungere commenti, saluti o premesse.

Thread (dal più vecchio al più recente):
{contesto}

Rispondi in questo formato:
RIASSUNTO: <testo>
AZIONI: <elenco puntato con almeno una fonte ciascuno, oppure "nessuna">
```

## 2 · Bozza di risposta

```
Scrivi la bozza di risposta alla mail più recente del thread.

Contesto:
- Mittente a cui rispondere: {mittente}
- Tono richiesto: {tono}   (formale | diretto | breve)
- Chi scrive: {nome_mittente_utente}
- Lingua: italiano

Regole:
- Massimo 8 righe, nessun allegato, nessuna promessa che non sia nel thread.
- Se servono informazioni che non hai (date, importi, disponibilità), lascia un segnaposto esplicito
  fra parentesi quadre, per esempio [data da confermare], invece di inventare.
- Non inventare nomi di colleghi, reparti o progetti.
- Non firmare: la firma la aggiunge il client.
- Rispondi SOLO con il testo della mail, senza oggetto e senza commenti.

Thread:
{contesto}
```

## 3 · Estrai azioni e scadenze

Output **JSON** (il client lo mostra come elenco):

```json
{
  "azioni": [
    { "cosa": "testo breve", "chi": "persona o 'io'", "entro": "AAAA-MM-GG oppure null",
      "fonte": 2, "testo_originale": "frase esatta del messaggio" }
  ],
  "scadenze_assenti": "true se il thread parla di una scadenza senza darne la data"
}
```

Regole: nessuna azione dedotta dal tono; `entro` compilato solo se la data è scritta nel messaggio;
`testo_originale` serve a verificare che l'azione non sia inventata (test: ogni `testo_originale` deve
comparire nel contesto).

## 4 · Traduci

```
Traduci in {lingua_destinazione} il messaggio qui sotto. Conserva la formattazione, non tradurre i nomi
propri, gli indirizzi email, i codici e i numeri di pratica. Non aggiungere commenti.

Messaggio:
{testo}
```

## 5 · Controllo prima dell'invio (deterministico + modello)

I controlli **strutturali** sono in Rust e non usano il modello (task 7.2): allegato citato nel testo ma
assente, testo che parla di allegato nell'oggetto, più di N destinatari, possibile dato sensibile (password,
IBAN, numero di carta, codice fiscale) nel corpo, oggetto vuoto, maiuscole eccessive.

Il modello interviene solo per il **tono**, con questo prompt, e solo se l'utente ha attivato il modello
locale:

```
Valuta se il testo seguente, in una mail di lavoro, può risultare brusco o troppo informale.
Rispondi con una sola riga: OK oppure AVVISO: <motivo breve>. Non riscrivere il testo.

Testo:
{corpo}
```

Il controllo **non blocca mai** l'invio: gli avvisi compaiono nella barra "Controllo prima dell'invio" e
l'utente decide.

## Note di implementazione

- Temperatura bassa (0.2) per riassunti, azioni e controllo del tono; 0.5 per le bozze di risposta.
- I template sono costanti con un numero di versione (`PROMPT_VERSION`), registrato nel log delle
  richieste cloud insieme all'hash del testo inviato (spec §6).
- Il modello locale è il default; i prompt non cambiano fra locale e cloud, cambia solo il destinatario
  della chiamata e la richiesta di consenso.
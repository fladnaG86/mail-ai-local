# Blocco U — Rubrica completa

Richiesta dell'utente (2026-10-17): importazione dai Contatti di macOS, scheda contatto completa, gruppi/liste, aggiunta automatica dei destinatari.

## Stato di partenza

- `contatti` (SQLite): `nome`, `cognome`, `email` **UNIQUE** (una sola), `telefono`, `azienda`, `note`, `creato`, `modificato`.
- Comandi: `contatti_elenco`, `contatto_salva`, `contatto_elimina`, `contatti_importa_vcard`, `contatti_esporta_vcard`, `contatti_suggerisci`.
- Interfaccia: `apriRubrica` (`src/views/contatti.js`), suggerimenti A/Cc/Ccn (`collegaCampoDestinatario`), «Aggiungi ai contatti» dal mittente.

## Scelte di progetto

1. **Compatibilità prima di tutto.** `contatti.email` resta l'email *principale* e chiave unica: suggerimenti, vCard, «Aggiungi ai contatti» e i dati già salvati continuano a funzionare. I campi nuovi sono colonne aggiunte con `migra` (come per `messages`), mai una tabella ricostruita.
2. **Email e telefoni multipli** come JSON in colonne nuove (`email_altre`, `telefoni`: elenco di `{etichetta, valore}`). Un'email non può appartenere a due contatti (né come principale né come altra): il salvataggio lo rifiuta con un errore leggibile.
3. **Gruppi** in due tabelle (`gruppi`, `gruppi_membri` con email, non id: un membro può non essere in rubrica). Nei campi A/Cc il gruppo compare fra i suggerimenti come «Nome gruppo (n)» e, scelto, si **espande** negli indirizzi dei membri: al server non arriva mai un «gruppo», solo indirizzi.
4. **Aggiunta automatica**: dopo un invio riuscito, i destinatari non in rubrica entrano con `origine = "automatico"` (i contatti esistenti non si toccano). Preferenza `rubricaAggiuntaAutomatica` (predefinita: attiva) nel pannello Contatti; in rubrica un filtro «Aggiunti automaticamente» per rivederli o eliminarli.
5. **Contatti di macOS**: si chiede all'app Contatti l'esportazione **vCard** di tutte le schede (AppleScript `vcard of every person`) e la si passa all'importatore vCard già provato, esteso ai campi nuovi. macOS chiede una volta il permesso di automazione («Outlook AI vuole controllare Contatti»): serve `NSAppleEventsUsageDescription` nell'`Info.plist`. Alternativa scartata per ora: framework nativo `Contacts` via Rust/Objective-C (più codice nativo, entitlement dedicato).

## Passi (ognuno: test rossi → codice → test verdi → commit)

| Passo | Contenuto | Prove |
|---|---|---|
| U1 | Schema: colonne `ruolo`, `indirizzo`, `email_altre`, `telefoni`, `origine`; `Contatto` esteso con `#[serde(default)]`; unicità delle email fra principale e altre | Rust: migrazione su DB vecchio, salvataggio, rifiuto duplicati |
| U2 | vCard: `EMAIL`/`TEL` multipli con `TYPE`, `TITLE`, `ADR`, in lettura e scrittura (andata e ritorno) | Rust: import/export con più email e telefoni |
| U3 | Scheda contatto in rubrica: campi nuovi, righe aggiungibili per email e telefoni | JS (jsdom): modifica e salvataggio |
| U4 | Gruppi: tabelle, comandi `gruppi_elenco/salva/elimina`, sezione Gruppi in rubrica, suggerimento ed espansione in A/Cc | Rust + JS |
| U5 | Aggiunta automatica dopo l'invio, preferenza, filtro in rubrica | Rust (`config` + store) + JS |
| U6 | Importa dai Contatti di macOS: comando `contatti_importa_macos` (osascript → vCard → importatore), voce in rubrica, `Info.plist` | Rust sul parser (vCard d'esempio); prova manuale del permesso |

Suggerimenti: i membri e le email «altre» entrano nella ricerca dei suggerimenti (U2/U4).

## Fuori portata

Foto del contatto, sincronizzazione bidirezionale con Contatti di macOS o con CardDAV, rubriche condivise/di directory.

# Struttura dei ribbon di Outlook, letta dai file di definizione

Fonte: `Contents/Resources/outlook_*.ribbon` (XML, non `*.ribbonb` che sono la versione compilata).
Documento di riferimento: serve a **non inventare** l'ordine dei gruppi della barra multifunzione.
Nessun codice Microsoft è copiato: si leggono solo gli identificativi e la sequenza dei gruppi.

## `outlook_calendar_event_tableEnabled.ribbon` — RibbonID `Microsoft.Outlook.Appointment`

**msotcidTabAppointment** (in ordine): `msotcidOLChunkActions` · `msotcidChunkAppointmentMoreOptions` · `msotcidChunkAppointmentOptions` · `msotcidChunkNightMode` · `msotcidVoiceChunkTools`

**msotcidTabMeetingOrganizer** (in ordine): `msotcidOLChunkActions` · `msotcidChunkShowPages` · `msotcidChunkOutlookAttendees` · `msotcidChunkOnlineMeetingOptions` · `msotcidChunkMSTeamsMeeting` · `msotcidChunkAppointmentMoreOptions` · `msotcidChunkAppointmentOptions` · `msotcidVoiceChunkTools`

**msotcidTabMeetingAttendee** (in ordine): `msotcidOLChunkRecordDelete` · `msotcidChunkShowPages` · `msotcidChunkOutlookAttendees` · `msotcidChunkOnlineMeetingOptions` · `msotcidChunkAppointmentMoreOptions` · `msotcidChunkRespond` · `msotcidChunkAppointmentOptions`

**msotcidTabMeetingCancel** (in ordine): `msotcidOLChunkRecordDelete` · `msotcidChunkAppointmentMoreOptions`

**msotcidTabOutlookWrite** (in ordine): `msotcidChunkClipboard` · `msotcidChunkBasicText` · `msotcidChunkNightMode` · `msotcidChunkInclude` · `msotcidChunkTable` · `msotcidChunkIllustrations`

**msotcidTabTableQuickFormats** (in ordine): `msotcidChunkTableLayout` · `msotcidChunkStylesTable`

**msotcidTabTableLayout** (in ordine): `msotcidChunkTableSelection` · `msotcidChunkTableInsert` · `msotcidChunkTableMerge` · `msotcidChunkTableCellSize` · `msotcidChunkTableAlignment`

## `outlook_compose_tableEnabled.ribbon` — RibbonID `Microsoft.Outlook.Mail.Compose`

**msotcidTabNewMailMessage** (in ordine): `msotcidOLChunkSend` · `msotcidOLChunkSendLater` · `msotcidChunkClipboard` · `msotcidChunkBasicText` · `msotcidChunkNightMode` · `msotcidChunkInclude` · `msotcidChunkTable` · `msotcidChunkIllustrations` · `msotcidChunkOutlookMoreOptions` · `msotcidVoiceChunkTools` · `msotcidChunkNames` · `msotcidChunkPictureTools` · `msotcidChunkClassificationLabel`

**msotcidTabMessageOptions** (in ordine): `msotcidChunkMessageFormatNew` · `msotcidChunkNightMode` · `msotcidChunkOutlookEMailFields` · `msotcidChunkZoom` · `msotcidChunkDrmProtect` · `msotcidChunkProofing` · `msotcidChunkOutlookTracking` · `msotcidChunkAccessibility`

**msotcidWebOptionsMenu** (in ordine): `msotcidChunkMessageFormatNew` · `msotcidChunkOutlookEMailFields` · `msotcidChunkThemes` · `msotcidChunkDrmProtect` · `msotcidChunkProofing`

**msotcidTabEditMessage** (in ordine): `msotcidChunkClipboard` · `msotcidChunkBasicText` · `msotcidChunkTable` · `msotcidChunkMessageFormatNew`

**msotcidTabTableQuickFormats** (in ordine): `msotcidChunkTableLayout` · `msotcidChunkStylesTable`

**msotcidTabTableLayout** (in ordine): `msotcidChunkTableSelection` · `msotcidChunkTableInsert` · `msotcidChunkTableMerge` · `msotcidChunkTableCellSize` · `msotcidChunkTableAlignment`

## `outlook_formatting.ribbon` — RibbonID `Microsoft.Outlook.Toolbar.Formatting`

## `outlook_signature_tableEnabled.ribbon` — RibbonID `Microsoft.Outlook.Signature.Compose`

**msotcidTabEditSignature** (in ordine): `msotcidChunkClipboard` · `msotcidChunkBasicText` · `msotcidChunkMessageFormatNew`

**msotcidTabTableQuickFormats** (in ordine): `msotcidChunkTableLayout` · `msotcidChunkStylesTable`

**msotcidTabTableLayout** (in ordine): `msotcidChunkTableSelection` · `msotcidChunkTableInsert` · `msotcidChunkTableMerge` · `msotcidChunkTableCellSize` · `msotcidChunkTableAlignment`

## `outlook_task_tableEnabled.ribbon` — RibbonID `Microsoft.Outlook.Mac.TaskEdit`

**msotcidTabTask** (in ordine): `msotcidOLChunkActions` · `msotcidChunkManageTask` · `msotcidOLChunkRecordDelete` · `msotcidChunkRecurrence` · `msotcidChunkTaskOptions` · `msotcidChunkOutlookMoreOptions` · `msotcidChunkNightMode`

**msotcidTabOutlookWrite** (in ordine): `msotcidChunkClipboard` · `msotcidChunkBasicText` · `msotcidChunkTable` · `msotcidChunkInclude`

**msotcidTabTableQuickFormats** (in ordine): `msotcidChunkTableLayout` · `msotcidChunkStylesTable`

**msotcidTabTableLayout** (in ordine): `msotcidChunkTableSelection` · `msotcidChunkTableInsert` · `msotcidChunkTableMerge` · `msotcidChunkTableCellSize` · `msotcidChunkTableAlignment`


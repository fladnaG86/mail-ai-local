# Colori misurati dall'app Outlook installata

Tabella di riferimento per i token di `design-tokens.css`. **Non è codice né grafica di Microsoft**:
sono i valori numerici dei colori letti dai *cataloghi di asset* dell'app regolarmente installata su questo
Mac (`/Applications/Microsoft Outlook.app`, 16.113.4), scompilati con `assetutil`. Un colore è un dato di
misura, non un'opera: la tabella serve a **non tirare a indovinare** i valori del clone.

## Metodo (rigenerabile)

```bash
R="/Applications/Microsoft Outlook.app/Contents/Resources"
assetutil --info "$R/Assets.car" > /tmp/assets.json
# ogni voce ha Name, Appearance (None = chiaro, NSAppearanceNameDarkAqua = scuro)
# e Color components in sRGB 0..1 -> x255 -> #RRGGBB
```

7781 asset in totale, di cui **686 voci di colore** = **350 nomi unici**, quasi tutti con variante
chiara *e* scura. Sotto, il sottoinsieme rilevante per un client di posta.

## Superfici e chrome

| Nome asset | Chiaro | Scuro |
|---|---|---|
| `BorderMidGrayColor` | `#AEAEAE` | `#000000` |
| `ConversationIndexMessageHoveredBackgroundColor` | `#E2EFFF` | `#2E2E2E` |
| `ConversationIndexMessagePressedBackgroundColor` | `#D2E7FF` | `#464646` |
| `DocsUI/serviceWindowBackgroundColor` | `#EBEBEB` | `#282828` |
| `EFGrayLightModeWithWindowBackgroundColorDarkMode` | `#EFEFEF` | `#323232` |
| `ItemListTextGrayColor` | `#000000` | `#FFFFFF` |
| `MercuryLightModeSeparatorDarkMode` | `#E1DFDD` | `#464646` |
| `MessageListEmphasizedGrayTextColor` | `#605D5A` | `#B3B3B3` |
| `MessageListEmphasizedTextColor` | `#0078D4` | `#4BA0FF` |
| `MessageListFlaggedBackgroundColor` | `#FFFFCC` | `#464646` |
| `MessageListHoveredBackgroundColor` | `#FAF9F8` | `#2E2E2E` |
| `MessageListSelectedBackgroundColor` | `#DDECF8` | `#00307E` |
| `MessageListUnemphasizedTextColor` | `#000000` | `#FFFFFF` |
| `NavPaneBackgroundColor` | `#FFFFFF` | `#1E1E1E` |
| `PreferencesSeparatorColor` | `#E6E6E6` | `#FFFFFF` |
| `PreviewPaneBackgroundColor` | `#D9D9D9` | `#1E1E1E` |
| `PreviewPaneHeaderBackgroundColor` | `#F5F5F5` | `#1E1E1E` |
| `TextFieldBorderColor` | `#C8C6C4` | `#585858` |
| `mercuryLightModeWithBorderColorDarkMode` | `#E1DFDD` | `#4F4F4F` |

## Lista messaggi

| Nome asset | Chiaro | Scuro |
|---|---|---|
| `FocusedInboxButtonTextColor` | `#0072C6` | `#E6E6E6` |
| `FocusedInboxNotificationViewBackgroundColor` | `#F5FAFC` | `#282828` |
| `FocusedInboxNotificationViewTextColor` | `#0067B0` | `#4BA0FF` |
| `TextFolderListRootItemColor` | `#747474` | `#E6E6E6` |

## Pulsanti e accenti

| Nome asset | Chiaro | Scuro |
|---|---|---|
| `BlueButtonPrimaryBackgroundDefaultColor` | `#0078D4` | `#4BA0FF` |
| `BlueButtonPrimaryBackgroundDisabledColor` | `#B2D6F3` | `#3E6998` |
| `BlueButtonPrimaryBackgroundHoveredColor` | `#0176D2` | `#0085F0` |
| `BlueButtonPrimaryBackgroundPressedColor` | `#0273CC` | `#004E8A` |
| `BlueButtonPrimaryBorderDefaultColor` | `#0767B3` | `#4BA0FF` |
| `BlueButtonPrimaryBorderDisabledColor` | `#DEEDF9` | `#3E6998` |
| `BlueButtonPrimaryBorderHoveredColor` | `#0767B3` | `#0085F0` |
| `BlueButtonTextColor` | `#FFFFFF` | `#1E1E1E` |
| `OutlookBlue50LightModeWithPrimaryBlue50DarkMode` | `#0078DA` | `#4BA0FF` |
| `OutlookBlueLightModeWithPrimaryBlueDarkMode` | `#0078DA` | `#4BA0FF` |
| `OutlookBlueLinkColor` | `#54BBFF` | `#4BA0FF` |
| `PageControlSelected` | `#000000` | `#0086F0` |
| `phoenixPrimaryButtonBackgroundColor` | `#0078D4` | `#4BA0FF` |
| `phoenixPrimaryButtonBackgroundDisabledColor` | `#7FBCEA` | `#3E6998` |
| `phoenixPrimaryButtonBackgroundHoverColor` | `#0767B3` | `#3F88D9` |
| `phoenixPrimaryButtonBackgroundSelectedColor` | `#074F87` | `#3068A6` |
| `weatherWidgetEditBorderColor` | `#0078D4` | `#4BA0FF` |
| `weatherWidgetEditDefaultBackground` | `#FFFFFF` | `#464646` |
| `weatherWidgetEditHoverBackground` | `#F5FAFC` | `#414141` |
| `weatherWidgetEditPressedBackground` | `#DDECF8` | `#464646` |

## Selezione e hover

| Nome asset | Chiaro | Scuro |
|---|---|---|
| `BlueLightModeWithHoveredBackgroundColorDarkMode` | `#0767B3` | `#3C80CC` |
| `BlueLightModeWithSelectedBackgroundColorDarkMode` | `#074F88` | `#285383` |
| `Moonstone50LightModeWithSelectedBackgroundDarkMode` | `#C7E0F4` | `#464646` |
| `SelectedSeashellBackgroundColor` | `#F3F2F1` | `#464646` |
| `phoenixFeedbackFeatureButtonBackgroundColor` | `#FFFFFF` | `#323232` |
| `phoenixFeedbackFeatureButtonBackgroundDisabledColor` | `#FFFFFF` | `#323232` |
| `phoenixFeedbackFeatureButtonBackgroundHoverColor` | `#FFFFFF` | `#464646` |
| `phoenixFeedbackFeatureButtonBackgroundSelectedColor` | `#C7E0F4` | `#00307E` |
| `phoenixFeedbackFeatureButtonBorderColor` | `#B3AFAB` | `#B3B3B3` |
| `phoenixFeedbackFeatureButtonBorderDisabledColor` | `#B3AFAB` | `#B3B3B3` |
| `phoenixFeedbackFeatureButtonBorderHoverColor` | `#C7E0F4` | `#4BA0FF` |
| `phoenixFeedbackFeatureButtonLabelColor` | `#212121` | `#E6E6E6` |
| `phoenixFeedbackFeatureButtonLabelDisabledColor` | `#212121` | `#E6E6E6` |
| `seashellLightModeWithHoverBgDarkMode` | `#F3F2F1` | `#414141` |
| `seashellLightModeWithHoverSecondaryButtonDarkMode` | `#F3F2F1` | `#2E2E2E` |
| `seashellLightModeWithWhiteTertiaryDarkMode` | `#F3F2F1` | `#8B8B8B` |
| `secondarySplitMenuButtonDefaultBackgroundColor` | `#FAF9F8` | `#1E1E1E` |
| `secondarySplitMenuButtonDefaultBorderColor` | `#85888B` | `#E6E6E6` |
| `secondarySplitMenuButtonHoverBackgroundColor` | `#E1DFDD` | `#2E2E2E` |
| `secondarySplitMenuButtonPressedBackgroundColor` | `#C8C6C4` | `#464646` |

## Destinatari (pill)

| Nome asset | Chiaro | Scuro |
|---|---|---|
| `outOfOrgContactPillDefaultBorderColor` | `#EFAC85` | `#EF7426` |
| `outOfOrgContactPillHoverBackgroundColor` | `#D78E02` | `#EF7426` |
| `outOfOrgContactPillSelectedColor` | `#EFAC85` | `#EF7426` |
| `unresolvedContactPillBackgroundColor` | `#FFE8E9` | `#D74654` |
| `unresolvedContactPillBorderColor` | `#E63237` | `#D74654` |

## Barre informative e badge

| Nome asset | Chiaro | Scuro |
|---|---|---|
| `CopilotBadgeBackgroundColor` | `#F0F0F0` | `—` |
| `CopilotBadgeTextColor` | `#666666` | `—` |
| `CopilotBannerBackgroundColor` | `#FFFFFF` | `#141414` |
| `CopilotBulletTextColor` | `#666666` | `#FFFFFF` |
| `CopilotCongratsBackgroundColor` | `#FFFFFF` | `#141414` |
| `CopilotDialogBackgroundColor` | `#FAFAFA` | `#2D2D2D` |
| `CopilotGradientEnd` | `#7B83EB` | `—` |
| `CopilotHeadingColor` | `#242424` | `#FFFFFF` |
| `CopilotSeparatorColor` | `#CCCCCC` | `—` |
| `CopilotSubheadingColor` | `#666666` | `#9C9C9C` |
| `InfoBarTextColor` | `#282828` | `#E6E6E6` |
| `M365PremiumBadge1BackgroundColor` | `#E0E0E0` | `—` |
| `M365PremiumBadge1TextColor` | `#616161` | `—` |
| `PromoOfferBadgeBackground` | `#FFFAD6` | `—` |

## Stato messaggio

| Nome asset | Chiaro | Scuro |
|---|---|---|
| `TokenTextHoveredBlueBackgroundColor` | `#DEE8F7` | `#4E4E4E` |
| `TokenTextHoveredGrayBackgroundColor` | `#F4F4F4` | `#0B0B0B` |
| `TokenTextHoveredYellowBackgroundColor` | `#EDCA76` | `#FFFFFF` |
| `TokenTextHoveredYellowBorderColor` | `#D1A147` | `#FBF1CD` |
| `TokenTextSelectedYellowBackgroundColor` | `#DF9300` | `#0078D7` |
| `TokenTextYellowBackgroundColor` | `#FDF2CB` | `#1E1E1E` |
| `TokenTextYellowBorderColor` | `#FACB8E` | `#EBB510` |

## Altri (171 nomi, per lo più calendario/contatti/altre finestre)

Restano disponibili nel catalogo: `AddAccountErrorTextColor`, `AddAccountExchangeTextColor`, `AddAccountFieldLabelTextColor`, `AddAccountGoogleOauthLabelColor`, `AddAccountGoogleOauthTextColor`, `AddAccountKerberosIDTextColor`, `AddAccountLabelTextColor`, `AddAccountLineColor`, `AddAccountLinkButtonColor`, `AddAccountNeedHelpTextColor`, `AddAccountO365TextColor`, `AddAccountPasswordTextColor`, `AddAccountPlaceholderTextColor`, `AddAccountWelcomeTextColor`, `AddAccountWindowBackgroundColor`, `AttachmentsButtonHoveredBackgroundColor`, `AttachmentsThumbnailDescriptionTextColor`, `AttachmentsThumbnailNameTextColor`, `BlackPrimaryLightModeWithPrimaryBlueDarkMode`, `BluePrimaryLightModeWithBlueDarkMode`, `BluePrimaryLightModeWithGrayDarkMode`, `BluePrimaryLightModeWithSelectBackgroundDarkMode`, `BorderAccentMercuryColor`, `BorderAccentSilverColor`, `CreateGroupDomainTextColor`, `CreateGroupPrimaryTextColor`, `CreateGroupWindowBackgroundColor`, `DatePickerBackgroundColor`, `DialogLabelColor`, `DialogLineColor`, `DocsUI/DocStage_RecommendedItem_Background`, `DocsUI/DocStage_SearchBarLabelColor`, `DocsUI/DocStage_TabContentBackgroundColor`, `DocsUI/DocStage_TopBar_BackgroundColor`, `DocsUI/FlyoutBackgroundColor`, `DocsUI/FlyoutDisabledReasonsColor`, `DocsUI/FlyoutLabelColor`, `DocsUI/IdentityViewController_BlockingUIColor`, `DocsUI/MenuButtonFocusedBackgroundColor`, `DocsUI/MenuButtonMousedownBackgroundColor`, `DocsUI/SignInButtonTextColor`, `DocsUI/emptyViewBackgroundColor`, `DocsUI/identityViewController_PopoverBackgroundColor`, `DocsUI/newEmptyTextColor`, `DocsUI/openVerticalDividerColor`, `DocsUI/recentTitleNoSelectionColor`, `DocsUI/recentViewBackgroundColor`, `DocsUI/shareMenuFlyoutContentBackgroundColor`, `DocsUI/shareMenuNativeContentBackgroundColor`, `DocsUI/shareMenuNativePopoverBackgroundColor`, `DocsUI/shareMenuPrimaryBackgroundColor`, `DocsUI/shareMenuSecondaryBackgroundColor`, `DocsUI/shareMenuWebViewDefaultPopoverBackgroundColor`, `DocsUI/shareMenuWebViewPopoverBackgroundColor`, `DocsUI/thumbnailTitleColor`, `DotPageControlRingActiveColor`, `DotPageControlRingInactiveColor`, `FRE_Button_Text_Color`, `FolderPickerBoxBackgroundColor`, `FullEventComposeBackgroundColor`, `GrayPrimaryLightModeWithWhiteSecondaryDarkMode`, `GroupCardBlueColor`, `GroupCardRedColor`, `HeaderBackgroundColor`, `IAPCardBackground`, `LPCPopoverBackground`, `LightGrayLightModeWithWhiteTertiary50DarkMode`, `M365PremiumTextPrimaryColor`, `M365PremiumTextSecondaryColor`, `MeetingMessageButtonBorderColor`, `MeetingMessageButtonTextColor`, `MercuryLightModeWithSelectedBackgroundColorDarkMode`, `MessageComposeBoxColor`, `MidGrayBackgroundColor`, `MiniCalDarkDateText`, `MiniCalHighlightedBackgroundColor`, `MiniCalLightDateText`, `MiniCalMediumDateText`, `MiniCalMonthTextColor`, `MoonstoneColor`, `MoonstoneLightModeWithWhitePrimaryDarkMode`, `NoteSubjectTextColor`, `NoteTitlePlaceholderTextColor`, `OLMSettingsAccessBoxBackgroundColor`, `OutlookBlackLightModeWithWhitePrimaryDarkMode`, `OutlookDefaultBlackColor`, `OutlookDefaultRedColor`, `OutlookDefaultWhiteColor`, `OutlookDynamicBlueColor`, `OutlookLegacyBlackColor`, `OutlookLegacyDarkBlueColor`, `OutlookLegacyWhiteColor`, `Outlook_macOS_Assets/Color-1`, `Outlook_macOS_Assets/Color-2`, `Outlook_macOS_Assets/Color-3`, `Outlook_macOS_Assets/Color-4`, `Outlook_macOS_Assets/Color-5`, `Outlook_macOS_Assets/Color-6`, `Outlook_macOS_Assets/Color-7`, `PageControlBackground`, `PreferencesRowDarkBackgroundColor`, `PreferencesRowLightBackgroundColor`, `ProposeNewTimeLabelTextColor`, `ProposeNewTimeLegendBackgroundColor`, `ProposeNewTimeLegendTextColor`, `RedPrimaryLightModeWithRedDarkMode`, `SMIMESettingBackgroundColor`, `SkyColor`, `SubjectTextColor`, `TextCategoryAccountTableHeaderColor`, `TextDarkGrayColor`, `TextLightColor`, `TextMediumGrayColor`, `TextOverDueColor`, `TextPrimaryColor`, `TextRegularColor`, `TextRegularGray`, `TimelineDateBackgroundColor`, `TimelineDateTextColor`, `TimelineHourTextColor`, `TimelineTimeBackgroundColor`, `TimelineTimeBorderColor`, `TopBarColor`, `TxpSummaryCardBackgroundColor`, `WeatherErrorAndRefreshingTextColor`, `WhitePrimaryLightModeWithTextBgColorDarkMode`, `WhiteSmokeColor`, `alabasterLightModeWithControlBgDarkMode`, `darkGrayLightModeWithWhiteSecondaryDarkMode`, `dynamicBlackTextColor`, `grayLightModeWithSecondWhiteDarkMode`, `grayPrimary80LightModeWithWhiteTertiaryDarkMode`, `grayPrimaryLightModeWithWhiteTertiaryDarkMode`, `messageWarningYellowLightModeWithAlmostBlackDarkMode`, `mustardLightModeWithOrangeDarkMode`, `phoenixFeedbackBoxBackgroundColor`, `phoenixFeedbackMainViewBackgroundColor`, `phoenixFeedbackSeperatorLineColor`, `phoenixLinkButtonTextColor`, `phoenixPromoBodyColor`, `phoenixPromoPanelSecondaryButtonBackgroundColor`, `phoenixPromoPanelSecondaryButtonBackgroundDisabledColor`, `phoenixPromoPanelSecondaryButtonLabelColor`, `phoenixPromoPanelSecondaryButtonLabelDisabledColor`, `phoenixPromoSecondaryButtonBackgroundColor`, `phoenixPromoSecondaryButtonBackgroundDisabledColor`, `phoenixPromoSecondaryButtonBackgroundHoverColor`, `phoenixPromoSecondaryButtonBackgroundSelectedColor`, `phoenixPromoSecondaryButtonBorderColor`, `phoenixPromoSecondaryButtonBorderDisabledColor`, `phoenixPromoSecondaryButtonLabelColor`, `phoenixPromoSecondaryButtonLabelDisabledColor`, `phoenixPromoTitleColor`, `silverLightModeWithWhiteSecondaryDarkMode`, `silverLightModeWithWhiteTertiaryDarkMode`, `warningYellowLightModeWithSelectBlueDarkMode`, `weatherWidgetBackgroundColor`, `weatherWidgetFooterBackground`, `weatherWidgetHorizontalLineColor`, `weatherWidgetLocationTextSecondPart`, `weatherWidgetPredictionTextColor`, `weatherWidgetSecondaryBackground`, `weatherWidgetSettingsFooterBackground`, `weatherWidgetTemperaturePopUpTextColor`, `weatherWidgetTertiaryText`, `weatherWidgetUnderPageBackgroundColor`, `weatherWidgetVerticalLineColor`, `white75LightModeWithControlBG75DarkMode`, `whiteLightModeWithControlBGDarkMode`, `whiteLightModeWithWhitePrimaryDarkMode`, `yellowLightLightModeWithSelectedBGColorDarkMode`.

## Nota di fedeltà

I valori del `design-tokens.css` scritti a mano **coincidono** con quelli misurati tranne:
`--accent` chiaro (era `#0078D7`, misurato `#0078D4`), `--row-sel-bg` chiaro (era `#E0EBF7`,
misurato `#DDECF8`) e `--row-sel-bg` scuro (era `#102F79`, misurato `#00307E`).

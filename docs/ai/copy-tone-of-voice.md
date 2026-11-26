# Copy Tone of Voice — User-Facing Text

> Canonical rule referenced by `.devin/rules/copy-tone-of-voice.md`.

## What this covers

Every string a non-technical user can see: translations seeds and patches,
entity/column labels, help tooltips (`x_help_key`, `description` projected
to the UI), empty states, validation messages, notifications, placeholders,
CTAs.

## The rule

- **Meaningful and explanatory.** Say what the thing DOES for the user, not
  what it IS for the machine. "Who receives the email — one or more
  addresses", never "Recipient addresses — a JSON array".
- **User-friendly, not dev-tech-language.** A form reader is configuring a
  business rule, not reading an API contract. Wire-format details
  (`JSON array`, `z.record`, `{kind:"map"}`, `payload_schema`) do NOT
  belong in user-facing copy.
- **Technical terms are allowed when they help a non-technical user** —
  established vocabulary the user already met or needs to recognize:
  `BCP-47`, `ISO`, `GDPR`, `CRON`, `uuid`, `email`, domain names like
  `variables` (the template's own declared keys). An acronym that explains
  is fine; jargon that describes the implementation is not.
- **Write the benefit first, mechanics second** — "Who is silently copied
  — hidden from other recipients" beats "Blind carbon-copy addresses".
- **Translations keep the same voice** — localizing is re-expressing the
  meaning in that language's natural phrasing, never transliterating
  dev-speak.

## Concrete jargon cases

- **"Key" / "Chiave" / "…schlüssel" is storage jargon.** A field whose
  value is an i18n key is named after the translated content the user
  gets — never after the stored format: `Label Key` → `Label
  translation` / `Traduzione etichetta`, `Description (translation key)`
  → `Description translation` / `Traduzione descrizione`, `Error label
  key` → `Error label translation` / `Traduzione etichetta errore`.
  Help/hint text MAY quote a real key as an example (`e.g.
  shell.settings.roles.label.admin`) — there the key itself is the
  information.

## Smell test

Read the string as a domain user who has never seen the codebase. If it
describes a type, a shape, or a storage format instead of the user's goal
— rewrite it.

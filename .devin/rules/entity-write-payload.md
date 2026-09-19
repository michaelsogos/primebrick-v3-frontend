# Devin Rule: Entity Write Payload (`{entity}` envelope)

## Trigger
- Applies to ALL non-bulk single-entity CUD calls to `/api/v1/entities/*`
  (BE) and `/ws/:module/api/v1/entities/*` (microservices via proxy).

## Rules
1. **Always wrap**: `POST`/`PUT` bodies MUST be
   `{ entity: <fields>, translations?: PendingTranslationRow[] }`.
   Flat entity fields at the body root are rejected by the BE (400).
2. **Use the shared type**: `EntityWritePayload<E>` and
   `PendingTranslationRow` from `$lib/api-types`.
3. **Translations sibling**: only for entities that support piggybacked
   translations (e.g. `config_entry`). Requires `TRANSLATIONS_MANAGE` on the
   BE. `/entities/translation` itself takes `{entity}` only — a
   `translations` sibling there is rejected.
4. **Exempt** (do NOT wrap): bulk endpoints (`bulk-*`, `duplicate`,
   `restore` — they use stream/temp-table bodies), RPC endpoints
   (`/api/v1/auth/*`, `/api/v1/system/*`), and `DELETE`.
5. **Error paths**: Zod issue paths are now `entity.<field>` — map form
   field errors accordingly.
6. **Microservices** (e.g. `provider` via `apiFetchExt`): same `{entity}`
   envelope, `translations` sibling is rejected there too.

## Enforcement
- AI agent MUST NOT introduce new callers that send flat entity bodies.
- AI agent MUST reuse `EntityWritePayload<E>` rather than redeclaring the
  shape inline.

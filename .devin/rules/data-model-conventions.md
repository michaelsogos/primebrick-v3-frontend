---
trigger: always_on
---

# Devin Rule: Data Model Conventions

## Trigger
- Applies to ALL code in this repository that defines, reads, or returns data models: TS types/interfaces, API response types, component props, store shapes.

## Golden Rules

### 1. Snake_case everywhere — maximum portability
- TS interfaces/types, JSON response parsing, component props, store shapes — ALL use `snake_case`.
- A field named `oidc_issuer_url` in the BE JSON response must be `oidc_issuer_url` in the TS type, `oidc_issuer_url` in the component prop, `oidc_issuer_url` in the store.
- NEVER rename `oidc_issuer_url` → `oidcIssuerUrl` (camelCase) between layers. The name is identical from BE JSON to FE component.
- **Exception:** External API adapters (e.g. a third-party library that expects camelCase). The camelCase is dictated by the external API, not by our convention. The translation happens ONLY at the adapter boundary, never in our internal data flow.

### 2. No DTO transformation between BE JSON responses and TS models
- If the BE JSON response returns `{ oidc_issuer_url, casdoor_endpoint, auth_mode }`, the TS interface is `{ oidc_issuer_url, casdoor_endpoint, auth_mode }` — NOT a rebuilt object with renamed fields.
- Do NOT create intermediate DTO classes/interfaces that rename fields between the JSON response and the internal TS model. The JSON response shape IS the TS model.
- Prefer using the raw response shape directly over field-by-field rebuilding (`return { fieldA: resp.field_a, fieldB: resp.field_b, ... }`).

### 3. No transformation unless it's a real TYPE conversion
- ALLOWED: `string` (JSON) → `boolean` (TS) via `=== "true"` or `Boolean()`. This is a type conversion, not data-quality enforcement.
- ALLOWED: `string` (JSON) → `enum` (TS) via validation. This is type safety, not data-quality enforcement.
- FORBIDDEN: Lowercasing, uppercasing, trimming, or any data-quality normalization on the READ path (API response parsing). Data quality is enforced at the BE write/upsert path. The FE read path returns exactly what the BE JSON has.
- FORBIDDEN: Fallback defaults when parsing API responses (e.g. `|| "http://localhost:8000"`, `?? ""`). A value either exists in the JSON or it doesn't — `undefined` if missing, `null` if explicitly null, `string` if present. Mandatory-field checks throw or show an error, they don't fake a default.

### 4. JSON API responses: snake_case for entity-shaped responses
- If this project exposes JSON API responses (e.g. microservices or BFF routes), the field names MUST be `snake_case` — matching the BE convention.
- Do NOT create a DTO layer that renames entity fields to camelCase before returning JSON. If the entity is already snake_case, pass it through directly.
- If the response is a computed shape (not an entity), field names are still snake_case for consistency.

### 5. No fake defaults for configuration data
- AUTH CONFIG, IDP config, gateway config — these are NOT "nice to have". Either the value is in the BE JSON response or the system is misconfigured.
- NEVER mix real config data with fake fallback defaults (`|| "ACME"`, `|| "x-gateway-secret"`). A fake config that looks valid but points to the wrong IDP is worse than a clear error.
- Mandatory fields: validate and throw/show error if missing. Optional fields: stay `undefined` if missing.

## Enforcement
- AI agent MUST use `snake_case` for all new TS interfaces, types, component props, store shapes, and any JSON response fields.
- AI agent MUST NOT create DTO classes/interfaces that rename fields between BE JSON responses and TS models.
- AI agent MUST NOT add lowercasing/uppercasing/trimming on the read path (API response parsing) — only at the write path (form submission).
- AI agent MUST NOT add fallback string-literal defaults (`|| "..."`, `?? ""`) for configuration data.
- AI agent MUST use raw response shapes directly instead of field-by-field rebuilding, unless a field needs a real type conversion.
- When reviewing existing code, flag any camelCase field names in entity-shaped TS types or JSON responses as violations.

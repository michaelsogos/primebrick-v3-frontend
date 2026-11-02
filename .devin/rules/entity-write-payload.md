# Devin Rule: Entity Write Payload (`{entity}` envelope)

## Trigger
- Applies to ALL non-bulk single-entity CUD calls to `/api/v1/entities/*`
  (BE) and `/svc/:module/api/v1/entities/*` (microservices via proxy).

## Canonical doc
**`docs/ai/entity-write-payload.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST NOT introduce new callers that send flat entity bodies.
- AI agent MUST reuse `EntityWritePayload<E>` rather than redeclaring the
  shape inline.

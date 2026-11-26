# Display coercion — `String(x)` vs `toDisplayString(x)`

Referenced by: `check-standards` rule `display-coerce` (.svelte files) and
`check:stringify` (`tools/check-stringify.ts`, the typed pass on .ts files).

## The boundary

Wire data decoded by `extJsonParse` is typed `unknown` / `Record<string, unknown>`
— row cells, filter values, config `value`, API `detail`, `data.profile?.*`.

`String(x)` on such values **silently corrupts the UI**:

| input | `String(x)` | `toDisplayString(x)` |
|---|---|---|
| `{a: 1}` | `"[object Object]"` | `'{"a":1}'` (via `extJsonStringify`) |
| `null` | `"null"` (literal text in a label) | `""` |
| `undefined` | `"undefined"` | `""` |
| `42` / `"s"` | `"42"` / `"s"` | identical |

No throw, no tripwire — the corruption ships to the user. That is why the
gate exists: the compiler, not the dev, remembers the boundary.

## The rule

- **`toDisplayString` (from `@primebrick/ui`)**: wire `unknown` → display —
  `row[uid]`, `row['field']`, `record[k]`, filter `f.value`, `entry.value`,
  `res.detail`, API payloads, `catch (e)` on `unknown` errors.
- **`String(x)`**: stays legal and preferred on **typed** values —
  `number`/`string`/`boolean`/`bigint`, loop indexes (`fi`, `i`), and objects
  with a real `toString` (`URL`, `Date`, `Error` — never plain records).
- **`.toString()` explicit call**: on union types like `RequestInfo | URL`
  (fetch args, test mocks) — semantically identical to `String()` for the
  values that actually occur, and provably intentional.
- **`instanceof Error` guard for catch vars**: `e instanceof Error ? e.message : toDisplayString(e)` — `String(e)` on a thrown wire object would print `[object Object]` or crash-shaped noise.

```ts
// WRONG — row[uid] is `unknown` wire data
const uuid = String(row[uid]);
{#each rows as r (String(r[uid]))}

// RIGHT — the display boundary is explicit
const uuid = toDisplayString(row[uid]);
{#each rows as r (toDisplayString(r[uid]))}

// ALSO RIGHT — typed values need no helper
qs.set('page', String(query.page));            // page: number
qs.append(`filters[${fi}][value][]`, toDisplayString(v)); // fi: number, v: unknown
```

## Enforcement

- `.ts` files: `pnpm check:stringify` — typed pass, flags `String(expr)` and
  `${expr}` where `expr` is not provably string-safe (`any`/`unknown`/plain
  objects flag; primitives and types with a declared `toString` pass).
  Runs inside `pnpm check` and `pnpm prebuild`.
- `.svelte` files: `check-standards` rule `display-coerce` — syntactic
  approximation (no type info in markup): `String(member/call/index)` and
  `${x[y]}` flag. Record/index access in markup is dominantly wire data.

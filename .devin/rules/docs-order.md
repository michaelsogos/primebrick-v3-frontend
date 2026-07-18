# Devin Rule: Documentation Page Order

## Trigger
- Applies whenever AI agent creates or deletes a page in `docs/user-guide/`.

## Actions
1. When creating a new `.mdx` page, add its slug to `docs/user-guide/_order.json`
   in the logical reading position (not at the end, not alphabetically).
2. When deleting a page, remove its slug from `_order.json`.
3. The `_order.json` `pages` array defines the sidebar order on
   docs.primebrick.dev. Pages not listed are appended alphabetically after
   listed pages.
4. `index.mdx` is always excluded — it's the category landing page, not a
   sidebar item.

## _order.json format
```json
{
  "pages": ["overview", "authentication", "rbac", "..."]
}
```

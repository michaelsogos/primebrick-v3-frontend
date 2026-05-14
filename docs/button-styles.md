# Button Style Standards

This document defines the standard styles for primary and secondary buttons in the Primebrick frontend. These standards should be applied to all new buttons going forward.

## Standard Button Styles

### Secondary Buttons

**Use for:** Cancel actions, secondary options, non-destructive actions

**Required classes:**
```svelte
class="border border-neutral-300 hover:border-neutral-400 hover:bg-accent hover:text-accent-foreground hover:scale-105 transition-all"
```

**Example:**
```svelte
<Button
  variant="secondary"
  class="border border-neutral-300 hover:border-neutral-400 hover:bg-accent hover:text-accent-foreground hover:scale-105 transition-all"
  onclick={handleCancel}
>
  {$t('common.cancel')}
</Button>
```

### Primary Buttons

**Use for:** Primary actions, confirmations, destructive actions (with `variant="destructive"`)

**Required classes:**
```svelte
class="hover:bg-{color}/80 hover:scale-105 transition-all"
```

Where `{color}` is the button's base color:
- For standard primary: `bg-primary` → `hover:bg-primary/80`
- For destructive: `bg-destructive` → `hover:bg-destructive/80`
- For warning: `bg-warning` → `hover:bg-warning/80`

**Examples:**

Standard primary:
```svelte
<Button
  variant="default"
  class="hover:bg-primary/80 hover:scale-105 transition-all"
  onclick={handleConfirm}
>
  Confirm
</Button>
```

Destructive (delete):
```svelte
<Button
  variant="destructive"
  class="hover:bg-destructive/80 hover:scale-105 transition-all"
  onclick={handleDelete}
>
  {$t('common.delete')}
</Button>
```

Warning (export):
```svelte
<Button
  class="bg-warning text-warning-foreground hover:bg-warning/80 hover:scale-105 transition-all"
  onclick={handleExport}
>
  Export
</Button>
```

## Soft Buttons

**Note:** Soft buttons (`variant="soft"`) should NOT have these additional styles applied. Keep them as-is without the border, hover scale, or transition effects.

## Style Breakdown

### Border (Secondary Only)
- `border border-neutral-300` - Light neutral border for visibility
- `hover:border-neutral-400` - Slightly darker border on hover

### Hover Effects
- `hover:bg-accent hover:text-accent-foreground` - Background and text color change on hover (secondary)
- `hover:bg-{color}/80` - More intense background color on hover (primary)
- `hover:scale-105` - Subtle scale up (1.05x) on hover for better interactivity

### Transitions
- `transition-all` - Smooth transitions for all properties

## When to Apply These Standards

Apply these styles to:
- All dialog confirmation buttons
- All form action buttons (save, cancel, delete)
- All bulk action buttons
- All toolbar action buttons

Do NOT apply to:
- Soft buttons (keep them as-is)
- Icon-only buttons in toolbars (unless they're primary actions)
- Navigation links
- Toggle switches

## Examples in Codebase

See `EntityListTable.svelte` for reference implementations:
- Export dialog (lines 3116-3148)
- Delete confirmation dialog (lines 3056-3074)
- Bulk delete confirmation dialog (lines 3087-3107)

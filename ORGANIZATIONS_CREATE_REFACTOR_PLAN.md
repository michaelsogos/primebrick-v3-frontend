# Organizations Create Page Refactor Plan

## Problem Analysis

### Current State
- **File location**: `src/routes/(app)/organizations/create/+page.svelte`
- **Breadcrumb**: Organizations (→ /system/settings) / New
- **Path**: `/organizations/create`

### Issues
1. **Filesystem structure**: Page is not under the proper settings hierarchy
2. **Breadcrumb structure**: Missing intermediate levels (System, Settings)
3. **Breadcrumb functionality**: Organizations should be a dropdown menu like customers

### Desired State
- **File location**: `src/routes/(app)/system/settings/organizations/create/+page.svelte`
- **Breadcrumb**: System / Settings / Organizations (dropdown) / Nuovo
- **Path**: `/system/settings/organizations/create`
- **Dropdown menu**: Organizations segment should show the same tabs as settings page:
  - Profile
  - Organizations (current)
  - Security
  - Modules
  - Templates

## Implementation Plan

### Step 1: Create Settings Menu Segment Function
**File**: `src/lib/shell/crm-breadcrumb.ts` (or create new `settings-breadcrumb.ts`)

Create a function similar to `crmModuleMenuSegment` that generates a dropdown menu for settings tabs:

```typescript
export function settingsTabMenuSegment(args: {
  pathname: string;
  t: (key: string) => string;
}): AppBreadcrumbMenuSegment {
  const pathname = args.pathname;
  return {
    kind: 'menu',
    label: args.t('shell.settings.tabs.organizations'),
    menuAriaLabel: args.t('shell.settings.breadcrumbMenu'),
    items: [
      {
        label: args.t('shell.settings.tabs.profile'),
        href: '/system/settings',
        current: pathname === '/system/settings'
      },
      {
        label: args.t('shell.settings.tabs.organizations'),
        href: '/system/settings',
        current: pathname === '/system/settings' // Add tab state detection
      },
      {
        label: args.t('shell.settings.tabs.security'),
        href: '/system/settings',
        current: pathname === '/system/settings' // Add tab state detection
      },
      {
        label: args.t('shell.settings.tabs.modules'),
        href: '/system/settings',
        current: pathname === '/system/settings' // Add tab state detection
      },
      {
        label: args.t('shell.settings.tabs.templates'),
        href: '/system/settings',
        current: pathname === '/system/settings' // Add tab state detection
      }
    ]
  };
}
```

**Note**: Need to handle tab state detection via URL query parameter or hash (e.g., `/system/settings?tab=organizations`)

### Step 2: Move File to Correct Location
- Move `src/routes/(app)/organizations/create/+page.svelte` → `src/routes/(app)/system/settings/organizations/create/+page.svelte`
- Delete the old `organizations/` directory if empty

### Step 3: Update Breadcrumb in Create Page
**File**: `src/routes/(app)/system/settings/organizations/create/+page.svelte`

Update breadcrumb segments to:
```typescript
segments={[
  { label: $t('shell.system') },
  { label: $t('shell.settings.title'), href: '/system/settings' },
  settingsTabMenuSegment({
    pathname: page.url.pathname,
    t: (key) => $t(key)
  }),
  { label: $t('common.new') }
]}
```

### Step 4: Update Settings Page Link
**File**: `src/routes/(app)/system/settings/+page.svelte`

Update `openNewOrganization` function:
```typescript
function openNewOrganization() {
  const url = '/system/settings/organizations/create';
  const childWindow = window.open(url, '_blank');
  if (childWindow) {
    childWindow.focus();
  } else {
    alert('Popup bloccato dal browser! Controlla le impostazioni.');
  }
}
```

### Step 5: Add Translation Keys
**Files**: `src/lib/i18n/messages/*.json`

Add missing translation key:
```json
{
  "shell": {
    "settings": {
      "breadcrumbMenu": "Settings tabs"
    }
  }
}
```

### Step 6: Handle Tab State in URL (Optional Enhancement)
Consider adding tab state to URL for proper "current" detection in dropdown:
- Update settings page to use URL query parameter: `/system/settings?tab=organizations`
- Update dropdown menu to check `tab` parameter for current state
- Update settings page to read `tab` parameter on load

## Testing Checklist
- [ ] File moved to correct location
- [ ] Breadcrumb shows: System / Settings / Organizations (dropdown) / Nuovo
- [ ] Dropdown menu shows all 5 tabs (Profile, Organizations, Security, Modules, Templates)
- [ ] Clicking dropdown items navigates to settings page
- [ ] "New" button in settings page opens correct URL
- [ ] All translation keys added
- [ ] No broken links or 404s

## Files to Modify
1. `src/lib/shell/crm-breadcrumb.ts` (or create `settings-breadcrumb.ts`)
2. `src/routes/(app)/organizations/create/+page.svelte` → `src/routes/(app)/system/settings/organizations/create/+page.svelte`
3. `src/routes/(app)/system/settings/+page.svelte`
4. `src/lib/i18n/messages/en-GB.json`
5. `src/lib/i18n/messages/it-IT.json`
6. `src/lib/i18n/messages/de-DE.json`
7. `src/lib/i18n/messages/pt-PT.json`

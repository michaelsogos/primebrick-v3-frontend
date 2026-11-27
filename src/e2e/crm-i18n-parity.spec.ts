import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.describe.configure({ mode: "serial" });

/* CRM i18n parity — end-user contract (user-ratified 2026-11-27, full ×7):
 *
 *   EVERY language offered in the language picker carries a COMPLETE CRM
 *   dictionary — a missing row is a bug, never a partial feature (fe-v3
 *   docs/ai/i18n.md UiLang↔dictionary parity, MANDATORY). English text in
 *   a non-English UI is the forbidden "silently mixed languages" — worse
 *   than the deliberate raw-key gap (be-v3 docs/dev-guide/translations).
 *
 * The oracle below is the authored naming matrix: every entity's
 * singular/plural/nav/new-title in de-DE/fr-FR/es-ES/pt-PT, with correct
 * per-language gender agreement in the "New …" compositions (the seeds
 * carry exact strings — composition never happens at runtime).
 *
 * Assertions run at TWO end-user layers:
 *   1. HTTP — the exact dict the user's browser receives from
 *      /api/v1/system/translations/crm/{lang}: keyset parity + exact values.
 *   2. DOM — the sidebar + launcher popover the user actually reads,
 *      per language, on the real stack. */

type Lang4 = "de-DE" | "fr-FR" | "es-ES" | "pt-PT";
const LANGS: Lang4[] = ["de-DE", "fr-FR", "es-ES", "pt-PT"];

/* The naming matrix — singular / plural(=title=nav) / new.title composition
 * per entity per language. Authored 2026-11-27, gender-correct by construction. */
const NAMING: Record<string, Record<Lang4, { sg: string; pl: string; nw: string }>> = {
  account_kind: {
    "de-DE": { sg: "Kontenart", pl: "Kontenarten", nw: "Neue Kontenart" },
    "fr-FR": { sg: "Type de compte", pl: "Types de compte", nw: "Nouveau type de compte" },
    "es-ES": { sg: "Tipo de cuenta", pl: "Tipos de cuenta", nw: "Nuevo tipo de cuenta" },
    "pt-PT": { sg: "Tipo de conta", pl: "Tipos de conta", nw: "Novo tipo de conta" },
  },
  company_dimension: {
    "de-DE": { sg: "Unternehmensgröße", pl: "Unternehmensgrößen", nw: "Neue Unternehmensgröße" },
    "fr-FR": { sg: "Taille d'entreprise", pl: "Tailles d'entreprise", nw: "Nouvelle taille d'entreprise" },
    "es-ES": { sg: "Tamaño de empresa", pl: "Tamaños de empresa", nw: "Nuevo tamaño de empresa" },
    "pt-PT": { sg: "Dimensão de empresa", pl: "Dimensões de empresa", nw: "Nova dimensão de empresa" },
  },
  consent_type: {
    "de-DE": { sg: "Einwilligungsart", pl: "Einwilligungsarten", nw: "Neue Einwilligungsart" },
    "fr-FR": { sg: "Type de consentement", pl: "Types de consentement", nw: "Nouveau type de consentement" },
    "es-ES": { sg: "Tipo de consentimiento", pl: "Tipos de consentimiento", nw: "Nuevo tipo de consentimiento" },
    "pt-PT": { sg: "Tipo de consentimento", pl: "Tipos de consentimento", nw: "Novo tipo de consentimento" },
  },
  contact_type: {
    "de-DE": { sg: "Kontaktart", pl: "Kontaktarten", nw: "Neue Kontaktart" },
    "fr-FR": { sg: "Type de contact", pl: "Types de contact", nw: "Nouveau type de contact" },
    "es-ES": { sg: "Tipo de contacto", pl: "Tipos de contacto", nw: "Nuevo tipo de contacto" },
    "pt-PT": { sg: "Tipo de contacto", pl: "Tipos de contacto", nw: "Novo tipo de contacto" },
  },
  customer_account: {
    "de-DE": { sg: "Kundenkonto", pl: "Kundenkonten", nw: "Neues Kundenkonto" },
    "fr-FR": { sg: "Compte client", pl: "Comptes clients", nw: "Nouveau compte client" },
    "es-ES": { sg: "Cuenta de cliente", pl: "Cuentas de cliente", nw: "Nueva cuenta de cliente" },
    "pt-PT": { sg: "Conta de cliente", pl: "Contas de cliente", nw: "Nova conta de cliente" },
  },
  customer_consent: {
    "de-DE": { sg: "Einwilligung", pl: "Einwilligungen", nw: "Neue Einwilligung" },
    "fr-FR": { sg: "Consentement", pl: "Consentements", nw: "Nouveau consentement" },
    "es-ES": { sg: "Consentimiento", pl: "Consentimientos", nw: "Nuevo consentimiento" },
    "pt-PT": { sg: "Consentimento", pl: "Consentimentos", nw: "Novo consentimento" },
  },
  customer_contact: {
    "de-DE": { sg: "Kontakt", pl: "Kontakte", nw: "Neuer Kontakt" },
    "fr-FR": { sg: "Contact", pl: "Contacts", nw: "Nouveau contact" },
    "es-ES": { sg: "Contacto", pl: "Contactos", nw: "Nuevo contacto" },
    "pt-PT": { sg: "Contacto", pl: "Contactos", nw: "Novo contacto" },
  },
  customer_link: {
    "de-DE": { sg: "Kundenverknüpfung", pl: "Kundenverknüpfungen", nw: "Neue Kundenverknüpfung" },
    "fr-FR": { sg: "Lien client", pl: "Liens clients", nw: "Nouveau lien client" },
    "es-ES": { sg: "Vínculo de cliente", pl: "Vínculos de cliente", nw: "Nuevo vínculo de cliente" },
    "pt-PT": { sg: "Ligação de cliente", pl: "Ligações de cliente", nw: "Nova ligação de cliente" },
  },
  customer_link_type: {
    "de-DE": { sg: "Verknüpfungsart", pl: "Verknüpfungsarten", nw: "Neue Verknüpfungsart" },
    "fr-FR": { sg: "Type de lien", pl: "Types de lien", nw: "Nouveau type de lien" },
    "es-ES": { sg: "Tipo de vínculo", pl: "Tipos de vínculo", nw: "Nuevo tipo de vínculo" },
    "pt-PT": { sg: "Tipo de ligação", pl: "Tipos de ligação", nw: "Novo tipo de ligação" },
  },
  customer_type: {
    "de-DE": { sg: "Kundenart", pl: "Kundenarten", nw: "Neue Kundenart" },
    "fr-FR": { sg: "Type de client", pl: "Types de client", nw: "Nouveau type de client" },
    "es-ES": { sg: "Tipo de cliente", pl: "Tipos de cliente", nw: "Nuevo tipo de cliente" },
    "pt-PT": { sg: "Tipo de cliente", pl: "Tipos de cliente", nw: "Novo tipo de cliente" },
  },
  legal_form: {
    "de-DE": { sg: "Rechtsform", pl: "Rechtsformen", nw: "Neue Rechtsform" },
    "fr-FR": { sg: "Forme juridique", pl: "Formes juridiques", nw: "Nouvelle forme juridique" },
    "es-ES": { sg: "Forma jurídica", pl: "Formas jurídicas", nw: "Nueva forma jurídica" },
    "pt-PT": { sg: "Forma jurídica", pl: "Formas jurídicas", nw: "Nova forma jurídica" },
  },
  local_address: {
    "de-DE": { sg: "Adresse", pl: "Adressen", nw: "Neue Adresse" },
    "fr-FR": { sg: "Adresse", pl: "Adresses", nw: "Nouvelle adresse" },
    "es-ES": { sg: "Dirección", pl: "Direcciones", nw: "Nueva dirección" },
    "pt-PT": { sg: "Endereço", pl: "Endereços", nw: "Novo endereço" },
  },
  local_address_type: {
    "de-DE": { sg: "Adressart", pl: "Adressarten", nw: "Neue Adressart" },
    "fr-FR": { sg: "Type d'adresse", pl: "Types d'adresse", nw: "Nouveau type d'adresse" },
    "es-ES": { sg: "Tipo de dirección", pl: "Tipos de dirección", nw: "Nuevo tipo de dirección" },
    "pt-PT": { sg: "Tipo de endereço", pl: "Tipos de endereço", nw: "Novo tipo de endereço" },
  },
  marketing_qualification: {
    "de-DE": { sg: "Marketing-Qualifikation", pl: "Marketing-Qualifikationen", nw: "Neue Marketing-Qualifikation" },
    "fr-FR": { sg: "Qualification marketing", pl: "Qualifications marketing", nw: "Nouvelle qualification marketing" },
    "es-ES": { sg: "Cualificación de marketing", pl: "Cualificaciones de marketing", nw: "Nueva cualificación de marketing" },
    "pt-PT": { sg: "Qualificação de marketing", pl: "Qualificações de marketing", nw: "Nova qualificação de marketing" },
  },
  qualification: {
    "de-DE": { sg: "Qualifikation", pl: "Qualifikationen", nw: "Neue Qualifikation" },
    "fr-FR": { sg: "Qualification", pl: "Qualifications", nw: "Nouvelle qualification" },
    "es-ES": { sg: "Cualificación", pl: "Cualificaciones", nw: "Nueva cualificación" },
    "pt-PT": { sg: "Qualificação", pl: "Qualificações", nw: "Nova qualificação" },
  },
};

/* entity key → plural table segment used in crm.<table>.nav */
const ENTITY_TABLE: Record<string, string> = {
  account_kind: "account_kinds",
  company_dimension: "company_dimensions",
  consent_type: "consent_types",
  contact_type: "contact_types",
  customer_account: "customer_accounts",
  customer_consent: "customer_consents",
  customer_contact: "customer_contacts",
  customer_link: "customer_links",
  customer_link_type: "customer_link_types",
  customer_type: "customer_types",
  legal_form: "legal_forms",
  local_address: "local_addresses",
  local_address_type: "local_address_types",
  marketing_qualification: "marketing_qualifications",
  qualification: "qualifications",
};

/* The create-leaf compositions — the historical bug surface. Gender agreement
 * is correct by construction in every language. */
const CREATES: Record<string, Record<Lang4, string>> = {
  customer_accounts: {
    "de-DE": "Neues Kundenkonto",
    "fr-FR": "Nouveau compte client",
    "es-ES": "Nueva cuenta de cliente",
    "pt-PT": "Nova conta de cliente",
  },
  customer_contacts: {
    "de-DE": "Neuer Kontakt",
    "fr-FR": "Nouveau contact",
    "es-ES": "Nuevo contacto",
    "pt-PT": "Novo contacto",
  },
  local_addresses: {
    "de-DE": "Neue Adresse",
    "fr-FR": "Nouvelle adresse",
    "es-ES": "Nueva dirección",
    "pt-PT": "Novo endereço",
  },
};

/* English-residue keys bonificated in the same slice — long sentences and
 * labels that were seeded in English across all four languages. */
const RESIDUE: Record<string, Record<Lang4, string>> = {
  "crm.entities.sequence.fields.revive_slot": {
    "de-DE": "Erneuerungs-Slot",
    "fr-FR": "Slot de renouvellement",
    "es-ES": "Slot de renovación",
    "pt-PT": "Slot de renovação",
  },
};

async function fetchCrmDict(page: import("@playwright/test").Page, lang: string): Promise<Record<string, string>> {
  return (await page.evaluate(async (l) => {
    const r = await fetch(`/api/v1/system/translations/crm/${l}`, { credentials: "include" });
    if (!r.ok) return { __error: r.status };
    return r.json();
  }, lang)) as Record<string, string>;
}

test.beforeEach(async ({ page }) => {
  await loginAsTestAdmin(page);
});

test("the crm dict keyset is complete in every offered language — zero missing rows", async ({ page }) => {
  await page.goto("/crm/customer_accounts", { waitUntil: "domcontentloaded" });
  await expect(page.locator('a[href="/crm/customer_accounts"]').first()).toBeVisible({ timeout: 10_000 });

  const enDict = await fetchCrmDict(page, "en-GB");
  expect(Object.keys(enDict).length, "the en-GB reference dict is non-empty").toBeGreaterThan(100);
  const enKeys = Object.keys(enDict);

  for (const lang of [...LANGS, "it-IT", "en-US"]) {
    const dict = await fetchCrmDict(page, lang);
    const missing = enKeys.filter((k) => !(k in dict));
    console.log(`${lang}: ${Object.keys(dict).length} keys, missing vs en-GB: ${missing.length}`, missing.slice(0, 8));
    expect(missing, `${lang} must carry every en-GB key — a missing row is a bug, not a partial feature`).toEqual([]);
  }
});

test("entity naming + create compositions + residue keys carry the authored translations — never english", async ({ page }) => {
  await page.goto("/crm/customer_accounts", { waitUntil: "domcontentloaded" });
  await expect(page.locator('a[href="/crm/customer_accounts"]').first()).toBeVisible({ timeout: 10_000 });

  for (const lang of LANGS) {
    const dict = await fetchCrmDict(page, lang);
    const wrong: string[] = [];
    for (const [entity, perLang] of Object.entries(NAMING)) {
      const exp = perLang[lang];
      const table = ENTITY_TABLE[entity];
      const checks: Array<[string, string]> = [
        [`crm.entities.${entity}.singular`, exp.sg],
        [`crm.entities.${entity}.plural`, exp.pl],
        [`crm.entities.${entity}.title`, exp.pl],
        [`crm.entities.${entity}.new.title`, exp.nw],
        [`crm.${table}.nav`, exp.pl],
      ];
      for (const [key, expected] of checks) {
        if (dict[key] !== expected) wrong.push(`${key} → got ${JSON.stringify(dict[key])}, expected ${JSON.stringify(expected)}`);
      }
    }
    for (const [table, perLang] of Object.entries(CREATES)) {
      const key = `crm.${table}.nav.create`;
      if (dict[key] !== perLang[lang]) wrong.push(`${key} → got ${JSON.stringify(dict[key])}, expected ${JSON.stringify(perLang[lang])}`);
    }
    for (const [key, perLang] of Object.entries(RESIDUE)) {
      if (dict[key] !== perLang[lang]) wrong.push(`${key} → got ${JSON.stringify(dict[key])}, expected ${JSON.stringify(perLang[lang])}`);
    }
    console.log(`${lang}: naming mismatches: ${wrong.length}`, wrong.slice(0, 6));
    expect(wrong, `${lang} naming matrix must match the authored translations exactly`).toEqual([]);
  }
});

test("browser: popover creates + sidebar leaves render translated per language — no raw keys, no english", async ({ page }) => {
  test.setTimeout(180_000);
  for (const lang of LANGS) {
    // Pin the language exactly like a user picking it in the language
    // switcher (sessionStorage pb.lang), then reload — the app boots in lang.
    await page.goto("/crm/customer_accounts", { waitUntil: "domcontentloaded" });
    await page.evaluate((l) => sessionStorage.setItem("pb.lang", l), lang);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('a[href="/crm/customer_accounts"]').first()).toBeVisible({ timeout: 10_000 });

    // Sidebar truth: the derived leaves carry the translated nav labels.
    const accountsLabel = ((await page.locator('a[href="/crm/customer_accounts"]').first().textContent()) ?? "").trim();
    const addressesLabel = ((await page.locator('a[href="/crm/local_addresses"]').first().textContent()) ?? "").trim();
    expect(accountsLabel, `${lang} sidebar customer_accounts leaf`).toBe(NAMING.customer_account[lang].pl);
    expect(addressesLabel, `${lang} sidebar local_addresses leaf`).toBe(NAMING.local_address[lang].pl);

    // Popover truth: walk the launcher columns like the user does.
    await page.getByTestId("app-launcher-trigger").click();
    const panel = page.getByTestId("app-launcher-panel");
    await expect(panel, "the launcher panel opens").toBeVisible({ timeout: 10_000 });
    const appRows = panel.locator('[data-launcher-col="0"] [data-launcher-row]');
    await expect(appRows.first()).toBeVisible({ timeout: 10_000 });
    await appRows.last().click();
    const moduleRows = panel.locator('[data-launcher-col="1"] [data-launcher-row]');
    await expect(moduleRows.first()).toBeVisible({ timeout: 10_000 });
    await moduleRows.first().hover();
    const rows = panel.locator('[data-launcher-col="2"] [data-launcher-row]');
    await expect(rows.first(), "the preview lists the crm leaves").toBeVisible({ timeout: 10_000 });
    await page.locator("#app-launcher-show-all-switch").click();

    const labels: string[] = [];
    for (const r of await rows.all()) labels.push(((await r.textContent()) ?? "").trim());
    console.log(`${lang} popover rows:`, JSON.stringify(labels));

    // No raw keys ever render — a raw crm.* key in the popover is a bug.
    const rawKeys = labels.filter((l) => /^crm\./.test(l));
    expect(rawKeys, `${lang} popover must never render raw translation keys`).toEqual([]);

    // No english residue: compositions never start with the english "New ".
    const englishResidue = labels.filter((l) => /^New\s/.test(l));
    expect(englishResidue, `${lang} popover must never compose create labels in english`).toEqual([]);

    // The three create leaves render their authored compositions, each
    // immediately before its list leaf (structural pairing, user-ratified).
    const TABLE_ENTITY: Record<string, string> = {
      customer_accounts: "customer_account",
      customer_contacts: "customer_contact",
      local_addresses: "local_address",
    };
    for (const [table, perLang] of Object.entries(CREATES)) {
      const composition = perLang[lang];
      const idx = labels.indexOf(composition);
      expect(idx, `${lang} popover lists ${JSON.stringify(composition)}`).toBeGreaterThanOrEqual(0);
      const expectedList = NAMING[TABLE_ENTITY[table]][lang].pl;
      const next = labels[idx + 1] ?? "";
      expect(next, `${lang} create leaf ${JSON.stringify(composition)} immediately precedes its list ${JSON.stringify(expectedList)}`).toBe(expectedList);
    }

    await page.keyboard.press("Escape");
  }
});

import type { ModuleInfo } from '$lib/api-types';

export type AppBreadcrumbPlainSegment = { label: string; href?: string };

export type AppBreadcrumbMenuSegment = {
  kind: 'menu';
  label: string;
  /** aria-label for the trigger (opens sibling section links). */
  menuAriaLabel?: string;
  items: { label: string; href: string; current?: boolean }[];
};

export type AppBreadcrumbSegment = AppBreadcrumbPlainSegment | AppBreadcrumbMenuSegment;

export function isMenuSegment(seg: AppBreadcrumbSegment): seg is AppBreadcrumbMenuSegment {
  return 'kind' in seg && seg.kind === 'menu';
}

/** First breadcrumb segment for CRM: same sibling links as the sidebar CRM flyout (Customers / Pipeline). */
export function crmModuleMenuSegment(args: {
  modules: ModuleInfo[];
  pathname: string;
  t: (key: string) => string;
}): AppBreadcrumbMenuSegment {
  const crm = args.modules.find((m) => m.id === 'crm');
  const pathname = args.pathname;
  return {
    kind: 'menu',
    label: crm?.name ?? args.t('shell.nav.crmFallback'),
    menuAriaLabel: args.t('shell.nav.crmBreadcrumbMenu'),
    items: [
      {
        label: args.t('entities.customer.title'),
        href: '/customers',
        current: pathname === '/customers' || pathname.startsWith('/customers/')
      },
      {
        label: args.t('entities.crm.pipeline.nav'),
        href: '/crm/pipeline',
        current: pathname === '/crm/pipeline' || pathname.startsWith('/crm/pipeline/')
      }
    ]
  };
}

/** Settings tab menu segment for breadcrumb dropdown (Profile / Organizations / Security / Modules / Templates). */
export function settingsTabMenuSegment(args: {
  pathname: string;
  searchParams: URLSearchParams;
  t: (key: string) => string;
}): AppBreadcrumbMenuSegment {
  const pathname = args.pathname;
  const currentTab = args.searchParams.get('tab') || 'profile';
  return {
    kind: 'menu',
    label: args.t('shell.settings.tabs.organizations'),
    menuAriaLabel: args.t('shell.settings.breadcrumbMenu'),
    items: [
      {
        label: args.t('shell.settings.tabs.profile'),
        href: '/system/settings?tab=profile',
        current: pathname === '/system/settings' && currentTab === 'profile'
      },
      {
        label: args.t('shell.settings.tabs.organizations'),
        href: '/system/settings?tab=organizations',
        current: (pathname === '/system/settings' && currentTab === 'organizations') || pathname.startsWith('/system/settings/organizations/')
      },
      {
        label: args.t('shell.settings.tabs.security'),
        href: '/system/settings?tab=security',
        current: pathname === '/system/settings' && currentTab === 'security'
      },
      {
        label: args.t('shell.settings.tabs.modules'),
        href: '/system/settings?tab=modules',
        current: pathname === '/system/settings' && currentTab === 'modules'
      },
      {
        label: args.t('shell.settings.tabs.templates'),
        href: '/system/settings?tab=templates',
        current: pathname === '/system/settings' && currentTab === 'templates'
      }
    ]
  };
}

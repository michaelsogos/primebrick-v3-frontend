import type { ModuleInfo } from '$lib/api-types';
import type { AppBreadcrumbMenuSegment } from './types';

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
    label: crm?.name ?? args.t('app.nav.crmFallback'),
    menuAriaLabel: args.t('app.nav.crmBreadcrumbMenu'),
    items: [
      {
        label: args.t('system.entities.customer.title'),
        href: '/customers',
        current: pathname === '/customers' || pathname.startsWith('/customers/')
      },
      {
        label: args.t('system.entities.crm.pipeline.nav'),
        href: '/crm/pipeline',
        current: pathname === '/crm/pipeline' || pathname.startsWith('/crm/pipeline/')
      }
    ]
  };
}

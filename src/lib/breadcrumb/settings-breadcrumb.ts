import type { AppBreadcrumbMenuSegment } from './types';

/** Settings tab menu segment for breadcrumb dropdown (Profile / Organizations / Users / Security / Modules / Templates). */
export function settingsTabMenuSegment(args: {
  pathname: string;
  searchParams: URLSearchParams;
  t: (key: string) => string;
}): AppBreadcrumbMenuSegment {
  const pathname = args.pathname;
  
  const items = [
    {
      label: args.t('shell.settings.tabs.profile'),
      href: '/system/settings/profile',
      current: pathname === '/system/settings/profile'
    },
    {
      label: args.t('shell.settings.tabs.organizations'),
      href: '/system/settings/organizations',
      current: pathname === '/system/settings/organizations' || pathname.startsWith('/system/settings/organizations/')
    },
    {
      label: args.t('shell.settings.tabs.users'),
      href: '/system/settings/users',
      current: pathname === '/system/settings/users' || pathname.startsWith('/system/settings/users/')
    },
    {
      label: args.t('shell.settings.tabs.security'),
      href: '/system/settings/security',
      current: pathname === '/system/settings/security'
    },
    {
      label: args.t('shell.settings.tabs.modules'),
      href: '/system/settings/modules',
      current: pathname === '/system/settings/modules'
    },
    {
      label: args.t('shell.settings.tabs.templates'),
      href: '/system/settings/templates',
      current: pathname === '/system/settings/templates'
    }
  ];
  
  // Find the current item to use as the dropdown label
  const currentItem = items.find(item => item.current);
  const label = currentItem?.label || args.t('shell.settings.tabs.organizations');
  
  return {
    kind: 'menu',
    label,
    menuAriaLabel: args.t('shell.settings.breadcrumbMenu'),
    items
  };
}

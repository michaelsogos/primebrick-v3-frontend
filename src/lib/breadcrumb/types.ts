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

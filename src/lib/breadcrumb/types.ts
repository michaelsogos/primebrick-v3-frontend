export type AppBreadcrumbPlainSegment = { label: string; href?: string; icon?: string };

export type AppBreadcrumbMenuSegment = {
  kind: 'menu';
  label: string;
  /** Optional icon name (lucide) rendered before the label. */
  icon?: string;
  /** aria-label for the trigger (opens sibling section links). */
  menuAriaLabel?: string;
  items: { label: string; href: string; current?: boolean; icon?: string }[];
};

export type AppBreadcrumbSegment = AppBreadcrumbPlainSegment | AppBreadcrumbMenuSegment;

export function isMenuSegment(seg: AppBreadcrumbSegment): seg is AppBreadcrumbMenuSegment {
  return 'kind' in seg && seg.kind === 'menu';
}

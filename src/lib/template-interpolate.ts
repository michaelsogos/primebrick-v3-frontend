/**
 * Template interpolator with nested path support.
 * Accepts dot notation for nested paths, e.g. `${user.name}`, `${org.display_name}`.
 * If a path does not exist, the original placeholder is returned.
 */
export function interpolateTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\$\{([\w.]+)\}/g, (match, path) => {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, data);

    return value !== undefined && value !== null ? String(value) : match;
  });
}

/** String and number formatting helpers. */

/**
 * Capitalise the first letter of a string.
 */
export function capitalize(str: string): string {
  return str.length === 0 ? str : str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Truncate a string to a maximum length, appending an ellipsis when trimmed.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 1)}…`;
}

/**
 * Format a number with thousands separators using the browser's locale.
 */
export function formatNumber(value: number): string {
  return value.toLocaleString();
}

/**
 * Convert a camelCase or snake_case string to Title Case.
 */
export function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

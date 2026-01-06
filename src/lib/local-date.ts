/**
 * Local Date/Time Formatting
 * ==========================
 *
 * Provides consistent local timezone date/time formatting for user-facing dates.
 * Uses the system's local timezone, NOT UTC.
 *
 * These formatters are used for:
 * - $TODAY / $NOW static value expansion
 * - today() / now() expression functions
 * - {date} template substitution
 * - Date expression evaluation (today() + '7d', etc.)
 *
 * For absolute timestamps (audit logs, migration history, snapshots),
 * continue to use Date.toISOString() which provides UTC.
 */

/**
 * Format a Date as YYYY-MM-DD in local timezone.
 *
 * @example
 * // At 11pm on Jan 1st in US Pacific time (UTC-8):
 * // new Date('2025-01-02T07:00:00Z') is still Jan 1st locally
 * formatLocalDate(new Date('2025-01-02T07:00:00Z'))
 * // => '2025-01-01' (in Pacific timezone)
 */
export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date as YYYY-MM-DD HH:mm in local timezone.
 *
 * @example
 * formatLocalDateTime(new Date('2025-01-15T14:30:00Z'))
 * // => '2025-01-15 06:30' (in Pacific timezone, UTC-8)
 */
export function formatLocalDateTime(date: Date = new Date()): string {
  const datePart = formatLocalDate(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}`;
}

/**
 * Expand special static values like $NOW and $TODAY.
 * Returns the original value if not a recognized static value.
 *
 * @param value - The value to potentially expand
 * @param now - Optional Date to use (defaults to current time, useful for testing)
 */
export function expandStaticValue(value: string, now: Date = new Date()): string {
  switch (value) {
    case '$NOW':
      return formatLocalDateTime(now);
    case '$TODAY':
      return formatLocalDate(now);
    default:
      return value;
  }
}

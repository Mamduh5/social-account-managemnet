/** Read-only destination history. Dates are owner wall dates in Asia/Bangkok. */
export const historyStatuses = ['draft', 'scheduled', 'preparing', 'branding', 'uploading', 'awaiting_confirmation', 'published', 'failed', 'cancelled'] as const;
export type HistoryTimestamp = 'created' | 'scheduled' | 'updated';
export type HistoryPeriod = 'all' | 'today' | 'date' | 'week' | 'last7' | 'month' | 'last30' | 'custom';
export interface PublishingHistoryQuery {
  timestamp: HistoryTimestamp;
  direction: 'desc' | 'asc';
  period: HistoryPeriod;
  date?: string;
  fromDate?: string;
  toDate?: string;
  startAt?: string;
  endAt?: string;
  status?: typeof historyStatuses[number];
  outcome: 'all' | 'completed' | 'failed';
  platform?: 'facebook' | 'tiktok';
  limit: number;
  offset: number;
}
const dayMs = 86_400_000;
const wallDate = (stamp: number) => new Date(stamp + 7 * 3_600_000).toISOString().slice(0, 10);
function midnight(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a valid YYYY-MM-DD date in Asia/Bangkok.');
  const parsed = Date.parse(`${value}T00:00:00+07:00`);
  if (!Number.isFinite(parsed) || wallDate(parsed) !== value) throw new Error('Use a valid calendar date.');
  return parsed;
}
function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error('Pagination must use whole nonnegative numbers.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error('Pagination is outside the supported range.');
  return parsed;
}
export function parsePublishingHistoryQuery(input: Record<string, unknown>, now = Date.now()): PublishingHistoryQuery {
  const get = (key: string): string | undefined => {
    const value = input[key];
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string') throw new Error(`Invalid ${key} filter.`);
    return value;
  };
  const choose = <T extends string>(key: string, options: readonly T[], fallback: T): T => {
    const value = get(key) || fallback;
    if (!options.includes(value as T)) throw new Error(`Invalid ${key} filter.`);
    return value as T;
  };
  const query: PublishingHistoryQuery = {
    timestamp: choose('timestamp', ['created', 'scheduled', 'updated'] as const, 'created'),
    direction: choose('direction', ['desc', 'asc'] as const, 'desc'),
    period: choose('period', ['all', 'today', 'date', 'week', 'last7', 'month', 'last30', 'custom'] as const, 'all'),
    outcome: choose('outcome', ['all', 'completed', 'failed'] as const, 'all'),
    limit: integer(get('limit'), 20, 1, 100),
    offset: integer(get('offset'), 0, 0, 1_000_000_000),
  };
  const status = get('status');
  if (status) {
    if (!historyStatuses.includes(status as typeof historyStatuses[number])) throw new Error('Invalid status filter.');
    query.status = status as typeof historyStatuses[number];
  }
  const platform = get('platform');
  if (platform) {
    if (platform !== 'facebook' && platform !== 'tiktok') throw new Error('Invalid platform filter.');
    query.platform = platform;
  }
  if (query.outcome !== 'all' && query.status && query.status !== (query.outcome === 'completed' ? 'published' : 'failed')) {
    throw new Error('The status and outcome filters conflict.');
  }
  if (query.period === 'all') return query;
  const selected = get('date') || wallDate(now);
  const anchor = midnight(selected);
  let start = anchor, end = anchor + dayMs;
  if (query.period === 'today') start = midnight(wallDate(now)), end = start + dayMs;
  if (query.period === 'week') {
    const weekday = new Date(anchor + 7 * 3_600_000).getUTCDay();
    start = anchor - ((weekday + 6) % 7) * dayMs; end = start + 7 * dayMs;
  }
  if (query.period === 'month') {
    const month = selected.slice(0, 7);
    start = midnight(`${month}-01`);
    const next = new Date(`${month}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    end = midnight(next.toISOString().slice(0, 10));
  }
  if (query.period === 'last7' || query.period === 'last30') {
    end = midnight(wallDate(now)) + dayMs;
    start = end - (query.period === 'last7' ? 7 : 30) * dayMs;
  }
  if (query.period === 'custom') {
    if (!get('fromDate') || !get('toDate')) throw new Error('Choose both custom range dates.');
    query.fromDate = get('fromDate'); query.toDate = get('toDate');
    start = midnight(query.fromDate!); end = midnight(query.toDate!) + dayMs;
    if (end <= start) throw new Error('The end date must be on or after the start date.');
  }
  query.date = selected;
  query.startAt = new Date(start).toISOString();
  query.endAt = new Date(end).toISOString();
  return query;
}

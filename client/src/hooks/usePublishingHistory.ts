import { useCallback, useEffect, useRef, useState } from 'react';
import { publishingHistoryApi, type HistoryFilters, type HistoryPage } from '../api/publishing-history';
import { useResourceRefresh } from '../api/resource-events';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const defaultHistoryFilters = (): HistoryFilters => ({ timestamp: 'created', direction: 'desc', period: 'all', date: today(), fromDate: today(), toDate: today(), outcome: 'all', status: '', platform: '', limit: 20 });
export function usePublishingHistory(enabled: boolean) {
  const [filters, setFilters] = useState(defaultHistoryFilters);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0), controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (!enabled) return;
    const token = ++sequence.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError('');
    try {
      const result = await publishingHistoryApi.history(filters, offset, abort.signal);
      if (token !== sequence.current) return;
      if (result.total > 0 && offset >= result.total) { setOffset(Math.floor((result.total - 1) / filters.limit) * filters.limit); return; }
      setPage(result);
    } catch (e) {
      if (token === sequence.current && !abort.signal.aborted) setError(e instanceof Error ? e.message : 'History could not be loaded.');
    } finally { if (token === sequence.current) setLoading(false); }
  }, [enabled, filters, offset]);
  useResourceRefresh(['publishing'], load);
  useEffect(() => {
    void load();
    return () => { sequence.current++; controller.current?.abort(); };
  }, [load]);
  const updateFilters = (patch: Partial<HistoryFilters>) => {
    sequence.current++; controller.current?.abort();
    setFilters(current => ({ ...current, ...patch })); setOffset(0); setPage(null);
  };
  // Resource changes retain the current history page, filters and editor state.
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { void load(); };
    window.addEventListener('scc:publishing-changed', refresh);
    window.addEventListener('scc:history-changed', refresh);
    window.addEventListener('scc:cleanup-changed', refresh);
    return () => { window.removeEventListener('scc:publishing-changed', refresh); window.removeEventListener('scc:history-changed', refresh); window.removeEventListener('scc:cleanup-changed', refresh); };
  }, [enabled, load]);
  return { filters, updateFilters, page, offset, setOffset, loading, error, refresh: load };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { Account, Category } from '../types';
import { readAllAccounts, readCategories } from '../api/reference-resources';
import { useFeatureActive } from '../features/FeatureActivity';
import { useResourceRefresh } from '../api/resource-events';

export function useAccounts() {
  const active = useFeatureActive();
  const generation = useRef(0);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingHealthId, setTestingHealthId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const request = ++generation.current;
    try {
      const [accRes, catRes] = await Promise.all([
        readAllAccounts(),
        readCategories(),
      ]);
      if (request !== generation.current) return;
      setAccounts(accRes.accounts || []);
      setCategories(catRes.categories || []);
      setError('');
    } catch (err) {
      if (request === generation.current) setError(err instanceof Error ? err.message : 'Accounts could not be loaded.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) void loadData();
    return () => { generation.current++; };
  }, [loadData, active]);
  useResourceRefresh(['accounts', 'categories'], loadData);

  const testHealth = async (id: string) => {
    setTestingHealthId(id);
    try {
      await api.testAccountHealth(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account health could not be checked.');
    } finally {
      setTestingHealthId(null);
    }
  };

  const reconnect = async (id: string) => {
    try {
      await api.reconnectAccount(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account could not be reconnected.');
    }
  };

  const changeMode = async (account: Account, newMode: string) => {
    try {
      await api.updateAccount(account.id, { connectorMode: newMode });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account could not be updated.');
    }
  };

  return {
    accounts,
    error,
    categories,
    loading,
    testingHealthId,
    loadData,
    testHealth,
    reconnect,
    changeMode,
  };
}

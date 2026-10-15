import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { Account, Category } from '../types';

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingHealthId, setTestingHealthId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [accRes, catRes] = await Promise.all([
        api.getAccounts(),
        api.getCategories(),
      ]);
      setAccounts(accRes.accounts || []);
      setCategories(catRes.categories || []);
    } catch (err) {
      console.error('Failed to load accounts/categories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const testHealth = async (id: string) => {
    setTestingHealthId(id);
    try {
      await api.testAccountHealth(id);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setTestingHealthId(null);
    }
  };

  const reconnect = async (id: string) => {
    try {
      await api.reconnectAccount(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const changeMode = async (account: Account, newMode: string) => {
    try {
      await api.updateAccount(account.id, { connectorMode: newMode });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  return {
    accounts,
    categories,
    loading,
    testingHealthId,
    loadData,
    testHealth,
    reconnect,
    changeMode,
  };
}

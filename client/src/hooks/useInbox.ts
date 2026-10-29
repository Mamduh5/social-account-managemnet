import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { CommentItem, Account, Category } from '../types';
import { ApiError } from '../api/http';
import { readAccounts, readCategories } from '../api/reference-resources';
import { useResourceRefresh } from '../api/resource-events';
import { useFeatureActive } from '../features/FeatureActivity';

export function useInbox(selectedCategory: string) {
  const active = useFeatureActive();
  const generation = useRef(0);
  const replyLock = useRef(false);
  const [error, setError] = useState('');
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<{ total: number; unread_count: number; awaiting_reply_count: number }>({
    total: 0,
    unread_count: 0,
    awaiting_reply_count: 0,
  });

  // Filters
  const [platformFilter, setPlatformFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [awaitingReplyOnly, setAwaitingReplyOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Active reply modal / state
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<{ message: string; nativeUrl?: string } | null>(null);

  const loadData = useCallback(async () => {
    const request = ++generation.current;
    try {
      const cmtRes = await api.getComments({
          platform: platformFilter,
          accountId: accountFilter,
          categoryId: selectedCategory !== 'all' ? selectedCategory : '',
          status: statusFilter,
          awaitingReply: awaitingReplyOnly ? 'true' : '',
          search: searchQuery,
        });
      if (request !== generation.current) return;
      setComments(cmtRes.comments || []);
      if (cmtRes.stats) setStats(cmtRes.stats);
      setError('');
    } catch (err) {
      if (request === generation.current) setError(err instanceof Error ? err.message : 'Comments could not be loaded.');
    }
  }, [platformFilter, accountFilter, statusFilter, awaitingReplyOnly, selectedCategory, searchQuery]);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => { void loadData(); }, searchQuery ? 250 : 0);
    return () => { clearTimeout(timer); generation.current++; };
  }, [loadData, active, searchQuery]);
  const loadReferences = useCallback(async () => {
    try {
      const [accRes, catRes] = await Promise.all([readAccounts(), readCategories()]);
      setAccounts(accRes.accounts || []); setCategories(catRes.categories || []);
    } catch (err) { setError(err instanceof Error ? err.message : 'Account filters are unavailable.'); }
  }, []);
  useEffect(() => { if (active) void loadReferences(); }, [active, loadReferences]);
  useResourceRefresh(['inbox'], loadData);
  useResourceRefresh(['accounts', 'categories'], loadReferences);
  const latestReply = useRef({ activeReplyId, replyText });
  latestReply.current = { activeReplyId, replyText };

  const handleSendReply = async (commentId: string) => {
    if (!replyText.trim() || replyLock.current) return;
    replyLock.current = true;
    const submittedText = replyText;
    setReplySubmitting(true);
    setReplyError(null);

    try {
      const res = await api.replyComment(commentId, replyText);
      if (res.success) {
        if (latestReply.current.activeReplyId === commentId && latestReply.current.replyText === submittedText) {
          setReplyText(''); setActiveReplyId(null);
        }
        await loadData();
      } else {
        setReplyError({
          message: res.error || 'Reply not supported via this connection.',
          nativeUrl: res.nativeUrl,
        });
      }
    } catch (err: any) {
      setReplyError({ message: err.message, nativeUrl: err instanceof ApiError ? err.nativeUrl : undefined });
    } finally {
      setReplySubmitting(false);
      replyLock.current = false;
    }
  };

  const handleReact = async (commentId: string) => {
    try {
      await api.reactComment(commentId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reaction could not be saved.');
    }
  };

  const handleStatusChange = async (commentId: string, newStatus: string) => {
    try {
      await api.updateCommentStatus(commentId, newStatus, newStatus === 'handled' ? false : undefined);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comment status could not be saved.');
    }
  };

  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ text: string; isError: boolean } | null>(null);

  const syncComments = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const res = await api.syncInbox(accountFilter || undefined);
      const results=res.result?.results?Object.values(res.result.results) as any[]:[res.result];
      const commentReads=results.filter(result=>result?.commentsStatus==='success').length;
      const allCommentsRead=results.length>0 && commentReads===results.length;
      if (res.success && res.result?.status === 'success' && allCommentsRead) {
        setSyncNotice({
          text: `Comments read successfully for ${commentReads} account(s). An empty supported response is valid.`,
          isError: false,
        });
      } else {
        const msg = results.find(result=>result?.commentsStatus==='failed')?.message || (allCommentsRead?res.message || res.result?.message:`Comments read for ${commentReads} account(s); ${results.length-commentReads} unavailable or require comment-reading permission. Account metrics do not establish comment synchronization.`) || 'Official API authorization required for automated comment synchronization. Use Open Native Account for native moderation.';
        setSyncNotice({
          text: msg,
          isError: true,
        });
      }
      await loadData();
    } catch (err: any) {
      setSyncNotice({
        text: `Sync failed: ${err.message}`,
        isError: true,
      });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncNotice(null), 8000);
    }
  };

  return {
    comments,
    error,
    accounts,
    categories,
    stats,
    platformFilter,
    setPlatformFilter,
    accountFilter,
    setAccountFilter,
    statusFilter,
    setStatusFilter,
    awaitingReplyOnly,
    setAwaitingReplyOnly,
    searchQuery,
    setSearchQuery,
    activeReplyId,
    setActiveReplyId,
    replyText,
    setReplyText,
    replySubmitting,
    replyError,
    setReplyError,
    loadData,
    handleSendReply,
    handleReact,
    handleStatusChange,
    syncComments,
    syncing,
    syncNotice,
  };
}

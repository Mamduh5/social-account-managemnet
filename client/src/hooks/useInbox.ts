import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { CommentItem, Account, Category } from '../types';

export function useInbox(selectedCategory: string) {
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
    try {
      const [cmtRes, accRes, catRes] = await Promise.all([
        api.getComments({
          platform: platformFilter,
          accountId: accountFilter,
          categoryId: selectedCategory !== 'all' ? selectedCategory : '',
          status: statusFilter,
          awaitingReply: awaitingReplyOnly ? 'true' : '',
          search: searchQuery,
        }),
        api.getAccounts(),
        api.getCategories(),
      ]);

      setComments(cmtRes.comments || []);
      if (cmtRes.stats) setStats(cmtRes.stats);
      setAccounts(accRes.accounts || []);
      setCategories(catRes.categories || []);
    } catch (err) {
      console.error(err);
    }
  }, [platformFilter, accountFilter, statusFilter, awaitingReplyOnly, selectedCategory, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSendReply = async (commentId: string) => {
    if (!replyText.trim()) return;
    setReplySubmitting(true);
    setReplyError(null);

    try {
      const res = await api.replyComment(commentId, replyText);
      if (res.success) {
        setReplyText('');
        setActiveReplyId(null);
        await loadData();
      } else {
        setReplyError({
          message: res.error || 'Reply not supported via this connection.',
          nativeUrl: res.nativeUrl,
        });
      }
    } catch (err: any) {
      setReplyError({ message: err.message });
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleReact = async (commentId: string) => {
    try {
      await api.reactComment(commentId);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (commentId: string, newStatus: string) => {
    try {
      await api.updateCommentStatus(commentId, newStatus, newStatus === 'handled' ? false : undefined);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  return {
    comments,
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
  };
}

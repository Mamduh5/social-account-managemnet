/** Invalidates prior selection and package requests, including after unmount. */
export function createGroupsRequestGuard() {
  let generation = 0;
  return {
    begin: () => ++generation,
    current: (token: number) => token === generation,
    invalidate: () => { generation += 1; },
  };
}

export function emptyGroupDraft() {
  return {
    kind: 'post' as 'post' | 'reply', content: '', threadUrl: '', relevance: '',
    reminderAt: '', sourcePageId: '', selectedMedia: [] as string[],
  };
}

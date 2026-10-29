import { db } from '../db/database.js';
import { parsePublishingHistoryQuery } from '../domain/publishing-history.js';
import { readActivePublishingQueue, readPublishingHistory } from '../repositories/publishing-history.repo.js';

export const publishingHistoryService = {
  history(input: Record<string, unknown>) { return readPublishingHistory(db, parsePublishingHistoryQuery(input)); },
  active() { return readActivePublishingQueue(db); },
};

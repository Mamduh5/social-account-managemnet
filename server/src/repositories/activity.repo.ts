import crypto from 'crypto';
import { db } from '../db/database.js';

export interface ActivityFilters {
  type?: string;
  severity?: string;
  limit?: number;
}

export class ActivityRepository {
  getRecentEvents(filters?: ActivityFilters | number): any[] {
    let limit = 50;
    let type: string | undefined;
    let severity: string | undefined;

    if (typeof filters === 'number') {
      limit = filters;
    } else if (filters) {
      limit = filters.limit || 50;
      type = filters.type;
      severity = filters.severity;
    }

    let query = `
      SELECT act.*, a.name as account_name, a.platform as account_platform,
             c.name as category_name, c.color as category_color
      FROM activity_events act
      LEFT JOIN accounts a ON act.account_id = a.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (type) {
      query += ' AND act.type = ?';
      params.push(type);
    }
    if (severity) {
      query += ' AND act.severity = ?';
      params.push(severity);
    }

    query += ' ORDER BY act.created_at DESC LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params);
  }

  logEvent(data: {
    type: string;
    accountId?: string | null;
    title: string;
    message: string;
    severity: 'info' | 'success' | 'warning' | 'error';
    metadataJson?: string | null;
  }): string {
    const id = `act-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(`
      INSERT INTO activity_events (id, type, account_id, title, message, severity, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.type,
      data.accountId || null,
      data.title,
      data.message,
      data.severity,
      data.metadataJson || null
    );
    return id;
  }

  deleteEvent(id: string): void {
    db.prepare('DELETE FROM activity_events WHERE id = ?').run(id);
  }
}

export const activityRepo = new ActivityRepository();

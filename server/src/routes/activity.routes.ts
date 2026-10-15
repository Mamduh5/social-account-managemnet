import { Router } from 'express';
import { db } from '../db/database.js';

export const activityRouter = Router();

activityRouter.get('/', (req, res) => {
  const { type, severity, limit } = req.query;
  let query = `
    SELECT act.*, a.name as account_name, a.platform as account_platform,
           c.name as category_name, c.color as category_color
    FROM activity_events act
    LEFT JOIN accounts a ON act.account_id = a.id
    LEFT JOIN categories c ON act.category_id = c.id
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
  params.push(Number(limit) || 50);

  const events = db.prepare(query).all(...params);
  res.json({ events });
});

activityRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM activity_events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

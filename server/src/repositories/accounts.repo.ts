import { db } from '../db/database.js';
import { AccountEntity, CategoryEntity } from '../domain/types.js';

export class AccountsRepository {
  getAllAccounts(): (AccountEntity & { category_name?: string; category_color?: string; category_slug?: string })[] {
    return db.prepare(`
      SELECT a.*, c.name as category_name, c.color as category_color, c.slug as category_slug
      FROM accounts a
      LEFT JOIN categories c ON a.category_id = c.id
      ORDER BY a.created_at ASC
    `).all() as any[];
  }

  getAccountById(id: string): (AccountEntity & { category_name?: string }) | undefined {
    return db.prepare(`
      SELECT a.*, c.name as category_name
      FROM accounts a
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.id = ?
    `).get(id) as any;
  }

  createAccount(data: {
    id: string;
    name: string;
    handle: string;
    platform: string;
    account_type: string;
    category_id: string | null;
    avatar_url: string;
    connector_mode: string;
    access_token?: string | null;
    brand_kit_json?: string | null;
  }): void {
    db.prepare(`
      INSERT INTO accounts (
        id, name, handle, platform, account_type, category_id,
        avatar_url, status, connector_mode, access_token, brand_kit_json,
        health_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?, ?, 'Healthy (Initial Setup)')
    `).run(
      data.id,
      data.name,
      data.handle,
      data.platform,
      data.account_type,
      data.category_id,
      data.avatar_url,
      data.connector_mode,
      data.access_token || null,
      data.brand_kit_json || null
    );
  }

  updateAccount(id: string, updates: {
    name?: string;
    handle?: string;
    category_id?: string | null;
    connector_mode?: string;
    access_token?: string | null;
    status?: string;
    health_status?: string;
  }): void {
    db.prepare(`
      UPDATE accounts SET
        name = COALESCE(?, name),
        handle = COALESCE(?, handle),
        category_id = COALESCE(?, category_id),
        connector_mode = COALESCE(?, connector_mode),
        access_token = COALESCE(?, access_token),
        status = COALESCE(?, status),
        health_status = COALESCE(?, health_status),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      updates.name,
      updates.handle,
      updates.category_id,
      updates.connector_mode,
      updates.access_token,
      updates.status,
      updates.health_status,
      id
    );
  }

  updateBrandKit(accountId: string, brandKitJson: string): void {
    db.prepare(`
      UPDATE accounts
      SET brand_kit_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(brandKitJson, accountId);
  }

  updateHealthStatus(id: string, status: string, healthStatus: string, tokenExpiresAt?: string): void {
    db.prepare(`
      UPDATE accounts
      SET status = ?, health_status = ?, token_expires_at = COALESCE(?, token_expires_at),
          last_health_check = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(status, healthStatus, tokenExpiresAt || null, id);
  }

  deleteAccount(id: string): void {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  }

  // --- CATEGORIES ---

  getAllCategories(): (CategoryEntity & { account_count: number })[] {
    return db.prepare(`
      SELECT c.*, count(a.id) as account_count
      FROM categories c
      LEFT JOIN accounts a ON c.id = a.category_id
      GROUP BY c.id
      ORDER BY c.name ASC
    `).all() as any[];
  }

  getCategoryById(id: string): CategoryEntity | undefined {
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
  }

  getCategoryByName(name: string): CategoryEntity | undefined {
    return db.prepare('SELECT id, slug, name, color, description, created_at FROM categories WHERE name = ?').get(name) as any;
  }

  getCategoryBySlug(slug: string): CategoryEntity | undefined {
    return db.prepare('SELECT id, slug FROM categories WHERE slug = ?').get(slug) as any;
  }

  createCategory(data: { id: string; name: string; slug: string; description: string; color: string }): void {
    db.prepare(`
      INSERT INTO categories (id, name, slug, description, color)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.id, data.name, data.slug, data.description, data.color);
  }

  updateCategory(id: string, updates: { name?: string; description?: string; color?: string }): void {
    db.prepare(`
      UPDATE categories SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        color = COALESCE(?, color)
      WHERE id = ?
    `).run(updates.name, updates.description, updates.color, id);
  }

  deleteCategory(id: string): void {
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }
}

export const accountsRepo = new AccountsRepository();

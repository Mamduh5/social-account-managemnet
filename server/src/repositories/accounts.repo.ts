import { db } from '../db/database.js';
import { AccountEntity, CategoryEntity } from '../domain/types.js';

export class AccountsRepository {
  getAllAccounts(includeArchived = false): (AccountEntity & { category_name?: string; category_color?: string; category_slug?: string })[] {
    return db.prepare(`
      SELECT a.*, c.name as category_name, c.color as category_color, c.slug as category_slug
      FROM accounts a
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE (? = 1 OR a.archived_at IS NULL)
      ORDER BY a.created_at ASC
    `).all(includeArchived ? 1 : 0) as any[];
  }

  getAccountById(id: string): (AccountEntity & { category_name?: string }) | undefined {
    return db.prepare(`
      SELECT a.*, c.name as category_name
      FROM accounts a
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.id = ?
    `).get(id) as any;
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

  // --- CATEGORIES ---

  getAllCategories(): (CategoryEntity & { account_count: number })[] {
    return db.prepare(`
      SELECT c.*, count(a.id) as account_count
      FROM categories c
      LEFT JOIN accounts a ON c.id = a.category_id AND a.archived_at IS NULL
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

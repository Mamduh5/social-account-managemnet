import { db } from '../db/database.js';
/** Registry and connection persistence, separate from videos and queue internals. */
export const accountConnectionsRepo = {
  transaction<T>(fn: () => T): T {
    return db.transaction(fn)();
  },
  findIdentity(platform: string, key: string): any {
    return db
      .prepare(
        'SELECT account_id FROM account_identities WHERE platform=? AND identity_key=?'
      )
      .get(platform, key);
  },
  claimIdentity(platform: string, key: string, id: string) {
    db.prepare(
      'INSERT OR IGNORE INTO account_identities(platform,identity_key,account_id) VALUES (?,?,?)'
    ).run(platform, key, id);
  },
  insertRegistered(a: any) {
    db.prepare(
      `INSERT INTO accounts(id,name,handle,platform,account_type,category_id,avatar_url,status,connector_mode,health_status) VALUES (?,?,?,?,?,?,?,'disconnected','official_api','Registered / Not Connected')`
    ).run(a.id, a.name, a.handle, a.platform, a.type, a.category, a.avatar);
  },
  updateRegistration(a: any) {
    db.prepare(
      `UPDATE accounts SET name=?,handle=?,public_url=?,account_type=?,category_id=?,avatar_url=?,description=?,notes=?,external_id=?,settings_json=?,updated_at=datetime('now') WHERE id=?`
    ).run(
      a.name,
      a.handle,
      a.publicUrl,
      a.type,
      a.category,
      a.avatar,
      a.description,
      a.notes,
      a.external,
      a.settings,
      a.id
    );
  },
  disconnect(id: string) {
    db.prepare(
      `UPDATE accounts SET status='disconnected',connection_status='disconnected',access_token=NULL,refresh_token=NULL,token_expires_at=NULL,refresh_expires_at=NULL,identity_verified_at=NULL,granted_scopes_json='[]',health_status='Disconnected; local preparation remains available',connection_revision=connection_revision+1,updated_at=datetime('now') WHERE id=?`
    ).run(id);
    this.clearSessions(id);
  },
  archive(id: string, date: string | null) {
    db.prepare(
      "UPDATE accounts SET archived_at=?,updated_at=datetime('now') WHERE id=?"
    ).run(date, id);
  },
  connectionStatus(id: string, status: string, health?: string) {
    db.prepare(
      'UPDATE accounts SET connection_status=?,health_status=COALESCE(?,health_status) WHERE id=?'
    ).run(status, health || null, id);
  },
  browserHandoff(id: string) {
    db.prepare(
      "UPDATE accounts SET connector_mode='browser_bridge',connection_status='limited',health_status='Browser-assisted setup; native identity and publication require manual confirmation' WHERE id=?"
    ).run(id);
  },
  saveConnection(id: string, item: any) {
    db.prepare(
      `UPDATE accounts SET external_id=?,access_token=?,refresh_token=?,token_expires_at=?,refresh_expires_at=?,granted_scopes_json=?,identity_verified_at=datetime('now'),status='connected',connector_mode='official_api',connection_status='limited',health_status='Authorized identity; operations depend on granted scopes',connection_revision=connection_revision+1,updated_at=datetime('now') WHERE id=?`
    ).run(
      item.id,
      item.accessToken,
      item.refreshToken,
      item.expiresAt,
      item.refreshExpiresAt,
      JSON.stringify(item.scopes),
      id
    );
    this.clearSessions(id);
  },
  clearSessions(id: string) {
    db.prepare('DELETE FROM oauth_sessions WHERE account_id=?').run(id);
  },
  findSession(browserHash: string): any {
    return db
      .prepare(
        'SELECT * FROM oauth_sessions WHERE browser_hash=? AND expires_at>? ORDER BY expires_at DESC LIMIT 1'
      )
      .get(browserHash, Date.now());
  },
  beginSession(session: any, previousBrowserHash: string) {
    this.transaction(() => {
      db.prepare(
        'DELETE FROM oauth_sessions WHERE expires_at<? OR account_id=? OR browser_hash=?'
      ).run(Date.now(), session.accountId, previousBrowserHash);
      db.prepare(
        "UPDATE accounts SET connection_status='authorization_required',connection_revision=connection_revision+1 WHERE id=?"
      ).run(session.accountId);
      db.prepare(
        'INSERT INTO oauth_sessions(state_hash,browser_hash,account_id,revision,expires_at,payload) VALUES (?,?,?,?,?,?)'
      ).run(
        session.stateHash,
        session.browserHash,
        session.accountId,
        session.revision,
        session.expiresAt,
        session.payload
      );
    });
  },
  exchanging(stateHash: string) {
    const result = db.prepare(
      "UPDATE oauth_sessions SET phase='exchanging' WHERE state_hash=? AND phase='started'"
    ).run(stateHash);
    if (result.changes !== 1) throw new Error('Authorization already in progress');
  },
  saveCandidates(stateHash: string, payload: string) {
    db.prepare(
      "UPDATE oauth_sessions SET payload=?,phase='selecting' WHERE state_hash=?"
    ).run(payload, stateHash);
  },
};

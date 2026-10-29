import { createHash } from 'node:crypto';
import { db } from '../db/database.js';
import { architectureSchemaReady } from '../db/architecture-schema.js';
import { canonicalPublicationPayload } from '../domain/publication-command.js';

/** Receipts deliberately outlive explicit history cleanup; there is no cascading FK. */
export function executePublishingCommand<T extends { postId: string }>(commandId: string | undefined, payload: unknown, create: () => T): T {
  if (commandId === undefined) return create(); // Existing internal calendar/draft callers retain their own approval contracts.
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(commandId)) throw new Error('A valid publication command ID is required.');
  if (!architectureSchemaReady(db)) throw new Error('Publishing command schema maintenance is required before this release can publish.');
  const hash = createHash('sha256').update(JSON.stringify(canonicalPublicationPayload(payload))).digest('hex');
  return db.transaction(() => {
    const previous = db.prepare('SELECT payload_hash,result_json FROM publishing_commands WHERE command_id=?').get(commandId) as { payload_hash: string; result_json: string } | undefined;
    if (previous) {
      if (previous.payload_hash !== hash) throw new Error('This publication command belongs to different content. Review the new content before creating another command.');
      return JSON.parse(previous.result_json) as T;
    }
    const result = create();
    db.prepare('INSERT INTO publishing_commands(command_id,payload_hash,post_id,result_json) VALUES(?,?,?,?)').run(commandId, hash, result.postId, JSON.stringify(result));
    return result;
  }).immediate();
}

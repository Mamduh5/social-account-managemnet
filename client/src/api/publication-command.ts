import { canonicalPublicationPayload } from '../../../server/src/domain/publication-command';
const storageKey = 'scc:pending-publication-command';
let pending: Map<string,string> | undefined;
function intents() {
  if (pending) return pending;
  pending = new Map();
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    const entries = Array.isArray(saved) ? saved : saved?.fingerprint ? [[saved.fingerprint,saved.commandId]] : [];
    for (const [fingerprint,commandId] of entries) if (/^[a-f0-9]{64}$/.test(fingerprint) && /^[a-zA-Z0-9-]{16,100}$/.test(commandId)) pending.set(fingerprint,commandId);
  } catch { /* Memory identities still protect retained editors. */ }
  return pending;
}
function persist() { try { sessionStorage.setItem(storageKey,JSON.stringify([...intents()])); } catch { /* Restricted storage never triggers replay. */ } }

/** Keep only a content fingerprint and command identity, never caption or credential bodies. */
export async function publicationCommand(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalPublicationPayload(payload)));
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('');
  const saved = intents();
  const existing = saved.get(fingerprint);
  if (existing) return existing;
  if (saved.size >= 50) throw new Error('Several publication outcomes remain unconfirmed. Review saved Publishing History before starting another command.');
  const random = crypto.getRandomValues(new Uint8Array(24));
  const commandId = 'command-' + Array.from(random).map(byte => byte.toString(16).padStart(2, '0')).join('');
  saved.set(fingerprint,commandId); persist();
  return commandId;
}

export function acknowledgePublicationCommand(commandId: string) {
  for (const [fingerprint,id] of intents()) if (id===commandId) intents().delete(fingerprint);
  persist();
}

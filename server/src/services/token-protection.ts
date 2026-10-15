import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
function key() {
  const value = process.env.SCC_TOKEN_ENCRYPTION_KEY || '';
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== 32)
    throw new Error(
      'Configure SCC_TOKEN_ENCRYPTION_KEY with a base64 32-byte key on the server'
    );
  return bytes;
}
export function tokenProtectionReady() {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}
export function seal(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [
    'enc1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}
export function unseal(value?: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('enc1:'))
    throw new Error('Legacy credentials require official reauthorization');
  const [, iv, tag, data] = value.split(':');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

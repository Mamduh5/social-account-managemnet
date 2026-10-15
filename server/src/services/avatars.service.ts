import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { uploadsDir } from '../db/database.js';
export function saveAvatar(bytes: Buffer) {
  let extension = '';
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    extension = 'png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    extension = 'jpg';
  else if (
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  )
    extension = 'webp';
  if (!extension || bytes.length > 2 * 1024 * 1024)
    throw new Error('Upload a PNG, JPEG or WebP avatar up to 2 MB');
  const dir = path.join(uploadsDir, 'avatars');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  fs.writeFileSync(path.join(dir, filename), bytes, { flag: 'wx' });
  return `/uploads/avatars/${filename}`;
}

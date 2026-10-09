import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_ROOT = path.resolve(__dirname, '../../.storage');

function keyPath(storageKey: string): string {
  return path.join(STORAGE_ROOT, storageKey);
}

export async function saveFile(organizationId: string, buffer: Buffer): Promise<string> {
  const storageKey = path.posix.join(organizationId, `${crypto.randomUUID()}.bin`);
  const dest = keyPath(storageKey);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.writeFile(dest, buffer);
  return storageKey;
}

export function readFile(storageKey: string): fs.ReadStream {
  return fs.createReadStream(keyPath(storageKey));
}

export async function deleteFile(storageKey: string): Promise<void> {
  await fsp.rm(keyPath(storageKey), { force: true });
}

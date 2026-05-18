import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getServerEnv } from '../env';

const KEY_FILE = 'workspace-secret.key';

function getWorkspaceKey() {
  const env = getServerEnv();
  const keyPath = path.join(env.dataRoot, KEY_FILE);
  fs.mkdirSync(env.dataRoot, { recursive: true });

  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, randomBytes(32).toString('base64'), { mode: 0o600 });
  }

  const encoded = fs.readFileSync(keyPath, 'utf-8').trim();
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('workspace secret key 格式错误');
  return key;
}

export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getWorkspaceKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decryptSecret(payload: string) {
  if (!payload) return '';
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) return '';

  const decipher = createDecipheriv('aes-256-gcm', getWorkspaceKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64')),
    decipher.final(),
  ]).toString('utf-8');
}

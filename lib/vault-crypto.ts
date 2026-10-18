import crypto from 'crypto';

// Vault credential encryption (AES-256-GCM, CODES_ENC_KEY base64 32B).
// Format: gcm:<iv b64>:<ciphertext b64>:<tag b64>
export function vaultEncrypt(plain: string): string {
  const b64key = process.env.CODES_ENC_KEY ?? '';
  if (!b64key) return `plain:${plain}`;
  try {
    const key = Buffer.from(b64key, 'base64');
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `gcm:${iv.toString('base64')}:${ct.toString('base64')}:${c.getAuthTag().toString('base64')}`;
  } catch {
    return 'enc-error';
  }
}

export function vaultDecrypt(stored: string): string {
  if (stored.startsWith('plain:')) return stored.slice(6);
  const b64key = process.env.CODES_ENC_KEY ?? '';
  const m = /^gcm:([^:]+):([^:]+):([^:]+)$/.exec(stored);
  if (!m || !b64key) return stored;
  try {
    const key = Buffer.from(b64key, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(m[1], 'base64'));
    d.setAuthTag(Buffer.from(m[3], 'base64'));
    return Buffer.concat([d.update(Buffer.from(m[2], 'base64')), d.final()]).toString('utf8');
  } catch {
    return stored;
  }
}

/**
 * Universal parser for account credentials.
 * Supports:
 * - pipe-separated: user | pass or user|pass
 * - colon-separated: user:pass or user@domain.com:pass
 * - multi-dash separated: user----pass or user---pass or user--pass
 * - tab-separated: user\tpass
 * - semicolon-separated: user;pass
 * - slash-separated: user / pass
 * - comma-separated: user,pass
 * - space-separated: user@domain.com pass
 */
export function parseCredentialLine(rawLine: string): { login: string; password: string } | null {
  const line = rawLine.trim();
  if (!line || line.startsWith('#') || line.startsWith('//')) return null;

  // 1. Dash-separated: user----pass or user---pass or user--pass
  const dashMatch = line.match(/^(.+?)\s*-{2,}\s*(.+)$/);
  if (dashMatch && dashMatch[1].trim() && dashMatch[2].trim()) {
    return { login: dashMatch[1].trim(), password: dashMatch[2].trim() };
  }

  // 2. Pipe delimiter: user | pass or user|pass
  if (line.includes('|')) {
    const parts = line.split('|');
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      return { login: parts[0].trim(), password: parts.slice(1).join('|').trim() };
    }
  }

  // 3. Tab delimiter: user\tpass
  if (line.includes('\t')) {
    const parts = line.split('\t');
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      return { login: parts[0].trim(), password: parts.slice(1).join('\t').trim() };
    }
  }

  // 4. Semicolon delimiter: user;pass
  if (line.includes(';')) {
    const parts = line.split(';');
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      return { login: parts[0].trim(), password: parts.slice(1).join(';').trim() };
    }
  }

  // 5. Slash delimiter with spaces: user / pass
  const slashMatch = line.match(/^(.+?)\s+\/\s+(.+)$/);
  if (slashMatch && slashMatch[1].trim() && slashMatch[2].trim()) {
    return { login: slashMatch[1].trim(), password: slashMatch[2].trim() };
  }

  // 6. Colon delimiter: user:pass
  if (line.includes(':')) {
    const firstColon = line.indexOf(':');
    const login = line.slice(0, firstColon).trim();
    const password = line.slice(firstColon + 1).trim();
    if (login && password) {
      return { login, password };
    }
  }

  // 7. Comma delimiter: user,pass
  if (line.includes(',')) {
    const parts = line.split(',');
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      return { login: parts[0].trim(), password: parts.slice(1).join(',').trim() };
    }
  }

  // 8. Space delimiter if first token is email: user@domain.com pass
  const spaceMatch = line.match(/^([^\s@]+@[^\s@]+\.[^\s@]+)\s+(.+)$/);
  if (spaceMatch && spaceMatch[1] && spaceMatch[2]) {
    return { login: spaceMatch[1].trim(), password: spaceMatch[2].trim() };
  }

  return null;
}


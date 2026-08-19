export function normalizeJwtKey(value: string | undefined): string | undefined {
  if (!value) return value;

  const normalized = value.replace(/\\n/g, '\n').trim();
  if (normalized.includes('-----BEGIN')) {
    return normalized;
  }

  if (normalized.startsWith('base64:')) {
    return Buffer.from(normalized.slice('base64:'.length), 'base64').toString('utf8').trim();
  }

  return normalized;
}

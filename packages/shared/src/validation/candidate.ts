export type NormalizedCandidateResult = {
  ok: boolean;
  value: string | null;
  label: 'empty' | 'short' | 'ready';
};

export function normalizeCandidate(input: string | null | undefined): NormalizedCandidateResult {
  const raw = input?.trim() ?? '';

  if (!raw) {
    return { ok: false, value: null, label: 'empty' };
  }

  const compact = raw
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim();

  if (compact.length < 4) {
    return { ok: false, value: null, label: 'short' };
  }

  const value =
    compact.length > 32
      ? `${compact.slice(0, 29).trimEnd()}...`
      : compact;

  return {
    ok: true,
    value,
    label: 'ready',
  };
}

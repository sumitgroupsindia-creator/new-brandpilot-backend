export interface ConfigEntryValue {
  key: string;
  namespace: string;
  value: unknown;
  isSecret: boolean;
  tenantId: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ConfigVersionValue {
  id: string;
  configId: string;
  value: unknown;
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface PublicConfig {
  branding: Record<string, unknown>;
  flags: Record<string, unknown>;
  billing: Record<string, unknown>;
  limits: Record<string, unknown>;
}

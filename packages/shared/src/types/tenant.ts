export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export interface PublicTenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  displayName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  createdAt: string;
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  DELETED = 'DELETED',
}

export enum RoleKey {
  SUPER_ADMIN = 'SUPER_ADMIN',
  TENANT_ADMIN = 'TENANT_ADMIN',
  SUPPORT = 'SUPPORT',
  FINANCE = 'FINANCE',
  USER = 'USER',
}

export enum Permission {
  USER_MANAGE = 'user.manage',
  USER_IMPERSONATE = 'user.impersonate',
  FRAME_MANAGE = 'frame.manage',
  FRAME_PUBLISH = 'frame.publish',
  CATEGORY_MANAGE = 'category.manage',
  WALLET_ADJUST = 'wallet.adjust',
  WALLET_REFUND = 'wallet.refund',
  PAYMENT_READ = 'payment.read',
  CONFIG_MANAGE = 'config.manage',
  ANALYTICS_READ = 'analytics.read',
  AUDIT_READ = 'audit.read',
  JOBS_MANAGE = 'jobs.manage',
  TENANT_MANAGE = 'tenant.manage',
}

export interface JwtClaims {
  sub: string;
  tid: string;
  email: string;
  roles: RoleKey[];
  perms: Permission[];
  sid: string;
  jti: string;
  iat: number;
  exp: number;
  act?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  status: UserStatus;
  emailVerifiedAt: string | null;
  tenantId: string;
  roles: RoleKey[];
  createdAt: string;
}

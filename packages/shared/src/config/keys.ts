export const ConfigNamespaces = {
  BILLING: 'billing',
  AI: 'ai',
  STORAGE: 'storage',
  LIMITS: 'limits',
  AUTH: 'auth',
  FLAGS: 'flags',
  BRANDING: 'branding',
  NOTIFICATIONS: 'notifications',
} as const;

export type ConfigNamespace = (typeof ConfigNamespaces)[keyof typeof ConfigNamespaces];

export const ConfigKeys = {
  // Billing
  BILLING_PLANS: 'billing.plans',
  BILLING_CURRENCY: 'billing.currency',
  BILLING_CREDIT_EXPIRY_DEFAULT_DAYS: 'billing.creditExpiryDefaultDays',
  BILLING_LOW_BALANCE_THRESHOLD: 'billing.lowBalanceThreshold',
  BILLING_SUBSCRIPTION_PLANS: 'billing.subscription.plans',
  BILLING_SUBSCRIPTION_GRACE_DAYS_DEFAULT: 'billing.subscription.graceDaysDefault',
  BILLING_SUBSCRIPTION_PREMIUM_ALSO_COSTS_CREDITS: 'billing.subscription.premiumAlsoCostsCredits',

  // AI
  AI_IMAGE_DEFAULT_PROVIDER: 'ai.image.defaultProvider',
  AI_IMAGE_COST: 'ai.image.cost',
  AI_VIDEO_DEFAULT_PROVIDER: 'ai.video.defaultProvider',
  AI_VIDEO_COST: 'ai.video.cost',
  AI_OPENAI_API_KEY: 'ai.openai.apiKey',
  AI_OPENAI_TIMEOUT_MS: 'ai.openai.timeoutMs',
  AI_OPENAI_RETRIES: 'ai.openai.retries',
  AI_OPENAI_QUEUE_SIZE: 'ai.openai.queueSize',
  AI_OPENAI_MAX_CONCURRENT: 'ai.openai.maxConcurrent',
  AI_RUNWAY_API_KEY: 'ai.runway.apiKey',
  AI_RUNWAY_TIMEOUT_MS: 'ai.runway.timeoutMs',
  AI_RUNWAY_RETRIES: 'ai.runway.retries',
  AI_RUNWAY_QUEUE_SIZE: 'ai.runway.queueSize',
  AI_RUNWAY_MAX_CONCURRENT: 'ai.runway.maxConcurrent',
  AI_MODERATION_ENABLED: 'ai.moderation.enabled',

  // Storage
  STORAGE_PATHS: 'storage.paths',
  STORAGE_MAX_UPLOAD_BYTES: 'storage.maxUploadBytes',
  STORAGE_ALLOWED_MIME: 'storage.allowedMime',
  STORAGE_TENANT_QUOTA_BYTES: 'storage.tenantQuotaBytes',

  // Limits
  LIMITS_GEN_PER_USER_DAILY: 'limits.gen.perUser.daily',
  LIMITS_GEN_PER_USER_CONCURRENT: 'limits.gen.perUser.concurrent',
  LIMITS_GEN_PER_TENANT_MONTHLY: 'limits.gen.perTenant.monthly',
  LIMITS_RATE_API_PER_MIN: 'limits.rate.api.perMin',

  // Auth
  AUTH_ACCESS_TTL_SEC: 'auth.access.ttlSec',
  AUTH_REFRESH_TTL_DAYS: 'auth.refresh.ttlDays',
  AUTH_PASSWORD_MIN_LEN: 'auth.password.minLen',
  AUTH_LOCKOUT_MAX_ATTEMPTS: 'auth.lockout.maxAttempts',

  // Flags
  FLAGS_MAINTENANCE_MODE: 'flags.maintenanceMode',
  FLAGS_VIDEO_ENABLED: 'flags.videoEnabled',
  FLAGS_OFFLINE_DRAFTS: 'flags.offlineDrafts',
  FLAGS_SUBSCRIPTIONS_ENABLED: 'flags.subscriptionsEnabled',

  // Branding
  BRANDING_APP_NAME: 'branding.appName',
  BRANDING_LOGO_URL: 'branding.logoUrl',
  BRANDING_THEME: 'branding.theme',

  // Notifications
  NOTIFICATIONS_TEMPLATES: 'notifications.templates',
} as const;

export type ConfigKey = (typeof ConfigKeys)[keyof typeof ConfigKeys];

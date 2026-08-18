import { ConfigKeys } from './keys';

export type ConfigValueType = 'string' | 'number' | 'boolean' | 'json' | 'secret';

export interface ConfigKeyMeta {
  key: string;
  namespace: string;
  type: ConfigValueType;
  defaultValue: unknown;
  description: string;
  isSecret: boolean;
  validation?: {
    min?: number;
    max?: number;
    regex?: string;
  };
}

export const CONFIG_REGISTRY: ConfigKeyMeta[] = [
  {
    key: ConfigKeys.BILLING_CURRENCY,
    namespace: 'billing',
    type: 'string',
    defaultValue: 'INR',
    description: 'Default currency for payments',
    isSecret: false,
  },
  {
    key: ConfigKeys.BILLING_CREDIT_EXPIRY_DEFAULT_DAYS,
    namespace: 'billing',
    type: 'number',
    defaultValue: 365,
    description: 'Default expiry for purchased credits',
    isSecret: false,
    validation: { min: 1 },
  },
  {
    key: ConfigKeys.BILLING_LOW_BALANCE_THRESHOLD,
    namespace: 'billing',
    type: 'number',
    defaultValue: 20,
    description: 'Balance threshold for low-balance notification',
    isSecret: false,
    validation: { min: 0 },
  },
  {
    key: ConfigKeys.BILLING_SUBSCRIPTION_PLANS,
    namespace: 'billing',
    type: 'json',
    defaultValue: [
      {
        id: 'sub-plan-monthly',
        name: 'Premium Monthly',
        amountInr: 499,
        period: 'MONTHLY',
        premiumFrames: true,
        monthlyCredits: 0,
        graceDays: 3,
        active: true,
      },
    ],
    description: 'Subscription plans and entitlements',
    isSecret: false,
  },
  {
    key: ConfigKeys.BILLING_SUBSCRIPTION_GRACE_DAYS_DEFAULT,
    namespace: 'billing',
    type: 'number',
    defaultValue: 3,
    description: 'Default grace period for failed subscription renewals',
    isSecret: false,
    validation: { min: 0, max: 30 },
  },
  {
    key: ConfigKeys.BILLING_SUBSCRIPTION_PREMIUM_ALSO_COSTS_CREDITS,
    namespace: 'billing',
    type: 'boolean',
    defaultValue: true,
    description: 'Whether premium frame generations still consume credits',
    isSecret: false,
  },
  {
    key: ConfigKeys.AI_IMAGE_DEFAULT_PROVIDER,
    namespace: 'ai',
    type: 'string',
    defaultValue: 'openai',
    description: 'Default image generation provider',
    isSecret: false,
  },
  {
    key: ConfigKeys.AI_IMAGE_COST,
    namespace: 'ai',
    type: 'json',
    defaultValue: { openai: { 'gpt-image-1': { '1024x1024': 10 } } },
    description: 'Image generation cost matrix in credits',
    isSecret: false,
  },
  {
    key: ConfigKeys.AI_OPENAI_API_KEY,
    namespace: 'ai',
    type: 'secret',
    defaultValue: '',
    description: 'OpenAI API key',
    isSecret: true,
  },
  {
    key: ConfigKeys.AI_OPENAI_TIMEOUT_MS,
    namespace: 'ai',
    type: 'number',
    defaultValue: 60000,
    description: 'OpenAI request timeout',
    isSecret: false,
    validation: { min: 1000, max: 300000 },
  },
  {
    key: ConfigKeys.AI_OPENAI_RETRIES,
    namespace: 'ai',
    type: 'number',
    defaultValue: 3,
    description: 'OpenAI retry attempts',
    isSecret: false,
    validation: { min: 0, max: 10 },
  },
  {
    key: ConfigKeys.AI_OPENAI_MAX_CONCURRENT,
    namespace: 'ai',
    type: 'number',
    defaultValue: 10,
    description: 'Max concurrent OpenAI jobs',
    isSecret: false,
    validation: { min: 1 },
  },
  {
    key: ConfigKeys.AI_MODERATION_ENABLED,
    namespace: 'ai',
    type: 'boolean',
    defaultValue: true,
    description: 'Enable content moderation hook',
    isSecret: false,
  },
  {
    key: ConfigKeys.STORAGE_MAX_UPLOAD_BYTES,
    namespace: 'storage',
    type: 'number',
    defaultValue: 10485760,
    description: 'Maximum upload size in bytes',
    isSecret: false,
    validation: { min: 1024 },
  },
  {
    key: ConfigKeys.LIMITS_GEN_PER_USER_DAILY,
    namespace: 'limits',
    type: 'number',
    defaultValue: 100,
    description: 'Daily generation limit per user',
    isSecret: false,
    validation: { min: 1 },
  },
  {
    key: ConfigKeys.LIMITS_GEN_PER_USER_CONCURRENT,
    namespace: 'limits',
    type: 'number',
    defaultValue: 3,
    description: 'Concurrent generation limit per user',
    isSecret: false,
    validation: { min: 1 },
  },
  {
    key: ConfigKeys.AUTH_ACCESS_TTL_SEC,
    namespace: 'auth',
    type: 'number',
    defaultValue: 900,
    description: 'Access token TTL in seconds',
    isSecret: false,
    validation: { min: 60 },
  },
  {
    key: ConfigKeys.AUTH_REFRESH_TTL_DAYS,
    namespace: 'auth',
    type: 'number',
    defaultValue: 30,
    description: 'Refresh token TTL in days',
    isSecret: false,
    validation: { min: 1 },
  },
  {
    key: ConfigKeys.AUTH_PASSWORD_MIN_LEN,
    namespace: 'auth',
    type: 'number',
    defaultValue: 10,
    description: 'Minimum password length',
    isSecret: false,
    validation: { min: 6 },
  },
  {
    key: ConfigKeys.FLAGS_MAINTENANCE_MODE,
    namespace: 'flags',
    type: 'boolean',
    defaultValue: false,
    description: 'Platform maintenance mode',
    isSecret: false,
  },
  {
    key: ConfigKeys.FLAGS_VIDEO_ENABLED,
    namespace: 'flags',
    type: 'boolean',
    defaultValue: true,
    description: 'Enable video generation feature',
    isSecret: false,
  },
  {
    key: ConfigKeys.FLAGS_SUBSCRIPTIONS_ENABLED,
    namespace: 'flags',
    type: 'boolean',
    defaultValue: true,
    description: 'Enable subscription and premium frame entitlement checks',
    isSecret: false,
  },
  {
    key: ConfigKeys.BRANDING_APP_NAME,
    namespace: 'branding',
    type: 'string',
    defaultValue: 'BrandPilot',
    description: 'Application display name',
    isSecret: false,
  },
  {
    key: ConfigKeys.NOTIFICATIONS_TEMPLATES,
    namespace: 'notifications',
    type: 'json',
    defaultValue: [],
    description: 'Template rows for notification events, channels and locales',
    isSecret: false,
  },
];

export function getConfigMeta(key: string): ConfigKeyMeta | undefined {
  return CONFIG_REGISTRY.find(meta => meta.key === key);
}

export function getNamespaceKeys(namespace: string): ConfigKeyMeta[] {
  return CONFIG_REGISTRY.filter(meta => meta.namespace === namespace);
}

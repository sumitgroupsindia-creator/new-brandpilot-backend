import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { FrameStatus, FrameTier, Prisma, UserStatus } from '../generated/prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import {
  CONFIG_REGISTRY,
  ConfigKeyMeta,
  ConfigKeys,
  getConfigMeta,
} from '@brandpilot/shared';

export interface AdminSeedConfig {
  emails: string[];
  password: string;
}

export function getAdminSeedConfig(env: NodeJS.ProcessEnv = process.env): AdminSeedConfig {
  const primaryEmail = env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@brandpilot.app';
  const fallbackEmail = env.SEED_SUPER_ADMIN_FALLBACK_EMAIL ?? 'admin@sumitgroups.com';
  const password = env.SEED_SUPER_ADMIN_PASSWORD ?? 'BrandPilot#Admin2026';

  return {
    emails: [primaryEmail, fallbackEmail],
    password,
  };
}

@Injectable()
export class ConfigService implements OnModuleInit {
  private readonly logger = new Logger(ConfigService.name);
  private cache = new Map<string, unknown>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly nestConfig: NestConfigService,
  ) {}

  async onModuleInit() {
    await this.seedDefaults();
    await this.seedDefaultCatalog();
    this.logger.log('Config defaults seeded');
  }

  async seedDefaults() {
    for (const meta of CONFIG_REGISTRY) {
      const existing = await this.prisma.configEntry.findFirst({
        where: { tenantId: null, namespace: meta.namespace, key: meta.key },
      });
      if (!existing) {
        await this.prisma.configEntry.create({
          data: {
            tenantId: null,
            namespace: meta.namespace,
            key: meta.key,
            value: (meta.isSecret
              ? { encrypted: this.encryption.encrypt(String(meta.defaultValue)) }
              : meta.defaultValue) as any,
            isSecret: meta.isSecret,
          },
        });
      }
    }
  }

  private async seedDefaultCatalog() {
    let tenant = await this.prisma.tenant.findFirst({
      where: { slug: 'default' },
      select: { id: true },
    });

    if (!tenant) {
      tenant = await this.prisma.tenant.create({
        data: {
          name: 'Default Tenant',
          slug: 'default',
          status: 'ACTIVE' as any,
          displayName: 'Default Tenant',
        },
        select: { id: true },
      });
    }

    await this.ensureDefaultAdmin(tenant.id);
    await this.ensureDefaultImageCategoryHierarchy(tenant.id);

    const existingCategories = await this.prisma.category.count({ where: { tenantId: tenant.id } });
    if (existingCategories > 0) {
      return;
    }

    const defaultCategoryNames = [
      'Branding',
      'Lifestyle',
      'Events',
    ];

    const createdCategories = [] as Array<{ id: string; name: string }>;

    for (const [index, name] of defaultCategoryNames.entries()) {
      const category = await this.prisma.category.create({
        data: {
          tenantId: tenant.id,
          name,
          sortOrder: index + 1,
        },
        select: { id: true, name: true },
      });
      createdCategories.push(category);
    }

    const parent = createdCategories[0];
    const subcategories = [
      { name: 'Social', parentId: parent.id },
      { name: 'Product', parentId: parent.id },
      { name: 'Editorial', parentId: parent.id },
    ];

    for (const [index, item] of subcategories.entries()) {
      await this.prisma.category.create({
        data: {
          tenantId: tenant.id,
          parentId: item.parentId,
          name: item.name,
          sortOrder: index + 1,
        },
      });
    }

    const frameCategory = createdCategories[1];
    const frameTemplates = [
      {
        title: 'Golden Frame',
        description: 'Premium metallic frame for luxury compositions.',
        tier: FrameTier.PREMIUM,
        status: FrameStatus.PUBLISHED,
        template: {
          kind: 'frame',
          style: 'golden',
          accent: '#f6c04d',
        },
      },
      {
        title: 'Minimal Border',
        description: 'Clean border suitable for editorial and product work.',
        tier: FrameTier.FREE,
        status: FrameStatus.PUBLISHED,
        template: {
          kind: 'frame',
          style: 'minimal',
          accent: '#1f2937',
        },
      },
      {
        title: 'Soft Glow',
        description: 'A soft glow frame for modern campaigns.',
        tier: FrameTier.FREE,
        status: FrameStatus.PUBLISHED,
        template: {
          kind: 'frame',
          style: 'glow',
          accent: '#7c3aed',
        },
      },
    ];

    for (const [index, frame] of frameTemplates.entries()) {
      await this.prisma.frame.create({
        data: {
          tenantId: tenant.id,
          categoryId: frameCategory.id,
          title: frame.title,
          description: frame.description,
          tier: frame.tier,
          status: frame.status,
          template: frame.template as Prisma.InputJsonValue,
          estimatedCredits: 0,
          isFeatured: index === 0,
          isTrending: index === 1,
          version: 1,
        },
      });
    }

  }

  private async ensureDefaultImageCategoryHierarchy(tenantId: string) {
    const imageCategories = this.getDefaultImageCategories();
    const existingEntry = await this.prisma.configEntry.findFirst({
      where: {
        tenantId,
        namespace: 'catalog',
        key: 'imageCategories',
      },
      select: { id: true, value: true },
    });

    if (!existingEntry) {
      await this.prisma.configEntry.create({
        data: {
          tenantId,
          namespace: 'catalog',
          key: 'imageCategories',
          value: imageCategories as any,
          isSecret: false,
        },
      });
      return;
    }

    const existing = existingEntry.value as Array<{ parentId?: string | null; images?: unknown[] }>;
    const hasSubcategoriesWithImages = Array.isArray(existing)
      && existing.some(category => Boolean(category.parentId) && Array.isArray(category.images) && category.images.length > 0);

    if (!hasSubcategoriesWithImages) {
      await this.prisma.configEntry.update({
        where: { id: existingEntry.id },
        data: { value: imageCategories as any },
      });
    }
  }

  private getDefaultImageCategories() {
    const now = new Date().toISOString();

    return [
      {
        id: 'default-image-category-root-1',
        name: 'Marketing Visuals',
        active: true,
        sortOrder: 1,
        createdAt: now,
        images: [],
      },
      {
        id: 'default-image-subcategory-1',
        parentId: 'default-image-category-root-1',
        name: 'Hero Shots',
        active: true,
        sortOrder: 1,
        createdAt: now,
        images: [
          {
            id: 'default-image-1',
            name: 'Studio Portrait',
            url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80',
            active: true,
            createdAt: now,
            tier: 'FREE' as const,
            estimatedCredits: 0,
            sortOrder: 1,
          },
          {
            id: 'default-image-2',
            name: 'Lifestyle Product',
            url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80',
            active: true,
            createdAt: now,
            tier: 'FREE' as const,
            estimatedCredits: 0,
            sortOrder: 2,
          },
        ],
      },
      {
        id: 'default-image-subcategory-2',
        parentId: 'default-image-category-root-1',
        name: 'Social Posters',
        active: true,
        sortOrder: 2,
        createdAt: now,
        images: [
          {
            id: 'default-image-3',
            name: 'Product Grid Banner',
            url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
            active: true,
            createdAt: now,
            tier: 'FREE' as const,
            estimatedCredits: 0,
            sortOrder: 1,
          },
        ],
      },
    ];
  }

  private async ensureDefaultAdmin(tenantId: string) {
    const adminSeed = getAdminSeedConfig();
    const passwordHash = await argon2.hash(adminSeed.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const superAdminRole = await this.prisma.role.upsert({
      where: { tenantId_key: { tenantId, key: 'SUPER_ADMIN' } },
      update: {
        name: 'Super Admin',
        description: 'Full platform access across subscription, wallet, and tenant controls.',
        isSystem: true,
      },
      create: {
        tenantId,
        key: 'SUPER_ADMIN',
        name: 'Super Admin',
        description: 'Full platform access across subscription, wallet, and tenant controls.',
        isSystem: true,
      },
    });

    for (const email of adminSeed.emails) {
      const user = await this.prisma.user.upsert({
        where: { tenantId_email: { tenantId, email } },
        update: {
          passwordHash,
          name: 'Super Admin',
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
        create: {
          tenantId,
          email,
          passwordHash,
          name: 'Super Admin',
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });

      if (superAdminRole) {
        await this.prisma.userRole.upsert({
          where: {
            userId_roleId: {
              userId: user.id,
              roleId: superAdminRole.id,
            },
          },
          update: {},
          create: { userId: user.id, roleId: superAdminRole.id },
        });
      }
    }
  }

  async get<T = unknown>(key: string, tenantId?: string | null): Promise<T | undefined> {
    const cacheKey = `${tenantId ?? 'platform'}:${key}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as T;
    }

    const value = await this.resolveValue(key, tenantId ?? null);
    if (value !== undefined) {
      this.cache.set(cacheKey, value);
    }
    return value as T;
  }

  async getOrThrow<T = unknown>(key: string, tenantId?: string | null): Promise<T> {
    const value = await this.get<T>(key, tenantId);
    if (value === undefined) {
      throw new Error(`Config key not found: ${key}`);
    }
    return value;
  }

  async getNumber(key: string, tenantId?: string | null): Promise<number | undefined> {
    const value = await this.get<unknown>(key, tenantId);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    return undefined;
  }

  async getString(key: string, tenantId?: string | null): Promise<string | undefined> {
    const value = await this.get<unknown>(key, tenantId);
    if (value === undefined || value === null) return undefined;
    return String(value);
  }

  async getBoolean(key: string, tenantId?: string | null): Promise<boolean | undefined> {
    const value = await this.get<unknown>(key, tenantId);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return undefined;
  }

  private async resolveValue(key: string, tenantId: string | null): Promise<unknown> {
    // Try tenant override
    if (tenantId) {
      const tenantEntry = await this.prisma.configEntry.findFirst({
        where: { tenantId, key },
      });
      if (tenantEntry) {
        return this.decodeValue(tenantEntry.value, tenantEntry.isSecret);
      }
    }

    // Try platform default
    const platformEntry = await this.prisma.configEntry.findFirst({
      where: { tenantId: null, key },
    });
    if (platformEntry) {
      return this.decodeValue(platformEntry.value, platformEntry.isSecret);
    }

    // Hardcoded fallback
    const meta = getConfigMeta(key);
    return meta?.defaultValue;
  }

  private decodeValue(value: unknown, isSecret: boolean): unknown {
    if (!isSecret || value === null || value === undefined) return value;
    if (
      typeof value === 'object' &&
      value !== null &&
      'encrypted' in value &&
      typeof (value as { encrypted: string }).encrypted === 'string'
    ) {
      return this.encryption.decrypt((value as { encrypted: string }).encrypted);
    }
    return value;
  }

  async set(
    key: string,
    value: unknown,
    options: {
      tenantId?: string | null;
      updatedBy?: string;
      reason?: string;
      isSecret?: boolean;
    } = {},
  ) {
    const namespace = key.split('.')[0];
    const meta = getConfigMeta(key);
    const isSecret = options.isSecret ?? meta?.isSecret ?? false;

    // Validate
    this.validateValue(key, value, meta);

    const storedValue = isSecret
      ? { encrypted: this.encryption.encrypt(String(value)) }
      : value;

    const existing = await this.prisma.configEntry.findFirst({
      where: { tenantId: options.tenantId ?? null, namespace, key },
    });

    let entry;
    if (existing) {
      entry = await this.prisma.configEntry.update({
        where: { id: existing.id },
        data: {
          value: storedValue as any,
          isSecret,
          updatedBy: options.updatedBy,
        },
      });
    } else {
      entry = await this.prisma.configEntry.create({
        data: {
          tenantId: options.tenantId ?? null,
          namespace,
          key,
          value: storedValue as any,
          isSecret,
          updatedBy: options.updatedBy,
        },
      });
    }

    await this.prisma.configVersion.create({
      data: {
        configId: entry.id,
        value: storedValue as any,
        reason: options.reason ?? null,
        createdBy: options.updatedBy ?? null,
      },
    });

    // Invalidate cache
    const cacheKey = `${options.tenantId ?? 'platform'}:${key}`;
    this.cache.delete(cacheKey);

    return entry;
  }

  private validateValue(key: string, value: unknown, meta?: ConfigKeyMeta) {
    if (!meta) return;
    if (meta.validation?.min !== undefined && typeof value === 'number' && value < meta.validation.min) {
      throw new Error(`Config ${key} must be >= ${meta.validation.min}`);
    }
    if (meta.validation?.max !== undefined && typeof value === 'number' && value > meta.validation.max) {
      throw new Error(`Config ${key} must be <= ${meta.validation.max}`);
    }
  }

  async getPublicConfig(tenantId: string | null): Promise<Record<string, Record<string, unknown>>> {
    const namespaces = ['branding', 'flags', 'billing', 'limits'];
    const result: Record<string, Record<string, unknown>> = {};
    for (const ns of namespaces) {
      result[ns] = await this.getNamespaceConfig(ns, tenantId);
    }
    return result;
  }

  async getNamespaceConfig(
    namespace: string,
    tenantId: string | null,
  ): Promise<Record<string, unknown>> {
    const entries = await this.prisma.configEntry.findMany({
      where: {
        namespace,
        isSecret: false,
        OR: [{ tenantId: tenantId ?? null }, { tenantId: null }],
      },
      orderBy: { tenantId: 'asc' },
    });
    const merged = new Map<string, unknown>();
    for (const entry of entries) {
      if (entry.tenantId === null && merged.has(entry.key)) continue;
      merged.set(entry.key, this.decodeValue(entry.value, entry.isSecret));
    }
    const result: Record<string, unknown> = {};
    for (const [k, v] of merged) {
      const shortKey = k.replace(`${namespace}.`, '');
      result[shortKey] = v;
    }
    return result;
  }
}

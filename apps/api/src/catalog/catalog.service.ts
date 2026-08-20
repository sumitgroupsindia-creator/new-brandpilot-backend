import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigKeys } from '@brandpilot/shared';
import { FrameStatus, FrameTier } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

interface FrameCategoryStateMap {
  [categoryId: string]: {
    active: boolean;
  };
}

interface ImageCategoryConfig {
  id: string;
  name: string;
  parentId?: string | null;
  active: boolean;
  sortOrder: number;
  images: Array<{
    id: string;
    name: string;
    url: string;
    active: boolean;
    createdAt: string;
    sortOrder?: number;
    tier?: 'FREE' | 'PREMIUM';
    estimatedCredits?: number;
  }>;
}

interface AssetUnlockState {
  users?: Record<string, {
    frames?: Record<string, string>;
    images?: Record<string, string>;
  }>;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async listFrames(userId?: string, categoryId?: string, filter?: string) {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const hasPremiumAccess = userId && tenantId ? await this.subscriptionsService.hasPremiumAccess(userId, tenantId) : false;
    const stateMap = tenantId ? await this.getFrameCategoryStateMap(tenantId) : {};
    const normalizedFilter = (filter ?? 'all').toLowerCase();
    const whereFilter =
      normalizedFilter === 'featured'
        ? { isFeatured: true }
        : normalizedFilter === 'trending'
          ? { isTrending: true }
          : {};

    const frames = await this.prisma.frame.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...whereFilter,
        status: FrameStatus.PUBLISHED,
      },
      include: { category: true },
      orderBy: [{ isFeatured: 'desc' }, { isTrending: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });

    return frames
      .filter(frame => {
        if (!frame.categoryId) {
          return true;
        }

        return stateMap[frame.categoryId]?.active ?? true;
      })
      .map(frame => ({
      thumbnailUrl: this.extractFrameThumbnailUrl(frame.template),
      dynamicFields: this.extractDynamicFields(frame.template),
      renderSize: this.extractRenderSize(frame.template),
      id: frame.id,
      title: frame.title,
      categoryId: frame.categoryId,
      category: frame.category?.name ?? 'Uncategorized',
      tier: frame.tier,
      trending: frame.isTrending,
      featured: frame.isFeatured,
      description: frame.description ?? '',
      estimatedCredits: frame.estimatedCredits,
      requiresSubscription: frame.tier === FrameTier.PREMIUM,
      isLocked: frame.tier === FrameTier.PREMIUM ? !hasPremiumAccess : false,
    }));
  }

  async getFrame(frameId: string, userId?: string) {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const hasPremiumAccess = userId && tenantId ? await this.subscriptionsService.hasPremiumAccess(userId, tenantId) : false;

    const frame = await this.prisma.frame.findFirst({
      where: {
        id: frameId,
        ...(tenantId ? { tenantId } : {}),
        status: FrameStatus.PUBLISHED,
      },
      include: { category: true },
    });

    if (!frame) {
      return null;
    }

    if (tenantId && frame.categoryId) {
      const stateMap = await this.getFrameCategoryStateMap(tenantId);
      if (stateMap[frame.categoryId]?.active === false) {
        return null;
      }
    }

    return {
      thumbnailUrl: this.extractFrameThumbnailUrl(frame.template),
      dynamicFields: this.extractDynamicFields(frame.template),
      renderSize: this.extractRenderSize(frame.template),
      templateLayers: this.extractTemplateLayers(frame.template),
      id: frame.id,
      title: frame.title,
      categoryId: frame.categoryId,
      category: frame.category?.name ?? 'Uncategorized',
      tier: frame.tier,
      trending: frame.isTrending,
      featured: frame.isFeatured,
      description: frame.description ?? '',
      estimatedCredits: frame.estimatedCredits,
      requiresSubscription: frame.tier === FrameTier.PREMIUM,
      isLocked: frame.tier === FrameTier.PREMIUM ? !hasPremiumAccess : false,
    };
  }

  async listAssets() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const userId = this.tenantContext.get()?.userId;
    const assets = await this.prisma.asset.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(userId ? { userId } : {}),
      },
      include: { frame: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return assets.map(asset => ({
      id: asset.id,
      title: asset.title,
      kind: asset.kind,
      frameName: asset.frame?.title ?? 'Frame',
      createdAt: asset.createdAt.toISOString(),
      creditsUsed: asset.creditsUsed,
      status: asset.status,
      outputUrl: asset.outputUrl,
    }));
  }

  async listProjects() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const userId = this.tenantContext.get()?.userId;
    const projects = await this.prisma.project.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(userId ? { userId } : {}),
      },
      include: { frame: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    return projects.map(project => ({
      id: project.id,
      name: project.name,
      frameName: project.frame?.title ?? 'Frame',
      updatedAt: project.updatedAt.toISOString(),
    }));
  }

  async listFrameCategories() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    if (!tenantId) {
      return [];
    }

    const [categories, stateMap] = await Promise.all([
      this.prisma.category.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: 200,
      }),
      this.getFrameCategoryStateMap(tenantId),
    ]);

    return categories
      .map(category => ({
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        sortOrder: category.sortOrder,
        active: stateMap[category.id]?.active ?? true,
      }))
      .filter(category => category.active);
  }

  async listImageCategories(userId?: string) {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    if (!tenantId) {
      return [];
    }

    const hasPremiumAccess = userId ? await this.subscriptionsService.hasPremiumAccess(userId, tenantId) : false;
    const unlockState = userId
      ? await this.getCatalogConfig<AssetUnlockState>(tenantId, 'assetUnlocks', { users: {} })
      : { users: {} };
    const now = Date.now();

    const categories = await this.getCatalogConfig<ImageCategoryConfig[]>(tenantId, 'imageCategories', []);
    if (!Array.isArray(categories)) {
      return [];
    }

    return categories
      .filter(category => category.active !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
      .map(category => ({
        id: category.id,
        name: category.name,
        parentId: category.parentId ?? null,
        sortOrder: category.sortOrder,
        images: (category.images ?? [])
          .filter(image => image.active !== false)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
          .map(image => ({
            tier: image.tier === 'PREMIUM' ? 'PREMIUM' : 'FREE',
            estimatedCredits: Number.isFinite(Number(image.estimatedCredits)) ? Math.max(0, Math.floor(Number(image.estimatedCredits))) : 0,
            isLocked: image.tier === 'PREMIUM' ? !hasPremiumAccess : false,
            isUnlocked: userId ? this.isAssetUnlocked(unlockState, userId, 'images', image.id, now) : false,
            id: image.id,
            name: image.name,
            url: image.url,
            sortOrder: image.sortOrder ?? 0,
          })),
      }));
  }

  async getWalletSummary() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const userId = this.tenantContext.get()?.userId;
    const [walletTxns, thresholdEntry] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(userId ? { userId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.configEntry.findFirst({
        where: {
          key: ConfigKeys.BILLING_LOW_BALANCE_THRESHOLD,
          OR: [{ tenantId: tenantId ?? null }, { tenantId: null }],
        },
        orderBy: { tenantId: 'desc' },
      }),
    ]);

    const total = walletTxns.reduce((sum, txn) => sum + txn.amount, 0);

    return {
      available: total,
      held: 0,
      lowBalanceThreshold: Number(thresholdEntry?.value ?? 20),
    };
  }

  async getWalletLedger() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const userId = this.tenantContext.get()?.userId;
    const walletTxns = await this.prisma.walletTransaction.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(userId ? { userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return walletTxns.map(txn => ({
      id: txn.id,
      type: txn.type,
      amount: txn.amount,
      summary: txn.summary,
      createdAt: txn.createdAt.toISOString(),
    }));
  }

  async fetchImageForProxy(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid image URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Only http/https image URLs are allowed');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadRequestException(`Image fetch failed with status ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      if (!contentType.toLowerCase().startsWith('image/')) {
        throw new BadRequestException('URL does not point to an image');
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length === 0) {
        throw new BadRequestException('Fetched image is empty');
      }
      if (buffer.length > 8 * 1024 * 1024) {
        throw new BadRequestException('Image is too large for proxy');
      }

      return { buffer, contentType };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Unable to fetch remote image');
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractFrameThumbnailUrl(template: unknown): string | null {
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      return null;
    }

    const record = template as Record<string, unknown>;
    return typeof record.thumbnailUrl === 'string' && record.thumbnailUrl.length > 0
      ? record.thumbnailUrl
      : null;
  }

  private extractDynamicFields(template: unknown): Array<{
    key: string;
    label: string;
    type: 'text' | 'email' | 'url' | 'tel' | 'image';
    defaultValue: string;
    supportsBackgroundRemoval?: boolean;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    font?: string;
    fontSize?: number;
    color?: string;
    lineHeight?: number;
    justification?: string;
  }> {
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      return [];
    }

    const record = template as Record<string, unknown>;
    const derivedFields = this.extractDynamicFieldsFromLayers(record);

    const persisted = record.dynamicFields;
    if (Array.isArray(persisted)) {
      const normalized = persisted
        .filter(item => item && typeof item === 'object' && !Array.isArray(item))
        .map((item, index) => {
          const row = item as Record<string, unknown>;
          const key = typeof row.key === 'string' && row.key.trim().length > 0 ? row.key.trim() : `field_${index + 1}`;
          const label = typeof row.label === 'string' && row.label.trim().length > 0 ? row.label.trim() : key;
          const type: 'text' | 'email' | 'url' | 'tel' | 'image' =
            row.type === 'email' || row.type === 'url' || row.type === 'tel' || row.type === 'image'
              ? row.type
              : 'text';
          const defaultValue = typeof row.defaultValue === 'string' ? row.defaultValue : '';
          const supportsBackgroundRemoval =
            type === 'image'
              ? row.supportsBackgroundRemoval === undefined
                ? true
                : Boolean(row.supportsBackgroundRemoval)
              : undefined;

          const numeric = (value: unknown) => (typeof value === 'number' ? value : undefined);

          return {
            key,
            label,
            type,
            defaultValue,
            supportsBackgroundRemoval,
            x: numeric(row.x),
            y: numeric(row.y),
            width: numeric(row.width),
            height: numeric(row.height),
            font: typeof row.font === 'string' ? row.font : undefined,
            fontSize: numeric(row.fontSize),
            color: typeof row.color === 'string' ? row.color : undefined,
            lineHeight: numeric(row.lineHeight),
            justification: typeof row.justification === 'string' ? row.justification : undefined,
          };
        });

      if (normalized.length > 0) {
        const persistedKeys = new Set(normalized.map(item => item.key));
        const missingFromPersisted = derivedFields.filter(item => !persistedKeys.has(item.key));
        return [...normalized, ...missingFromPersisted];
      }
    }

    return derivedFields;
  }

  private extractDynamicFieldsFromLayers(record: Record<string, unknown>) {
    const layers = Array.isArray(record.layers) ? record.layers : [];
    const usedKeys = new Set<string>();
    const fields: Array<{
      key: string;
      label: string;
      type: 'text' | 'email' | 'url' | 'tel' | 'image';
      defaultValue: string;
      supportsBackgroundRemoval?: boolean;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      font?: string;
      fontSize?: number;
      color?: string;
      lineHeight?: number;
      justification?: string;
    }> = [];

    for (const layer of layers) {
      if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
        continue;
      }

      const maybeLayer = layer as Record<string, unknown>;
      const rawName = typeof maybeLayer.name === 'string' ? maybeLayer.name : '';
      const candidateKey = rawName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const baseKey = candidateKey || `field_${fields.length + 1}`;
      const key = usedKeys.has(baseKey) ? `${baseKey}_${fields.length + 1}` : baseKey;
      usedKeys.add(key);

      const label = rawName
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, ch => ch.toUpperCase()) || 'Field';

      if (maybeLayer.type === 'text' && typeof maybeLayer.text === 'string') {
        let type: 'text' | 'email' | 'url' | 'tel' = 'text';
        if (/email|mail/.test(baseKey)) {
          type = 'email';
        } else if (/phone|mobile|contact|tel/.test(baseKey)) {
          type = 'tel';
        } else if (/web|site|url|link/.test(baseKey)) {
          type = 'url';
        }

        fields.push({
          key,
          label,
          type,
          defaultValue: maybeLayer.text.trim(),
          x: typeof maybeLayer.x === 'number' ? maybeLayer.x : undefined,
          y: typeof maybeLayer.y === 'number' ? maybeLayer.y : undefined,
          width: typeof maybeLayer.width === 'number' ? maybeLayer.width : undefined,
          height: typeof maybeLayer.height === 'number' ? maybeLayer.height : undefined,
          font: typeof maybeLayer.font === 'string' ? maybeLayer.font : undefined,
          fontSize: typeof maybeLayer.size === 'number' ? maybeLayer.size : undefined,
          color: typeof maybeLayer.color === 'string' ? maybeLayer.color : undefined,
          lineHeight: typeof maybeLayer.lineHeight === 'number' ? maybeLayer.lineHeight : undefined,
          justification: typeof maybeLayer.justification === 'string' ? maybeLayer.justification : undefined,
        });
      }

      if (
        maybeLayer.type === 'image' &&
        this.isCustomImageLayerName(baseKey) &&
        typeof maybeLayer.src === 'string'
      ) {
        fields.push({
          key,
          label,
          type: 'image',
          defaultValue: maybeLayer.src,
          supportsBackgroundRemoval: true,
          x: typeof maybeLayer.x === 'number' ? maybeLayer.x : undefined,
          y: typeof maybeLayer.y === 'number' ? maybeLayer.y : undefined,
          width: typeof maybeLayer.width === 'number' ? maybeLayer.width : undefined,
          height: typeof maybeLayer.height === 'number' ? maybeLayer.height : undefined,
        });
      }
    }

    return fields;
  }

  private extractRenderSize(template: unknown): { width: number; height: number } {
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      return { width: 1280, height: 720 };
    }

    const record = template as Record<string, unknown>;

    const renderSize = record.renderSize;
    if (renderSize && typeof renderSize === 'object' && !Array.isArray(renderSize)) {
      const sizeRecord = renderSize as Record<string, unknown>;
      const renderWidth = typeof sizeRecord.width === 'number' ? sizeRecord.width : 0;
      const renderHeight = typeof sizeRecord.height === 'number' ? sizeRecord.height : 0;
      if (renderWidth > 0 && renderHeight > 0) {
        return {
          width: Math.ceil(renderWidth),
          height: Math.ceil(renderHeight),
        };
      }
    }

    const rootWidth = typeof record.width === 'number' ? record.width : 0;
    const rootHeight = typeof record.height === 'number' ? record.height : 0;
    if (rootWidth > 0 && rootHeight > 0) {
      return {
        width: Math.ceil(rootWidth),
        height: Math.ceil(rootHeight),
      };
    }

    const layers = Array.isArray(record.layers) ? record.layers : [];

    let width = 0;
    let height = 0;
    for (const layer of layers) {
      if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
        continue;
      }

      const row = layer as Record<string, unknown>;
      const x = typeof row.x === 'number' ? row.x : 0;
      const y = typeof row.y === 'number' ? row.y : 0;
      const w = typeof row.width === 'number' ? row.width : 0;
      const h = typeof row.height === 'number' ? row.height : 0;

      width = Math.max(width, Math.ceil(x + w));
      height = Math.max(height, Math.ceil(y + h));
    }

    if (width <= 0 || height <= 0) {
      return { width: 1280, height: 720 };
    }

    return { width, height };
  }

  private extractTemplateLayers(template: unknown): Array<{
    type?: string;
    name?: string;
    text?: string;
    src?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    font?: string;
    size?: number;
    color?: string;
    fill?: string;
    lineHeight?: number;
    justification?: string;
    opacity?: number;
    radius?: number;
  }> {
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      return [];
    }

    const record = template as Record<string, unknown>;
    const layers = Array.isArray(record.layers) ? record.layers : [];

    return layers
      .filter(layer => layer && typeof layer === 'object' && !Array.isArray(layer))
      .map(layer => {
        const row = layer as Record<string, unknown>;
        const numeric = (value: unknown) => (typeof value === 'number' ? value : undefined);
        const text = typeof row.text === 'string' ? row.text : undefined;
        const src = typeof row.src === 'string' ? row.src : undefined;
        return {
          type: typeof row.type === 'string' ? row.type : undefined,
          name: typeof row.name === 'string' ? row.name : undefined,
          text,
          src,
          x: numeric(row.x),
          y: numeric(row.y),
          width: numeric(row.width),
          height: numeric(row.height),
          font: typeof row.font === 'string' ? row.font : undefined,
          size: numeric(row.size),
          color: typeof row.color === 'string' ? row.color : undefined,
          fill: typeof row.fill === 'string' ? row.fill : undefined,
          lineHeight: numeric(row.lineHeight),
          justification: typeof row.justification === 'string' ? row.justification : undefined,
          opacity: numeric(row.opacity),
          radius: numeric(row.radius),
        };
      });
  }

  private isCustomImageLayerName(name: string) {
    const normalized = name.toLowerCase();
    if (!normalized) {
      return false;
    }

    const imageSlotPattern = /(logo|photo|image|product|avatar|profile|pic|brand)/;
    const staticAssetPattern = /(bg|background|frame|overlay|icon|layer)/;
    return imageSlotPattern.test(normalized) && !staticAssetPattern.test(normalized);
  }

  private async getFrameCategoryStateMap(tenantId: string) {
    return this.getCatalogConfig<FrameCategoryStateMap>(tenantId, 'frameCategoryStates', {});
  }

  private isAssetUnlocked(
    state: AssetUnlockState,
    userId: string,
    type: 'frames' | 'images',
    assetId: string,
    now: number,
  ) {
    const userState = state.users?.[userId];
    if (!userState) {
      return false;
    }

    const map = type === 'frames' ? userState.frames : userState.images;
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      return false;
    }

    const expiresAt = map[assetId];
    if (typeof expiresAt !== 'string' || !expiresAt) {
      return false;
    }

    const expiresAtTime = new Date(expiresAt).getTime();
    return Number.isFinite(expiresAtTime) && expiresAtTime > now;
  }

  private async getCatalogConfig<T>(tenantId: string, key: string, fallback: T): Promise<T> {
    const entry = await this.prisma.configEntry.findUnique({
      where: {
        tenantId_namespace_key: {
          tenantId,
          namespace: 'catalog',
          key,
        },
      },
    });

    if (!entry) {
      return fallback;
    }

    return entry.value as T;
  }
}

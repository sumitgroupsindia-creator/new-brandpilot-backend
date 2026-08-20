import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigKeys } from '@brandpilot/shared';
import { FrameStatus, FrameTier, Prisma, SubPeriod } from '../generated/prisma/client';
import AdmZip, { IZipEntry } from 'adm-zip';
import { randomUUID } from 'crypto';
import path from 'path';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { OutboxService } from '../outbox/outbox.service';

interface FrameCategoryStateMap {
  [categoryId: string]: {
    active: boolean;
  };
}

interface ImageItemConfig {
  id: string;
  name: string;
  url: string;
  active: boolean;
  createdAt: string;
  sortOrder?: number;
  tier?: 'FREE' | 'PREMIUM';
  estimatedCredits?: number;
}

interface ImageCategoryConfig {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  images: ImageItemConfig[];
}

interface FrameDynamicFieldConfig {
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
}

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly notificationsService: NotificationsService,
    private readonly outboxService: OutboxService,
  ) {}

  async getDashboard() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [registeredUsers, activeTenants, todaySessions, failedJobsCount] = await Promise.all([
      this.prisma.user.count({ where: tenantId ? { tenantId } : undefined }),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.session.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          createdAt: { gte: today },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          OR: [
            { action: { contains: 'failed' } },
            { action: { contains: 'error' } },
          ],
        },
      }),
    ]);

    return {
      kpis: [
        { key: 'Registered Users', value: String(registeredUsers) },
        { key: 'Sessions (today)', value: String(todaySessions) },
        { key: 'Failed Jobs', value: String(failedJobsCount) },
        { key: 'Active Tenants', value: String(activeTenants) },
      ],
      failedJobs: await this.listFailedJobs(),
    };
  }

  async listUsers() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const users = await this.prisma.user.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return users.map(user => ({
      id: user.id,
      email: user.email,
      role: user.roles[0]?.role.key ?? 'USER',
      status: user.status,
    }));
  }

  async listFailedJobs() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const logs = await this.prisma.auditLog.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        OR: [{ action: { contains: 'failed' } }, { action: { contains: 'error' } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return logs.map(log => ({
      id: log.id,
      queue: log.entityType,
      reason: log.reason ?? log.action,
      when: log.createdAt.toISOString(),
    }));
  }

  async listAudit() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const logs = await this.prisma.auditLog.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return logs.map(log => ({
      action: log.action,
      actor: log.actorEmail ?? 'system',
      entity: `${log.entityType}${log.entityId ? `:${log.entityId}` : ''}`,
      when: log.createdAt.toISOString(),
    }));
  }

  async listFrames() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const frames = await this.prisma.frame.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: { category: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    return frames.map(frame => ({
      id: frame.id,
      title: frame.title,
      categoryId: frame.categoryId,
      category: frame.category?.name ?? 'Uncategorized',
      tier: frame.tier,
      thumbnailUrl: this.extractFrameThumbnailUrl(frame.template),
      active: frame.status === FrameStatus.PUBLISHED,
      status: frame.status,
      version: frame.version,
    }));
  }

  async setFrameActive(frameId: string, active: boolean, userId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }

    const frame = await this.prisma.frame.findFirst({
      where: { id: frameId, tenantId },
      include: { category: true },
    });

    if (!frame) {
      throw new BadRequestException('Frame not found for this tenant');
    }

    const nextStatus = active ? FrameStatus.PUBLISHED : FrameStatus.ARCHIVED;
    const updated = await this.prisma.frame.update({
      where: { id: frame.id },
      data: {
        status: nextStatus,
        publishedAt: active ? frame.publishedAt ?? new Date() : null,
      },
      include: { category: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: active ? 'frame.activated' : 'frame.deactivated',
        entityType: 'frame',
        entityId: frame.id,
        after: {
          status: updated.status,
          active,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: updated.id,
      title: updated.title,
      categoryId: updated.categoryId,
      category: updated.category?.name ?? 'Uncategorized',
      tier: updated.tier,
      thumbnailUrl: this.extractFrameThumbnailUrl(updated.template),
      active: updated.status === FrameStatus.PUBLISHED,
      status: updated.status,
      version: updated.version,
    };
  }

  async getFrame(frameId: string) {
    const tenantId = this.requireTenantId();
    const frame = await this.prisma.frame.findFirst({
      where: { id: frameId, tenantId },
      include: { category: true },
    });

    if (!frame) {
      throw new NotFoundException('Frame not found for this tenant');
    }

    return {
      id: frame.id,
      title: frame.title,
      description: frame.description ?? '',
      categoryId: frame.categoryId,
      category: frame.category?.name ?? 'Uncategorized',
      tier: frame.tier,
      thumbnailUrl: this.extractFrameThumbnailUrl(frame.template),
      active: frame.status === FrameStatus.PUBLISHED,
      status: frame.status,
      version: frame.version,
      dynamicFields: this.extractDynamicFieldsFromTemplate(frame.template),
      templateLayers: this.extractTemplateLayers(frame.template),
      renderSize: this.extractRenderSize(frame.template),
    };
  }

  async updateFrameTemplate(
    frameId: string,
    userId: string,
    input: {
      dynamicFields?: Array<{
        key?: string;
        label?: string;
        type?: 'text' | 'email' | 'url' | 'tel' | 'image';
        defaultValue?: string;
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
      }>;
    },
  ) {
    const tenantId = this.requireTenantId();
    const frame = await this.prisma.frame.findFirst({
      where: { id: frameId, tenantId },
      include: { category: true },
    });

    if (!frame) {
      throw new NotFoundException('Frame not found for this tenant');
    }

    const templateObj =
      frame.template && typeof frame.template === 'object' && !Array.isArray(frame.template)
        ? ({ ...(frame.template as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    const normalizedFields = Array.isArray(input.dynamicFields)
      ? this.normalizeDynamicFields(input.dynamicFields as Array<Record<string, unknown>>)
      : this.extractDynamicFieldsFromTemplate(frame.template);

    templateObj.dynamicFields = normalizedFields as unknown as Prisma.InputJsonValue;
    templateObj.layers = this.syncLayersWithDynamicFields(templateObj.layers, normalizedFields) as unknown as Prisma.InputJsonValue;

    const updated = await this.prisma.frame.update({
      where: { id: frame.id },
      data: {
        template: templateObj as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
      include: { category: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'frame.template.updated',
        entityType: 'frame',
        entityId: frame.id,
        after: {
          dynamicFieldCount: normalizedFields.length,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: updated.id,
      title: updated.title,
      description: updated.description ?? '',
      categoryId: updated.categoryId,
      category: updated.category?.name ?? 'Uncategorized',
      tier: updated.tier,
      thumbnailUrl: this.extractFrameThumbnailUrl(updated.template),
      active: updated.status === FrameStatus.PUBLISHED,
      status: updated.status,
      version: updated.version,
      dynamicFields: this.extractDynamicFieldsFromTemplate(updated.template),
      templateLayers: this.extractTemplateLayers(updated.template),
      renderSize: this.extractRenderSize(updated.template),
    };
  }

  async listCategories() {
    const tenantId = this.requireTenantId();
    const categories = await this.prisma.category.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 200,
    });
    const stateMap = await this.getFrameCategoryStateMap(tenantId);

    return categories.map(category => ({
      id: category.id,
      name: category.name,
      parent: category.parentId,
      order: category.sortOrder,
      active: stateMap[category.id]?.active ?? true,
    }));
  }

  async createFrameCategory(
    userId: string,
    input: {
      name: string;
      parentId?: string;
      sortOrder?: string;
      active?: string;
    },
  ) {
    const tenantId = this.requireTenantId();
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('Category name is required');
    }

    const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0;
    const parentId = input.parentId?.trim() || null;

    if (parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: parentId, tenantId },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException('Parent category not found');
      }
    }

    const category = await this.prisma.category.create({
      data: {
        tenantId,
        name,
        parentId,
        sortOrder,
      },
    });

    await this.setFrameCategoryState(tenantId, category.id, input.active !== 'false');

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'frame_category.created',
        entityType: 'frame_category',
        entityId: category.id,
        after: {
          name: category.name,
          parentId: category.parentId,
          sortOrder: category.sortOrder,
          active: input.active !== 'false',
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: category.id,
      name: category.name,
      parent: category.parentId,
      order: category.sortOrder,
      active: input.active !== 'false',
    };
  }

  async updateFrameCategory(
    categoryId: string,
    userId: string,
    input: {
      name?: string;
      parentId?: string;
      sortOrder?: string;
      active?: string;
    },
  ) {
    const tenantId = this.requireTenantId();
    const existing = await this.prisma.category.findFirst({
      where: { id: categoryId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Frame category not found');
    }

    const data: Prisma.CategoryUpdateInput = {};
    if (typeof input.name === 'string') {
      const name = input.name.trim();
      if (!name) {
        throw new BadRequestException('Category name cannot be empty');
      }
      data.name = name;
    }

    if (input.sortOrder !== undefined) {
      data.sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : existing.sortOrder;
    }

    if (input.parentId !== undefined) {
      const parentId = input.parentId.trim();
      if (!parentId) {
        data.parent = { disconnect: true };
      } else {
        if (parentId === categoryId) {
          throw new BadRequestException('Category cannot be parent of itself');
        }
        const parent = await this.prisma.category.findFirst({
          where: { id: parentId, tenantId },
          select: { id: true },
        });
        if (!parent) {
          throw new BadRequestException('Parent category not found');
        }
        data.parent = { connect: { id: parent.id } };
      }
    }

    const updated = await this.prisma.category.update({
      where: { id: categoryId },
      data,
    });

    if (input.active !== undefined) {
      await this.setFrameCategoryState(tenantId, updated.id, input.active === 'true');
    }

    const stateMap = await this.getFrameCategoryStateMap(tenantId);
    const active = stateMap[updated.id]?.active ?? true;

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'frame_category.updated',
        entityType: 'frame_category',
        entityId: updated.id,
        after: {
          name: updated.name,
          parentId: updated.parentId,
          sortOrder: updated.sortOrder,
          active,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      parent: updated.parentId,
      order: updated.sortOrder,
      active,
    };
  }

  async deleteFrameCategory(categoryId: string, userId: string) {
    const tenantId = this.requireTenantId();
    const existing = await this.prisma.category.findFirst({
      where: { id: categoryId, tenantId },
      select: { id: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException('Frame category not found');
    }

    await this.prisma.frame.updateMany({
      where: { tenantId, categoryId },
      data: { categoryId: null },
    });

    await this.prisma.category.delete({
      where: { id: categoryId },
    });

    const states = await this.getFrameCategoryStateMap(tenantId);
    if (states[categoryId]) {
      delete states[categoryId];
      await this.setFrameCategoryStateMap(tenantId, states);
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'frame_category.deleted',
        entityType: 'frame_category',
        entityId: categoryId,
        after: {
          name: existing.name,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return { success: true, categoryId };
  }

  async setFrameCategoryActive(categoryId: string, active: boolean, userId: string) {
    const tenantId = this.requireTenantId();
    const existing = await this.prisma.category.findFirst({
      where: { id: categoryId, tenantId },
      select: { id: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException('Frame category not found');
    }

    await this.setFrameCategoryState(tenantId, categoryId, active);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: active ? 'frame_category.activated' : 'frame_category.deactivated',
        entityType: 'frame_category',
        entityId: categoryId,
        after: {
          active,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: existing.id,
      name: existing.name,
      active,
    };
  }

  async listImageCategories() {
    const tenantId = this.requireTenantId();
    const categories = await this.getImageCategories(tenantId);
    return categories
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(category => ({
        id: category.id,
        name: category.name,
        active: category.active,
        sortOrder: category.sortOrder,
        images: [...category.images]
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
          .map(image => ({
          id: image.id,
          name: image.name,
          url: image.url,
          active: image.active,
          createdAt: image.createdAt,
          sortOrder: image.sortOrder ?? 0,
            tier: image.tier === 'PREMIUM' ? 'PREMIUM' : 'FREE',
            estimatedCredits: Number.isFinite(Number(image.estimatedCredits)) ? Math.max(0, Math.floor(Number(image.estimatedCredits))) : 0,
        })),
      }));
  }

  async createImageCategory(
    userId: string,
    input: {
      name: string;
      sortOrder?: string;
      active?: string;
    },
  ) {
    const tenantId = this.requireTenantId();
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('Image category name is required');
    }

    const categories = await this.getImageCategories(tenantId);
    if (categories.some(category => category.name.toLowerCase() === name.toLowerCase())) {
      throw new BadRequestException('Image category with same name already exists');
    }

    const next: ImageCategoryConfig = {
      id: randomUUID(),
      name,
      active: input.active !== 'false',
      sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : categories.length + 1,
      createdAt: new Date().toISOString(),
      images: [],
    };
    categories.push(next);
    await this.setImageCategories(tenantId, categories);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'image_category.created',
        entityType: 'image_category',
        entityId: null,
        after: {
          categoryId: next.id,
          name: next.name,
          active: next.active,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return next;
  }

  async updateImageCategory(
    categoryId: string,
    userId: string,
    input: {
      name?: string;
      sortOrder?: string;
      active?: string;
    },
  ) {
    const tenantId = this.requireTenantId();
    const categories = await this.getImageCategories(tenantId);
    const index = categories.findIndex(category => category.id === categoryId);
    if (index < 0) {
      throw new NotFoundException('Image category not found');
    }

    const current = categories[index];
    if (!current) {
      throw new NotFoundException('Image category not found');
    }

    if (typeof input.name === 'string') {
      const nextName = input.name.trim();
      if (!nextName) {
        throw new BadRequestException('Image category name cannot be empty');
      }
      current.name = nextName;
    }

    if (input.sortOrder !== undefined && Number.isFinite(Number(input.sortOrder))) {
      current.sortOrder = Number(input.sortOrder);
    }

    if (input.active !== undefined) {
      current.active = input.active === 'true';
    }

    categories[index] = current;
    await this.setImageCategories(tenantId, categories);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'image_category.updated',
        entityType: 'image_category',
        entityId: null,
        after: {
          categoryId: current.id,
          name: current.name,
          active: current.active,
          sortOrder: current.sortOrder,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return current;
  }

  async deleteImageCategory(categoryId: string, userId: string) {
    const tenantId = this.requireTenantId();
    const categories = await this.getImageCategories(tenantId);
    const next = categories.filter(category => category.id !== categoryId);
    if (next.length === categories.length) {
      throw new NotFoundException('Image category not found');
    }

    await this.setImageCategories(tenantId, next);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'image_category.deleted',
        entityType: 'image_category',
        entityId: null,
        after: {
          categoryId,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return { success: true, categoryId };
  }

  async setImageCategoryActive(categoryId: string, active: boolean, userId: string) {
    const tenantId = this.requireTenantId();
    const categories = await this.getImageCategories(tenantId);
    const category = categories.find(item => item.id === categoryId);
    if (!category) {
      throw new NotFoundException('Image category not found');
    }

    category.active = active;
    await this.setImageCategories(tenantId, categories);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: active ? 'image_category.activated' : 'image_category.deactivated',
        entityType: 'image_category',
        entityId: null,
        after: {
          categoryId: category.id,
          active,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return category;
  }

  async uploadImageCategoryImages(
    categoryId: string,
    userId: string,
    files: Express.Multer.File[],
    options?: {
      namePrefix?: string;
      metadata?: string;
    },
  ) {
    const tenantId = this.requireTenantId();
    if (!files.length) {
      throw new BadRequestException('At least one image is required');
    }

    const categories = await this.getImageCategories(tenantId);
    const category = categories.find(item => item.id === categoryId);
    if (!category) {
      throw new NotFoundException('Image category not found');
    }

    const metadataItems = this.parseUploadImageMetadata(options?.metadata);

    const createdImages: ImageItemConfig[] = [];
    for (const [index, file] of files.entries()) {
      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException('Only image uploads are allowed');
      }

      const metadata = metadataItems[index];
      const explicitName = metadata?.name?.trim();
      const explicitPrefix = options?.namePrefix?.trim();
      const baseName = explicitName && explicitName.length > 0
        ? explicitName
        : explicitPrefix && explicitPrefix.length > 0
          ? `${explicitPrefix} ${category.images.length + createdImages.length + 1}`
          : file.originalname.replace(/\.[^.]+$/, '').trim() || 'Image';

      const resolvedSortOrder =
        metadata && Number.isFinite(Number(metadata.sortOrder))
          ? Number(metadata.sortOrder)
          : category.images.length + createdImages.length + 1;

      const image: ImageItemConfig = {
        id: randomUUID(),
        name: baseName,
        url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        active: true,
        createdAt: new Date().toISOString(),
        sortOrder: resolvedSortOrder,
        tier: 'FREE',
        estimatedCredits: 0,
      };

      category.images.push(image);
      createdImages.push(image);
    }

    await this.setImageCategories(tenantId, categories);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'image_category.images_uploaded',
        entityType: 'image_category',
        entityId: null,
        after: {
          categoryId: category.id,
          imageCount: createdImages.length,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      categoryId: category.id,
      uploaded: createdImages,
    };
  }

  private parseUploadImageMetadata(raw?: string): Array<{ name?: string; sortOrder?: number }> {
    if (!raw?.trim()) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Invalid upload metadata JSON');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Upload metadata must be an array');
    }

    return parsed.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return {};
      }

      const row = item as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name : undefined;
      const sortOrderValue = row.sortOrder;
      const sortOrder =
        typeof sortOrderValue === 'number'
          ? sortOrderValue
          : typeof sortOrderValue === 'string' && Number.isFinite(Number(sortOrderValue))
            ? Number(sortOrderValue)
            : undefined;

      return {
        name,
        sortOrder,
      };
    });
  }

  async setImageActive(categoryId: string, imageId: string, active: boolean, userId: string) {
    const tenantId = this.requireTenantId();
    const categories = await this.getImageCategories(tenantId);
    const category = categories.find(item => item.id === categoryId);
    if (!category) {
      throw new NotFoundException('Image category not found');
    }

    const image = category.images.find(item => item.id === imageId);
    if (!image) {
      throw new NotFoundException('Image not found');
    }

    image.active = active;
    await this.setImageCategories(tenantId, categories);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: active ? 'image.activated' : 'image.deactivated',
        entityType: 'image',
        entityId: null,
        after: {
          imageId: image.id,
          categoryId,
          active,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return image;
  }

  async updateImage(
    categoryId: string,
    imageId: string,
    userId: string,
    input: {
      name?: string;
      sortOrder?: string;
      active?: string;
      tier?: 'FREE' | 'PREMIUM';
      estimatedCredits?: string;
    },
  ) {
    const tenantId = this.requireTenantId();
    const categories = await this.getImageCategories(tenantId);
    const category = categories.find(item => item.id === categoryId);
    if (!category) {
      throw new NotFoundException('Image category not found');
    }

    const image = category.images.find(item => item.id === imageId);
    if (!image) {
      throw new NotFoundException('Image not found');
    }

    if (typeof input.name === 'string') {
      const nextName = input.name.trim();
      if (!nextName) {
        throw new BadRequestException('Image name cannot be empty');
      }
      image.name = nextName;
    }

    if (input.sortOrder !== undefined && Number.isFinite(Number(input.sortOrder))) {
      image.sortOrder = Number(input.sortOrder);
    }

    if (input.active !== undefined) {
      image.active = input.active === 'true';
    }

    if (input.tier !== undefined) {
      image.tier = input.tier === 'PREMIUM' ? 'PREMIUM' : 'FREE';
    }

    if (input.estimatedCredits !== undefined && Number.isFinite(Number(input.estimatedCredits))) {
      image.estimatedCredits = Math.max(0, Math.floor(Number(input.estimatedCredits)));
    }

    await this.setImageCategories(tenantId, categories);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'image.updated',
        entityType: 'image',
        entityId: null,
        after: {
          imageId: image.id,
          categoryId,
          name: image.name,
          active: image.active,
          sortOrder: image.sortOrder ?? 0,
          tier: image.tier === 'PREMIUM' ? 'PREMIUM' : 'FREE',
          estimatedCredits: Number.isFinite(Number(image.estimatedCredits)) ? Math.max(0, Math.floor(Number(image.estimatedCredits))) : 0,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return image;
  }

  async deleteImage(categoryId: string, imageId: string, userId: string) {
    const tenantId = this.requireTenantId();
    const categories = await this.getImageCategories(tenantId);
    const category = categories.find(item => item.id === categoryId);
    if (!category) {
      throw new NotFoundException('Image category not found');
    }

    const nextImages = category.images.filter(image => image.id !== imageId);
    if (nextImages.length === category.images.length) {
      throw new NotFoundException('Image not found');
    }

    category.images = nextImages;
    await this.setImageCategories(tenantId, categories);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'image.deleted',
        entityType: 'image',
        entityId: null,
        after: {
          imageId,
          categoryId,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return { success: true, imageId };
  }

  async uploadFrame(
    userId: string,
    input: {
      title: string;
      description?: string;
      categoryId?: string;
      tier?: 'FREE' | 'PREMIUM';
      status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      estimatedCredits?: string;
      isFeatured?: string;
      isTrending?: string;
    },
    files: {
      frameZip?: Express.Multer.File[];
      thumbnail?: Express.Multer.File[];
    },
  ) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required for frame upload');
    }

    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException('Frame title is required');
    }

    const zipFile = files.frameZip?.[0];
    if (!zipFile) {
      throw new BadRequestException('Frame ZIP file is required');
    }
    if (!zipFile.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('Only .zip is supported for frame bundle upload');
    }

    let parsedTemplate: unknown = {};
    let selectedJsonPath: string | null = null;
    try {
      const archive = new AdmZip(zipFile.buffer);
      const entries = archive
        .getEntries()
        .filter((entry: IZipEntry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.json'));
      const preferred = entries.find((entry: IZipEntry) => entry.entryName.toLowerCase().includes('/json/'));
      const selectedEntry = preferred ?? entries[0];

      if (selectedEntry) {
        selectedJsonPath = selectedEntry.entryName;
        parsedTemplate = JSON.parse(archive.readAsText(selectedEntry));
      }
    } catch {
      throw new BadRequestException('Invalid ZIP or JSON content in uploaded frame bundle');
    }

    const thumbnailFile = files.thumbnail?.[0];
    const thumbnailUrl = thumbnailFile
      ? `data:${thumbnailFile.mimetype || 'image/png'};base64,${thumbnailFile.buffer.toString('base64')}`
      : null;

    const templateObj =
      typeof parsedTemplate === 'object' && parsedTemplate !== null && !Array.isArray(parsedTemplate)
        ? ({ ...parsedTemplate } as Record<string, unknown>)
        : { payload: parsedTemplate };

    try {
      const archive = new AdmZip(zipFile.buffer);
      this.inlineZipLayerAssets(templateObj, archive, selectedJsonPath);
    } catch {
      // If inlining fails, keep original src values; renderer may still use thumbnail fallback.
    }

    templateObj.uploadMeta = {
      zipName: zipFile.originalname,
      zipSizeBytes: zipFile.size,
      jsonPath: selectedJsonPath,
      uploadedAt: new Date().toISOString(),
    };
    if (thumbnailUrl) {
      templateObj.thumbnailUrl = thumbnailUrl;
    }
    templateObj.dynamicFields = this.extractDynamicFields(templateObj);

    const tier = input.tier === 'PREMIUM' ? FrameTier.PREMIUM : FrameTier.FREE;
    const statusMap: Record<string, FrameStatus> = {
      DRAFT: FrameStatus.DRAFT,
      PUBLISHED: FrameStatus.PUBLISHED,
      ARCHIVED: FrameStatus.ARCHIVED,
    };
    const status = statusMap[input.status ?? 'PUBLISHED'] ?? FrameStatus.PUBLISHED;

    const estimatedCredits = Number.isFinite(Number(input.estimatedCredits))
      ? Math.max(0, Math.floor(Number(input.estimatedCredits)))
      : tier === FrameTier.PREMIUM
        ? 10
        : 0;

    const isFeatured = String(input.isFeatured).toLowerCase() === 'true';
    const isTrending = String(input.isTrending).toLowerCase() === 'true';

    let categoryId: string | null = null;
    if (input.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: input.categoryId, tenantId },
        select: { id: true },
      });
      if (!category) {
        throw new BadRequestException('Selected category does not exist for this tenant');
      }
      categoryId = category.id;
    }

    const frame = await this.prisma.frame.create({
      data: {
        tenantId,
        categoryId,
        title,
        description: input.description?.trim() || null,
        tier,
        status,
        template: templateObj as unknown as Prisma.InputJsonValue,
        estimatedCredits,
        isFeatured,
        isTrending,
        publishedAt: status === FrameStatus.PUBLISHED ? new Date() : null,
      },
      include: { category: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'frame.uploaded',
        entityType: 'frame',
        entityId: frame.id,
        after: {
          title: frame.title,
          tier: frame.tier,
          status: frame.status,
          categoryId: frame.categoryId,
          estimatedCredits: frame.estimatedCredits,
          zipName: zipFile.originalname,
          hasThumbnail: Boolean(thumbnailUrl),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: frame.id,
      title: frame.title,
      category: frame.category?.name ?? 'Uncategorized',
      tier: frame.tier,
      thumbnailUrl: this.extractFrameThumbnailUrl(frame.template),
      status: frame.status,
      version: frame.version,
    };
  }

  async listWalletOps() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const txns = await this.prisma.walletTransaction.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return txns.map(txn => ({
      id: txn.id,
      userEmail: txn.user?.email ?? 'unknown',
      type: txn.type,
      amount: txn.amount,
      reason: txn.summary,
      when: txn.createdAt.toISOString(),
    }));
  }

  async listPlans() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const plans = await this.prisma.billingPlan.findMany({
      where: {
        OR: [{ tenantId: tenantId ?? null }, { tenantId: null }],
      },
      orderBy: [{ tenantId: 'desc' }, { amountInr: 'asc' }],
      take: 200,
    });
    return plans.map(plan => ({
      id: plan.id,
      amountInr: plan.amountInr,
      credits: plan.credits,
      bonus: plan.bonus,
      active: plan.active,
    }));
  }

  async listSubscriptionPlans() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: {
        OR: [{ tenantId: tenantId ?? null }, { tenantId: null }],
      },
      orderBy: [{ tenantId: 'desc' }, { displayOrder: 'asc' }, { amountInr: 'asc' }],
      take: 200,
    });

    return plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      amountInr: plan.amountInr,
      currency: plan.currency,
      period: plan.period,
      premiumFrames: plan.premiumFrames,
      monthlyCredits: plan.monthlyCredits,
      graceDays: plan.graceDays,
      active: plan.active,
      displayOrder: plan.displayOrder,
      tenantId: plan.tenantId,
    }));
  }

  async upsertSubscriptionPlan(
    userId: string,
    input: {
      id?: string;
      name: string;
      amountInr: number;
      currency?: string;
      period: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
      premiumFrames?: boolean;
      monthlyCredits?: number;
      graceDays?: number;
      active?: boolean;
      displayOrder?: number;
    },
  ) {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const period = input.period as SubPeriod;

    const data = {
      name: input.name,
      amountInr: input.amountInr,
      currency: input.currency ?? 'INR',
      period,
      premiumFrames: input.premiumFrames ?? true,
      monthlyCredits: input.monthlyCredits ?? 0,
      graceDays: input.graceDays ?? 3,
      active: input.active ?? true,
      displayOrder: input.displayOrder ?? 0,
      tenantId,
    };

    const result = input.id
      ? await this.prisma.subscriptionPlan.update({
          where: { id: input.id },
          data,
        })
      : await this.prisma.subscriptionPlan.create({
          data,
        });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'subscription.plan.upsert',
        entityType: 'subscription_plan',
        entityId: result.id,
        after: data as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: result.id,
      name: result.name,
      amountInr: result.amountInr,
      currency: result.currency,
      period: result.period,
      premiumFrames: result.premiumFrames,
      monthlyCredits: result.monthlyCredits,
      graceDays: result.graceDays,
      active: result.active,
      displayOrder: result.displayOrder,
    };
  }

  async listSubscriptions() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const subscriptions = await this.prisma.subscription.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: {
        user: true,
        plan: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    return subscriptions.map(subscription => ({
      id: subscription.id,
      userEmail: subscription.user.email,
      status: subscription.status,
      planName: subscription.plan.name,
      amountInr: subscription.plan.amountInr,
      period: subscription.plan.period,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      providerSubId: subscription.providerSubId,
    }));
  }

  async getBranding() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const tenant = tenantId
      ? await this.prisma.tenant.findUnique({ where: { id: tenantId } })
      : await this.prisma.tenant.findFirst({ where: { slug: 'default' } });

    const logo = await this.prisma.configEntry.findFirst({
      where: {
        key: ConfigKeys.BRANDING_LOGO_URL,
        OR: [{ tenantId: tenantId ?? null }, { tenantId: null }],
      },
      orderBy: { tenantId: 'desc' },
    });

    return {
      appName: tenant?.displayName ?? tenant?.name ?? 'BrandPilot',
      primaryColor: tenant?.primaryColor ?? '#0f766e',
      logoUrl: typeof logo?.value === 'string' ? logo.value : '',
    };
  }

  async listNotificationTemplates() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    return this.notificationsService.listTemplates(tenantId);
  }

  async upsertNotificationTemplate(
    userId: string,
    input: {
      id: string;
      event: string;
      channel: string;
      locale?: string;
      title: string;
      body: string;
      active?: boolean;
    },
  ) {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const result = await this.notificationsService.upsertTemplate(tenantId, userId, {
      id: input.id,
      event: input.event,
      channel: input.channel,
      locale: input.locale ?? 'en',
      title: input.title,
      body: input.body,
      active: input.active ?? true,
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'notifications.template.upsert',
        entityType: 'notification_template',
        entityId: input.id,
        after: {
          event: input.event,
          channel: input.channel,
          locale: input.locale ?? 'en',
          title: input.title,
          active: input.active ?? true,
        } as any,
      },
    });

    return result;
  }

  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        users: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    return tenants.map(tenant => ({
      id: tenant.id,
      name: tenant.displayName ?? tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      userCap: tenant.users.length,
    }));
  }

  async getAiConfig() {
    const tenantId = this.tenantContext.getTenantId() ?? null;
    const entries = await this.prisma.configEntry.findMany({
      where: {
        namespace: 'ai',
        OR: [{ tenantId: tenantId ?? null }, { tenantId: null }],
      },
      orderBy: { tenantId: 'asc' },
    });

    const merged = new Map<string, unknown>();
    for (const entry of entries) {
      if (entry.tenantId === null && merged.has(entry.key)) continue;
      merged.set(entry.key, entry.value);
    }

    return {
      imageProvider: String(merged.get(ConfigKeys.AI_IMAGE_DEFAULT_PROVIDER) ?? 'openai'),
      videoProvider: String(merged.get(ConfigKeys.AI_VIDEO_DEFAULT_PROVIDER) ?? 'runway'),
      openaiTimeoutMs: Number(merged.get(ConfigKeys.AI_OPENAI_TIMEOUT_MS) ?? 60000),
      openaiRetries: Number(merged.get(ConfigKeys.AI_OPENAI_RETRIES) ?? 3),
      runwayTimeoutMs: Number(merged.get(ConfigKeys.AI_RUNWAY_TIMEOUT_MS) ?? 120000),
      runwayRetries: Number(merged.get(ConfigKeys.AI_RUNWAY_RETRIES) ?? 3),
    };
  }

  async processOutbox() {
    return this.outboxService.processPending(100);
  }

  async outboxStatus() {
    return this.outboxService.getStatus();
  }

  async deadOutbox(limit = 50) {
    return this.outboxService.listDead(limit);
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

  private extractDynamicFields(template: Record<string, unknown>): Array<{
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
    const layers = Array.isArray(template.layers) ? template.layers : [];
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

  private extractDynamicFieldsFromTemplate(template: unknown): FrameDynamicFieldConfig[] {
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      return [];
    }

    const record = template as Record<string, unknown>;
    const persisted = record.dynamicFields;
    if (Array.isArray(persisted)) {
      return this.normalizeDynamicFields(persisted as Array<Record<string, unknown>>);
    }

    return this.extractDynamicFields(record);
  }

  private normalizeDynamicFields(rawFields: Array<Record<string, unknown>>): FrameDynamicFieldConfig[] {
    return rawFields
      .filter(row => row && typeof row === 'object' && !Array.isArray(row))
      .map((row, index) => {
        const key = typeof row.key === 'string' && row.key.trim() ? row.key.trim() : `field_${index + 1}`;
        const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : key;
        const type: 'text' | 'email' | 'url' | 'tel' | 'image' =
          row.type === 'email' || row.type === 'url' || row.type === 'tel' || row.type === 'image'
            ? row.type
            : 'text';
        const numeric = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

        return {
          key,
          label,
          type,
          defaultValue: typeof row.defaultValue === 'string' ? row.defaultValue : '',
          supportsBackgroundRemoval: type === 'image'
            ? row.supportsBackgroundRemoval === undefined
              ? true
              : Boolean(row.supportsBackgroundRemoval)
            : undefined,
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
  }

  private extractRenderSize(template: unknown): { width: number; height: number } | null {
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      return null;
    }

    const record = template as Record<string, unknown>;
    const width = this.parsePositiveNumber(record.width);
    const height = this.parsePositiveNumber(record.height);
    if (width && height) {
      return { width, height };
    }

    return null;
  }

  private extractTemplateLayers(template: unknown): Array<Record<string, unknown>> {
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      return [];
    }

    const record = template as Record<string, unknown>;
    if (!Array.isArray(record.layers)) {
      return [];
    }

    return record.layers
      .filter(layer => layer && typeof layer === 'object' && !Array.isArray(layer))
      .map(layer => ({ ...(layer as Record<string, unknown>) }));
  }

  private syncLayersWithDynamicFields(
    rawLayers: unknown,
    dynamicFields: FrameDynamicFieldConfig[],
  ) {
    if (!Array.isArray(rawLayers)) {
      return rawLayers;
    }

    const normalizedFieldMap = new Map(dynamicFields.map(field => [this.normalizeLayerKey(field.key), field]));

    return rawLayers.map(layer => {
      if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
        return layer;
      }

      const row = { ...(layer as Record<string, unknown>) };
      const name = typeof row.name === 'string' ? row.name : '';
      const layerKey = this.normalizeLayerKey(name);
      const field = normalizedFieldMap.get(layerKey);
      if (!field) {
        return row;
      }

      if (typeof field.x === 'number') row.x = field.x;
      if (typeof field.y === 'number') row.y = field.y;
      if (typeof field.width === 'number') row.width = field.width;
      if (typeof field.height === 'number') row.height = field.height;

      if (field.type === 'image') {
        if (typeof field.defaultValue === 'string' && field.defaultValue.trim()) {
          row.src = field.defaultValue;
        }
      } else {
        row.text = field.defaultValue;
        if (typeof field.font === 'string' && field.font.trim()) row.font = field.font;
        if (typeof field.fontSize === 'number') row.size = field.fontSize;
        if (typeof field.color === 'string' && field.color.trim()) row.color = field.color;
        if (typeof field.lineHeight === 'number') row.lineHeight = field.lineHeight;
        if (typeof field.justification === 'string' && field.justification.trim()) row.justification = field.justification;
      }

      return row;
    });
  }

  private normalizeLayerKey(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  private inlineZipLayerAssets(
    templateObj: Record<string, unknown>,
    archive: AdmZip,
    selectedJsonPath: string | null,
  ) {
    if (!Array.isArray(templateObj.layers)) {
      return;
    }

    const jsonDir = selectedJsonPath
      ? path.posix.dirname(selectedJsonPath)
      : '';

    const entries = archive.getEntries().filter(entry => !entry.isDirectory);
    const byExactPath = new Map(entries.map(entry => [this.normalizeZipPath(entry.entryName), entry]));
    const byBasename = new Map<string, IZipEntry[]>();

    for (const entry of entries) {
      const basename = path.posix.basename(entry.entryName).toLowerCase();
      const list = byBasename.get(basename) ?? [];
      list.push(entry);
      byBasename.set(basename, list);
    }

    templateObj.layers = templateObj.layers.map(rawLayer => {
      if (!rawLayer || typeof rawLayer !== 'object' || Array.isArray(rawLayer)) {
        return rawLayer;
      }

      const layer = { ...(rawLayer as Record<string, unknown>) };
      const src = typeof layer.src === 'string' ? layer.src.trim() : '';
      if (!src || /^data:/i.test(src) || /^https?:\/\//i.test(src)) {
        return layer;
      }

      const resolved = this.resolveZipAssetEntry(src, jsonDir, byExactPath, byBasename);
      if (!resolved) {
        return layer;
      }

      const ext = path.posix.extname(resolved.entryName).toLowerCase();
      const mime = ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png';
      layer.src = `data:${mime};base64,${resolved.getData().toString('base64')}`;
      return layer;
    });
  }

  private resolveZipAssetEntry(
    src: string,
    jsonDir: string,
    byExactPath: Map<string, IZipEntry>,
    byBasename: Map<string, IZipEntry[]>,
  ) {
    const normalizedSrc = this.normalizeZipPath(src);
    const relativeToJson = jsonDir
      ? this.normalizeZipPath(path.posix.normalize(path.posix.join(jsonDir, src)))
      : normalizedSrc;
    const srcWithoutLeading = normalizedSrc.replace(/^\/+/, '');
    const relativeWithoutLeading = relativeToJson.replace(/^\/+/, '');

    const direct =
      byExactPath.get(normalizedSrc)
      ?? byExactPath.get(srcWithoutLeading)
      ?? byExactPath.get(relativeToJson)
      ?? byExactPath.get(relativeWithoutLeading);
    if (direct) {
      return direct;
    }

    const basename = path.posix.basename(normalizedSrc).toLowerCase();
    const matches = byBasename.get(basename) ?? [];
    return matches[0] ?? null;
  }

  private normalizeZipPath(value: string) {
    return value.replace(/\\/g, '/').trim();
  }

  private parsePositiveNumber(value: unknown) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return null;
    }

    return Math.floor(value);
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

  private requireTenantId() {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    return tenantId;
  }

  private async getFrameCategoryStateMap(tenantId: string) {
    return this.getCatalogConfig<FrameCategoryStateMap>(tenantId, 'frameCategoryStates', {});
  }

  private async setFrameCategoryStateMap(tenantId: string, value: FrameCategoryStateMap) {
    await this.setCatalogConfig(tenantId, 'frameCategoryStates', value as unknown as Prisma.InputJsonValue);
  }

  private async setFrameCategoryState(tenantId: string, categoryId: string, active: boolean) {
    const states = await this.getFrameCategoryStateMap(tenantId);
    states[categoryId] = { active };
    await this.setFrameCategoryStateMap(tenantId, states);
  }

  private async getImageCategories(tenantId: string) {
    const categories = await this.getCatalogConfig<ImageCategoryConfig[]>(tenantId, 'imageCategories', []);
    return Array.isArray(categories) ? categories : [];
  }

  private async setImageCategories(tenantId: string, categories: ImageCategoryConfig[]) {
    await this.setCatalogConfig(tenantId, 'imageCategories', categories as unknown as Prisma.InputJsonValue);
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

  private async setCatalogConfig(tenantId: string, key: string, value: Prisma.InputJsonValue) {
    await this.prisma.configEntry.upsert({
      where: {
        tenantId_namespace_key: {
          tenantId,
          namespace: 'catalog',
          key,
        },
      },
      update: {
        value,
      },
      create: {
        tenantId,
        namespace: 'catalog',
        key,
        value,
      },
    });
  }

}

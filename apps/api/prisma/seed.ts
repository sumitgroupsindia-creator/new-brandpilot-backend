import {
  PrismaClient,
  TenantStatus,
  UserStatus,
  FrameTier,
  FrameStatus,
  AssetKind,
  AssetStatus,
  WalletTransactionType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { Permission, RoleKey } from '@brandpilot/shared';

// Load root .env first, then api .env as fallback for local package-only runs.
loadEnv({ path: resolve(__dirname, '../../.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const ALL_PERMISSIONS = Object.values(Permission);

async function main() {
  console.log('Seeding BrandPilot...');

  // Default tenant
  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Default Tenant',
      slug: 'default',
      status: TenantStatus.ACTIVE,
      displayName: 'BrandPilot',
      primaryColor: '#0f172a',
    },
  });

  // Seed permissions
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: {
        key,
        name: key,
        description: `Permission to ${key}`,
      },
    });
  }

  // Seed system roles
  const roleDefinitions: { key: RoleKey; permissions: Permission[] }[] = [
    {
      key: RoleKey.SUPER_ADMIN,
      permissions: ALL_PERMISSIONS,
    },
    {
      key: RoleKey.TENANT_ADMIN,
      permissions: [
        Permission.USER_MANAGE,
        Permission.FRAME_MANAGE,
        Permission.FRAME_PUBLISH,
        Permission.CATEGORY_MANAGE,
        Permission.WALLET_ADJUST,
        Permission.WALLET_REFUND,
        Permission.PAYMENT_READ,
        Permission.CONFIG_MANAGE,
        Permission.ANALYTICS_READ,
        Permission.AUDIT_READ,
        Permission.JOBS_MANAGE,
      ],
    },
    {
      key: RoleKey.SUPPORT,
      permissions: [Permission.USER_MANAGE, Permission.AUDIT_READ, Permission.JOBS_MANAGE],
    },
    {
      key: RoleKey.FINANCE,
      permissions: [Permission.PAYMENT_READ, Permission.ANALYTICS_READ, Permission.AUDIT_READ],
    },
    {
      key: RoleKey.USER,
      permissions: [],
    },
  ];

  for (const def of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { tenantId_key: { tenantId: defaultTenant.id, key: def.key } },
      update: {},
      create: {
        tenantId: defaultTenant.id,
        key: def.key,
        name: def.key,
        isSystem: true,
      },
    });

    const existingPerms = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const existingPermIds = new Set(existingPerms.map(p => p.permissionId));

    const permRecords = await prisma.permission.findMany({
      where: { key: { in: def.permissions } },
    });

    for (const perm of permRecords) {
      if (!existingPermIds.has(perm.id)) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
      }
    }
  }

  // Seed default super admin user (always enforced on seed runs)
  const adminEmails = [
    process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@brandpilot.app',
    process.env.SEED_SUPER_ADMIN_FALLBACK_EMAIL ?? 'admin@sumitgroups.com',
  ];
  const adminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'BrandPilot#Admin2026';
  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const superAdminRole = await prisma.role.findUnique({
    where: { tenantId_key: { tenantId: defaultTenant.id, key: RoleKey.SUPER_ADMIN } },
  });

  for (const adminEmail of adminEmails) {
    const admin = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: defaultTenant.id, email: adminEmail } },
      update: {
        passwordHash,
        name: 'Super Admin',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
      create: {
        tenantId: defaultTenant.id,
        email: adminEmail,
        passwordHash,
        name: 'Super Admin',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    if (superAdminRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: admin.id,
            roleId: superAdminRole.id,
          },
        },
        update: {},
        create: { userId: admin.id, roleId: superAdminRole.id },
      });
    }
  }

  console.log(`Ensured default super admins: ${adminEmails.join(', ')}`);

  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { tenantId_email: { tenantId: defaultTenant.id, email: adminEmails[0] } },
  });

  const businessCards = await prisma.category.upsert({
    where: { tenantId_name: { tenantId: defaultTenant.id, name: 'Business Cards' } },
    update: { sortOrder: 1 },
    create: {
      tenantId: defaultTenant.id,
      name: 'Business Cards',
      sortOrder: 1,
    },
  });

  const festivalCampaigns = await prisma.category.upsert({
    where: { tenantId_name: { tenantId: defaultTenant.id, name: 'Festival Campaigns' } },
    update: { sortOrder: 2 },
    create: {
      tenantId: defaultTenant.id,
      name: 'Festival Campaigns',
      sortOrder: 2,
    },
  });

  const productAds = await prisma.category.upsert({
    where: { tenantId_name: { tenantId: defaultTenant.id, name: 'Product Ads' } },
    update: { sortOrder: 3 },
    create: {
      tenantId: defaultTenant.id,
      name: 'Product Ads',
      sortOrder: 3,
    },
  });

  const frame1 = await prisma.frame.upsert({
    where: { id: 'f-1' },
    update: {
      title: 'Executive Business Intro',
      categoryId: businessCards.id,
      tier: FrameTier.FREE,
      status: FrameStatus.PUBLISHED,
      isTrending: true,
      isFeatured: true,
      estimatedCredits: 10,
      description: 'A clean corporate frame with logo and contact emphasis.',
      publishedAt: new Date(),
    },
    create: {
      id: 'f-1',
      tenantId: defaultTenant.id,
      categoryId: businessCards.id,
      title: 'Executive Business Intro',
      tier: FrameTier.FREE,
      status: FrameStatus.PUBLISHED,
      isTrending: true,
      isFeatured: true,
      estimatedCredits: 10,
      description: 'A clean corporate frame with logo and contact emphasis.',
      publishedAt: new Date(),
    },
  });

  const frame2 = await prisma.frame.upsert({
    where: { id: 'f-2' },
    update: {
      title: 'Monsoon Sale Burst',
      categoryId: festivalCampaigns.id,
      tier: FrameTier.PREMIUM,
      status: FrameStatus.PUBLISHED,
      isTrending: true,
      isFeatured: false,
      estimatedCredits: 16,
      description: 'High-impact promo frame with strong CTA zones.',
      publishedAt: new Date(),
    },
    create: {
      id: 'f-2',
      tenantId: defaultTenant.id,
      categoryId: festivalCampaigns.id,
      title: 'Monsoon Sale Burst',
      tier: FrameTier.PREMIUM,
      status: FrameStatus.PUBLISHED,
      isTrending: true,
      isFeatured: false,
      estimatedCredits: 16,
      description: 'High-impact promo frame with strong CTA zones.',
      publishedAt: new Date(),
    },
  });

  const frame3 = await prisma.frame.upsert({
    where: { id: 'f-3' },
    update: {
      title: 'Startup Product Spotlight',
      categoryId: productAds.id,
      tier: FrameTier.FREE,
      status: FrameStatus.DRAFT,
      isTrending: false,
      isFeatured: true,
      estimatedCredits: 12,
      description: 'Hero-style spotlight suitable for app launches.',
    },
    create: {
      id: 'f-3',
      tenantId: defaultTenant.id,
      categoryId: productAds.id,
      title: 'Startup Product Spotlight',
      tier: FrameTier.FREE,
      status: FrameStatus.DRAFT,
      isTrending: false,
      isFeatured: true,
      estimatedCredits: 12,
      description: 'Hero-style spotlight suitable for app launches.',
    },
  });

  await prisma.billingPlan.upsert({
    where: { id: 'plan-1' },
    update: { amountInr: 199, credits: 40, bonus: 0, active: true },
    create: {
      id: 'plan-1',
      tenantId: defaultTenant.id,
      amountInr: 199,
      credits: 40,
      bonus: 0,
      active: true,
    },
  });

  await prisma.billingPlan.upsert({
    where: { id: 'plan-2' },
    update: { amountInr: 499, credits: 120, bonus: 10, active: true },
    create: {
      id: 'plan-2',
      tenantId: defaultTenant.id,
      amountInr: 499,
      credits: 120,
      bonus: 10,
      active: true,
    },
  });

  await prisma.billingPlan.upsert({
    where: { id: 'plan-3' },
    update: { amountInr: 999, credits: 260, bonus: 40, active: true },
    create: {
      id: 'plan-3',
      tenantId: defaultTenant.id,
      amountInr: 999,
      credits: 260,
      bonus: 40,
      active: true,
    },
  });

  await prisma.subscriptionPlan.createMany({
    data: [
      {
        id: 'sub-plan-monthly',
        tenantId: defaultTenant.id,
        name: 'Premium Monthly',
        amountInr: 499,
        currency: 'INR',
        period: 'MONTHLY',
        premiumFrames: true,
        monthlyCredits: 0,
        graceDays: 3,
        active: true,
        displayOrder: 1,
      },
      {
        id: 'sub-plan-yearly',
        tenantId: defaultTenant.id,
        name: 'Premium Yearly',
        amountInr: 4999,
        currency: 'INR',
        period: 'YEARLY',
        premiumFrames: true,
        monthlyCredits: 0,
        graceDays: 7,
        active: true,
        displayOrder: 2,
      },
    ],
    skipDuplicates: true,
  });

  const project1 = await prisma.project.upsert({
    where: { id: 'p-1' },
    update: {
      name: 'Independence Day Campaign',
      frameId: frame2.id,
      userId: adminUser.id,
      tenantId: defaultTenant.id,
    },
    create: {
      id: 'p-1',
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      frameId: frame2.id,
      name: 'Independence Day Campaign',
    },
  });

  const project2 = await prisma.project.upsert({
    where: { id: 'p-2' },
    update: {
      name: 'Founder Launch Intro',
      frameId: frame1.id,
      userId: adminUser.id,
      tenantId: defaultTenant.id,
    },
    create: {
      id: 'p-2',
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      frameId: frame1.id,
      name: 'Founder Launch Intro',
    },
  });

  await prisma.asset.upsert({
    where: { id: 'a-1' },
    update: {
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      projectId: project1.id,
      frameId: frame2.id,
      title: 'Q3 Promo V1',
      kind: AssetKind.IMAGE,
      status: AssetStatus.SUCCEEDED,
      creditsUsed: 16,
    },
    create: {
      id: 'a-1',
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      projectId: project1.id,
      frameId: frame2.id,
      title: 'Q3 Promo V1',
      kind: AssetKind.IMAGE,
      status: AssetStatus.SUCCEEDED,
      creditsUsed: 16,
    },
  });

  await prisma.asset.upsert({
    where: { id: 'a-2' },
    update: {
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      projectId: project2.id,
      frameId: frame1.id,
      title: 'Founder Intro Reel',
      kind: AssetKind.VIDEO,
      status: AssetStatus.RUNNING,
      creditsUsed: 40,
    },
    create: {
      id: 'a-2',
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      projectId: project2.id,
      frameId: frame1.id,
      title: 'Founder Intro Reel',
      kind: AssetKind.VIDEO,
      status: AssetStatus.RUNNING,
      creditsUsed: 40,
    },
  });

  await prisma.asset.upsert({
    where: { id: 'a-3' },
    update: {
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      projectId: project1.id,
      frameId: frame3.id,
      title: 'Launch Poster',
      kind: AssetKind.IMAGE,
      status: AssetStatus.SUCCEEDED,
      creditsUsed: 12,
    },
    create: {
      id: 'a-3',
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      projectId: project1.id,
      frameId: frame3.id,
      title: 'Launch Poster',
      kind: AssetKind.IMAGE,
      status: AssetStatus.SUCCEEDED,
      creditsUsed: 12,
    },
  });

  await prisma.walletTransaction.upsert({
    where: { id: 'w-1' },
    update: {
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      type: WalletTransactionType.CREDIT,
      amount: 100,
      summary: 'Recharge: Growth 499 Plan',
    },
    create: {
      id: 'w-1',
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      type: WalletTransactionType.CREDIT,
      amount: 100,
      summary: 'Recharge: Growth 499 Plan',
    },
  });

  await prisma.walletTransaction.upsert({
    where: { id: 'w-2' },
    update: {
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      type: WalletTransactionType.DEBIT,
      amount: -16,
      summary: 'Image generation: Monsoon Sale Burst',
    },
    create: {
      id: 'w-2',
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      type: WalletTransactionType.DEBIT,
      amount: -16,
      summary: 'Image generation: Monsoon Sale Burst',
    },
  });

  await prisma.walletTransaction.upsert({
    where: { id: 'w-3' },
    update: {
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      type: WalletTransactionType.BONUS,
      amount: 20,
      summary: 'Promotional top-up',
    },
    create: {
      id: 'w-3',
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      type: WalletTransactionType.BONUS,
      amount: 20,
      summary: 'Promotional top-up',
    },
  });

  await prisma.walletTransaction.upsert({
    where: { id: 'w-4' },
    update: {
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      type: WalletTransactionType.DEBIT,
      amount: -40,
      summary: 'Video generation: Founder Intro Reel',
    },
    create: {
      id: 'w-4',
      tenantId: defaultTenant.id,
      userId: adminUser.id,
      type: WalletTransactionType.DEBIT,
      amount: -40,
      summary: 'Video generation: Founder Intro Reel',
    },
  });

  console.log('Seed complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

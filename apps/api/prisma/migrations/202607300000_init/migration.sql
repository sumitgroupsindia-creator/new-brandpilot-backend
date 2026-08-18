-- CreateTable
CREATE TABLE `tenants` (
    `id` CHAR(26) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `displayName` VARCHAR(255) NULL,
    `logoUrl` VARCHAR(2048) NULL,
    `primaryColor` VARCHAR(9) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    INDEX `tenants_status_idx`(`status`),
    INDEX `tenants_slug_idx`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `passwordHash` VARCHAR(255) NULL,
    `name` VARCHAR(255) NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'DELETED') NOT NULL DEFAULT 'PENDING_VERIFICATION',
    `emailVerifiedAt` DATETIME(3) NULL,
    `emailVerifyToken` VARCHAR(255) NULL,
    `passwordResetToken` VARCHAR(255) NULL,
    `passwordResetExpiresAt` DATETIME(3) NULL,
    `mfaSecret` VARCHAR(255) NULL,
    `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `users_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `users_tenantId_status_idx`(`tenantId`, `status`),
    UNIQUE INDEX `users_tenantId_email_key`(`tenantId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` CHAR(26) NOT NULL,
    `userId` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `refreshHash` VARCHAR(255) NOT NULL,
    `familyId` CHAR(26) NOT NULL,
    `replacedById` CHAR(26) NULL,
    `deviceName` VARCHAR(255) NULL,
    `deviceInfo` JSON NULL,
    `ipAddress` VARCHAR(45) NULL,
    `revokedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessions_refreshHash_key`(`refreshHash`),
    INDEX `sessions_userId_idx`(`userId`),
    INDEX `sessions_refreshHash_idx`(`refreshHash`),
    INDEX `sessions_familyId_idx`(`familyId`),
    INDEX `sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `roles_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `roles_tenantId_key_key`(`tenantId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` CHAR(26) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,

    UNIQUE INDEX `permissions_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `roleId` CHAR(26) NOT NULL,
    `permissionId` CHAR(26) NOT NULL,

    INDEX `role_permissions_permissionId_idx`(`permissionId`),
    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `userId` CHAR(26) NOT NULL,
    `roleId` CHAR(26) NOT NULL,

    INDEX `user_roles_roleId_idx`(`roleId`),
    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `config_entries` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NULL,
    `namespace` VARCHAR(100) NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `value` JSON NOT NULL,
    `isSecret` BOOLEAN NOT NULL DEFAULT false,
    `updatedBy` CHAR(26) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `config_entries_namespace_idx`(`namespace`),
    INDEX `config_entries_tenantId_namespace_idx`(`tenantId`, `namespace`),
    UNIQUE INDEX `config_entries_tenantId_namespace_key_key`(`tenantId`, `namespace`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `config_versions` (
    `id` CHAR(26) NOT NULL,
    `configId` CHAR(26) NOT NULL,
    `value` JSON NOT NULL,
    `reason` TEXT NULL,
    `createdBy` CHAR(26) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `config_versions_configId_createdAt_idx`(`configId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `parentId` CHAR(26) NULL,
    `name` VARCHAR(255) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `categories_tenantId_sortOrder_idx`(`tenantId`, `sortOrder`),
    INDEX `categories_parentId_idx`(`parentId`),
    UNIQUE INDEX `categories_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `frames` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `categoryId` CHAR(26) NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `tier` ENUM('FREE', 'PREMIUM') NOT NULL DEFAULT 'FREE',
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `template` JSON NULL,
    `estimatedCredits` INTEGER NOT NULL DEFAULT 0,
    `isTrending` BOOLEAN NOT NULL DEFAULT false,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `frames_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `frames_tenantId_isFeatured_isTrending_idx`(`tenantId`, `isFeatured`, `isTrending`),
    INDEX `frames_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `userId` CHAR(26) NOT NULL,
    `frameId` CHAR(26) NULL,
    `name` VARCHAR(255) NOT NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `projects_tenantId_userId_updatedAt_idx`(`tenantId`, `userId`, `updatedAt`),
    INDEX `projects_frameId_idx`(`frameId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assets` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `userId` CHAR(26) NOT NULL,
    `projectId` CHAR(26) NULL,
    `frameId` CHAR(26) NULL,
    `title` VARCHAR(255) NOT NULL,
    `kind` ENUM('IMAGE', 'VIDEO') NOT NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED') NOT NULL DEFAULT 'QUEUED',
    `creditsUsed` INTEGER NOT NULL DEFAULT 0,
    `outputUrl` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `assets_tenantId_userId_createdAt_idx`(`tenantId`, `userId`, `createdAt`),
    INDEX `assets_projectId_idx`(`projectId`),
    INDEX `assets_frameId_idx`(`frameId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_transactions` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `userId` CHAR(26) NULL,
    `type` ENUM('CREDIT', 'DEBIT', 'REFUND', 'BONUS', 'EXPIRY') NOT NULL,
    `amount` INTEGER NOT NULL,
    `summary` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wallet_transactions_tenantId_userId_createdAt_idx`(`tenantId`, `userId`, `createdAt`),
    INDEX `wallet_transactions_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `billing_plans` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NULL,
    `amountInr` INTEGER NOT NULL,
    `credits` INTEGER NOT NULL,
    `bonus` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `billing_plans_tenantId_active_idx`(`tenantId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recharge_orders` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `userId` CHAR(26) NOT NULL,
    `providerOrderId` VARCHAR(100) NOT NULL,
    `providerPaymentId` VARCHAR(100) NULL,
    `status` ENUM('CREATED', 'PAID', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'CREATED',
    `amountInr` INTEGER NOT NULL,
    `amountPaise` INTEGER NOT NULL,
    `credits` INTEGER NOT NULL,
    `bonusCredits` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
    `rawPayload` JSON NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `recharge_orders_providerOrderId_key`(`providerOrderId`),
    INDEX `recharge_orders_tenantId_userId_createdAt_idx`(`tenantId`, `userId`, `createdAt`),
    INDEX `recharge_orders_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_notification_preferences` (
    `id` CHAR(26) NOT NULL,
    `userId` CHAR(26) NOT NULL,
    `eventKey` ENUM('RECHARGE_SUCCESS', 'RECHARGE_FAILED', 'GENERATION_COMPLETED', 'GENERATION_FAILED', 'WALLET_LOW_BALANCE') NOT NULL,
    `email` BOOLEAN NOT NULL DEFAULT true,
    `push` BOOLEAN NOT NULL DEFAULT true,
    `inApp` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `user_notification_preferences_eventKey_idx`(`eventKey`),
    UNIQUE INDEX `user_notification_preferences_userId_eventKey_key`(`userId`, `eventKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_events` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `userId` CHAR(26) NOT NULL,
    `eventKey` ENUM('RECHARGE_SUCCESS', 'RECHARGE_FAILED', 'GENERATION_COMPLETED', 'GENERATION_FAILED', 'WALLET_LOW_BALANCE') NOT NULL,
    `channel` ENUM('EMAIL', 'PUSH', 'IN_APP') NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    `metadata` JSON NULL,
    `deliveredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_events_tenantId_userId_createdAt_idx`(`tenantId`, `userId`, `createdAt`),
    INDEX `notification_events_eventKey_channel_idx`(`eventKey`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NULL,
    `actorId` CHAR(26) NULL,
    `actorEmail` VARCHAR(255) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entityType` VARCHAR(100) NOT NULL,
    `entityId` CHAR(26) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `reason` TEXT NULL,
    `ipAddress` VARCHAR(45) NULL,
    `correlationId` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `audit_logs_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `audit_logs_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotency_keys` (
    `id` CHAR(26) NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `userId` CHAR(26) NOT NULL,
    `requestMethod` VARCHAR(10) NOT NULL,
    `requestPath` VARCHAR(2048) NOT NULL,
    `requestBody` JSON NULL,
    `responseStatus` INTEGER NOT NULL,
    `responseBody` JSON NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idempotency_keys_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `idempotency_keys_tenantId_userId_key_key`(`tenantId`, `userId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `config_entries` ADD CONSTRAINT `config_entries_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `config_versions` ADD CONSTRAINT `config_versions_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `config_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `frames` ADD CONSTRAINT `frames_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `frames` ADD CONSTRAINT `frames_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_frameId_fkey` FOREIGN KEY (`frameId`) REFERENCES `frames`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_frameId_fkey` FOREIGN KEY (`frameId`) REFERENCES `frames`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billing_plans` ADD CONSTRAINT `billing_plans_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recharge_orders` ADD CONSTRAINT `recharge_orders_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recharge_orders` ADD CONSTRAINT `recharge_orders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_notification_preferences` ADD CONSTRAINT `user_notification_preferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_events` ADD CONSTRAINT `notification_events_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_events` ADD CONSTRAINT `notification_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `idempotency_keys` ADD CONSTRAINT `idempotency_keys_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


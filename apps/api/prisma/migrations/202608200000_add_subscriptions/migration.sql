-- CreateTable
CREATE TABLE `subscription_plans` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NULL,
    `name` VARCHAR(255) NOT NULL,
    `amountInr` INTEGER NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
    `period` ENUM('MONTHLY', 'QUARTERLY', 'YEARLY') NOT NULL DEFAULT 'MONTHLY',
    `premiumFrames` BOOLEAN NOT NULL DEFAULT true,
    `monthlyCredits` INTEGER NOT NULL DEFAULT 0,
    `graceDays` INTEGER NOT NULL DEFAULT 3,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `subscription_plans_tenantId_active_displayOrder_idx`(`tenantId`, `active`, `displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NOT NULL,
    `userId` CHAR(26) NOT NULL,
    `planId` CHAR(26) NOT NULL,
    `provider` VARCHAR(50) NOT NULL DEFAULT 'razorpay',
    `providerSubId` VARCHAR(100) NOT NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'IN_GRACE', 'PAST_DUE', 'CANCELED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `currentPeriodStart` DATETIME(3) NULL,
    `currentPeriodEnd` DATETIME(3) NULL,
    `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
    `canceledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscriptions_providerSubId_key`(`providerSubId`),
    INDEX `subscriptions_tenantId_userId_status_idx`(`tenantId`, `userId`, `status`),
    INDEX `subscriptions_status_currentPeriodEnd_idx`(`status`, `currentPeriodEnd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_events` (
    `id` CHAR(26) NOT NULL,
    `subscriptionId` CHAR(26) NOT NULL,
    `eventType` VARCHAR(100) NOT NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `subscription_events_subscriptionId_createdAt_idx`(`subscriptionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `subscription_plans` ADD CONSTRAINT `subscription_plans_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `subscription_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription_events` ADD CONSTRAINT `subscription_events_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

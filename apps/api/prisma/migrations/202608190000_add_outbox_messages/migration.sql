-- CreateTable
CREATE TABLE `outbox_messages` (
    `id` CHAR(26) NOT NULL,
    `tenantId` CHAR(26) NULL,
    `userId` CHAR(26) NULL,
    `topic` VARCHAR(100) NOT NULL,
    `dedupeKey` VARCHAR(255) NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 5,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `outbox_messages_topic_dedupeKey_key`(`topic`, `dedupeKey`),
    INDEX `outbox_messages_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `outbox_messages_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `outbox_messages` ADD CONSTRAINT `outbox_messages_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outbox_messages` ADD CONSTRAINT `outbox_messages_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

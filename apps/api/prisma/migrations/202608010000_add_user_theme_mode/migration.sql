-- AlterTable
ALTER TABLE `users`
    ADD COLUMN `themeMode` ENUM('LIGHT', 'DARK', 'SYSTEM') NOT NULL DEFAULT 'SYSTEM' AFTER `name`;
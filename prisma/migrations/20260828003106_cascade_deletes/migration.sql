-- DropForeignKey
ALTER TABLE `Alert` DROP FOREIGN KEY `Alert_analysisId_fkey`;

-- DropForeignKey
ALTER TABLE `Alert` DROP FOREIGN KEY `Alert_entityId_fkey`;

-- DropForeignKey
ALTER TABLE `Analysis` DROP FOREIGN KEY `Analysis_publicationId_fkey`;

-- DropForeignKey
ALTER TABLE `Notification` DROP FOREIGN KEY `Notification_alertId_fkey`;

-- DropForeignKey
ALTER TABLE `Publication` DROP FOREIGN KEY `Publication_sourceId_fkey`;

-- DropForeignKey
ALTER TABLE `PublicationEntity` DROP FOREIGN KEY `PublicationEntity_entityId_fkey`;

-- DropForeignKey
ALTER TABLE `PublicationEntity` DROP FOREIGN KEY `PublicationEntity_publicationId_fkey`;

-- AddForeignKey
ALTER TABLE `Publication` ADD CONSTRAINT `Publication_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Source`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicationEntity` ADD CONSTRAINT `PublicationEntity_publicationId_fkey` FOREIGN KEY (`publicationId`) REFERENCES `Publication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicationEntity` ADD CONSTRAINT `PublicationEntity_entityId_fkey` FOREIGN KEY (`entityId`) REFERENCES `MonitoredEntity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Analysis` ADD CONSTRAINT `Analysis_publicationId_fkey` FOREIGN KEY (`publicationId`) REFERENCES `Publication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_analysisId_fkey` FOREIGN KEY (`analysisId`) REFERENCES `Analysis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_entityId_fkey` FOREIGN KEY (`entityId`) REFERENCES `MonitoredEntity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `Alert`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

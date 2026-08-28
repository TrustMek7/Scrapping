-- AlterTable
ALTER TABLE `Alert` MODIFY `summary` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `Analysis` MODIFY `summary` TEXT NULL,
    MODIFY `reason` TEXT NULL;

-- AlterTable
ALTER TABLE `Publication` MODIFY `content` TEXT NOT NULL;

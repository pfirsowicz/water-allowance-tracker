-- Generic v3-to-v4 migration; portfolio sample defaults only.
-- Do not run against the original private production database.
-- Existing reading rows are preserved.
-- Run once before deploying v4 if the current database was created from the v3 schema.

ALTER TABLE `readings`
  MODIFY COLUMN `reading` BIGINT UNSIGNED NOT NULL;

CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` TINYINT UNSIGNED NOT NULL,
  `baseline_date` DATE NOT NULL,
  `baseline_reading` BIGINT UNSIGNED NOT NULL,
  `daily_allowance` INT UNSIGNED NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CHECK (`id` = 1),
  CHECK (`daily_allowance` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `app_settings` (`id`, `baseline_date`, `baseline_reading`, `daily_allowance`)
VALUES (1, '2026-01-01', 100000, 800)
ON DUPLICATE KEY UPDATE `id` = `id`;

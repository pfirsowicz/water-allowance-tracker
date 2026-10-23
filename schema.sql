-- Water Allowance App v4 schema (fresh install)

CREATE TABLE IF NOT EXISTS `readings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `date` DATE NOT NULL COMMENT 'Date the meter reading was taken',
  `time` TIME NOT NULL COMMENT 'Server time the reading was first saved',
  `reading` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_date_time` (`date`, `time`, `id`),
  UNIQUE KEY `uq_reading_date_value` (`date`, `reading`),
  CHECK (`reading` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

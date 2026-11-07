CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','agent') NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_profiles (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  first_name VARCHAR(60) NOT NULL DEFAULT '',
  last_name VARCHAR(60) NOT NULL DEFAULT '',
  surname VARCHAR(60) NOT NULL DEFAULT '',
  profile_image MEDIUMBLOB NULL,
  profile_image_mime VARCHAR(40) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_account_preferences (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  username VARCHAR(40) NULL UNIQUE,
  location VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_account_status (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  status ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_account_status_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_account_status (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  status ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agent_account_status_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_account_preferences (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  location VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agent_account_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_account_avatars (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  profile_image MEDIUMBLOB NULL,
  profile_image_mime VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agent_account_avatar_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicles (
  id VARCHAR(24) NOT NULL PRIMARY KEY,
  plate VARCHAR(32) NOT NULL UNIQUE,
  make VARCHAR(80) NOT NULL,
  model VARCHAR(80) NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  type VARCHAR(80) NOT NULL,
  color VARCHAR(80) NOT NULL DEFAULT '',
  operator VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  route VARCHAR(160) NOT NULL,
  status ENUM('Active','Under review','Suspended') NOT NULL DEFAULT 'Active',
  registered_at DATE NOT NULL,
  last_verified VARCHAR(80) NOT NULL DEFAULT 'Not verified yet',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vehicles_status (status),
  INDEX idx_vehicles_operator (operator)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_card_batches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vehicle_class VARCHAR(60) NOT NULL,
  destination VARCHAR(120) NOT NULL,
  allocated_quantity INT UNSIGNED NOT NULL DEFAULT 250,
  fare_ngn DECIMAL(12,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_transport_card_batch (vehicle_class, destination)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_card_trips (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id INT UNSIGNED NOT NULL,
  serial INT UNSIGNED NOT NULL,
  vehicle_id VARCHAR(24) NOT NULL,
  driver_name VARCHAR(120) NOT NULL,
  driver_phone VARCHAR(40) NOT NULL,
  origin VARCHAR(120) NOT NULL,
  destination VARCHAR(120) NOT NULL,
  status ENUM('ready','in_transit','on_hold','completed') NOT NULL DEFAULT 'ready',
  current_step TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY uq_transport_card_trip (batch_id, serial),
  INDEX idx_transport_card_trip_status (status, created_at),
  CONSTRAINT fk_transport_card_trip_batch FOREIGN KEY (batch_id) REFERENCES transport_card_batches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transport_card_trip_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transport_card_trip_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_card_trip_tokens (
  batch_id INT UNSIGNED NOT NULL,
  serial INT UNSIGNED NOT NULL,
  public_token CHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id, serial),
  UNIQUE KEY uq_transport_card_trip_token (batch_id, public_token),
  CONSTRAINT fk_transport_card_trip_token_batch FOREIGN KEY (batch_id) REFERENCES transport_card_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_card_trip_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trip_id BIGINT UNSIGNED NOT NULL,
  goods_description VARCHAR(160) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transport_card_trip_items_trip (trip_id),
  CONSTRAINT fk_transport_card_trip_item_trip FOREIGN KEY (trip_id) REFERENCES transport_card_trips(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_card_trip_goods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trip_id BIGINT UNSIGNED NOT NULL,
  goods_description VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transport_card_trip_goods_trip (trip_id),
  CONSTRAINT fk_transport_card_trip_goods_trip FOREIGN KEY (trip_id) REFERENCES transport_card_trips(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_card_verification_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trip_id BIGINT UNSIGNED NOT NULL,
  step TINYINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  outcome ENUM('verified','flagged') NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transport_card_trip_checks (trip_id, step, checked_at),
  CONSTRAINT fk_transport_card_check_trip FOREIGN KEY (trip_id) REFERENCES transport_card_trips(id) ON DELETE CASCADE,
  CONSTRAINT fk_transport_card_check_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Driverless trip records. Kept separate from the legacy vehicle-linked table
-- so deployments whose database user cannot ALTER existing tables can migrate safely.
CREATE TABLE IF NOT EXISTS transport_card_trip_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id INT UNSIGNED NOT NULL,
  serial INT UNSIGNED NOT NULL,
  origin VARCHAR(120) NOT NULL,
  destination VARCHAR(120) NOT NULL,
  status ENUM('ready','in_transit','on_hold','completed') NOT NULL DEFAULT 'ready',
  current_step TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY uq_transport_card_assignment (batch_id, serial),
  INDEX idx_transport_card_assignment_status (status, created_at),
  CONSTRAINT fk_transport_card_assignment_batch FOREIGN KEY (batch_id) REFERENCES transport_card_batches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transport_card_assignment_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_card_assignment_goods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trip_id BIGINT UNSIGNED NOT NULL,
  goods_description VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transport_card_assignment_goods_trip (trip_id),
  CONSTRAINT fk_transport_card_assignment_goods_trip FOREIGN KEY (trip_id) REFERENCES transport_card_trip_assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_card_assignment_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trip_id BIGINT UNSIGNED NOT NULL,
  step TINYINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  outcome ENUM('verified','flagged') NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transport_card_assignment_checks (trip_id, step, checked_at),
  CONSTRAINT fk_transport_card_assignment_check_trip FOREIGN KEY (trip_id) REFERENCES transport_card_trip_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_transport_card_assignment_check_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_production_batches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transport_production_batch_date (batch_date, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_production_batch_seed_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  seeded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_production_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  production_batch_id INT UNSIGNED NOT NULL,
  legacy_batch_id INT UNSIGNED NULL,
  vehicle_class VARCHAR(60) NOT NULL,
  destination VARCHAR(120) NOT NULL,
  allocated_quantity INT UNSIGNED NOT NULL,
  fare_ngn DECIMAL(12,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_transport_production_category (production_batch_id, vehicle_class, destination),
  UNIQUE KEY uq_transport_production_legacy_category (legacy_batch_id),
  INDEX idx_transport_production_category_batch (production_batch_id),
  CONSTRAINT fk_transport_production_category_batch FOREIGN KEY (production_batch_id) REFERENCES transport_production_batches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transport_production_category_legacy FOREIGN KEY (legacy_batch_id) REFERENCES transport_card_batches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_production_trip_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  production_batch_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  serial INT UNSIGNED NOT NULL,
  public_token CHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  origin VARCHAR(120) NOT NULL,
  destination VARCHAR(120) NOT NULL,
  status ENUM('ready','in_transit','on_hold','completed') NOT NULL DEFAULT 'ready',
  current_step TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY uq_transport_production_trip_serial (category_id, serial),
  UNIQUE KEY uq_transport_production_trip_token (production_batch_id, public_token),
  INDEX idx_transport_production_trip_status (status, created_at),
  CONSTRAINT fk_transport_production_trip_batch FOREIGN KEY (production_batch_id) REFERENCES transport_production_batches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transport_production_trip_category FOREIGN KEY (category_id) REFERENCES transport_production_categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transport_production_trip_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_production_trip_goods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trip_id BIGINT UNSIGNED NOT NULL,
  goods_description VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transport_production_trip_goods_trip (trip_id),
  CONSTRAINT fk_transport_production_trip_goods_trip FOREIGN KEY (trip_id) REFERENCES transport_production_trip_assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transport_production_trip_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trip_id BIGINT UNSIGNED NOT NULL,
  step TINYINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  outcome ENUM('verified','flagged') NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transport_production_trip_checks (trip_id, step, checked_at),
  CONSTRAINT fk_transport_production_trip_check FOREIGN KEY (trip_id) REFERENCES transport_production_trip_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_transport_production_trip_check_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One short-lived, isolated practice batch. The JSON payload is deleted when
-- the session expires and never joins production batch or reporting tables.
CREATE TABLE IF NOT EXISTS transport_test_sandboxes (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  session_token CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  data_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicle_verification_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vehicle_id VARCHAR(24) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  vehicle_status ENUM('Active','Under review','Suspended') NOT NULL,
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vehicle_verification_checked_at (checked_at),
  INDEX idx_vehicle_verification_vehicle (vehicle_id, checked_at),
  CONSTRAINT fk_vehicle_verification_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  CONSTRAINT fk_vehicle_verification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_preregistrations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nin_hash CHAR(64) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  other_names VARCHAR(120) NOT NULL DEFAULT '',
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_agent_prereg_admin FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_preregistration_nins (
  preregistration_id INT UNSIGNED NOT NULL PRIMARY KEY,
  nin_encrypted VARCHAR(180) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_agent_preregistration_nin FOREIGN KEY (preregistration_id) REFERENCES agent_preregistrations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  preregistration_id INT UNSIGNED NOT NULL UNIQUE,
  username VARCHAR(40) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  other_names VARCHAR(120) NOT NULL DEFAULT '',
  phone VARCHAR(40) NOT NULL,
  location VARCHAR(120) NOT NULL,
  origin_state VARCHAR(80) NOT NULL,
  origin_lga VARCHAR(80) NOT NULL DEFAULT '',
  residence_state VARCHAR(80) NOT NULL,
  country VARCHAR(80) NOT NULL,
  email_verified_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_agent_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_profile_prereg FOREIGN KEY (preregistration_id) REFERENCES agent_preregistrations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recipient_user_id INT UNSIGNED NOT NULL,
  actor_user_id INT UNSIGNED NULL,
  kind ENUM('agent_activity','admin_message','agent_message') NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  href VARCHAR(255) NOT NULL DEFAULT '',
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_portal_notifications_recipient (recipient_user_id, created_at, id),
  INDEX idx_portal_notifications_actor (actor_user_id, created_at, id),
  CONSTRAINT fk_portal_notification_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_portal_notification_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_verification_user (user_id),
  CONSTRAINT fk_email_verification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  requester_ip_hash CHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_password_reset_user_created (user_id, created_at),
  INDEX idx_password_reset_ip_created (requester_ip_hash, created_at),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

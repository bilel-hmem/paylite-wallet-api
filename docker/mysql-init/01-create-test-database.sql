-- Runs once, when the MySQL volume is first created.
CREATE DATABASE IF NOT EXISTS paylite_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON paylite_test.* TO 'paylite'@'%';
FLUSH PRIVILEGES;

-- Reverte 018_test_folders.sql

DROP TABLE IF EXISTS test_folders;

DROP INDEX IF EXISTS idx_test_cases_folder;
ALTER TABLE test_cases DROP COLUMN IF EXISTS folder_path;

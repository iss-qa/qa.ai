-- Reverte 014_project_journey_view_mode.sql
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_journey_view_mode_check;
ALTER TABLE projects DROP COLUMN IF EXISTS journey_view_mode;

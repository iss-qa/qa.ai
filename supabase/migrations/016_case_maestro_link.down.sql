-- Reverte 016_case_maestro_link.sql
DROP INDEX IF EXISTS idx_qa_cases_test_case;
ALTER TABLE qa_journey_cases DROP COLUMN IF EXISTS test_case_id;

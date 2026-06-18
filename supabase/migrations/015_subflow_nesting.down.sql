-- Reverte 015_subflow_nesting.sql
DROP INDEX IF EXISTS idx_qa_subflows_parent;
ALTER TABLE qa_journey_subflows DROP COLUMN IF EXISTS parent_subflow_id;

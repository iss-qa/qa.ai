ALTER TABLE qa_journey_cases
    DROP COLUMN IF EXISTS automation_alert_days,
    DROP COLUMN IF EXISTS automation_engine,
    DROP COLUMN IF EXISTS playwright_path,
    DROP COLUMN IF EXISTS playwright_repo,
    DROP COLUMN IF EXISTS playwright_spec;

ALTER TABLE qa_journey_subflows
    DROP COLUMN IF EXISTS automation_alert_days;

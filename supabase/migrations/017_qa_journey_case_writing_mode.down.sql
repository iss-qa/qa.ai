ALTER TABLE qa_journey_cases
    DROP COLUMN IF EXISTS writing_mode,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS gherkin;

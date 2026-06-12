-- Plataforma do caso de teste (Web, Mobile, API, ...), importada da planilha
-- do QA ou preenchida manualmente no admin.

ALTER TABLE qa_journey_cases
    ADD COLUMN IF NOT EXISTS platform TEXT;

COMMENT ON COLUMN qa_journey_cases.platform IS
    'Plataforma/ambiente do caso (ex.: Web, Mobile, iOS, Android, API).';

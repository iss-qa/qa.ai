-- Evidência da execução manual de um caso (imagem ou vídeo) + bucket de
-- storage dedicado. A miniatura é exibida no modal de detalhe do caso.

ALTER TABLE qa_journey_cases
    ADD COLUMN IF NOT EXISTS evidence_url  TEXT,
    ADD COLUMN IF NOT EXISTS evidence_type TEXT;  -- 'image' | 'video'

COMMENT ON COLUMN qa_journey_cases.evidence_url IS
    'URL pública da evidência (screenshot/vídeo) da última execução manual.';

-- Bucket público para as evidências (upload feito pelo dashboard com anon key)
INSERT INTO storage.buckets (id, name, public)
VALUES ('qa-evidence', 'qa-evidence', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "qa evidence read"   ON storage.objects;
DROP POLICY IF EXISTS "qa evidence upload" ON storage.objects;
DROP POLICY IF EXISTS "qa evidence delete" ON storage.objects;

CREATE POLICY "qa evidence read" ON storage.objects
    FOR SELECT USING (bucket_id = 'qa-evidence');

CREATE POLICY "qa evidence upload" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'qa-evidence');

CREATE POLICY "qa evidence delete" ON storage.objects
    FOR DELETE USING (bucket_id = 'qa-evidence');

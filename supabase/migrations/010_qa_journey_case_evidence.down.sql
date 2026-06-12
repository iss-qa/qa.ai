ALTER TABLE qa_journey_cases
    DROP COLUMN IF EXISTS evidence_url,
    DROP COLUMN IF EXISTS evidence_type;

DROP POLICY IF EXISTS "qa evidence read"   ON storage.objects;
DROP POLICY IF EXISTS "qa evidence upload" ON storage.objects;
DROP POLICY IF EXISTS "qa evidence delete" ON storage.objects;

-- O bucket só é removido se estiver vazio.
DELETE FROM storage.buckets WHERE id = 'qa-evidence';

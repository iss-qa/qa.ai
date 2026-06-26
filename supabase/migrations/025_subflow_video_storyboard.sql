-- Storyboard de vídeo anexado a um SUB-FLUXO.
-- A partir do upload de um vídeo curto (≤ ~3 min), o front detecta cada
-- mudança de tela, captura um print de cada uma e monta uma sequência de
-- "telas" (passo a passo). Cada item guarda a URL pública da imagem (bucket
-- qa-evidence, prefixo storyboard/) + uma legenda editável.
--
-- Formato (jsonb array):
--   [{ "id": "uuid", "order": 0, "image_url": "https://...", "caption": "…", "time": 1.2 }, ...]
--
-- Reaproveita o bucket público `qa-evidence` (migration 010) — sem novo bucket.

ALTER TABLE qa_journey_subflows
    ADD COLUMN IF NOT EXISTS video_steps JSONB;

COMMENT ON COLUMN qa_journey_subflows.video_steps IS
    'Storyboard derivado de um vídeo: array de telas {id, order, image_url, caption, time}. Renderizado como nós-imagem encadeados (com setas) no mapa. Imagens vivem no bucket qa-evidence (prefixo storyboard/).';

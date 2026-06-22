-- Documento HTML opcional anexado a um SUB-FLUXO (espelha o campo de jornada
-- adicionado na migration 008). A coluna existia só em qa_journeys, então o
-- HTML enviado pelo SubflowFormModal nunca era persistido no banco.
-- Aceita HTML "self-contained" (imagens já embutidas como data URI quando o
-- admin importa um .zip com a pasta de anexos).

ALTER TABLE qa_journey_subflows
    ADD COLUMN IF NOT EXISTS html_doc TEXT;

COMMENT ON COLUMN qa_journey_subflows.html_doc IS
    'Documento HTML completo importado pelo admin; renderizado em iframe sandbox ao abrir o sub-fluxo. Imagens podem vir embutidas como data URI (import de .zip com anexos).';

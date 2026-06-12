-- Documento HTML opcional anexado a uma jornada (Parte: Jornadas).
-- Permite importar um HTML formatado (ex.: planilha de testes estilizada)
-- e renderizá-lo no mapa quando a jornada é expandida.

ALTER TABLE qa_journeys
    ADD COLUMN IF NOT EXISTS html_doc TEXT;

COMMENT ON COLUMN qa_journeys.html_doc IS
    'Documento HTML completo importado pelo admin; renderizado em iframe sandbox no mapa.';

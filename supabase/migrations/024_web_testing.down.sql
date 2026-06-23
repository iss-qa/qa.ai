-- Reverte 024: remove as tabelas de testes Web.
DROP TRIGGER IF EXISTS web_test_configs_updated_at ON web_test_configs;
DROP FUNCTION IF EXISTS web_test_set_updated_at();
DROP TABLE IF EXISTS web_test_results;
DROP TABLE IF EXISTS web_test_runs;
DROP TABLE IF EXISTS web_test_configs;

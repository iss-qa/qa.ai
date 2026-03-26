"""
premises_loader.py
Carrega o premises.yaml e formata como bloco de contexto para injetar no prompt da IA.
Garante que as regras globais de montagem de passos sejam sempre enviadas antes da geração.
"""
import os
import yaml
import logging

logger = logging.getLogger("premises_loader")

# Caminho padrão — relativo à raiz do monorepo
_DEFAULT_PATH = os.path.join(
    os.path.dirname(__file__),  # apps/daemon/ai/
    "..", "..", "..",           # → raiz do monorepo
    "premises.yaml"
)


def load_premises(path: str = None) -> dict:
    """Lê o premises.yaml e retorna o dict bruto."""
    target = path or os.path.abspath(_DEFAULT_PATH)
    try:
        with open(target, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        logger.warning(f"premises.yaml não encontrado em: {target}")
        return {}
    except Exception as e:
        logger.error(f"Erro ao ler premises.yaml: {e}")
        return {}


def format_premises_context(path: str = None) -> str:
    """
    Formata as premissas como bloco de texto estruturado para injeção no prompt da IA.
    Retorna string vazia se o arquivo não existir.
    """
    data = load_premises(path)
    if not data:
        return ""

    lines = [
        "══ PREMISSAS GLOBAIS DO PROJETO (OBRIGATÓRIAS) ══",
        "Estas regras PREVALECEM sobre qualquer inferência sua. Leia e aplique ANTES de montar qualquer passo.\n",
    ]

    # ── Regras de geração de passos ──
    step_gen = data.get("step_generation", {})
    if step_gen:
        lines.append("▶ REGRAS DE MONTAGEM:")

        if step_gen.get("never_use_literal_description"):
            lines.append(
                "  [CRÍTICO] NUNCA use palavras descritivas do usuário nos seletores.\n"
                "  ERRADO: assertVisible: \"botão Entrar\"  →  CERTO: assertVisible: \"Entrar\"\n"
                "  ERRADO: tapOn: \"campo de email\"         →  CERTO: tapOn: \"Digite seu e-mail\""
            )

        if step_gen.get("analyze_images_first"):
            lines.append(
                "  [CRÍTICO] Analise TODAS as imagens de referência ANTES de montar qualquer passo.\n"
                "  Extraia textos exatos de botões, labels, placeholders e hints."
            )

        if step_gen.get("validate_each_step"):
            lines.append(
                "  [CRÍTICO] Valide cada seletor passo a passo antes de incluí-lo no YAML.\n"
                "  O seletor deve existir na imagem, no XML ou no element_map."
            )

        priority = step_gen.get("selector_priority", [])
        if priority:
            lines.append(f"  Hierarquia de seletores: {' > '.join(priority)}")

        forbidden = step_gen.get("forbidden_selector_words", [])
        if forbidden:
            lines.append(f"  Palavras PROIBIDAS nos seletores: {', '.join(forbidden)}")

    # ── Configurações globais ──
    global_cfg = data.get("global", {})
    if global_cfg:
        lines.append("\n▶ CONFIGURAÇÕES GLOBAIS:")
        if global_cfg.get("after_launch_wait"):
            lines.append("  Após launchApp → SEMPRE inserir waitForAnimationToEnd ou extendedWaitUntil.")
        timeout = global_cfg.get("default_wait_timeout_ms")
        if timeout:
            lines.append(f"  Timeout padrão para extendedWaitUntil: {timeout}ms")

    # ── Pacotes de apps conhecidos ──
    app_packages = data.get("app_packages", {})
    if app_packages:
        lines.append("\n▶ APPS CONHECIDOS (pacotes confirmados):")
        for name, pkg in app_packages.items():
            lines.append(f"  {name}: {pkg}")

    # ── Elementos comuns ──
    common = data.get("common_elements", {})
    if common:
        lines.append("\n▶ ELEMENTOS COMUNS (aliases validados no app real):")
        for alias, info in common.items():
            parts = []
            if info.get("resource_id"):
                parts.append(f"id={info['resource_id']}")
            if info.get("text"):
                parts.append(f"text=\"{info['text']}\"")
            if info.get("hint"):
                parts.append(f"hint=\"{info['hint']}\"")
            lines.append(f"  {alias}: {' | '.join(parts)}")

    lines.append("")  # linha em branco final
    return "\n".join(lines)

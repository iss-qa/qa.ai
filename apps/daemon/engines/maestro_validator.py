import yaml


def validate_maestro_yaml(content: str) -> tuple[bool, str]:
    """Validate Maestro YAML syntax before saving."""
    try:
        parts = content.split('---', 1)
        if len(parts) != 2:
            return False, "Separador --- ausente entre appId e os comandos"

        header = yaml.safe_load(parts[0])
        if not header or 'appId' not in header:
            return False, "appId ausente no inicio do flow"

        flow = yaml.safe_load(parts[1])
        if not isinstance(flow, list):
            return False, "Os comandos do flow devem ser uma lista YAML"

        return True, "OK"
    except yaml.YAMLError as e:
        return False, str(e)

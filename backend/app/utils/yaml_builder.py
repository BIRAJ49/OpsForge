import yaml


def to_yaml(data: dict) -> str:
    return yaml.safe_dump(data, sort_keys=False)

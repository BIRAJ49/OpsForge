def normalize_project_name(name: str) -> str:
    return name.strip().lower().replace("_", "-").replace(" ", "-")

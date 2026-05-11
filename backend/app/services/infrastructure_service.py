TEMPLATES = {
    "ec2": 'resource "aws_instance" "app" {\n  ami           = var.ami_id\n  instance_type = var.instance_type\n  subnet_id     = var.subnet_id\n  key_name      = var.key_pair_name\n}\n',
    "s3": 'resource "aws_s3_bucket" "artifacts" {\n  bucket = "replace-with-unique-bucket-name"\n}\n',
    "iam": 'resource "aws_iam_role" "opsforge" {\n  name = "replace-with-role-name"\n  assume_role_policy = "replace-with-policy-json"\n}\n',
    "security-group": 'resource "aws_security_group" "k3s" {\n  name   = "replace-with-security-group-name"\n  vpc_id = var.vpc_id\n}\n',
    "k3s-on-ec2": 'module "k3s" {\n  source = "./modules/k3s-ec2"\n  ami_id = var.ami_id\n  instance_type = var.instance_type\n  subnet_id = var.subnet_id\n}\n',
}


def list_templates() -> list[dict]:
    return [{"id": key, "name": key.replace("-", " ").title(), "content": value} for key, value in TEMPLATES.items()]


def get_template(template_id: str) -> dict | None:
    content = TEMPLATES.get(template_id)
    if not content:
        return None
    return {"id": template_id, "content": content}

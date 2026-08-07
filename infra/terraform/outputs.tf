output "public_ip" {
  description = "Elastic public IPv4 address of the OpsForge server."
  value       = aws_eip.opsforge.public_ip
}

output "instance_id" {
  description = "EC2 instance ID of the OpsForge server."
  value       = aws_instance.opsforge.id
}

output "ssh_command" {
  description = "Command for connecting to the OpsForge server over SSH."
  value       = "ssh -i ${trimsuffix(var.ssh_public_key_path, ".pub")} ubuntu@${aws_eip.opsforge.public_ip}"
}

output "ssm_command" {
  description = "Preferred administrative command after the SSM agent is online."
  value       = "aws ssm start-session --region ${var.aws_region} --target ${aws_instance.opsforge.id}"
}

output "grafana_url" {
  description = "Cloudflare Access-protected Grafana URL."
  value       = "https://${var.grafana_domain_name}"
}

output "argocd_url" {
  description = "Cloudflare Access-protected Argo CD URL."
  value       = "https://${var.argocd_domain_name}"
}

output "terraform_plan_role_arn" {
  description = "Configure this as the AWS_TERRAFORM_PLAN_ROLE_ARN GitHub repository variable."
  value       = aws_iam_role.terraform_plan.arn
}

output "terraform_apply_role_arn" {
  description = "Configure this as the AWS_TERRAFORM_APPLY_ROLE_ARN GitHub repository variable."
  value       = aws_iam_role.terraform_apply.arn
}

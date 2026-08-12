output "public_ip" {
  description = "Elastic public IPv4 address of the OpsForge server."
  value       = aws_eip.opsforge.public_ip
}

output "instance_id" {
  description = "EC2 instance ID of the OpsForge server."
  value       = aws_instance.opsforge.id
}

output "availability_zone" {
  description = "Availability Zone shared by the EC2 node and retained data volume."
  value       = aws_subnet.public.availability_zone
}

output "k3s_data_volume_id" {
  description = "Retained gp3 volume. A standalone attachment gives it DeleteOnTermination=false semantics."
  value       = aws_ebs_volume.k3s_data.id
}

output "k3s_data_volume_arn" {
  description = "ARN of the retained gp3 K3s data volume selected by AWS Backup."
  value       = aws_ebs_volume.k3s_data.arn
}

output "k3s_storage_contract" {
  description = "Stable host paths consumed by K3s local-path PVCs and the host backup uploader."
  value = {
    data_mount            = local.k3s_data_mount
    local_path_root       = "${local.k3s_data_mount}/storage"
    postgres_ready_layout = "<local-path-pv>/ready/<UTC-stem>.{dump,sha256,manifest.json,ready}"
  }
}

output "k3s_version" {
  description = "Checksum-pinned K3s version installed by first-boot bootstrap."
  value       = var.k3s_version
}

output "ssh_command" {
  description = "Command for connecting to the OpsForge server over SSH."
  value       = "ssh -i ${trimsuffix(var.ssh_public_key_path, ".pub")} ubuntu@${aws_eip.opsforge.public_ip}"
}

output "ssm_command" {
  description = "Preferred administrative command after the SSM agent is online."
  value       = "aws ssm start-session --region ${var.aws_region} --target ${aws_instance.opsforge.id}"
}

output "ssm_configure_k3s_command" {
  description = "Explicit post-migration command that installs the pinned K3s config and host backup timers on the existing node."
  value       = "aws ssm send-command --region ${var.aws_region} --instance-ids ${aws_instance.opsforge.id} --document-name ${aws_ssm_document.configure_k3s.name} --comment 'Configure retained-volume K3s after verified migration'"
}

output "ssm_migrate_k3s_data_command" {
  description = "Fail-closed SSM command that migrates the existing root-disk K3s directory to the exact retained EBS volume."
  value       = "aws ssm send-command --region ${var.aws_region} --instance-ids ${aws_instance.opsforge.id} --document-name ${aws_ssm_document.migrate_k3s_data.name} --parameters '{\"volumeId\":[\"${aws_ebs_volume.k3s_data.id}\"],\"cutoverAcknowledgement\":[\"${local.cutover_acknowledgement}\"],\"migrationAcknowledgement\":[\"MIGRATE_ROOT_K3S_DATA\"]}' --comment 'Migrate verified root-disk K3s data to retained EBS'"
}

output "backup_bucket_name" {
  description = "Primary-region KMS-encrypted bucket for K3s and PostgreSQL recovery objects."
  value       = aws_s3_bucket.postgres_backups.id
}

output "backup_kms_key_arn" {
  description = "Primary multi-Region KMS key used by the host-side recovery uploaders."
  value       = aws_kms_key.backups.arn
}

output "disaster_recovery_kms_key_arn" {
  description = "Multi-Region KMS replica that decrypts server-token ciphertext and protects recovery copies in the DR region."
  value       = aws_kms_replica_key.backups_dr.arn
}

output "recovery_reader_role_arn" {
  description = "MFA-gated human role that can only list/read DR recovery prefixes and decrypt with the DR replica key."
  value       = aws_iam_role.recovery_reader.arn
}

output "operations_sns_topic_arn" {
  description = "Off-node alert topic; its email subscription must be confirmed before production activation."
  value       = aws_sns_topic.operations.arn
}

output "operations_kms_key_arn" {
  description = "Customer-managed key used by EventBridge, CloudWatch, and the node when publishing encrypted operations alerts."
  value       = aws_kms_key.operations.arn
}

output "disaster_recovery_bucket_name" {
  description = "Cross-region replicated recovery bucket."
  value       = aws_s3_bucket.recovery_dr.id
}

output "ebs_backup_vault_arn" {
  description = "Primary AWS Backup vault for daily K3s data-volume recovery points."
  value       = aws_backup_vault.k3s_data.arn
}

output "disaster_recovery_backup_vault_arn" {
  description = "Cross-region AWS Backup vault receiving copies of K3s data-volume recovery points."
  value       = aws_backup_vault.k3s_data_dr.arn
}

output "secret_container_arns" {
  description = "Empty Secrets Manager containers to populate out-of-band. Values are not managed by Terraform."
  value       = { for name, secret in aws_secretsmanager_secret.opsforge : name => secret.arn }
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

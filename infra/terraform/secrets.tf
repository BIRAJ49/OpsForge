# These resources reserve stable names and apply recovery/deletion controls.
# Secret *values* must be written out-of-band so they never enter Terraform state.
resource "aws_secretsmanager_secret" "opsforge" {
  for_each = var.secret_container_names

  name                    = each.value
  description             = "OpsForge secret container managed by operators; value is intentionally outside Terraform."
  kms_key_id              = aws_kms_key.backups.arn
  recovery_window_in_days = 30

  replica {
    region     = var.disaster_recovery_region
    kms_key_id = aws_kms_replica_key.backups_dr.arn
  }

  tags = {
    Environment = var.environment
    Purpose     = "runtime-secret-container"
  }
}

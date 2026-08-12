# Preserve the existing node backup policy and attachment while broadening their
# purpose to the exact K3s/PostgreSQL recovery prefixes and secret containers.
moved {
  from = aws_iam_policy.postgres_backups
  to   = aws_iam_policy.node_recovery
}

moved {
  from = aws_iam_role_policy_attachment.postgres_backups
  to   = aws_iam_role_policy_attachment.node_recovery
}

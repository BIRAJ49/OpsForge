data "aws_caller_identity" "current" {}

locals {
  backup_bucket_name    = "opsforge-postgres-backups-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  dr_backup_bucket_name = "opsforge-recovery-${data.aws_caller_identity.current.account_id}-${var.disaster_recovery_region}"
  backup_prefixes       = ["k3s/etcd/*", "k3s/token/*", "postgres/production/*", "postgres/staging/*"]
}

resource "aws_kms_key" "backups" {
  description             = "Encrypt OpsForge recovery objects and EBS recovery points"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region            = true

  tags = {
    Name        = "opsforge-${var.environment}-backups"
    Environment = var.environment
    Purpose     = "recovery"
  }
}

resource "aws_kms_alias" "backups" {
  name          = "alias/opsforge-${var.environment}-backups"
  target_key_id = aws_kms_key.backups.key_id
}

resource "aws_kms_replica_key" "backups_dr" {
  provider = aws.disaster_recovery

  primary_key_arn         = aws_kms_key.backups.arn
  description             = "Encrypt cross-region OpsForge recovery copies"
  deletion_window_in_days = 30

  tags = {
    Name        = "opsforge-${var.environment}-backups-dr"
    Environment = var.environment
    Purpose     = "cross-region-recovery"
  }
}

resource "aws_kms_alias" "backups_dr" {
  provider = aws.disaster_recovery

  name          = "alias/opsforge-${var.environment}-backups-dr"
  target_key_id = aws_kms_replica_key.backups_dr.key_id
}

resource "aws_s3_bucket" "postgres_backups" {
  bucket        = local.backup_bucket_name
  force_destroy = false

  tags = {
    Name        = "opsforge-recovery"
    Environment = var.environment
    Purpose     = "postgres-and-k3s-backups"
  }
}

resource "aws_s3_bucket_public_access_block" "postgres_backups" {
  bucket = aws_s3_bucket.postgres_backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "postgres_backups" {
  bucket = aws_s3_bucket.postgres_backups.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "postgres_backups" {
  bucket = aws_s3_bucket.postgres_backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "postgres_backups" {
  bucket = aws_s3_bucket.postgres_backups.id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.backups.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "postgres_backups" {
  bucket = aws_s3_bucket.postgres_backups.id

  depends_on = [aws_s3_bucket_versioning.postgres_backups]

  rule {
    id     = "expire-recovery-objects"
    status = "Enabled"

    filter {}

    expiration {
      days = var.s3_backup_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.s3_backup_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "backup_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.postgres_backups.arn,
      "${aws_s3_bucket.postgres_backups.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid     = "DenyUploadsWithoutKMS"
    effect  = "Deny"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.postgres_backups.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["aws:kms"]
    }
  }

  statement {
    sid     = "DenyUploadsWithWrongKMSKey"
    effect  = "Deny"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.postgres_backups.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption-aws-kms-key-id"
      values   = [aws_kms_key.backups.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "postgres_backups" {
  bucket = aws_s3_bucket.postgres_backups.id
  policy = data.aws_iam_policy_document.backup_bucket.json
}

resource "aws_s3_bucket" "recovery_dr" {
  provider = aws.disaster_recovery

  bucket        = local.dr_backup_bucket_name
  force_destroy = false

  tags = {
    Name        = "opsforge-recovery-dr"
    Environment = var.environment
    Purpose     = "cross-region-recovery"
  }
}

resource "aws_s3_bucket_public_access_block" "recovery_dr" {
  provider = aws.disaster_recovery
  bucket   = aws_s3_bucket.recovery_dr.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "recovery_dr" {
  provider = aws.disaster_recovery
  bucket   = aws_s3_bucket.recovery_dr.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "recovery_dr" {
  provider = aws.disaster_recovery
  bucket   = aws_s3_bucket.recovery_dr.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "recovery_dr" {
  provider = aws.disaster_recovery
  bucket   = aws_s3_bucket.recovery_dr.id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_replica_key.backups_dr.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "recovery_dr" {
  provider = aws.disaster_recovery
  bucket   = aws_s3_bucket.recovery_dr.id

  depends_on = [aws_s3_bucket_versioning.recovery_dr]

  rule {
    id     = "expire-cross-region-recovery-objects"
    status = "Enabled"

    filter {}

    expiration {
      days = var.dr_s3_backup_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.dr_s3_backup_retention_days
    }
  }
}

data "aws_iam_policy_document" "recovery_dr_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.recovery_dr.arn,
      "${aws_s3_bucket.recovery_dr.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid     = "DenyUploadsWithoutKMS"
    effect  = "Deny"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.recovery_dr.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["aws:kms"]
    }
  }

  statement {
    sid     = "DenyUploadsWithWrongKMSKey"
    effect  = "Deny"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.recovery_dr.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption-aws-kms-key-id"
      values   = [aws_kms_replica_key.backups_dr.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "recovery_dr" {
  provider = aws.disaster_recovery
  bucket   = aws_s3_bucket.recovery_dr.id
  policy   = data.aws_iam_policy_document.recovery_dr_bucket.json
}

data "aws_iam_policy_document" "s3_replication_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "s3_replication" {
  name               = "opsforge-${var.environment}-s3-replication"
  assume_role_policy = data.aws_iam_policy_document.s3_replication_assume_role.json
}

data "aws_iam_policy_document" "s3_replication" {
  statement {
    sid       = "ReadSourceBucket"
    effect    = "Allow"
    actions   = ["s3:GetReplicationConfiguration", "s3:ListBucket"]
    resources = [aws_s3_bucket.postgres_backups.arn]
  }

  statement {
    sid    = "ReadSourceVersions"
    effect = "Allow"
    actions = [
      "s3:GetObjectVersionAcl",
      "s3:GetObjectVersionForReplication",
      "s3:GetObjectVersionTagging",
    ]
    resources = ["${aws_s3_bucket.postgres_backups.arn}/*"]
  }

  statement {
    sid    = "ReplicateToRecoveryRegion"
    effect = "Allow"
    actions = [
      "s3:ReplicateObject",
      "s3:ReplicateTags",
    ]
    resources = ["${aws_s3_bucket.recovery_dr.arn}/*"]
  }

  statement {
    sid       = "DecryptSourceObjects"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.backups.arn]
  }

  statement {
    sid       = "EncryptDestinationObjects"
    effect    = "Allow"
    actions   = ["kms:Encrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_replica_key.backups_dr.arn]
  }
}

resource "aws_iam_policy" "s3_replication" {
  name   = "opsforge-${var.environment}-s3-replication"
  policy = data.aws_iam_policy_document.s3_replication.json
}

resource "aws_iam_role_policy_attachment" "s3_replication" {
  role       = aws_iam_role.s3_replication.name
  policy_arn = aws_iam_policy.s3_replication.arn
}

resource "aws_s3_bucket_replication_configuration" "recovery" {
  bucket = aws_s3_bucket.postgres_backups.id
  role   = aws_iam_role.s3_replication.arn

  depends_on = [
    aws_s3_bucket_versioning.postgres_backups,
    aws_s3_bucket_versioning.recovery_dr,
  ]

  rule {
    id     = "replicate-recovery-objects"
    status = "Enabled"

    filter {}

    delete_marker_replication {
      status = "Disabled"
    }

    source_selection_criteria {
      sse_kms_encrypted_objects {
        status = "Enabled"
      }
    }

    destination {
      bucket        = aws_s3_bucket.recovery_dr.arn
      storage_class = "STANDARD_IA"

      metrics {
        status = "Enabled"

        event_threshold {
          minutes = 15
        }
      }

      encryption_configuration {
        replica_kms_key_id = aws_kms_replica_key.backups_dr.arn
      }
    }
  }
}

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "opsforge" {
  name               = "opsforge-${var.environment}-ec2"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = {
    Name        = "opsforge-${var.environment}-ec2"
    Environment = var.environment
  }
}

data "aws_iam_policy_document" "node_recovery" {
  statement {
    sid       = "ListApprovedRecoveryPrefixes"
    effect    = "Allow"
    actions   = ["s3:GetBucketLocation", "s3:ListBucket"]
    resources = [aws_s3_bucket.postgres_backups.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = local.backup_prefixes
    }
  }

  statement {
    sid    = "AppendAndRestoreRecoveryObjects"
    effect = "Allow"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
    ]
    resources = [for prefix in local.backup_prefixes : "${aws_s3_bucket.postgres_backups.arn}/${prefix}"]
  }

  statement {
    sid    = "UseRecoveryKey"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:Encrypt",
      "kms:GenerateDataKey",
    ]
    resources = [aws_kms_key.backups.arn]
  }

  statement {
    sid       = "ReadApprovedRuntimeSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:DescribeSecret", "secretsmanager:GetSecretValue"]
    resources = values(aws_secretsmanager_secret.opsforge)[*].arn
  }

  statement {
    sid       = "PublishHostBackupFailures"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.operations.arn]
  }

  statement {
    sid    = "EncryptHostBackupFailureNotifications"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey*",
    ]
    resources = [aws_kms_key.operations.arn]
  }
}

data "aws_iam_policy_document" "recovery_reader_assume_role" {
  statement {
    sid     = "AccountOperatorsWithMFAOnly"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    condition {
      test     = "Bool"
      variable = "aws:MultiFactorAuthPresent"
      values   = ["true"]
    }
  }
}

resource "aws_iam_role" "recovery_reader" {
  name                 = "opsforge-${var.environment}-recovery-reader"
  description          = "MFA-gated human recovery reader; never trusted by the node or CI."
  assume_role_policy   = data.aws_iam_policy_document.recovery_reader_assume_role.json
  max_session_duration = 3600

  tags = {
    Environment = var.environment
    Purpose     = "human-disaster-recovery"
  }
}

data "aws_iam_policy_document" "recovery_reader" {
  statement {
    sid       = "ListExactRecoveryPrefixes"
    effect    = "Allow"
    actions   = ["s3:GetBucketLocation", "s3:ListBucket", "s3:ListBucketVersions"]
    resources = [aws_s3_bucket.recovery_dr.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = local.backup_prefixes
    }
  }

  statement {
    sid       = "ReadExactRecoveryPrefixes"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectVersion"]
    resources = [for prefix in local.backup_prefixes : "${aws_s3_bucket.recovery_dr.arn}/${prefix}"]
  }

  statement {
    sid       = "DecryptRecoveryObjects"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = [aws_kms_replica_key.backups_dr.arn]
  }
}

resource "aws_iam_role_policy" "recovery_reader" {
  name   = "read-decrypt-cross-region-recovery"
  role   = aws_iam_role.recovery_reader.id
  policy = data.aws_iam_policy_document.recovery_reader.json
}

resource "aws_iam_policy" "node_recovery" {
  # Keep the legacy identity/description to update this policy in place. IAM
  # policy names and descriptions are ForceNew and this node must never lose its
  # recovery permissions during the storage migration.
  name        = "opsforge-${var.environment}-postgres-backups"
  description = "Allow the OpsForge server to write and restore PostgreSQL backups."
  policy      = data.aws_iam_policy_document.node_recovery.json
}

resource "aws_iam_role_policy_attachment" "node_recovery" {
  role       = aws_iam_role.opsforge.name
  policy_arn = aws_iam_policy.node_recovery.arn
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.opsforge.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "opsforge" {
  name = "opsforge-${var.environment}-ec2"
  role = aws_iam_role.opsforge.name

  tags = {
    Name        = "opsforge-${var.environment}-ec2"
    Environment = var.environment
  }
}

data "aws_iam_policy_document" "backup_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "opsforge-${var.environment}-aws-backup"
  assume_role_policy = data.aws_iam_policy_document.backup_assume_role.json
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_backup_vault" "k3s_data" {
  name        = "opsforge-${var.environment}-k3s-data"
  kms_key_arn = aws_kms_key.backups.arn

  tags = {
    Environment = var.environment
    Purpose     = "k3s-data-recovery"
  }
}

resource "aws_backup_vault" "k3s_data_dr" {
  provider = aws.disaster_recovery

  name        = "opsforge-${var.environment}-k3s-data-dr"
  kms_key_arn = aws_kms_replica_key.backups_dr.arn

  tags = {
    Environment = var.environment
    Purpose     = "cross-region-k3s-data-recovery"
  }
}

resource "aws_backup_plan" "k3s_data" {
  name = "opsforge-${var.environment}-k3s-data"

  rule {
    rule_name         = "daily-k3s-data"
    target_vault_name = aws_backup_vault.k3s_data.name
    schedule          = "cron(0 3 * * ? *)"
    start_window      = 60
    completion_window = 360

    lifecycle {
      delete_after = var.ebs_backup_retention_days
    }

    copy_action {
      destination_vault_arn = aws_backup_vault.k3s_data_dr.arn

      lifecycle {
        delete_after = var.dr_ebs_backup_retention_days
      }
    }

    recovery_point_tags = {
      Environment = var.environment
      Purpose     = "k3s-data-recovery"
    }
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_backup_selection" "k3s_data" {
  name         = "opsforge-${var.environment}-k3s-data"
  plan_id      = aws_backup_plan.k3s_data.id
  iam_role_arn = aws_iam_role.backup.arn
  resources    = [aws_ebs_volume.k3s_data.arn]
}

data "aws_caller_identity" "current" {}

locals {
  backup_bucket_name = "opsforge-postgres-backups-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
}

resource "aws_s3_bucket" "postgres_backups" {
  bucket        = local.backup_bucket_name
  force_destroy = false

  tags = {
    Name        = "opsforge-postgres-backups"
    Environment = var.environment
    Purpose     = "postgres-backups"
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

# SSE-S3 is sufficient for this personal-project backup bucket and avoids the
# recurring cost and additional key policy surface of a customer-managed KMS key.
#trivy:ignore:AVD-AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "postgres_backups" {
  bucket = aws_s3_bucket.postgres_backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "postgres_backups" {
  bucket = aws_s3_bucket.postgres_backups.id

  depends_on = [aws_s3_bucket_versioning.postgres_backups]

  rule {
    id     = "expire-postgres-backups"
    status = "Enabled"

    filter {}

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
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

data "aws_iam_policy_document" "postgres_backups" {
  statement {
    sid    = "ListBackupBucket"
    effect = "Allow"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket",
    ]
    resources = [aws_s3_bucket.postgres_backups.arn]
  }

  statement {
    sid    = "ReadWriteBackupObjects"
    effect = "Allow"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
    ]
    resources = ["${aws_s3_bucket.postgres_backups.arn}/*"]
  }
}

resource "aws_iam_policy" "postgres_backups" {
  name        = "opsforge-${var.environment}-postgres-backups"
  description = "Allow the OpsForge server to write and restore PostgreSQL backups."
  policy      = data.aws_iam_policy_document.postgres_backups.json

  tags = {
    Name        = "opsforge-${var.environment}-postgres-backups"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "postgres_backups" {
  role       = aws_iam_role.opsforge.name
  policy_arn = aws_iam_policy.postgres_backups.arn
}

resource "aws_iam_instance_profile" "opsforge" {
  name = "opsforge-${var.environment}-ec2"
  role = aws_iam_role.opsforge.name

  tags = {
    Name        = "opsforge-${var.environment}-ec2"
    Environment = var.environment
  }
}

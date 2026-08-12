data "aws_iam_policy_document" "operations_kms" {
  statement {
    sid       = "AccountAdministersAlertKey"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  # EventBridge-to-encrypted-SNS does not support SourceArn/SourceAccount KMS
  # conditions. Keep this statement limited to the exact service principal and
  # the two cryptographic operations required by SNS publishers.
  statement {
    sid    = "EventBridgeEncryptsBackupFailureNotifications"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey*",
    ]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }

  statement {
    sid    = "CloudWatchEncryptsRecoveryAlarmNotifications"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey*",
    ]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:opsforge-${var.environment}-*"]
    }
  }
}

resource "aws_kms_key" "operations" {
  description             = "Encrypt OpsForge off-node operations alerts"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.operations_kms.json

  tags = {
    Name        = "opsforge-${var.environment}-operations"
    Environment = var.environment
    Purpose     = "off-node-operations-alerts"
  }
}

resource "aws_kms_alias" "operations" {
  name          = "alias/opsforge-${var.environment}-operations"
  target_key_id = aws_kms_key.operations.key_id
}

resource "aws_sns_topic" "operations" {
  name              = "opsforge-${var.environment}-operations"
  kms_master_key_id = aws_kms_key.operations.arn

  tags = {
    Environment = var.environment
    Purpose     = "off-node-operations-alerts"
  }
}

resource "aws_sns_topic_subscription" "operations_email" {
  topic_arn = aws_sns_topic.operations.arn
  protocol  = "email"
  endpoint  = var.budget_alert_email
}

resource "aws_cloudwatch_event_rule" "backup_failures" {
  name        = "opsforge-${var.environment}-backup-job-failures"
  description = "Capture failed, aborted, or expired AWS Backup and cross-region copy jobs."

  event_pattern = jsonencode({
    source      = ["aws.backup"]
    detail-type = ["Backup Job State Change", "Copy Job State Change"]
    detail = {
      state = ["FAILED", "ABORTED", "EXPIRED"]
    }
  })
}

resource "aws_cloudwatch_event_target" "backup_failures" {
  rule      = aws_cloudwatch_event_rule.backup_failures.name
  target_id = "opsforge-operations-sns"
  arn       = aws_sns_topic.operations.arn
}

resource "aws_cloudwatch_metric_alarm" "s3_replication_failures" {
  alarm_name          = "opsforge-${var.environment}-s3-replication-failures"
  alarm_description   = "At least one primary recovery object failed cross-region S3 replication."
  namespace           = "AWS/S3"
  metric_name         = "OperationsFailedReplication"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    SourceBucket      = aws_s3_bucket.postgres_backups.id
    DestinationBucket = aws_s3_bucket.recovery_dr.id
    RuleId            = "replicate-recovery-objects"
  }

  alarm_actions = [aws_sns_topic.operations.arn]
  ok_actions    = [aws_sns_topic.operations.arn]

  tags = {
    Environment = var.environment
    Purpose     = "recovery-alerting"
  }
}

data "aws_iam_policy_document" "operations_topic" {
  statement {
    sid    = "AccountOwnsTopic"
    effect = "Allow"
    actions = [
      "SNS:AddPermission",
      "SNS:DeleteTopic",
      "SNS:GetTopicAttributes",
      "SNS:ListSubscriptionsByTopic",
      "SNS:Publish",
      "SNS:Receive",
      "SNS:RemovePermission",
      "SNS:SetTopicAttributes",
      "SNS:Subscribe",
    ]
    resources = [aws_sns_topic.operations.arn]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "EventBridgePublishesBackupFailures"
    effect    = "Allow"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.operations.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.backup_failures.arn]
    }
  }

  statement {
    sid       = "CloudWatchPublishesRecoveryAlarms"
    effect    = "Allow"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.operations.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:opsforge-${var.environment}-*"]
    }
  }
}

resource "aws_sns_topic_policy" "operations" {
  arn    = aws_sns_topic.operations.arn
  policy = data.aws_iam_policy_document.operations_topic.json
}

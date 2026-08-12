data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  cutover_acknowledgement = "I_HAVE_VERIFIED_BACKUPS_AND_THE_K3S_DATA_MIGRATION_PLAN"
  k3s_data_mount          = "/var/lib/rancher/k3s"
  k3s_data_device         = "/dev/sdf"
  capacity_reviewed_instance_types = toset([
    "m7i.2xlarge",
    "m7i.4xlarge",
    "m7i.8xlarge",
    "m7i.12xlarge",
    "m7i.16xlarge",
    "m7i.24xlarge",
    "m7i.48xlarge",
  ])

  k3s_user_data = <<-USER_DATA
    #!/usr/bin/env bash
    export OPSFORGE_AWS_CLI_SHA256=${jsonencode(var.aws_cli_zip_sha256)}
    export OPSFORGE_AWS_CLI_VERSION=${jsonencode(var.aws_cli_version)}
    export OPSFORGE_AWS_REGION=${jsonencode(var.aws_region)}
    export OPSFORGE_BACKUP_BUCKET=${jsonencode(aws_s3_bucket.postgres_backups.id)}
    export OPSFORGE_BACKUP_KMS_KEY_ARN=${jsonencode(aws_kms_key.backups.arn)}
    export OPSFORGE_ALERT_TOPIC_ARN=${jsonencode(aws_sns_topic.operations.arn)}
    export OPSFORGE_BACKUP_SCRIPT_B64_GZ=${jsonencode(base64gzip(file("${path.module}/scripts/backup-k3s.sh")))}
    export OPSFORGE_DATA_MOUNT=${jsonencode(local.k3s_data_mount)}
    export OPSFORGE_DATA_VOLUME_ID=${jsonencode(aws_ebs_volume.k3s_data.id)}
    export OPSFORGE_K3S_SHA256=${jsonencode(var.k3s_sha256)}
    export OPSFORGE_K3S_SNAPSHOT_RETENTION=${jsonencode(tostring(var.k3s_snapshot_retention))}
    export OPSFORGE_K3S_VERSION=${jsonencode(var.k3s_version)}
    export OPSFORGE_POSTGRES_UPLOAD_SCRIPT_B64_GZ=${jsonencode(base64gzip(file("${path.module}/scripts/upload-postgres-backups.sh")))}
    export OPSFORGE_POSTGRES_BACKUP_IMAGE_REVISION=${jsonencode(var.postgres_backup_image_revision)}
    ${file("${path.module}/scripts/install-k3s.sh")}
  USER_DATA

  # EC2's API limit is 16 KiB after base64 decoding. Cloud-init recognizes the
  # gzip magic header and expands this payload before executing it.
  k3s_user_data_gzip_base64 = base64gzip(local.k3s_user_data)
  k3s_user_data_gzip_padding = endswith(local.k3s_user_data_gzip_base64, "==") ? 2 : (
    endswith(local.k3s_user_data_gzip_base64, "=") ? 1 : 0
  )
  k3s_user_data_gzip_bytes = (length(local.k3s_user_data_gzip_base64) / 4 * 3) - local.k3s_user_data_gzip_padding

  k3s_ssm_payload = base64gzip(local.k3s_user_data)
  k3s_ssm_command = join(" ", [
    "script_path=\"$(mktemp /var/tmp/opsforge-configure-k3s.XXXXXX)\";",
    "trap 'rm -f \"$script_path\"' EXIT HUP INT TERM;",
    "printf '%s' '${local.k3s_ssm_payload}' | base64 --decode | gzip --decompress >\"$script_path\";",
    "chmod 0700 \"$script_path\";",
    "/usr/bin/env bash \"$script_path\"",
  ])
  k3s_ssm_document = jsonencode({
    schemaVersion = "2.2"
    description   = "Explicitly configure the checksum-pinned OpsForge K3s host after retained-volume migration."
    mainSteps = [
      {
        action = "aws:runShellScript"
        name   = "configureK3s"
        inputs = {
          timeoutSeconds = "1800"
          runCommand     = [local.k3s_ssm_command]
        }
      },
    ]
  })

  k3s_migration_payload = base64gzip(file("${path.module}/scripts/migrate-k3s-data.sh"))
  k3s_migration_command = join(" ", [
    "script_path=\"$(mktemp /var/tmp/opsforge-migrate-k3s.XXXXXX)\";",
    "trap 'rm -f \"$script_path\"' EXIT HUP INT TERM;",
    "printf '%s' '${local.k3s_migration_payload}' | base64 --decode | gzip --decompress >\"$script_path\";",
    "chmod 0700 \"$script_path\";",
    "/usr/bin/env bash \"$script_path\" '{{ volumeId }}' '{{ cutoverAcknowledgement }}' '{{ migrationAcknowledgement }}'",
  ])
  k3s_migration_document = jsonencode({
    schemaVersion = "2.2"
    description   = "Migrate existing root-disk K3s data to the exact retained OpsForge EBS volume."
    parameters = {
      volumeId = {
        type           = "String"
        description    = "Exact attached retained EBS volume ID."
        allowedPattern = "^vol-[0-9a-f]+$"
      }
      cutoverAcknowledgement = {
        type          = "String"
        description   = "Exact reviewed cutover acknowledgement."
        allowedValues = [local.cutover_acknowledgement]
      }
      migrationAcknowledgement = {
        type          = "String"
        description   = "Exact final data-copy acknowledgement."
        allowedValues = ["MIGRATE_ROOT_K3S_DATA"]
      }
    }
    mainSteps = [
      {
        action = "aws:runShellScript"
        name   = "migrateK3sData"
        inputs = {
          timeoutSeconds = "3600"
          runCommand     = [local.k3s_migration_command]
        }
      },
    ]
  })
}

resource "terraform_data" "safety_checks" {
  lifecycle {
    precondition {
      condition     = var.single_node_cutover_acknowledgement == local.cutover_acknowledgement
      error_message = "Refusing to plan/apply the single-node storage cutover. Back up the old root-disk database/PVCs, read infra/terraform/README.md, and set single_node_cutover_acknowledgement to the documented exact phrase."
    }

    precondition {
      condition     = var.monthly_budget_usd >= var.minimum_expected_monthly_cost_usd || var.acknowledge_budget_below_estimate
      error_message = "monthly_budget_usd is below minimum_expected_monthly_cost_usd. Review current regional pricing and either raise the budget or explicitly set acknowledge_budget_below_estimate=true."
    }

    precondition {
      condition     = contains(local.capacity_reviewed_instance_types, var.instance_type) || var.acknowledge_unreviewed_instance_capacity
      error_message = "instance_type has not been capacity-reviewed for the combined staging, production, data, and platform workloads. Use m7i.2xlarge or larger from the documented m7i set, or explicitly acknowledge a separate capacity review."
    }
  }
}

data "aws_ami" "ubuntu" {
  most_recent = false
  owners      = ["099720109477"]

  filter {
    name   = "image-id"
    values = [var.ubuntu_ami_id]
  }
}

resource "aws_vpc" "opsforge" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "opsforge-${var.environment}-vpc"
    Environment = var.environment
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.opsforge.id
  cidr_block              = "10.42.1.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = false

  tags = {
    Name        = "opsforge-${var.environment}-public"
    Environment = var.environment
  }
}

resource "aws_internet_gateway" "opsforge" {
  vpc_id = aws_vpc.opsforge.id

  tags = {
    Name        = "opsforge-${var.environment}-igw"
    Environment = var.environment
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.opsforge.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.opsforge.id
  }

  tags = {
    Name        = "opsforge-${var.environment}-public"
    Environment = var.environment
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# This single-node K3s host requires internet egress for image registries,
# package repositories, certificate issuance, AWS APIs, and external services.
#trivy:ignore:AVD-AWS-0104
resource "aws_security_group" "opsforge" {
  name        = "opsforge-${var.environment}"
  description = "Public web access and restricted SSH for the OpsForge K3s node"
  vpc_id      = aws_vpc.opsforge.id

  dynamic "ingress" {
    for_each = var.enable_ssh_access ? [1] : []

    content {
      description = "Temporary SSH from administrator IP; disable after SSM verification"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [var.ssh_allowed_cidr]
    }
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.cloudflare_ipv4_cidrs
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.cloudflare_ipv4_cidrs
  }

  egress {
    description = "Allow outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "opsforge-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_key_pair" "opsforge" {
  key_name   = "opsforge-${var.environment}"
  public_key = var.ssh_public_key != null ? var.ssh_public_key : file(pathexpand(var.ssh_public_key_path))

  tags = {
    Name        = "opsforge-${var.environment}"
    Environment = var.environment
  }

}

resource "aws_ebs_volume" "k3s_data" {
  availability_zone = aws_subnet.public.availability_zone
  type              = "gp3"
  size              = var.data_volume_size
  iops              = var.data_volume_iops
  throughput        = var.data_volume_throughput
  encrypted         = true

  tags = {
    Name                = "opsforge-${var.environment}-k3s-data"
    Environment         = var.environment
    Purpose             = "k3s-data-and-local-path-pvcs"
    DeleteOnTermination = "false"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_instance" "opsforge" {
  ami                                  = data.aws_ami.ubuntu.id
  instance_type                        = var.instance_type
  subnet_id                            = aws_subnet.public.id
  vpc_security_group_ids               = [aws_security_group.opsforge.id]
  key_name                             = aws_key_pair.opsforge.key_name
  iam_instance_profile                 = aws_iam_instance_profile.opsforge.name
  associate_public_ip_address          = true
  monitoring                           = true
  disable_api_termination              = true
  instance_initiated_shutdown_behavior = "stop"
  user_data_base64                     = local.k3s_user_data_gzip_base64
  user_data_replace_on_change          = false

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    iops                  = var.root_volume_iops
    throughput            = var.root_volume_throughput
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
    instance_metadata_tags      = "disabled"
  }

  tags = {
    Name        = "opsforge-${var.environment}"
    Environment = var.environment
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [user_data, user_data_base64]

    precondition {
      condition     = terraform_data.safety_checks.id != null
      error_message = "Single-node cutover safety checks did not pass."
    }

    precondition {
      condition     = local.k3s_user_data_gzip_bytes <= 16384
      error_message = "Gzip-compressed EC2 user_data exceeds the 16 KiB decoded API limit. Move additional bootstrap payloads out of user_data."
    }
  }
}

resource "aws_ssm_document" "configure_k3s" {
  name            = "opsforge-${var.environment}-configure-k3s"
  document_type   = "Command"
  document_format = "JSON"
  target_type     = "/AWS::EC2::Instance"

  content = local.k3s_ssm_document

  tags = {
    Name        = "opsforge-${var.environment}-configure-k3s"
    Environment = var.environment
  }

  lifecycle {
    precondition {
      condition     = length(local.k3s_ssm_document) <= 65536
      error_message = "Rendered SSM command document exceeds the 64 KiB document limit."
    }
  }
}

resource "aws_ssm_document" "migrate_k3s_data" {
  name            = "opsforge-${var.environment}-migrate-k3s-data"
  document_type   = "Command"
  document_format = "JSON"
  target_type     = "/AWS::EC2::Instance"

  content = local.k3s_migration_document

  tags = {
    Name        = "opsforge-${var.environment}-migrate-k3s-data"
    Environment = var.environment
  }

  lifecycle {
    precondition {
      condition     = length(local.k3s_migration_document) <= 65536
      error_message = "Rendered K3s migration SSM command document exceeds the 64 KiB document limit."
    }
  }
}

# A standalone attachment is retained by EC2 when the instance terminates;
# unlike an inline ebs_block_device, its DeleteOnTermination behavior is false.
resource "aws_volume_attachment" "k3s_data" {
  device_name = local.k3s_data_device
  volume_id   = aws_ebs_volume.k3s_data.id
  instance_id = aws_instance.opsforge.id

  stop_instance_before_detaching = true
}

resource "aws_eip" "opsforge" {
  domain   = "vpc"
  instance = aws_instance.opsforge.id

  tags = {
    Name        = "opsforge-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "automatic_instance_recovery" {
  alarm_name          = "opsforge-${var.environment}-recover-system-status"
  alarm_description   = "Recover the single OpsForge node after an EC2 system status failure."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"

  dimensions = {
    InstanceId = aws_instance.opsforge.id
  }

  alarm_actions             = ["arn:aws:automate:${var.aws_region}:ec2:recover", aws_sns_topic.operations.arn]
  ok_actions                = [aws_sns_topic.operations.arn]
  insufficient_data_actions = []

  tags = {
    Name        = "opsforge-${var.environment}-recover-system-status"
    Environment = var.environment
  }
}

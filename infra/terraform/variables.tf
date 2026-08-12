variable "aws_region" {
  description = "AWS region in which to create the OpsForge server."
  type        = string
  default     = "us-east-1"
}

variable "disaster_recovery_region" {
  description = "Second AWS region that receives S3 and EBS recovery copies."
  type        = string
  default     = "us-west-2"

  validation {
    condition     = var.disaster_recovery_region != var.aws_region
    error_message = "disaster_recovery_region must differ from aws_region."
  }
}

variable "environment" {
  description = "Environment name used for resource naming and tags."
  type        = string
  default     = "production"
}

variable "ubuntu_ami_id" {
  description = "Exact Canonical Ubuntu 24.04 amd64 AMI ID in aws_region. The default is pinned for us-east-1; update deliberately for another region."
  type        = string
  default     = "ami-052355af2a014bd2c"

  validation {
    condition     = can(regex("^ami-[0-9a-f]{8,17}$", var.ubuntu_ami_id))
    error_message = "ubuntu_ami_id must be an explicit EC2 AMI ID."
  }
}

variable "instance_type" {
  description = "On-demand EC2 instance type for the single-node K3s cluster."
  type        = string
  default     = "m7i.2xlarge"
}

variable "acknowledge_unreviewed_instance_capacity" {
  description = "Permit an instance type outside the reviewed m7i.2xlarge-or-larger set after documenting CPU, memory, EBS, and rollout-surge capacity."
  type        = bool
  default     = false
}

variable "root_volume_size" {
  description = "Size of the encrypted EC2 root volume in GiB."
  type        = number
  default     = 50

  validation {
    condition     = var.root_volume_size >= 30
    error_message = "root_volume_size must be at least 30 GiB."
  }
}

variable "root_volume_iops" {
  description = "Provisioned IOPS for the gp3 root volume."
  type        = number
  default     = 3000

  validation {
    condition     = var.root_volume_iops >= 3000 && var.root_volume_iops <= 16000
    error_message = "root_volume_iops must be between 3,000 and 16,000."
  }
}

variable "root_volume_throughput" {
  description = "Provisioned throughput in MiB/s for the gp3 root volume."
  type        = number
  default     = 125

  validation {
    condition     = var.root_volume_throughput >= 125 && var.root_volume_throughput <= 1000
    error_message = "root_volume_throughput must be between 125 and 1,000 MiB/s."
  }
}

variable "data_volume_size" {
  description = "Size of the retained encrypted gp3 volume that backs /var/lib/rancher/k3s, including local-path PVCs."
  type        = number
  default     = 300

  validation {
    condition     = var.data_volume_size >= 100
    error_message = "data_volume_size must be at least 100 GiB."
  }
}

variable "data_volume_iops" {
  description = "Provisioned IOPS for the retained gp3 K3s data volume."
  type        = number
  default     = 3000

  validation {
    condition     = var.data_volume_iops >= 3000 && var.data_volume_iops <= 16000
    error_message = "data_volume_iops must be between 3,000 and 16,000."
  }
}

variable "data_volume_throughput" {
  description = "Provisioned throughput in MiB/s for the retained gp3 K3s data volume."
  type        = number
  default     = 125

  validation {
    condition     = var.data_volume_throughput >= 125 && var.data_volume_throughput <= 1000
    error_message = "data_volume_throughput must be between 125 and 1,000 MiB/s."
  }
}

variable "k3s_version" {
  description = "Exact K3s release installed on first boot. Change only together with k3s_sha256 after testing."
  type        = string
  default     = "v1.35.7+k3s1"

  validation {
    condition     = can(regex("^v[0-9]+\\.[0-9]+\\.[0-9]+\\+k3s[0-9]+$", var.k3s_version))
    error_message = "k3s_version must be an exact stable release such as v1.35.7+k3s1."
  }
}

variable "aws_cli_version" {
  description = "Exact AWS CLI v2 release installed on the K3s host. Change only together with aws_cli_zip_sha256."
  type        = string
  default     = "2.36.20"

  validation {
    condition     = can(regex("^2\\.[0-9]+\\.[0-9]+$", var.aws_cli_version))
    error_message = "aws_cli_version must be an exact AWS CLI v2 release such as 2.36.20."
  }
}

variable "aws_cli_zip_sha256" {
  description = "SHA-256 of the official Linux x86_64 AWS CLI v2 zip for aws_cli_version."
  type        = string
  default     = "59bdfab4035b0251a0c8de801abe01928861a89e27433bb80fc3fcf6dfe32352"

  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.aws_cli_zip_sha256))
    error_message = "aws_cli_zip_sha256 must be a lowercase 64-character SHA-256 digest."
  }
}

variable "k3s_sha256" {
  description = "SHA-256 of the amd64 k3s binary for k3s_version, copied from that GitHub release."
  type        = string
  default     = "5fc25309c53031e0cf03f7ee85f6f60969381ff3649039ffda19e30f5c26947a"

  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.k3s_sha256))
    error_message = "k3s_sha256 must be a lowercase 64-character SHA-256 digest."
  }
}

variable "k3s_snapshot_retention" {
  description = "Number of local on-demand K3s etcd snapshots retained after successful S3 uploads."
  type        = number
  default     = 28

  validation {
    condition     = var.k3s_snapshot_retention >= 2 && var.k3s_snapshot_retention <= 100
    error_message = "k3s_snapshot_retention must be between 2 and 100."
  }
}

variable "postgres_backup_image_revision" {
  description = "Exact sha256 revision expected in PostgreSQL logical-backup manifests; update atomically with the GitOps CronJob image."
  type        = string
  default     = "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777"

  validation {
    condition     = can(regex("^sha256:[0-9a-f]{64}$", var.postgres_backup_image_revision))
    error_message = "postgres_backup_image_revision must be an exact sha256 image revision."
  }
}

variable "single_node_cutover_acknowledgement" {
  description = "Fail-closed acknowledgement required before planning/applying the new storage layout. Follow README.md first, then set exactly I_HAVE_VERIFIED_BACKUPS_AND_THE_K3S_DATA_MIGRATION_PLAN."
  type        = string
  default     = ""
}

variable "ssh_public_key_path" {
  description = "Path to the public SSH key Terraform uploads to AWS."
  type        = string
  default     = "~/.ssh/opsforge-gitops.pub"
}

variable "ssh_public_key" {
  description = "Optional SSH public key content for CI; local runs fall back to ssh_public_key_path."
  type        = string
  default     = null
  nullable    = true
}

variable "ssh_allowed_cidr" {
  description = "Public IPv4 CIDR allowed to SSH to the server, for example 203.0.113.10/32."
  type        = string
}

variable "enable_ssh_access" {
  description = "Temporarily enable SSH from ssh_allowed_cidr. Prefer SSM and leave this false."
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Fully qualified OpsForge hostname managed by Cloudflare."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID containing the OpsForge DNS record."
  type        = string

  validation {
    condition     = length(var.cloudflare_zone_id) == 32
    error_message = "cloudflare_zone_id must be a 32-character Cloudflare zone ID."
  }
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID used to manage Zero Trust Access applications."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = !var.enable_admin_access || (var.cloudflare_account_id != null && length(var.cloudflare_account_id) == 32)
    error_message = "cloudflare_account_id must be a 32-character Cloudflare account ID."
  }
}

variable "enable_admin_access" {
  description = "Create Cloudflare Access, DNS, and protected public endpoints for Grafana and Argo CD."
  type        = bool
  default     = false
}

variable "grafana_domain_name" {
  description = "Cloudflare-proxied hostname for the Access-protected Grafana UI."
  type        = string
  default     = "grafana.birajadhikari49.com.np"
}

variable "argocd_domain_name" {
  description = "Cloudflare-proxied hostname for the Access-protected Argo CD UI."
  type        = string
  default     = "argocd.birajadhikari49.com.np"
}

variable "cloudflare_access_email" {
  description = "Owner email allowed through Cloudflare Access."
  type        = string
  default     = null
  nullable    = true
}

variable "cloudflare_github_idp_id" {
  description = "Cloudflare Access GitHub identity-provider ID used for Grafana and Argo CD."
  type        = string
  default     = null
  nullable    = true
}

variable "cloudflare_ipv4_cidrs" {
  description = "Published Cloudflare IPv4 origin ranges allowed to reach the EC2 origin."
  type        = list(string)
  default = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
  ]
}

variable "github_repository" {
  description = "GitHub owner/repository allowed to assume Terraform OIDC roles."
  type        = string
  default     = "BIRAJ49/OpsForge"
}

variable "github_production_environment" {
  description = "GitHub environment that gates production Terraform applies."
  type        = string
  default     = "production"
}

variable "terraform_state_bucket" {
  description = "Existing S3 bucket containing production Terraform state and locks."
  type        = string
  default     = "opsforge-terraform-state-396868033396-us-east-1"
}

variable "monthly_budget_usd" {
  description = "Monthly AWS cost budget in USD."
  type        = number
  default     = 450

  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "monthly_budget_usd must be greater than zero."
  }
}

variable "minimum_expected_monthly_cost_usd" {
  description = "Conservative fail-fast monthly estimate for the default on-demand node and storage; update after reviewing the AWS calculator."
  type        = number
  default     = 350
}

variable "acknowledge_budget_below_estimate" {
  description = "Explicitly allow a budget below minimum_expected_monthly_cost_usd after reviewing regional pricing."
  type        = bool
  default     = false
}

variable "ebs_backup_retention_days" {
  description = "Retention in days for daily AWS Backup recovery points of the K3s data volume."
  type        = number
  default     = 35

  validation {
    condition     = var.ebs_backup_retention_days >= 7
    error_message = "ebs_backup_retention_days must be at least 7 days."
  }
}

variable "dr_ebs_backup_retention_days" {
  description = "Retention in days for cross-region EBS recovery points."
  type        = number
  default     = 90

  validation {
    condition     = var.dr_ebs_backup_retention_days >= 30
    error_message = "dr_ebs_backup_retention_days must be at least 30 days."
  }
}

variable "s3_backup_retention_days" {
  description = "Retention in days for primary K3s and PostgreSQL recovery objects."
  type        = number
  default     = 35

  validation {
    condition     = var.s3_backup_retention_days >= 7
    error_message = "s3_backup_retention_days must be at least 7 days."
  }
}

variable "dr_s3_backup_retention_days" {
  description = "Retention in days for cross-region K3s and PostgreSQL recovery objects."
  type        = number
  default     = 90

  validation {
    condition     = var.dr_s3_backup_retention_days >= 30
    error_message = "dr_s3_backup_retention_days must be at least 30 days."
  }
}

variable "secret_container_names" {
  description = "Exact AWS Secrets Manager containers created without values. Populate values out-of-band; Terraform state never stores them."
  type        = set(string)
  default = [
    "/opsforge/argocd/github-app",
    "/opsforge/platform/alertmanager",
    "/opsforge/platform/grafana",
    "/opsforge/production/ghcr",
    "/opsforge/production/runtime",
    "/opsforge/staging/ghcr",
    "/opsforge/staging/runtime",
  ]

  validation {
    condition     = alltrue([for name in var.secret_container_names : startswith(name, "/opsforge/")])
    error_message = "Every secret container must stay under the /opsforge/ path."
  }
}

variable "budget_alert_email" {
  description = "Email address that receives AWS budget alerts."
  type        = string
}

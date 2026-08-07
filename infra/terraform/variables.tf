variable "aws_region" {
  description = "AWS region in which to create the OpsForge server."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name used for resource naming and tags."
  type        = string
  default     = "production"
}

variable "instance_type" {
  description = "EC2 instance type for the single-node K3s cluster."
  type        = string
  default     = "m7i-flex.large"
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
  description = "Keep temporary administrator SSH enabled until SSM access is verified."
  type        = bool
  default     = true
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

  validation {
    condition     = length(var.cloudflare_account_id) == 32
    error_message = "cloudflare_account_id must be a 32-character Cloudflare account ID."
  }
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
}

variable "cloudflare_github_idp_id" {
  description = "Cloudflare Access GitHub identity-provider ID used for Grafana and Argo CD."
  type        = string
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
  default     = 50
}

variable "budget_alert_email" {
  description = "Email address that receives AWS budget alerts."
  type        = string
}

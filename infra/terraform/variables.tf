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

variable "ssh_allowed_cidr" {
  description = "Public IPv4 CIDR allowed to SSH to the server, for example 203.0.113.10/32."
  type        = string
}

variable "domain_name" {
  description = "Optional application hostname managed in an existing Route 53 hosted zone."
  type        = string
  default     = ""
}

variable "route53_zone_name" {
  description = "Optional existing Route 53 zone name, for example example.com."
  type        = string
  default     = ""
}

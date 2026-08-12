provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "OpsForge"
      ManagedBy = "Terraform"
    }
  }
}

provider "aws" {
  alias  = "disaster_recovery"
  region = var.disaster_recovery_region

  default_tags {
    tags = {
      Project   = "OpsForge"
      ManagedBy = "Terraform"
    }
  }
}

provider "cloudflare" {}

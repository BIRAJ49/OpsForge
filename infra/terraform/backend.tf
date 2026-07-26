terraform {
  backend "s3" {
    bucket       = "opsforge-terraform-state-396868033396-us-east-1"
    key          = "environments/production/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

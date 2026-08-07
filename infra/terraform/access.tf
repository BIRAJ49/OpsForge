locals {
  admin_access_applications = {
    grafana = {
      name   = "OpsForge Grafana"
      domain = var.grafana_domain_name
    }
    argocd = {
      name   = "OpsForge Argo CD"
      domain = var.argocd_domain_name
    }
  }
}

resource "cloudflare_zero_trust_access_application" "admin" {
  for_each = var.enable_admin_access ? local.admin_access_applications : {}

  account_id                = var.cloudflare_account_id
  name                      = each.value.name
  domain                    = each.value.domain
  type                      = "self_hosted"
  session_duration          = "8h"
  allowed_idps              = [var.cloudflare_github_idp_id]
  auto_redirect_to_identity = true

  policies = [
    {
      name       = "Allow OpsForge owner"
      decision   = "allow"
      precedence = 1
      include = [
        {
          email = {
            email = var.cloudflare_access_email
          }
        }
      ]
    }
  ]
}

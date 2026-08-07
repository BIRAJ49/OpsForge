locals {
  terraform_state_arn = "arn:aws:s3:::${var.terraform_state_bucket}"
  github_oidc_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = {
    Name        = "opsforge-github-actions"
    Environment = var.environment
  }
}

data "aws_iam_policy_document" "terraform_plan_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:pull_request"]
    }
  }
}

resource "aws_iam_role" "terraform_plan" {
  name                 = "opsforge-${var.environment}-terraform-plan"
  assume_role_policy   = data.aws_iam_policy_document.terraform_plan_assume_role.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "terraform_plan_read_only" {
  role       = aws_iam_role.terraform_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "terraform_state" {
  statement {
    sid       = "ReadStateBucket"
    effect    = "Allow"
    actions   = ["s3:GetBucketLocation", "s3:ListBucket"]
    resources = [local.terraform_state_arn]
  }

  statement {
    sid       = "ReadState"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${local.terraform_state_arn}/environments/production/terraform.tfstate"]
  }

  statement {
    sid    = "UseStateLock"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${local.terraform_state_arn}/environments/production/terraform.tfstate.tflock"]
  }
}

resource "aws_iam_policy" "terraform_state" {
  name   = "opsforge-${var.environment}-terraform-state"
  policy = data.aws_iam_policy_document.terraform_state.json
}

resource "aws_iam_role_policy_attachment" "terraform_plan_state" {
  role       = aws_iam_role.terraform_plan.name
  policy_arn = aws_iam_policy.terraform_state.arn
}

data "aws_iam_policy_document" "terraform_apply_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:${var.github_production_environment}"]
    }
  }
}

resource "aws_iam_role" "terraform_apply" {
  name                 = "opsforge-${var.environment}-terraform-apply"
  assume_role_policy   = data.aws_iam_policy_document.terraform_apply_assume_role.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "terraform_apply" {
  statement {
    sid       = "ManageEC2Network"
    effect    = "Allow"
    actions   = ["ec2:*"]
    resources = ["*"]
  }

  statement {
    sid    = "ManageOpsForgeStorage"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:Get*",
      "s3:List*",
      "s3:Put*",
      "s3:DeleteObject",
    ]
    resources = [
      local.terraform_state_arn,
      "${local.terraform_state_arn}/*",
      "arn:aws:s3:::opsforge-postgres-backups-*",
      "arn:aws:s3:::opsforge-postgres-backups-*/*",
    ]
  }

  statement {
    sid    = "ManageOpsForgeIAM"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:CreatePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListPolicyVersions",
      "iam:TagPolicy",
      "iam:UntagPolicy",
      "iam:CreateInstanceProfile",
      "iam:DeleteInstanceProfile",
      "iam:GetInstanceProfile",
      "iam:AddRoleToInstanceProfile",
      "iam:RemoveRoleFromInstanceProfile",
      "iam:TagInstanceProfile",
      "iam:UntagInstanceProfile",
      "iam:PassRole",
    ]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/opsforge-*",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/opsforge-*",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:instance-profile/opsforge-*",
    ]
  }

  statement {
    sid    = "ManageGitHubOIDCProvider"
    effect = "Allow"
    actions = [
      "iam:GetOpenIDConnectProvider",
      "iam:ListOpenIDConnectProviders",
      "iam:UpdateOpenIDConnectProviderThumbprint",
      "iam:AddClientIDToOpenIDConnectProvider",
      "iam:RemoveClientIDFromOpenIDConnectProvider",
      "iam:TagOpenIDConnectProvider",
      "iam:UntagOpenIDConnectProvider",
    ]
    resources = [local.github_oidc_arn]
  }

  statement {
    sid    = "ManageOpsForgeBudget"
    effect = "Allow"
    actions = [
      "budgets:ViewBudget",
      "budgets:ModifyBudget",
      "budgets:TagResource",
      "budgets:UntagResource",
      "budgets:ListTagsForResource",
    ]
    resources = ["arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/OpsForge-*"]
  }
}

resource "aws_iam_policy" "terraform_apply" {
  name   = "opsforge-${var.environment}-terraform-apply"
  policy = data.aws_iam_policy_document.terraform_apply.json
}

resource "aws_iam_role_policy_attachment" "terraform_apply" {
  role       = aws_iam_role.terraform_apply.name
  policy_arn = aws_iam_policy.terraform_apply.arn
}

resource "aws_iam_role_policy_attachment" "terraform_apply_state" {
  role       = aws_iam_role.terraform_apply.name
  policy_arn = aws_iam_policy.terraform_state.arn
}

data "aws_iam_policy_document" "terraform_state_apply" {
  statement {
    sid       = "WriteState"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${local.terraform_state_arn}/environments/production/terraform.tfstate"]
  }
}

resource "aws_iam_policy" "terraform_state_apply" {
  name   = "opsforge-${var.environment}-terraform-state-apply"
  policy = data.aws_iam_policy_document.terraform_state_apply.json
}

resource "aws_iam_role_policy_attachment" "terraform_apply_state_write" {
  role       = aws_iam_role.terraform_apply.name
  policy_arn = aws_iam_policy.terraform_state_apply.arn
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id          = data.aws_caller_identity.current.account_id
  deployment_prefix   = "${var.project_name}-${var.environment}"
  oidc_provider_arn   = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : var.existing_github_oidc_provider_arn
  secret_arn_prefix   = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.aws_region}:${local.account_id}:secret:${local.deployment_prefix}/*"
  lambda_arn_prefix   = "arn:${data.aws_partition.current.partition}:lambda:${var.aws_region}:${local.account_id}:function:${local.deployment_prefix}-*"
  iam_role_arn_prefix = "arn:${data.aws_partition.current.partition}:iam::${local.account_id}:role/${local.deployment_prefix}-*"
  dynamodb_arn_prefix = "arn:${data.aws_partition.current.partition}:dynamodb:${var.aws_region}:${local.account_id}:table/${local.deployment_prefix}-*"
}

resource "terraform_data" "account_guard" {
  input = local.account_id
  lifecycle {
    precondition {
      condition     = var.expected_account_id == "" || var.expected_account_id == local.account_id
      error_message = "The AWS credentials target a different account than expected_account_id."
    }
  }
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = var.artifact_bucket_name
  force_destroy = false
  depends_on    = [terraform_data.account_guard]
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

data "aws_iam_policy_document" "bucket_tls" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts_tls" {
  bucket = aws_s3_bucket.artifacts.id
  policy = data.aws_iam_policy_document.bucket_tls.json
}

resource "aws_s3_bucket" "terraform_state" {
  bucket        = var.state_bucket_name
  force_destroy = false
  depends_on    = [terraform_data.account_guard]
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

data "aws_iam_policy_document" "state_bucket_tls" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.terraform_state.arn, "${aws_s3_bucket.terraform_state.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "terraform_state_tls" {
  bucket = aws_s3_bucket.terraform_state.id
  policy = data.aws_iam_policy_document.state_bucket_tls.json
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  depends_on     = [terraform_data.account_guard]
}

data "aws_iam_policy_document" "github_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = var.github_subjects
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${local.deployment_prefix}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github_trust.json
  max_session_duration = 3600
  depends_on           = [terraform_data.account_guard]
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "TerraformStateBucketMetadata"
    actions   = ["s3:GetBucketLocation", "s3:ListBucket"]
    resources = [aws_s3_bucket.terraform_state.arn]
  }
  statement {
    sid = "TerraformStateAndNativeS3Lockfile"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject"
    ]
    resources = [
      "${aws_s3_bucket.terraform_state.arn}/${local.account_id}/${var.environment}/terraform.tfstate",
      "${aws_s3_bucket.terraform_state.arn}/${local.account_id}/${var.environment}/terraform.tfstate.tflock"
    ]
  }
  statement {
    sid       = "LambdaArtifactObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }
  statement {
    sid       = "LambdaArtifactBucketListing"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.artifacts.arn]
  }
  statement {
    sid       = "CreatePrefixedFrontendBuckets"
    actions   = ["s3:CreateBucket"]
    resources = ["arn:${data.aws_partition.current.partition}:s3:::${local.deployment_prefix}-*"]
  }
  statement {
    sid = "ConfigureOnlyPrefixedFrontendBuckets"
    actions = [
      "s3:DeleteBucket", "s3:GetBucketLocation", "s3:GetBucketPolicy", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy",
      "s3:GetAccelerateConfiguration", "s3:GetBucketAcl", "s3:GetBucketLogging", "s3:GetBucketNotification", "s3:GetBucketObjectLockConfiguration", "s3:GetBucketPolicyStatus", "s3:GetBucketRequestPayment",
      "s3:GetLifecycleConfiguration", "s3:GetReplicationConfiguration",
      "s3:GetBucketVersioning", "s3:PutBucketVersioning", "s3:GetBucketCORS", "s3:GetBucketWebsite", "s3:GetEncryptionConfiguration", "s3:PutEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock", "s3:PutBucketPublicAccessBlock", "s3:DeleteBucketPublicAccessBlock",
      "s3:GetBucketOwnershipControls", "s3:PutBucketOwnershipControls", "s3:GetBucketTagging", "s3:PutBucketTagging", "s3:DeleteBucketTagging",
      "s3:ListBucket"
    ]
    resources = ["arn:${data.aws_partition.current.partition}:s3:::${local.deployment_prefix}-*"]
  }
  statement {
    sid       = "PublishFrontendObjects"
    actions   = ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"]
    resources = ["arn:${data.aws_partition.current.partition}:s3:::${local.deployment_prefix}-*/*"]
  }
  statement {
    sid       = "CreateApplicationResources"
    actions   = ["dynamodb:CreateTable"]
    resources = ["arn:${data.aws_partition.current.partition}:dynamodb:${var.aws_region}:${local.account_id}:table/${local.deployment_prefix}-*"]
  }
  statement {
    actions   = ["lambda:CreateFunction"]
    resources = ["arn:${data.aws_partition.current.partition}:lambda:${var.aws_region}:${local.account_id}:function:${local.deployment_prefix}-*"]
  }
  statement {
    actions = ["logs:CreateLogGroup"]
    resources = [
      "arn:${data.aws_partition.current.partition}:logs:${var.aws_region}:${local.account_id}:log-group:/aws/lambda/${local.deployment_prefix}-*",
      "arn:${data.aws_partition.current.partition}:logs:${var.aws_region}:${local.account_id}:log-group:/aws/http-api/${local.deployment_prefix}*"
    ]
  }
  statement {
    actions   = ["sqs:CreateQueue"]
    resources = ["arn:${data.aws_partition.current.partition}:sqs:${var.aws_region}:${local.account_id}:${local.deployment_prefix}-*"]
  }
  statement {
    actions   = ["secretsmanager:CreateSecret"]
    resources = [local.secret_arn_prefix]
  }
  statement {
    sid       = "CreateSchedulerGroupsAndSchedules"
    actions   = ["scheduler:CreateScheduleGroup", "scheduler:CreateSchedule"]
    resources = ["arn:${data.aws_partition.current.partition}:scheduler:${var.aws_region}:${local.account_id}:schedule-group/${local.deployment_prefix}-*", "arn:${data.aws_partition.current.partition}:scheduler:${var.aws_region}:${local.account_id}:schedule/${local.deployment_prefix}-*/*"]
  }
  statement {
    sid     = "ManageHttpApi"
    actions = ["apigateway:POST", "apigateway:GET", "apigateway:PUT", "apigateway:PATCH", "apigateway:DELETE", "apigateway:TagResource", "apigateway:UntagResource"]
    resources = [
      "arn:${data.aws_partition.current.partition}:apigateway:${var.aws_region}::/apis*",
      "arn:${data.aws_partition.current.partition}:apigateway:${var.aws_region}::/tags/*"
    ]
  }
  statement {
    sid       = "ManageCloudFrontDistribution"
    actions   = ["cloudfront:CreateDistribution", "cloudfront:UpdateDistribution", "cloudfront:GetDistribution", "cloudfront:GetDistributionConfig", "cloudfront:DeleteDistribution", "cloudfront:ListDistributions", "cloudfront:TagResource", "cloudfront:UntagResource", "cloudfront:CreateOriginAccessControl", "cloudfront:GetOriginAccessControl", "cloudfront:GetOriginAccessControlConfig", "cloudfront:UpdateOriginAccessControl", "cloudfront:DeleteOriginAccessControl", "cloudfront:CreateResponseHeadersPolicy", "cloudfront:GetResponseHeadersPolicy", "cloudfront:GetResponseHeadersPolicyConfig", "cloudfront:UpdateResponseHeadersPolicy", "cloudfront:DeleteResponseHeadersPolicy", "cloudfront:CreateInvalidation", "cloudfront:ListTagsForResource"]
    resources = ["*"]
  }
  statement {
    sid       = "ManageCognitoPools"
    actions   = ["cognito-idp:CreateUserPool", "cognito-idp:DescribeUserPool", "cognito-idp:GetUserPoolMfaConfig", "cognito-idp:UpdateUserPool", "cognito-idp:SetUserPoolMfaConfig", "cognito-idp:DeleteUserPool", "cognito-idp:CreateUserPoolClient", "cognito-idp:DescribeUserPoolClient", "cognito-idp:UpdateUserPoolClient", "cognito-idp:DeleteUserPoolClient", "cognito-idp:CreateUserPoolDomain", "cognito-idp:DeleteUserPoolDomain", "cognito-idp:TagResource", "cognito-idp:UntagResource", "cognito-idp:ListTagsForResource"]
    resources = ["arn:${data.aws_partition.current.partition}:cognito-idp:${var.aws_region}:${local.account_id}:userpool/*"]
  }
  statement {
    sid       = "DescribeCognitoUserPoolDomains"
    actions   = ["cognito-idp:DescribeUserPoolDomain"]
    resources = ["*"]
  }
  statement {
    sid       = "ManagePrefixedSessionTables"
    actions   = ["dynamodb:DescribeTable", "dynamodb:UpdateTable", "dynamodb:DescribeContinuousBackups", "dynamodb:UpdateContinuousBackups", "dynamodb:DeleteTable", "dynamodb:TagResource", "dynamodb:UntagResource", "dynamodb:ListTagsOfResource", "dynamodb:DescribeTimeToLive", "dynamodb:UpdateTimeToLive"]
    resources = [local.dynamodb_arn_prefix]
  }
  statement {
    sid       = "ManagePrefixedSchedules"
    actions   = ["scheduler:UpdateSchedule", "scheduler:GetSchedule", "scheduler:DeleteSchedule", "scheduler:ListSchedules", "scheduler:GetScheduleGroup", "scheduler:DeleteScheduleGroup", "scheduler:ListTagsForResource", "scheduler:TagResource", "scheduler:UntagResource"]
    resources = ["arn:${data.aws_partition.current.partition}:scheduler:${var.aws_region}:${local.account_id}:schedule-group/${local.deployment_prefix}-*", "arn:${data.aws_partition.current.partition}:scheduler:${var.aws_region}:${local.account_id}:schedule/${local.deployment_prefix}-*/*"]
  }
  statement {
    sid       = "ManagePrefixedFunctions"
    actions   = ["lambda:GetFunction", "lambda:GetFunctionConfiguration", "lambda:GetFunctionCodeSigningConfig", "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration", "lambda:DeleteFunction", "lambda:AddPermission", "lambda:RemovePermission", "lambda:GetPolicy", "lambda:TagResource", "lambda:UntagResource", "lambda:ListTags", "lambda:ListVersionsByFunction"]
    resources = [local.lambda_arn_prefix]
  }
  statement {
    # DescribeLogGroups does not support resource-level authorization, so Terraform
    # needs this read-only list action on "*" when refreshing managed log groups.
    sid       = "DescribeLogGroupsForTerraform"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }
  statement {
    sid = "ManageHttpApiLogDelivery"
    actions = [
      "logs:CreateLogDelivery", "logs:PutResourcePolicy", "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery", "logs:DescribeResourcePolicies", "logs:GetLogDelivery",
      "logs:ListLogDeliveries"
    ]
    resources = ["*"]
  }
  statement {
    sid     = "ManagePrefixedLogs"
    actions = ["logs:PutRetentionPolicy", "logs:DeleteLogGroup", "logs:ListTagsForResource", "logs:TagResource", "logs:UntagResource"]
    resources = [
      "arn:${data.aws_partition.current.partition}:logs:${var.aws_region}:${local.account_id}:log-group:/aws/lambda/${local.deployment_prefix}-*",
      "arn:${data.aws_partition.current.partition}:logs:${var.aws_region}:${local.account_id}:log-group:/aws/http-api/${local.deployment_prefix}*"
    ]
  }
  statement {
    sid       = "ManagePrefixedSecrets"
    actions   = ["secretsmanager:DescribeSecret", "secretsmanager:GetResourcePolicy", "secretsmanager:DeleteSecret", "secretsmanager:RestoreSecret", "secretsmanager:TagResource", "secretsmanager:UntagResource", "secretsmanager:PutSecretValue"]
    resources = [local.secret_arn_prefix]
  }
  statement {
    sid       = "ManagePrefixedQueues"
    actions   = ["sqs:GetQueueAttributes", "sqs:SetQueueAttributes", "sqs:DeleteQueue", "sqs:TagQueue", "sqs:UntagQueue", "sqs:ListQueueTags"]
    resources = ["arn:${data.aws_partition.current.partition}:sqs:${var.aws_region}:${local.account_id}:${local.deployment_prefix}-*"]
  }
  statement {
    sid       = "ManagePrefixedAlarms"
    actions   = ["cloudwatch:PutMetricAlarm", "cloudwatch:DescribeAlarms", "cloudwatch:DeleteAlarms", "cloudwatch:TagResource", "cloudwatch:UntagResource", "cloudwatch:ListTagsForResource"]
    resources = ["arn:${data.aws_partition.current.partition}:cloudwatch:${var.aws_region}:${local.account_id}:alarm:${local.deployment_prefix}-*"]
  }
  statement {
    sid = "ManageOnlyPrefixedRuntimeRoles"
    actions = [
      "iam:CreateRole", "iam:GetRole", "iam:UpdateRole", "iam:DeleteRole", "iam:UpdateAssumeRolePolicy",
      "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy"
    ]
    resources = [local.iam_role_arn_prefix]
  }
  statement {
    sid       = "PassOnlyPrefixedApplicationRoles"
    actions   = ["iam:PassRole"]
    resources = [local.iam_role_arn_prefix]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com", "scheduler.amazonaws.com"]
    }
  }
  statement {
    sid       = "GlobalIdentityAndTagReads"
    actions   = ["sts:GetCallerIdentity", "tag:GetResources"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${local.deployment_prefix}-github-deploy-policy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}

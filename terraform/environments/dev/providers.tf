provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]

  dynamic "assume_role" {
    for_each = var.deployment_role_arn == "" ? [] : [var.deployment_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "terraform-${var.environment}"
    }
  }

  default_tags {
    tags = local.tags
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

resource "terraform_data" "account_guard" {
  input = data.aws_caller_identity.current.account_id
  lifecycle {
    precondition {
      condition     = data.aws_caller_identity.current.account_id == var.aws_account_id
      error_message = "AWS credentials do not target aws_account_id."
    }
  }
}

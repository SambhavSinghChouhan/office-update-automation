locals {
  lambda_roles = {
    session_api      = "${var.name_prefix}-session-api"
    report_processor = "${var.name_prefix}-report-processor"
  }
  lambda_log_arns = {
    session_api      = "arn:${var.partition}:logs:${var.region}:${var.account_id}:log-group:/aws/lambda/${local.lambda_roles.session_api}:*"
    report_processor = "arn:${var.partition}:logs:${var.region}:${var.account_id}:log-group:/aws/lambda/${local.lambda_roles.report_processor}:*"
  }
}

resource "aws_iam_role" "lambda" {
  for_each           = local.lambda_roles
  name               = each.value
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = var.tags
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "session_api" {
  statement {
    sid       = "SessionItems"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
    resources = [var.table_arn, var.table_index_arn]
  }
  statement {
    sid       = "ManageOnlyApplicationSchedules"
    actions   = ["scheduler:CreateSchedule", "scheduler:UpdateSchedule", "scheduler:GetSchedule", "scheduler:DeleteSchedule"]
    resources = [var.schedule_group_arn]
  }
  statement {
    sid       = "PassOnlySchedulerExecutionRole"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.scheduler.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["scheduler.amazonaws.com"]
    }
  }
  statement {
    sid       = "WriteFunctionLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [local.lambda_log_arns.session_api]
  }
}

data "aws_iam_policy_document" "report_processor" {
  statement {
    sid       = "SessionAndDueIndexAccess"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"]
    resources = [var.table_arn, var.table_index_arn]
  }
  statement {
    sid       = "ReadOnlyRequiredIntegrationSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.integration_secret_arns
  }
  statement {
    sid       = "WriteFunctionLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [local.lambda_log_arns.report_processor]
  }
}

resource "aws_iam_role_policy" "session_api" {
  name   = "${var.name_prefix}-session-api-runtime"
  role   = aws_iam_role.lambda["session_api"].id
  policy = data.aws_iam_policy_document.session_api.json
}

resource "aws_iam_role_policy" "report_processor" {
  name   = "${var.name_prefix}-report-processor-runtime"
  role   = aws_iam_role.lambda["report_processor"].id
  policy = data.aws_iam_policy_document.report_processor.json
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name_prefix}-scheduler-invoke"
  assume_role_policy = data.aws_iam_policy_document.scheduler_trust.json
  tags               = var.tags
}

data "aws_iam_policy_document" "scheduler_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

output "lambda_role_arns" {
  value = { for name, role in aws_iam_role.lambda : name => role.arn }
}
output "scheduler_role_arn" { value = aws_iam_role.scheduler.arn }
output "scheduler_role_name" { value = aws_iam_role.scheduler.name }

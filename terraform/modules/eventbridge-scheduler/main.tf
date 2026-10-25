resource "aws_scheduler_schedule_group" "application" {
  name = var.schedule_group_name
  tags = var.tags
}

resource "aws_sqs_queue" "dead_letter" {
  name                      = "${var.name_prefix}-schedule-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  tags                      = var.tags
}

data "aws_iam_policy_document" "scheduler_permissions" {
  statement {
    sid       = "InvokeOnlyReportProcessor"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.report_processor_arn]
  }
  statement {
    sid       = "SendFailedInvocationsToDeadLetterQueue"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.dead_letter.arn]
  }
}

resource "aws_iam_role_policy" "scheduler_permissions" {
  name   = "${var.name_prefix}-scheduler-targets"
  role   = var.scheduler_role_name
  policy = data.aws_iam_policy_document.scheduler_permissions.json
}

resource "aws_scheduler_schedule" "fallback" {
  name                         = "${var.name_prefix}-fallback-0030"
  group_name                   = aws_scheduler_schedule_group.application.name
  description                  = "Daily eligible-session recovery at 00:30 ${var.timezone}"
  schedule_expression          = "cron(30 0 * * ? *)"
  schedule_expression_timezone = var.timezone
  state                        = var.fallback_enabled ? "ENABLED" : "DISABLED"
  flexible_time_window { mode = "OFF" }

  target {
    arn      = var.report_processor_arn
    role_arn = var.scheduler_role_arn
    input    = jsonencode({ "trigger" = "fallback" })
    dead_letter_config { arn = aws_sqs_queue.dead_letter.arn }
    retry_policy {
      maximum_event_age_in_seconds = var.maximum_event_age_seconds
      maximum_retry_attempts       = var.maximum_retry_attempts
    }
  }
  depends_on = [aws_iam_role_policy.scheduler_permissions]
}

output "schedule_group_name" { value = aws_scheduler_schedule_group.application.name }
output "schedule_group_arn" { value = aws_scheduler_schedule_group.application.arn }
output "dead_letter_queue_arn" { value = aws_sqs_queue.dead_letter.arn }
output "fallback_schedule_arn" { value = aws_scheduler_schedule.fallback.arn }

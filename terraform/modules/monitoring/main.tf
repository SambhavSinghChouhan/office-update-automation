resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = var.lambda_function_names

  alarm_name          = "${var.name_prefix}-${each.key}-errors"
  alarm_description   = "One or more errors occurred in ${each.value} during the evaluation period."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = each.value }
  tags                = var.tags
}

output "lambda_error_alarm_arns" {
  value = { for name, alarm in aws_cloudwatch_metric_alarm.lambda_errors : name => alarm.arn }
}

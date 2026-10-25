resource "aws_cloudwatch_log_group" "function" {
  for_each          = var.functions
  name              = "/aws/lambda/${var.name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "function" {
  for_each = var.functions

  function_name = "${var.name_prefix}-${each.key}"
  description   = each.value.description
  role          = var.execution_role_arns[each.key]
  runtime       = each.value.runtime
  handler       = each.value.handler
  memory_size   = each.value.memory_size
  timeout       = each.value.timeout

  s3_bucket         = var.artifact_bucket_name
  s3_key            = each.value.s3_key
  s3_object_version = each.value.s3_object_version
  source_code_hash  = each.value.source_code_hash

  environment {
    variables = each.value.environment_variables
  }

  tracing_config { mode = var.tracing_mode }
  depends_on = [aws_cloudwatch_log_group.function]
  tags       = var.tags
}

output "function_arns" {
  value = { for name, function in aws_lambda_function.function : name => function.arn }
}
output "function_names" {
  value = { for name, function in aws_lambda_function.function : name => function.function_name }
}

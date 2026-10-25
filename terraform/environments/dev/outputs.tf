output "frontend_url" {
  description = "HTTPS CloudFront URL for phone/desktop access."
  value       = module.frontend_distribution.url
}
output "cloudfront_distribution_id" { value = module.frontend_distribution.distribution_id }
output "frontend_bucket_name" { value = module.frontend_bucket.bucket_name }
output "api_endpoint" {
  description = "HTTP API base URL. All configured application routes require Cognito JWT authentication."
  value       = module.api.api_endpoint
}
output "cognito_user_pool_id" { value = module.authentication.user_pool_id }
output "cognito_user_pool_client_id" { value = module.authentication.user_pool_client_id }
output "cognito_issuer_url" { value = module.authentication.issuer_url }
output "cognito_hosted_ui_domain" { value = module.authentication.hosted_ui_domain }
output "session_table_name" { value = module.sessions.table_name }
output "fallback_schedule_arn" { value = module.scheduler.fallback_schedule_arn }
output "scheduler_dlq_arn" { value = module.scheduler.dead_letter_queue_arn }
output "lambda_function_names" { value = module.functions.function_names }
output "lambda_error_alarm_arns" { value = module.monitoring.lambda_error_alarm_arns }
output "integration_secret_arns" {
  description = "Secret references only. Secret values are never outputs."
  value       = module.integration_secrets.secret_arns
}

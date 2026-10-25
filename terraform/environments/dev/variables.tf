variable "aws_account_id" {
  description = "Target account ID. AWS provider rejects credentials for any other account."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account ID."
  }
}
variable "aws_region" {
  description = "AWS region for regional application resources."
  type        = string
  default     = "ap-south-1"
}
variable "deployment_role_arn" {
  description = "Optional IAM role ARN for the Terraform AWS provider to assume. GitHub OIDC workflows should pass the role ARN at runtime."
  type        = string
  default     = ""
  validation {
    condition     = var.deployment_role_arn == "" || can(regex("^arn:[a-z-]+:iam::${var.aws_account_id}:role/.+$", var.deployment_role_arn))
    error_message = "deployment_role_arn must be empty or an IAM role ARN in aws_account_id."
  }
}
variable "environment" {
  description = "Environment label, used in resource names and tags."
  type        = string
  default     = "dev"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "environment must be 2-16 lowercase letters, digits, or hyphens."
  }
}
variable "name_prefix" {
  description = "Account/environment-specific prefix; keep it stable for lifecycle management."
  type        = string
  default     = "office-update-dev"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.name_prefix))
    error_message = "name_prefix must be 3-25 lowercase letters, digits, or hyphens and start with a letter."
  }
}
variable "frontend_bucket_name" {
  description = "Globally unique private S3 frontend bucket name."
  type        = string
  validation {
    condition     = startswith(var.frontend_bucket_name, "${var.name_prefix}-")
    error_message = "frontend_bucket_name must start with name_prefix so the bootstrap role can scope S3 access."
  }
}
variable "lambda_artifact_bucket_name" {
  description = "Artifact bucket output from that account's bootstrap."
  type        = string
}
variable "lambda_artifact_keys" {
  description = "S3 keys already uploaded by CI. Each artifact must be a packaged Lambda ZIP."
  type        = map(string)
  default = {
    session_api      = "dev/session-api.zip"
    report_processor = "dev/report-processor.zip"
  }
}
variable "lambda_artifact_hashes" {
  description = "Base64 SHA-256 for each deployed ZIP; update these when CI publishes code."
  type        = map(string)
  default     = {}
}
variable "lambda_artifact_versions" {
  description = "Optional S3 object version IDs per Lambda package, useful with versioned artifact buckets."
  type        = map(string)
  default     = {}
}
variable "frontend_domain_names" {
  description = "Optional custom CloudFront aliases. Requires an ACM certificate in us-east-1."
  type        = list(string)
  default     = []
}
variable "frontend_acm_certificate_arn" {
  description = "Optional us-east-1 ACM certificate ARN for frontend_domain_names."
  type        = string
  default     = ""
}
variable "cognito_domain_prefix" {
  description = "Optional Cognito hosted UI domain prefix; leave empty for direct SDK sign-in."
  type        = string
  default     = ""
}
variable "timezone" {
  description = "IANA timezone for session calculations and fallback schedule."
  type        = string
  default     = "Asia/Kolkata"
  validation {
    condition     = can(regex("^[A-Za-z_+-]+(/[A-Za-z0-9_+.-]+)+$", var.timezone))
    error_message = "timezone must be an IANA-style region/city name."
  }
}
variable "session_retention_days" {
  description = "Retention for completed or safely failed sessions; active and ambiguous-delivery sessions do not expire."
  type        = number
  default     = 365
  validation {
    condition     = var.session_retention_days >= 30 && var.session_retention_days <= 3650
    error_message = "session_retention_days must be between 30 and 3650 days."
  }
}
variable "log_retention_days" {
  type    = number
  default = 30
  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "Use a supported CloudWatch Logs retention period."
  }
}
variable "dynamodb_deletion_protection_enabled" {
  type    = bool
  default = true
}
variable "cognito_deletion_protection_enabled" {
  type    = bool
  default = true
}
variable "frontend_bucket_force_destroy" {
  type    = bool
  default = false
}
variable "dynamodb_point_in_time_recovery_enabled" {
  type    = bool
  default = true
}
variable "fallback_enabled" {
  type    = bool
  default = true
}
variable "schedule_maximum_retry_attempts" {
  type    = number
  default = 3
}
variable "schedule_maximum_event_age_seconds" {
  type    = number
  default = 3600
}
variable "cloudfront_price_class" {
  type    = string
  default = "PriceClass_100"
}
variable "api_routes" {
  type = list(string)
  default = [
    "GET /sessions",
    "POST /sessions",
    "GET /sessions/{sessionId}",
    "PUT /sessions/{sessionId}",
    "POST /sessions/{sessionId}/retry",
    "POST /sessions/{sessionId}/confirm-delivered"
  ]
}

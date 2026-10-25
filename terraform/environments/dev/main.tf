locals {
  tags = {
    Project     = "office-update-automation"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
  schedule_group_name  = "${var.name_prefix}-schedules"
  schedule_group_arn   = "arn:${data.aws_partition.current.partition}:scheduler:${var.aws_region}:${var.aws_account_id}:schedule/${local.schedule_group_name}/*"
  secret_base_name     = var.name_prefix
  processor_lambda_arn = "arn:${data.aws_partition.current.partition}:lambda:${var.aws_region}:${var.aws_account_id}:function:${var.name_prefix}-report_processor"
  functions = {
    session_api = {
      description       = "Authenticated work-session API; handler is supplied by the application package."
      runtime           = "nodejs22.x"
      handler           = "src/session.handler"
      s3_key            = var.lambda_artifact_keys["session_api"]
      source_code_hash  = lookup(var.lambda_artifact_hashes, "session_api", null)
      s3_object_version = lookup(var.lambda_artifact_versions, "session_api", null)
      memory_size       = 256
      timeout           = 20
      environment_variables = {
        SESSION_TABLE_NAME   = module.sessions.table_name
        SCHEDULE_GROUP_NAME  = local.schedule_group_name
        SCHEDULER_ROLE_ARN   = module.runtime_iam.scheduler_role_arn
        REPORT_PROCESSOR_ARN = local.processor_lambda_arn
        TIMEZONE             = var.timezone
      }
    }
    report_processor = {
      description       = "Scheduled report generation and fallback processor; handler is supplied by the application package."
      runtime           = "nodejs22.x"
      handler           = "src/processor.handler"
      s3_key            = var.lambda_artifact_keys["report_processor"]
      source_code_hash  = lookup(var.lambda_artifact_hashes, "report_processor", null)
      s3_object_version = lookup(var.lambda_artifact_versions, "report_processor", null)
      memory_size       = 512
      timeout           = 120
      environment_variables = {
        SESSION_TABLE_NAME = module.sessions.table_name
        GEMINI_SECRET_ARN  = module.integration_secrets.gemini_secret_arn
        TEAMS_SECRET_ARN   = module.integration_secrets.teams_secret_arn
        TIMEZONE           = var.timezone
      }
    }
  }
}

module "frontend_bucket" {
  source        = "../../modules/s3-frontend"
  bucket_name   = var.frontend_bucket_name
  force_destroy = var.frontend_bucket_force_destroy
  tags          = local.tags
  depends_on    = [terraform_data.account_guard]
}

module "frontend_distribution" {
  source                      = "../../modules/cloudfront"
  name_prefix                 = var.name_prefix
  bucket_name                 = module.frontend_bucket.bucket_name
  bucket_arn                  = module.frontend_bucket.bucket_arn
  bucket_regional_domain_name = module.frontend_bucket.regional_domain_name
  price_class                 = var.cloudfront_price_class
  aliases                     = var.frontend_domain_names
  acm_certificate_arn         = var.frontend_acm_certificate_arn
  tags                        = local.tags
}

module "sessions" {
  source                         = "../../modules/dynamodb"
  table_name                     = "${var.name_prefix}-sessions"
  deletion_protection_enabled    = var.dynamodb_deletion_protection_enabled
  point_in_time_recovery_enabled = var.dynamodb_point_in_time_recovery_enabled
  tags                           = local.tags
}

module "integration_secrets" {
  source             = "../../modules/secrets-manager"
  name_prefix        = var.name_prefix
  gemini_secret_name = "${local.secret_base_name}/gemini-api-key"
  teams_secret_name  = "${local.secret_base_name}/teams-webhook"
  tags               = local.tags
}

module "runtime_iam" {
  source                  = "../../modules/iam"
  name_prefix             = var.name_prefix
  region                  = var.aws_region
  account_id              = var.aws_account_id
  partition               = data.aws_partition.current.partition
  table_arn               = module.sessions.table_arn
  table_index_arn         = module.sessions.table_index_arn
  integration_secret_arns = module.integration_secrets.secret_arns
  schedule_group_arn      = local.schedule_group_arn
  tags                    = local.tags
}

module "functions" {
  source               = "../../modules/lambda"
  name_prefix          = var.name_prefix
  artifact_bucket_name = var.lambda_artifact_bucket_name
  execution_role_arns  = module.runtime_iam.lambda_role_arns
  log_retention_days   = var.log_retention_days
  functions            = local.functions
  tags                 = local.tags
}

module "scheduler" {
  source                    = "../../modules/eventbridge-scheduler"
  name_prefix               = var.name_prefix
  schedule_group_name       = local.schedule_group_name
  scheduler_role_arn        = module.runtime_iam.scheduler_role_arn
  scheduler_role_name       = module.runtime_iam.scheduler_role_name
  report_processor_arn      = module.functions.function_arns["report_processor"]
  account_id                = var.aws_account_id
  partition                 = data.aws_partition.current.partition
  region                    = var.aws_region
  timezone                  = var.timezone
  fallback_enabled          = var.fallback_enabled
  maximum_retry_attempts    = var.schedule_maximum_retry_attempts
  maximum_event_age_seconds = var.schedule_maximum_event_age_seconds
  tags                      = local.tags
}

module "authentication" {
  source              = "../../modules/cognito"
  name_prefix         = var.name_prefix
  region              = var.aws_region
  callback_urls       = [module.frontend_distribution.url]
  logout_urls         = [module.frontend_distribution.url]
  domain_prefix       = var.cognito_domain_prefix
  deletion_protection = var.cognito_deletion_protection_enabled
  tags                = local.tags
}

module "api" {
  source                 = "../../modules/api-gateway"
  name_prefix            = var.name_prefix
  session_api_lambda_arn = module.functions.function_arns["session_api"]
  cognito_client_id      = module.authentication.user_pool_client_id
  cognito_issuer_url     = module.authentication.issuer_url
  allowed_origins        = [module.frontend_distribution.url]
  routes                 = var.api_routes
  log_retention_days     = var.log_retention_days
  tags                   = local.tags
}

module "monitoring" {
  source                = "../../modules/monitoring"
  name_prefix           = var.name_prefix
  lambda_function_names = module.functions.function_names
  tags                  = local.tags
}

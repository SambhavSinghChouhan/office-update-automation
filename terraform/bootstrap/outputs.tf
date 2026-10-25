output "aws_account_id" {
  description = "Account where bootstrap resources were created."
  value       = data.aws_caller_identity.current.account_id
}

output "lambda_artifact_bucket_name" {
  description = "Private bucket where CI uploads versioned Lambda ZIP artifacts."
  value       = aws_s3_bucket.artifacts.id
}

output "terraform_state_bucket_name" {
  description = "Private, versioned bucket for the environment Terraform state and lock file."
  value       = aws_s3_bucket.terraform_state.id
}

output "github_oidc_provider_arn" {
  description = "OIDC provider trusted by the deployment role."
  value       = local.oidc_provider_arn
}

output "github_deployment_role_arn" {
  description = "Configure this role ARN as a GitHub Environment variable. It contains no credentials."
  value       = aws_iam_role.github_deploy.arn
}

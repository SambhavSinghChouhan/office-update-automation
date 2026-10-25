variable "aws_region" {
  description = "Region for the bootstrap buckets and deployment role policy scope."
  type        = string
  default     = "ap-south-1"
}

variable "expected_account_id" {
  description = "Optional guard. When set, bootstrap fails unless credentials target this 12-digit account."
  type        = string
  default     = ""
  validation {
    condition     = var.expected_account_id == "" || can(regex("^[0-9]{12}$", var.expected_account_id))
    error_message = "expected_account_id must be empty or a 12-digit AWS account ID."
  }
}

variable "project_name" {
  description = "Lowercase resource prefix, kept stable across environments in this account."
  type        = string
  default     = "office-update"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.project_name))
    error_message = "project_name must be 3-25 lowercase letters, digits, or hyphens and start with a letter."
  }
}

variable "environment" {
  description = "Environment this bootstrap role is restricted to, such as dev or prod."
  type        = string
  default     = "dev"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "environment must be 2-16 lowercase letters, digits, or hyphens."
  }
}

variable "artifact_bucket_name" {
  description = "Globally unique private S3 bucket for versioned Lambda deployment ZIPs."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.artifact_bucket_name))
    error_message = "Use a valid globally unique S3 bucket name (3-63 lowercase characters)."
  }
}

variable "state_bucket_name" {
  description = "Globally unique private S3 bucket for this account/environment's Terraform state and S3 lock files."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.state_bucket_name))
    error_message = "Use a valid globally unique S3 bucket name (3-63 lowercase characters)."
  }
}

variable "github_repository" {
  description = "GitHub repository in owner/repo format."
  type        = string
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must use owner/repo format."
  }
}

variable "github_subjects" {
  description = "Exact GitHub OIDC sub values, e.g. repo:owner/repo:environment:dev or repo:owner/repo:ref:refs/heads/main."
  type        = list(string)
  validation {
    condition     = length(var.github_subjects) > 0 && alltrue([for subject in var.github_subjects : startswith(subject, "repo:${var.github_repository}:")])
    error_message = "At least one GitHub subject is required and every subject must belong to github_repository."
  }
}

variable "create_github_oidc_provider" {
  description = "Create GitHub's OIDC provider in this account. Set false if it already exists."
  type        = bool
  default     = true
}

variable "existing_github_oidc_provider_arn" {
  description = "Existing token.actions.githubusercontent.com provider ARN when create_github_oidc_provider is false."
  type        = string
  default     = ""
  validation {
    condition     = var.create_github_oidc_provider || can(regex("^arn:[a-z-]+:iam::[0-9]{12}:oidc-provider/token\\.actions\\.githubusercontent\\.com$", var.existing_github_oidc_provider_arn))
    error_message = "When reusing a provider, set its full token.actions.githubusercontent.com OIDC provider ARN."
  }
}

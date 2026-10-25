# Per-account bootstrap

This Terraform root runs before the application root. It creates the private versioned state and Lambda-artifact S3 buckets, the account's GitHub Actions OIDC provider (or reuses an existing one), and the `office-update-dev-github-deploy` role with its repository-restricted trust and app-scoped deployment policy.

The bootstrap backend intentionally remains local because the remote state bucket is one of the resources this root creates. Use authorized credentials for the target AWS account, set `expected_account_id`, and keep a secure backup of the generated local `terraform.tfstate`. Never commit bootstrap state or `terraform.tfvars`. Preserve a different bootstrap state per account/environment; importing existing resources is safer than creating duplicates if state is lost.

Quick start:

```sh
cp terraform.tfvars.example terraform.tfvars
# Edit account, globally unique bucket names, repo, and exact OIDC sub claim.
aws sts get-caller-identity
terraform init
terraform fmt -recursive
terraform validate
terraform plan
# Review account and plan before a human-authorized bootstrap apply.
terraform apply
terraform output
```

The OIDC provider URL is `https://token.actions.githubusercontent.com` and its audience is `sts.amazonaws.com`. Its ARN is account-specific. If it already exists, set `create_github_oidc_provider = false` and pass its ARN via `existing_github_oidc_provider_arn`; do not create a second provider.

Outputs `github_deployment_role_arn`, `terraform_state_bucket_name`, `lambda_artifact_bucket_name`, and `aws_account_id` are copied to the matching GitHub Actions secrets as described in [`../README.md`](../README.md). The role ARN goes in the `OIDC` secret. Do not use the OIDC provider ARN or the IAM `github-oidc` user ARN for that secret.

The deployment policy is explicit and prefix/region/account scoped wherever AWS allows it. A small number of global APIs require `Resource = "*"`; these are read-only discovery or AWS control-plane APIs, and are described in the main runbook. It is not an administrator policy. Update this root and apply the bootstrap policy before using a newly added permission in the application workflow.

The application backend uses the bootstrap state bucket with an account/environment-specific key and native S3 lock file (`use_lockfile=true`, Terraform 1.10+). Bootstrap buckets, OIDC provider, and deployment role are intentionally not removed by the dev application destroy workflow.

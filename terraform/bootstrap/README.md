# Account bootstrap

Run this root per account/environment with an administrator identity (prefer AWS IAM Identity Center/SSO). Bootstrap state stays local so the backend bucket can be created before the application root is initialized. Keep local state backed up securely and out of Git.

It creates versioned/private Lambda artifact and Terraform state buckets, a GitHub OIDC provider when requested, and a role restricted to the configured GitHub repository subjects. GitHub subjects include immutable owner/repository IDs in the form `repo:OWNER@OWNER_ID/REPO@REPO_ID:ref:refs/heads/main`; trust the exact subject shown by your workflow. The role policy supports `environments/dev` and limits state access to this account/environment's state and lock objects; it is not an account administrator policy. CloudFront's global APIs require wildcard resource scope, and API Gateway/Cognito policies are limited to the account/region or pool resource type rather than a human-readable name. IAM pass-role is separately restricted to this project/environment role prefix and Lambda/Scheduler services. For strong isolation between production and development, use separate AWS accounts. Review and narrow the action set as the application stabilizes.

The deployment role can write secret values only under `<project_name>-<environment>/*`. This supports a later GitHub workflow syncing GitHub Actions secrets into Secrets Manager without placing secret values in Terraform inputs/state. Restrict who can administer those GitHub secrets and protect the GitHub Environment. CloudFront's global control-plane API requires wildcard resource scope; the role's repository/subject trust and explicit action list still constrain its use.

## Account reuse

For another environment/account, use credentials for the target account, set `environment`, provide a distinct globally unique artifact bucket name, and set `expected_account_id` as a guard. Use an OIDC subject for that environment. In a new account, create the provider; for another environment in an account that already has it, set `create_github_oidc_provider = false` and provide the existing provider ARN. Select a distinct local workspace such as `<account-id>-<environment>` in this root. No application resource definitions need account-specific edits.

The bootstrap root itself uses local state. The application root uses the bootstrap-created S3 bucket with Terraform's native S3 lock file (`use_lockfile=true`), supported by Terraform 1.10 and newer. Keep bootstrap state backed up securely and never commit it.

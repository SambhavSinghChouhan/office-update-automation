# AWS Terraform infrastructure

This directory contains the reusable AWS infrastructure foundation for the work-update application. The Cloudflare application remains untouched. The Lambda functions are provisioned from deployment ZIPs in a private S3 artifacts bucket; application handlers and application packaging/deployment remain a later phase.

## Layout

- `bootstrap/`: per-account/environment foundation for artifact and Terraform state buckets and the GitHub OIDC role. Bootstrap state stays local.
- `modules/`: reusable application resource groups.
- `environments/dev/`: an environment root module showing how to compose modules. A second account/environment uses the same modules with different backend and variable files.

## Prerequisites

- Terraform 1.10 or newer.
- AWS CLI credentials for a human administrator during bootstrap, preferably an AWS IAM Identity Center/SSO profile. No access keys are stored in this repository.
- An existing GitHub repository and an exact branch or GitHub Environment subject to trust.

## Bootstrap, once in each target account/environment

The bootstrap root creates private Lambda artifact and Terraform state buckets, GitHub OIDC provider (unless one already exists), and environment-scoped GitHub deployment role. The application environment uses the state bucket and native S3 lock file. Use distinct buckets and state keys per account/environment. For an already bootstrapped account, stay in the existing local workspace so Terraform can update its current state; do not create a new workspace for the same resources.

```sh
cd terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars
# Edit names, region, repository, and allowed GitHub subject. Confirm AWS identity.
aws sts get-caller-identity
terraform init
terraform fmt -recursive
terraform validate
terraform plan
# Apply only after reviewing the account and plan.
terraform apply
```

If the account already has the GitHub OIDC provider, set `create_github_oidc_provider = false` and supply its ARN in `existing_github_oidc_provider_arn`. The provider must have `sts.amazonaws.com` as a client ID. Bootstrap itself is not automatically applied by any workflow.

Record the artifact bucket, state bucket, role ARN, account ID, region, and project prefix. The role ARN is an output, not a credential. Bootstrap state remains local; back it up securely and do not commit it.

## Main infrastructure

```sh
cd terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
# Set account/environment values and the artifact bucket output from bootstrap.
terraform init -reconfigure -backend-config="bucket=<state-bucket>" -backend-config="key=<account-id>/<environment>/terraform.tfstate" -backend-config="region=<region>" -backend-config="use_lockfile=true" -backend-config="encrypt=true"
terraform fmt -check -recursive
terraform validate
terraform plan -var-file=terraform.tfvars
```

The application state is stored in S3 and locked with Terraform's native `.tflock` object. The bucket must be created by bootstrap before initializing the application root. GitHub Actions also serializes workflow runs to avoid overlapping pipeline operations.

To add another environment, use the same `environments/dev` composition as a thin root template (or copy it to `environments/prod`) and supply its own variable files and local workspace. Module definitions remain unchanged. Bootstrap once per account/environment to create an artifact bucket and an environment-scoped deployment role. The GitHub OIDC provider itself is account-level: create it once per account, then reuse its ARN for additional environments in that account.

### Lambda artifact order

This repository does not yet contain AWS Lambda handler packages. Do not invent or deploy placeholder handlers. Once application code and packaging workflows exist, upload ZIPs to the bootstrap artifact bucket using the keys configured in `terraform.tfvars`, then apply the main environment. Each ZIP must contain the configured Node.js handler entry point. The bootstrap role grants the repository deployment role read access to those artifacts; use an environment-specific prefix in each key.

## GitHub Actions workflow and repository secrets

`.github/workflows/terraform.yaml` runs only through manual `workflow_dispatch`. It runs format, init, validate, and plan; selecting `apply` applies the saved plan and is restricted to `main`. GitHub Actions OIDC supplies short-lived credentials. No AWS access keys are used.

Selecting `destroy` requires the exact `DESTROY DEV` confirmation. The workflow first previews destruction, disables DynamoDB and Cognito deletion protection, then plans and applies the final destroy. It removes the dev application stack, including frontend objects and application resources. Secrets Manager secrets enter their configured recovery window. The bootstrap state/artifact buckets, GitHub deployment role, and OIDC provider are intentionally retained so Terraform state remains available and the stack can be redeployed. Configure GitHub Environment `dev-destroy` with required reviewers if you want an additional approval gate.

Configure these GitHub Actions repository secrets before running the workflow:

| Secret | Value |
|---|---|
| `OIDC` | Role ARN output by bootstrap (`github_deployment_role_arn`), not the OIDC provider ARN |
| `AWS_ACCOUNT_ID` | Target 12-digit account ID |
| `TF_STATE_BUCKET` | Bootstrap-created Terraform state bucket name |

The workflow keeps region (`ap-south-1`), environment (`dev`), naming prefix, timezone (`Asia/Kolkata`), and log retention (`30` days) in code. Frontend and artifact bucket names are built from the coded prefix/region and `AWS_ACCOUNT_ID`, so they stay account-specific without additional secrets. Update those workflow values directly if this deployment configuration changes.

The bootstrap role trust must match the workflow's repository and `main` branch. The role and policy need to be updated by running bootstrap after the state-bucket additions, before the workflow can initialize remote state.

The deployment role trusts only the configured repository subject(s) and `sts.amazonaws.com` audience. Configure the GitHub workflow to request `id-token: write` and assume the role with `aws-actions/configure-aws-credentials`; the AWS credentials are short-lived. The workflow reads the account ID, role ARN, and state bucket name from GitHub Actions secrets. No permanent AWS access keys belong in GitHub.

The optional `deployment_role_arn` provider variable is for local `terraform plan` runs that use an AWS CLI/SSO identity allowed to assume that role. The local-only `environments/dev/terraform.tfvars` contains the role ARN you supplied and is ignored by Git. An OIDC-only role may not trust a local identity, so local assumption can fail even when GitHub OIDC works. In GitHub Actions, pass the same role ARN to `aws-actions/configure-aws-credentials` (a GitHub Actions variable is sufficient; it is not a credential). The account-local OIDC provider ARN is a different identifier and is created/reused by bootstrap.

The main Terraform creates empty Secrets Manager secret containers for Gemini and Teams. To honor repository-secret based setup without putting values in Terraform state, a later workflow can read GitHub Actions secrets (for example `GEMINI_API_KEY` and `TEAMS_WEBHOOK_URL`) and call `PutSecretValue` using the OIDC role. The role is limited to secret names under this application's prefix. Secret values are never Terraform variables or outputs. Do not print them in workflow logs.

The GitHub deployment policy is intentionally limited by project/environment resource name prefixes where AWS supports resource-level IAM. CloudFront has global APIs requiring `Resource = "*"`, and API Gateway/Cognito resource identifiers do not provide a reliable human-name boundary in this policy. Use separate AWS accounts for strong dev/prod isolation. Review the final policy against the actual CI deployment commands before enabling apply.

## Architecture and networking

CloudFront serves a private S3 bucket through Origin Access Control. Cognito user-pool JWT authorization protects every HTTP API route. API Gateway invokes a session Lambda; EventBridge Scheduler invokes a report processor at a supplied clock-out and at 00:30 in the configured IANA timezone. DynamoDB is the state authority; schedule versions and conditional processor leases are expected application behavior. Secrets Manager stores external credentials. Lambda is not attached to a VPC because the current integrations require public HTTPS egress and AWS service APIs only; avoiding a VPC avoids an unjustified NAT Gateway. Add networking only if a private dependency is introduced.

The session table and IAM resources are provisioned, but actual validation, duration calculation, retrieval, Gemini calls, Teams delivery, idempotency state transitions, and safe retry code require the application migration phase. A Teams webhook does not guarantee exactly-once delivery after an ambiguous timeout.

## Costs and lifecycle

Potential charges include CloudFront transfer/requests, S3 storage/requests, API Gateway calls, Lambda duration, DynamoDB storage/requests/backups, EventBridge schedules/invocations, Cognito usage, Secrets Manager secret/API usage, CloudWatch log ingestion/retention/alarms, and external Gemini API usage. The artifact bucket also incurs storage charges. This is not guaranteed to be free. Check current pricing in the selected region before deployment.

Frontend bucket force deletion is disabled during normal operations and enabled only by the confirmed destroy workflow. DynamoDB and Cognito deletion protection are enabled by default and disabled only during that workflow. Secret deletion uses a recovery window. No Cloudflare resource is managed or removed by this Terraform.

# AWS Terraform setup and account runbook

This directory manages the AWS infrastructure for the work-update application. It keeps the application stack and per-account bootstrap separate. The bootstrap creates the state/artifact buckets and GitHub OIDC deployment role; the environment root creates the application resources. No AWS resources are created by reading this guide or running validation commands.

## What this Terraform manages

The reusable modules in `modules/` provision the private frontend S3 bucket, CloudFront distribution, Cognito user pool and client, HTTP API Gateway, Lambda functions and log groups, DynamoDB session table, EventBridge Scheduler schedule group/fallback and dead-letter queue, Secrets Manager secret containers, CloudWatch alarms, and application IAM roles/policies.

The deployment role created by `bootstrap/` is separate from application roles. Its trust policy only accepts the configured GitHub repository subject and `sts.amazonaws.com` audience. The explicit deployment policy scopes resources by account, region, and the `office-update-dev-` prefix where AWS supports resource-level access. A few AWS APIs require `Resource = "*"` or have non-resource-specific ARNs; these are documented below. The Lambda and Scheduler roles do not inherit the deployment role's permissions.

The application Lambdas do not use a VPC: the current application calls public Gemini and Teams HTTPS endpoints and AWS managed service APIs. Attaching them to a private subnet would require an egress design (often a NAT Gateway) and add cost without a current private-network dependency.

## Account-switch overview

For each new AWS account, use an authorized human identity in that target account to run bootstrap once. Bootstrap creates the account-local GitHub OIDC provider (unless one already exists), the deployment role, a state bucket, and an artifact bucket. Then configure the GitHub repository secrets with that account's output values and run the existing workflow. The Terraform module/resource definitions are unchanged between accounts; names and state keys are derived from account/environment configuration.

Changing only `AWS_ACCOUNT_ID` is not enough. The target account needs the OIDC provider, matching role trust, deployment policy, state bucket, artifact bucket, and the target account's own state. Bootstrap creates these together. Keep a different state key per account/environment.

## Prerequisites

- Terraform 1.10 or newer (the application workflow pins 1.10.5).
- AWS CLI and credentials with permission to bootstrap the listed resources in the target account. Prefer AWS IAM Identity Center / SSO; do not create permanent credentials for GitHub.
- Access to the GitHub repository's Settings and Actions.
- Gemini API key and the existing Teams webhook URL. Keep both in GitHub Actions secrets; the deploy workflow writes them into Secrets Manager.
- An exact GitHub OIDC subject. GitHub now includes immutable owner/repository IDs in the subject in many configurations. The subject must match the value accepted by the AWS role trust policy. The example file has the expected shape; use the GitHub token claim for this repository rather than guessing IDs.

## Step 1: Select and verify the target AWS account

1. Sign in to the AWS Console and select the target account from the account menu.
2. Open **CloudShell** from the top navigation, or use a local terminal configured for that target account.
3. Run `aws sts get-caller-identity`. Check the `Account` value before proceeding.
4. Use this same identity for the bootstrap commands below. Set `expected_account_id` in the bootstrap variables as an additional guard.

For local AWS CLI profiles, the commands can be run as `AWS_PROFILE=your-target-profile aws sts get-caller-identity` and Terraform can use `AWS_PROFILE=your-target-profile terraform ...`.

## Step 2: Prepare bootstrap configuration

Bootstrap has local state because its purpose is to create the remote state bucket. Never commit `terraform/bootstrap/terraform.tfstate`, its backup, or `terraform.tfvars`; these are ignored by Git. Keep a secure backup of the local state. If local state is lost, do not rerun bootstrap blindly: first inspect/import the existing bucket, OIDC provider, and role so Terraform does not attempt duplicate creation.

From the repository root:

```sh
cd terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` for this account. To get the repository IDs for the immutable subject, open `https://api.github.com/repos/SambhavSinghChouhan/office-update-automation` in a browser and read the JSON `owner.id` and top-level `id` fields. GitHub's OIDC subject format used here is `repo:<owner>@<owner-id>/<repo>@<repo-id>:ref:refs/heads/main`. If the repository owner/repository or workflow trust configuration changes, verify the actual token `sub` claim and update this value. Do not copy the OIDC provider ARN into `github_subjects`.

Edit `terraform.tfvars` for this account:

```hcl
aws_region          = "ap-south-1"
expected_account_id  = "TARGET_12_DIGIT_ACCOUNT_ID"
project_name         = "office-update"
environment          = "dev"
artifact_bucket_name = "office-update-dev-TARGET_ACCOUNT_ID-ap-south-1-artifacts"
state_bucket_name    = "office-update-dev-tfstate-TARGET_ACCOUNT_ID"
github_repository    = "SambhavSinghChouhan/office-update-automation"
github_subjects      = ["repo:OWNER@OWNER_ID/REPO@REPO_ID:ref:refs/heads/main"]
create_github_oidc_provider = true
```

Replace the account ID and OIDC subject with the target values. S3 bucket names are globally unique; if the shown name is unavailable, choose another unique name and use that exact state bucket name in GitHub later. Keep the branch/environment restriction narrow; don't use `*` for all repositories or branches.

If `token.actions.githubusercontent.com` is already registered as an IAM identity provider in this AWS account, do not create a duplicate. In `terraform.tfvars` set `create_github_oidc_provider = false` and set `existing_github_oidc_provider_arn` to the ARN shown in the console. To verify it, open **AWS Console → IAM → Identity providers → token.actions.githubusercontent.com**. The provider's audience/client ID must include `sts.amazonaws.com`.

## Step 3: Run bootstrap and review outputs

Still in `terraform/bootstrap`:

```sh
terraform init
terraform fmt -recursive
terraform validate
terraform plan
```

Review the plan and verify it targets the account from Step 1 and only the expected bucket, provider, role, and policy names. The bootstrap deployment role policy is intentionally explicit, not an administrator policy. If this is a new target account, run `terraform apply` only after reviewing the plan and confirming the account. This is the one human-authorized bootstrap operation; the application deployment workflow does not apply bootstrap.

Then read the non-secret outputs:

```sh
terraform output
```

Record `aws_account_id`, `github_deployment_role_arn`, `terraform_state_bucket_name`, `lambda_artifact_bucket_name`, and `github_oidc_provider_arn`. `github_deployment_role_arn` is a role identifier, not a credential. Do not put the provider ARN in the `OIDC` GitHub secret.

### What must exist before the application workflow

Bootstrap must have completed in the target account, and the GitHub secrets below must point to that same account. The bootstrap role policy must be refreshed whenever `bootstrap/main.tf` changes: use the bootstrap credentials and run `terraform plan`/`terraform apply` from the same local bootstrap state before invoking the application workflow. This is particularly important when a new AWS API permission is added. Do not manually attach `AdministratorAccess` to fix a permission error.

## Step 4: Add GitHub Actions repository secrets

Navigate to **GitHub → SambhavSinghChouhan/office-update-automation → Settings → Secrets and variables → Actions → Repository secrets → New repository secret**. Create these names exactly. For each, paste only the value described:

| Secret name | Value to copy/paste |
|---|---|
| `AWS_ACCOUNT_ID` | The 12-digit `aws_account_id` value from bootstrap output (or verify with `aws sts get-caller-identity`). |
| `OIDC` | The complete `github_deployment_role_arn` output, for example `arn:aws:iam::TARGET_ACCOUNT_ID:role/office-update-dev-github-deploy`. This is the role to assume, **not** the IAM OIDC provider ARN and not the `github-oidc` IAM user ARN. |
| `TF_STATE_BUCKET` | The exact `terraform_state_bucket_name` output. |
| `GEMINI_API_KEY` | The Gemini API key from the authorized Google AI Studio project. Do not retrieve or copy a key from old source files. |
| `TEAMS_WEBHOOK_URL` | The existing Teams webhook/workflow URL for the intended channel. |

The account, region, environment, bucket naming pattern, timezone, and log retention are ordinary configuration in the workflows and Terraform variables, not GitHub secrets. If the deployment configuration changes, update those code values deliberately. Never print the Gemini key or Teams URL in a workflow log.

GitHub path: **Settings → Secrets and variables → Actions**. Repository secrets are available to both manual workflows in this repository. Restrict repository write/admin access because these workflows can deploy and destroy resources.

## Step 5: Confirm the OIDC provider and role trust

The preferred path is to let bootstrap create these resources. Do not manually create a second provider or role if bootstrap already created them.

To inspect them in AWS Console:

1. Open **AWS Console → IAM → Identity providers**. Confirm there is an OpenID Connect provider named `token.actions.githubusercontent.com` with audience `sts.amazonaws.com`.
2. Open **IAM → Roles → `office-update-dev-github-deploy` → Trust relationships**.
3. Confirm the trusted federated principal references this account's `oidc-provider/token.actions.githubusercontent.com` ARN.
4. Confirm the conditions restrict `aud` to `sts.amazonaws.com` and `sub` to the configured repository plus `main` branch (or another explicitly allowed GitHub environment).
5. Open the role's **Permissions** tab. The inline `office-update-dev-github-deploy-policy` should be the Terraform-managed deployment policy. Do not attach broad managed policies.

If you must create an OIDC provider by hand in a fresh account, navigate to **IAM → Identity providers → Add provider → OpenID Connect**; set Provider URL to `https://token.actions.githubusercontent.com`, Audience to `sts.amazonaws.com`, and add it. Then bootstrap must be configured to reuse the resulting provider ARN. The deployment role and its trust/policy are best created through the bootstrap Terraform so the exact naming and policy stay under state management.

The workflows require `id-token: write` and use `aws-actions/configure-aws-credentials` with the `OIDC` role ARN secret. This exchanges a short-lived GitHub-issued OIDC token for temporary AWS credentials; there are no permanent AWS keys in GitHub.

## Step 6: Run the infrastructure workflow

1. In GitHub, open **Actions → Terraform**.
2. Click **Run workflow** and select branch `main`.
3. Choose `plan` first and run it. Review the plan and logs for the expected target account and resource actions.
4. After reviewing the plan, run it again with `apply` to create/update the application stack. The workflow applies the saved plan from that run. Do not approve a plan with unexplained deletions or replacements.
5. To remove only the application stack, choose `destroy` and enter exactly `DESTROY DEV`. Bootstrap buckets, state, artifacts, deployment role, and OIDC provider are retained.

Terraform workflow address: `.github/workflows/terraform.yaml`. The pipeline formats, initializes, validates, plans, and offers a reviewed apply or a separately confirmed destroy. It packages Lambda artifacts before normal plan/apply. It uses S3 state with account/environment state key and native S3 lock files (`use_lockfile=true`, Terraform >=1.10).

## Step 7: Deploy the web application and integrations

After the infrastructure workflow's apply succeeds:

1. Confirm `GEMINI_API_KEY` and `TEAMS_WEBHOOK_URL` are set in repository secrets.
2. Open **Actions → Deploy application → Run workflow** on `main`.
3. The workflow checks that the assumed OIDC role resolves to `AWS_ACCOUNT_ID`, reads stack outputs, builds and uploads Lambda packages, updates Lambda code, writes the two secret values to the matching Secrets Manager secret containers, uploads the frontend, and invalidates CloudFront.
4. Open the `cloudfront_url` Terraform output on a phone or desktop and sign in through Cognito.

The deploy workflow does not create infrastructure. The Terraform workflow does not need the external secret values to plan infrastructure; they are required only by the application deployment workflow.

## Running the same code in a second account

1. Sign in to the second account with an authorized bootstrap identity and confirm its account ID.
2. Make a separate bootstrap working copy or preserve a separate local bootstrap state/workspace for that account. Set `expected_account_id`, globally unique bucket names, and the same repository's exact OIDC subject. Do not point two accounts at the same bootstrap state.
3. If the account lacks the GitHub provider, create it through bootstrap. If it already exists, reuse its account-local provider ARN.
4. Run bootstrap plan and review; apply only after confirming the target account. This creates the second account's own deploy role, artifact bucket, and state bucket.
5. Update the five repository secrets to the second account's output values and its integration credentials, if using a separate destination. The `OIDC` role ARN and state bucket must always be from the same target account.
6. The current workflow is explicitly configured for `dev`, `ap-south-1`, and `office-update-dev`. To operate multiple accounts simultaneously rather than sequentially, add a separate protected GitHub Environment/workflow configuration per account and separate GitHub Environment secrets. Never allow two targets to share the same state key.

Changing the account values in GitHub switches where the same code runs, but it does not copy data or resources. Each account gets a separate stack and isolated state. Keep bootstrap state separately backed up for each account/environment.

## IAM permissions and why a few use `*`

The bootstrap policy tracks the errors encountered during actual Terraform refresh, create, update, deploy, and destroy operations. This includes S3 configuration reads and removal of versioned frontend objects; IAM role inline-policy/trust lifecycle and role inspection; Cognito domain status; DynamoDB continuous-backup controls; Lambda code/configuration and permission lifecycle; EventBridge Scheduler groups/schedules; API Gateway HTTP API and CloudWatch log-delivery APIs; CloudWatch alarms/log groups; CloudFront configuration/invalidation; Secrets Manager containers/values; state and artifact S3 access; and `iam:PassRole` restricted to application roles and Lambda/Scheduler services.

AWS does not support resource-level authorization for some discovery/control-plane APIs used here. The current unavoidable wildcard statements are limited to:

- CloudFront distribution/policy control-plane operations, which use global resource identifiers.
- `logs:DescribeLogGroups`, API Gateway's CloudWatch Logs delivery/resource-policy operations, and Cognito user-pool-domain description, where AWS authorization requires `*` or the API does not expose a reliably scoped ARN.
- STS caller identity and Resource Groups Tagging read, which are read-only discovery calls.

API Gateway permissions otherwise use this account/region's API path; Cognito pool permissions use this account/region; IAM roles, Lambda, DynamoDB, S3, SQS, Secrets Manager, logs, and alarms use this project's name prefix. These remaining global API scopes are why the OIDC subject must be narrowly restricted and why separate accounts are preferred for production isolation. The role is not an administrator role.

Application runtime roles are distinct and narrower: session API accesses session records and its own schedules; report processor accesses session state and the Gemini/Teams secret values it needs; Scheduler can invoke only the intended processor and send failed invocations to the configured queue. Runtime IAM does not grant infrastructure management.

## Destroy behavior and recovery

The destroy workflow requires the explicit text `DESTROY DEV`, disables deletion protection only for the confirmed operation, and first applies the `force_destroy` setting to the frontend bucket if that bucket is still in Terraform state. This matters because S3 versioning keeps old object versions: deleting the bucket requires deleting all versions, not merely the current frontend files. The destroy role therefore has `s3:ListBucketVersions` on prefixed frontend buckets and `s3:DeleteObjectVersion` on their objects. It also needs `iam:ListInstanceProfilesForRole` to inspect a role before deleting it.

Destroy is resumable: the preparation step targets only protected resources still present in state, preventing an interrupted destroy retry from recreating already-removed resources. If destroy fails, inspect the first AWS access-denied or dependency error, update bootstrap policy code if a specific API is genuinely required, apply that policy using bootstrap state, push the change, and rerun confirmed destroy. Do not delete the S3 state bucket or its lock file manually while Terraform is operating. A state lock protects concurrent state operations; it does not cause these AWS authorization errors.

Secrets Manager deletion uses a recovery window; deleting a secret is not immediate permanent erasure. Bootstrap buckets are retained. If you later intend to remove bootstrap infrastructure, first migrate and back up state, verify the application stack is gone, and separately plan bootstrap destruction.

## Validation and no-deploy checks

From the repository root:

```sh
terraform fmt -check -recursive terraform
terraform -chdir=terraform/bootstrap init -backend=false
terraform -chdir=terraform/bootstrap validate
terraform -chdir=terraform/environments/dev init -backend=false
terraform -chdir=terraform/environments/dev validate
```

`init -backend=false` validates provider/module configuration without contacting or changing the remote state backend. The application root may still need the Lambda artifact objects to exist before a successful AWS plan/apply. Do not run `terraform apply` unless you intend to change the selected AWS account. No `apply` is part of the validation steps above.

## Operational/cost notes

Potential charges include CloudFront requests/data transfer, S3 storage and requests, API Gateway calls, Lambda duration, DynamoDB storage/requests/backups, EventBridge schedules/invocations, Cognito usage, Secrets Manager secrets/API calls, CloudWatch log ingestion/retention/alarms, and Gemini API usage. This is not guaranteed to be free. The functions run outside a VPC to avoid a NAT Gateway that the current design does not need. Check current service prices in the target region before production use.

The frontend bucket is private and CloudFront uses Origin Access Control. Cognito protects API routes. Logs must not contain external API keys, webhook URLs, or full conversation transcripts. The legacy Cloudflare implementation is outside this Terraform state and is neither modified nor deleted by these instructions.

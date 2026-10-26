# Work Done and Next-Agent Handoff

**Purpose:** Give the next AI/developer enough context to continue this repository without re-reading the entire chat. Read [`detailed.md`](detailed.md) for the full application and desired business-flow design, and [`terraform/README.md`](terraform/README.md) for the AWS account/bootstrap runbook.

## 1. Project objective

Migrate the existing, partially implemented Cloudflare work-update automation application to a secure, low-cost AWS serverless application. The owner uses a phone or desktop to enter clock-in and optional clock-out, work context, and a ChatGPT conversation URL/transcript. AWS stores the session, schedules processing even if the phone is off, calculates durations, asks Gemini for a factual work update, and sends a formatted message to Microsoft Teams.

The owner’s latest intended behavior is:

1. On clock-in submission, save the active work session and immediately send a Teams clock-in notification.
2. If explicit clock-out is entered, schedule the appropriate report/check behavior.
3. A recurring job runs nightly at 00:30 in Asia/Kolkata. No clock-in means no report. If clock-out is missing, use an agreed configurable default; the owner said “11:30 or something,” likely 23:30, but this needs confirmation.
4. If clock-out is before the 00:30 check, the clock-out schedule may send at clock-out; the 00:30 job checks delivery, recovers if needed, and archives/clears the active record after confirmed delivery.
5. If explicit clock-out is after 00:30 (for example 00:45), do not default or send early. Schedule a check at clock-out + 10 minutes (00:55 in that example); it checks Teams state, safely sends if missing, then archives/clears after delivery.
6. Keep completed reports in history while the active page returns to empty/null. Only the 00:30 fallback handler and the post-00:30 clock-out check handler may archive/clear the active session. Failed or ambiguous-delivery sessions remain active for investigation.

The full intended rules and sample Teams format are in `detailed.md`.

## 2. Current repository state

At the time this file was created:

- Branch: `main`.
- Local `HEAD` and `origin/main`: `25f162b` (`Add full application architecture handoff`).
- Working tree was clean before creating this file.
- Current AWS state after the last failed/partial destroy is **unknown**. Check GitHub Actions history and Terraform state/plan before any further apply or destroy. Do not assume the stack is fully present or fully removed.
- No AWS apply/destroy or real Teams message was sent while creating this handoff.

## 3. Work completed in this project/chat

### Terraform foundation

Created a reusable `terraform/` hierarchy with:

- `terraform/bootstrap/`: per-account OIDC provider/reuse configuration, GitHub deployment role and policy, versioned/private/encrypted Terraform state S3 bucket, and Lambda artifact S3 bucket. Bootstrap state is local because the remote state bucket is one of the bootstrap outputs.
- `terraform/environments/dev/`: environment root and resource composition, with account/environment variables, outputs, and example values.
- `terraform/modules/`: IAM, private frontend S3, CloudFront, Cognito, API Gateway, Lambda, DynamoDB, EventBridge Scheduler, Secrets Manager, and CloudWatch monitoring modules.
- `terraform/README.md` and `terraform/bootstrap/README.md`: bootstrap, account switching, exact GitHub secrets, OIDC trust, deployment/destroy, IAM scope, and cost instructions.

AWS application stack described in Terraform:

- S3 private frontend bucket and CloudFront HTTPS distribution using Origin Access Control.
- Cognito user pool, OAuth public client, optional Hosted UI domain; admin-created users only.
- API Gateway HTTP API with Cognito JWT authorization on routes.
- `session_api` and `report_processor` Node.js 22 Lambda functions.
- DynamoDB on-demand session table, status GSI, server-side encryption, point-in-time recovery, and TTL.
- EventBridge Scheduler group, per-session schedules managed by the API, 00:30 recurring fallback, Scheduler IAM role, and SQS dead-letter queue.
- Secrets Manager secret containers for Gemini and Teams; secret values are not Terraform variables or outputs.
- CloudWatch logs/retention and Lambda error alarms.
- No EC2, ECS/EKS, RDS, VPC, or NAT Gateway. The Lambdas call public HTTPS Gemini/Teams APIs and AWS services without private-subnet networking.

### CI/CD

The obsolete workflow files were removed so only these remain under `.github/workflows/`:

- `terraform.yaml`: manually dispatched `plan`, `apply`, or confirmed `destroy` (`DESTROY DEV`), uses GitHub OIDC, runs Terraform format/validation, packages Lambda artifacts before normal plan/apply, and uses remote S3 state with Terraform native lock files (`use_lockfile=true`).
- `deploy-app.yaml`: manually dispatched code deployment; reads stack outputs, updates Lambda code, writes GitHub integration secrets into Secrets Manager, uploads frontend assets, generates public `js/config.js`, and invalidates CloudFront.

GitHub Actions uses short-lived OIDC credentials; no permanent AWS keys are intended. Required repository secret **names** are:

| Secret | Contents |
|---|---|
| `AWS_ACCOUNT_ID` | Target 12-digit AWS account ID. |
| `OIDC` | Full ARN of `office-update-dev-github-deploy` in that target account. It is a role ARN, not the OIDC provider ARN and not an IAM user ARN. |
| `TF_STATE_BUCKET` | The target account’s bootstrap output `terraform_state_bucket_name`. |
| `GEMINI_API_KEY` | Gemini API credential; used by Deploy application. |
| `TEAMS_WEBHOOK_URL` | Existing Teams webhook URL; used by Deploy application. |

Region (`ap-south-1`), environment (`dev`), prefix (`office-update-dev`), timezone (`Asia/Kolkata`), and log retention are code/workflow configuration. Never write secret values in the repository or this document.

### AWS access and multi-account model

- The original account discussed was `596144666648`, region `ap-south-1`.
- Earlier names included an IAM user `github-oidc`, role `github-oidc-role`, and provider `token.actions.githubusercontent.com`. These are not necessarily the role used by the current Terraform workflow.
- The Terraform bootstrap role expected by the current workflow is named `office-update-dev-github-deploy`; the `OIDC` secret must contain its role ARN for the same account as `AWS_ACCOUNT_ID` and `TF_STATE_BUCKET`.
- GitHub OIDC provider URL: `https://token.actions.githubusercontent.com`; audience: `sts.amazonaws.com`; role trust must restrict repository subject/branch (the bootstrap variables provide exact subjects).
- The same Terraform modules can be deployed to a second account by running bootstrap using credentials for that account, supplying unique buckets and expected account guard, then setting GitHub secrets to that account’s outputs. Do not merely change an account ID; OIDC provider, role trust, state/artifact buckets, and isolated state must also exist there.
- No credentials or secret values are recorded here. See `terraform/README.md` for click-by-click setup and the exact `OIDC`/bucket values to copy from bootstrap outputs.

### Application code already present

- Static mobile-friendly frontend (`index.html`, `css/`, `js/`) with Cognito PKCE sign-in, session form and status polling.
- Lambda API handler and domain modules under `application/lambda/src/`.
- Timezone-aware input parsing and duration calculations.
- DynamoDB optimistic version checks and per-user keying.
- One-time clock-out scheduler updates with schedule version included in payload; stale events are ignored after re-reading the current record.
- Report processor with conditional processing lease, Gemini request/response validation, bounded retry for selected transient failures, Teams delivery-state handling, structured logs, and manual retry/ambiguous-delivery confirmation endpoints.
- `application/lambda/package-and-upload.sh` packages and verifies `dev/session-api.zip` and `dev/report-processor.zip` in the artifact bucket.
- Existing tests include `application/lambda/test/session-domain.test.js`; old Cloudflare tests are under `worker/test/` and do not verify AWS parity.

## 4. Terraform/workflow failures encountered and code remedies

The repeated errors were AWS authorization failures for specific AWS API calls—not a broken S3 state lock. The deployment policy in `terraform/bootstrap/main.tf` was expanded to include the operations Terraform and the deploy/destroy workflows actually call, scoped to the project/account/region where AWS supports resource-level permissions. Policy changes for a new account must be deployed through bootstrap before that account’s application workflow can use them.

| Failure seen in workflow | Code remedy / status |
|---|---|
| `logs:CreateLogGroup` denied | Added scoped CloudWatch log-group creation permission for application Lambda/API log names. |
| `cloudfront:CreateResponseHeadersPolicy` denied | Added CloudFront response-header policy lifecycle actions. CloudFront APIs use global resource scope in IAM. |
| Cognito `SetUserPoolMfaConfig` / `GetUserPoolMfaConfig` denied | Added MFA configuration read/write actions for user pools. |
| `dynamodb:UpdateContinuousBackups` / `DescribeContinuousBackups` denied | Added point-in-time-recovery state update/read actions for the prefixed session table. |
| `scheduler:ListTagsForResource` denied | Added Scheduler tag inspection and lifecycle actions for project schedule group/schedules. |
| `iam:ListRolePolicies`, `ListAttachedRolePolicies` denied | Added read access needed for Terraform to refresh inline and attached IAM policy state on prefixed roles. |
| S3 `GetBucketAcl`, `GetBucketCORS`, `GetBucketWebsite`, `GetAccelerateConfiguration`, and related reads denied | Added the S3 bucket configuration reads the AWS provider performs while refreshing the prefixed frontend bucket. |
| Secrets Manager `GetResourcePolicy` denied | Added policy inspection for this application's secret name prefix. |
| `logs:DescribeLogGroups` denied | Added this read-only list API; AWS requires wildcard resource scope for this operation. |
| API Gateway `POST`/`TagResource` denied | Added HTTP API, stage, route, integration, authorizer, and tag lifecycle permissions scoped to account/region API paths and tags. |
| API Gateway “Insufficient permissions to enable logging” / `logs:CreateLogDelivery` denied | Added the CloudWatch Logs delivery/resource-policy actions used by API Gateway. AWS requires broad resource scope for these control-plane calls. |
| Cognito `DescribeUserPoolDomain` denied | Added the domain description read; AWS does not provide a useful scoped resource ARN for this call. |
| Lambda `GetFunctionCodeSigningConfig` denied during refresh | Added the function inspection read for prefixed Lambda functions. |
| CloudWatch `ListTagsForResource` denied | Added tag listing for prefixed CloudWatch alarms. |
| Lambda create failed with S3 `NoSuchKey` | Workflow now builds/uploads both Lambda packages before planning and rebuilds/verifies their keys before applying. `package-and-upload.sh` checks S3 object keys. This is an artifact-order issue, not an IAM policy issue. |
| Destroy failed because the versioned frontend bucket was nonempty | Confirmed destroy workflow sets `frontend_bucket_force_destroy=true` and performs a preparatory apply for the tracked bucket before destroy; deployment role includes `s3:ListBucketVersions` and `s3:DeleteObjectVersion` for prefixed frontend buckets/objects. |
| Destroy failed with `iam:ListInstanceProfilesForRole` denied | Added role-inspection permission for project-prefixed IAM roles. |
| Partial destroy retry risked recreating resources already destroyed | Destroy workflow now checks `terraform state list` and targets only protected resources still in state during its preparatory apply. |

The deployment role was **not** made an unrestricted administrator. Some AWS APIs genuinely require `Resource="*"`, including CloudFront global control-plane calls, log-group discovery and API Gateway log delivery APIs, plus Cognito domain description. These are action-limited; strong production isolation should use a separate AWS account. AWS Organizations SCPs, permission boundaries, quotas, naming collisions, and service availability can still deny actions in another account; application code cannot override those constraints.

The user previously suspected state locking. State locking is enabled with Terraform S3 native lock files; the logs showed explicit `AccessDenied`, missing artifact keys, or versioned-bucket contents. Do not manually delete `.tflock` or state objects to address those errors. Terraform releases a normal lock at the end of failed operations.

## 5. Current application behavior versus what remains

### Present in code

- User can save a full clock-in datetime and optional clock-out datetime, work date, ChatGPT URL, pasted transcript, ticket/work reference, and optional sprint interval.
- API accepts only authenticated Cognito users and associates data with their token `sub`.
- Validation prevents malformed URL/input and invalid duration/order; timezone defaults to Asia/Kolkata; overnight work must provide the correct full date.
- Explicit clock-out currently schedules the report processor at the entered instant.
- Recurring EventBridge Scheduler fallback runs at 00:30 Asia/Kolkata.
- Processor requires pasted transcript text; it does not scrape/fetch conversation content from the ChatGPT shared URL. If transcript is missing, processing fails without inventing an update.
- Current missing-clock-out effective value is midnight at the end of the work date, not 23:30.
- Gemini currently returns exactly three paragraphs; current prompt disallows “today” and “yesterday”.
- Current Teams content is the generated report text alone; the full ELEPHANT template is not composed yet.
- Current app does **not** send a clock-in Teams notification.
- Current app has no email/blocker fields.
- Completed session records remain in DynamoDB (with TTL for eventual expiry); the app does not archive to history and clear an active-session record.
- Clock-out after the 00:30 check is not yet handled by a clock-out-plus-10-minute delivery-check schedule.

### Required work before claiming the requested application flow is complete

1. Confirm fallback default: `11:30` is ambiguous. Decide 11:30 AM, 23:30 (11:30 PM), or another local time and whether it applies on session date or next date.
2. Confirm exact clock-in Teams message and whether report includes `Email`, `Blocker`, and sprint duration lines when empty/disabled.
3. Add immediate clock-in notification with separate state/idempotency, retries, and ambiguous-delivery handling.
4. Add the owner's complete report template to report composition. Include `ELEPHANT`, local clock-in/out, `H hrs MM mins`, ticket, email status, blocker, and Gemini output. Do not reuse the example work/tasks as real facts.
5. Decide whether to retain pasted transcript and generated content, how long to retain history, and how to safely handle old session records when moving to active/history keys.
6. Implement active-session clearing only in the 00:30 recovery handler or the scheduled post-00:30 clock-out check handler. Archive history and clear atomically/conditionally after delivery confirmation. Keep failed/ambiguous items active.
7. Implement schedule semantics: clock-out before upcoming 00:30 may process at clock-out, with fallback reconciliation at 00:30; if clock-out is later than the fallback invocation, schedule delivery verification at clock-out + 10 minutes. Update on edits and reject stale schedule versions.
8. Add email/blocker form/API/schema validation, and a history UI/API while preserving ownership authorization.
9. Update least-privilege runtime IAM and deployment permissions to support any new DynamoDB transaction/archive operation or Lambda path. Do not add blanket account-wide permissions.
10. Add tests for time zones/midnight, default end time, before/after-00:30 schedules, +10-minute recovery, schedule version races, lock collision, no clock-in, Gemini errors, Teams accepted-but-unrecorded ambiguity, archive-after-delivery, and “active is empty/history remains”.
11. Deploy only to dev after plan review; test external integrations using mocks or an approved test Teams channel; verify mobile sign-in, schedule timing, statuses, DLQ and CloudWatch. Do not post to a real work channel during automated tests.
12. Compare AWS with retained Cloudflare behavior, get owner approval, then plan cutover/rollback. Do not remove Cloudflare resources as an incidental part of AWS deployment.

## 6. Deployment and account setup quick reference

1. Read `terraform/README.md` and `terraform/bootstrap/README.md`.
2. In each target AWS account, use authorized human credentials and confirm account via `aws sts get-caller-identity`.
3. Run bootstrap Terraform once for that account/environment. It creates/reuses GitHub OIDC, role, state bucket, and artifacts bucket. Preserve local bootstrap state securely; never commit it.
4. Copy bootstrap outputs into the exact repository secrets listed above. `OIDC` gets `github_deployment_role_arn`; `TF_STATE_BUCKET` gets `terraform_state_bucket_name`; `AWS_ACCOUNT_ID` gets that account’s 12-digit ID.
5. Add/verify `GEMINI_API_KEY` and `TEAMS_WEBHOOK_URL` in GitHub Actions secrets; never put secret values in Terraform variables or frontend files.
6. Manually run **Actions → Terraform → plan** on `main`, inspect target account and changes, then run **apply** intentionally.
7. Run **Actions → Deploy application** after infrastructure exists and outputs include API, Cognito, CloudFront, Lambda and secret ARNs.
8. For destroy, verify the selected account and enter exact `DESTROY DEV`. This removes the app stack and data; bootstrap state/artifact buckets, OIDC provider and deploy role are retained. Do not use destroy as routine debugging.

The current workflow hardcodes `ap-south-1`, `dev`, and `office-update-dev`; for simultaneous independent accounts/environments, add separate protected GitHub Environments and state keys rather than having different deployments overwrite a single set of repository secrets.

## 7. Validation already performed

On the current Terraform/docs changes before this handoff was added:

- `terraform fmt -check -recursive terraform` passed.
- `terraform -chdir=terraform/bootstrap init -backend=false` and `validate` passed.
- `terraform -chdir=terraform/environments/dev validate` passed after initialization.
- Both GitHub workflow YAML files parsed successfully.
- `git diff --check` passed.

These checks validate configuration syntax. They do **not** prove that AWS apply/destroy will succeed under every target account's policies, that the running AWS resources match state, or that real Gemini/Teams integrations work. Do not claim those verifications without reviewing recent GitHub Actions runs and a fresh non-destructive plan.

## 8. Git history landmarks

Recent relevant commits on current `main`:

- `25f162b` — Add full application architecture handoff (`detailed.md`).
- `1793568` — Document account bootstrap and deployment setup.
- `8784d17` — Avoid recreating resources during partial destroy retries.
- `8af6d12` — Fix versioned bucket and IAM role destruction.
- `41e9c34` — Remove obsolete workflow files.
- `800f1c0` — Allow Terraform to read alarm tags.
- `846eb6e` — Add Cognito and Lambda deployment read permissions.
- `1bfbfff` — Ensure Terraform apply has permissions and Lambda packages.

The currently observed tracking ref had `origin/main` at `25f162b`; verify `git status`, `git log`, and remote state before adding work. Earlier in the chat a push failed from the Codex runtime because it had no usable SSH key; a later status showed the new commits on `origin/main`, so rely on current refs rather than that stale failure report.

## 9. Guidance for the next AI agent

- Begin by reading `work-done.md`, `detailed.md`, and `terraform/README.md`; then inspect source before editing.
- Treat code as authoritative for **current** behavior and `detailed.md` as the desired target workflow. Keep this file updated as features land.
- Do not ask for Gemini or Teams credentials in chat. Use configured GitHub secrets and Secrets Manager.
- Do not scrape ChatGPT with cookies, invent report contents, log full transcripts/secrets, or send real Teams messages in tests.
- Do not add AdministratorAccess or indiscriminate IAM permissions to suppress errors. Match newly observed API actions to the exact Terraform resource/operation and scope them where possible.
- Do not deploy/apply/destroy AWS resources or remove Cloudflare resources without explicit current authorization. First establish the real AWS/remote state after the previously partial destroy.
- Confirm the fallback time and final message details before encoding them as production defaults.
- Work incrementally, test the state-machine edge cases, and report exactly what was implemented and verified.

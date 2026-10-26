# Important Handoff Notes for the Next AI Agent

This file is the quick-start operational handoff. Read it first, then read [`work-done.md`](work-done.md) for work history and [`detailed.md`](detailed.md) for the full desired application design. Terraform account/bootstrap instructions are in [`terraform/README.md`](terraform/README.md) and [`terraform/bootstrap/README.md`](terraform/bootstrap/README.md).

## 1. Start here: repository and authority

- Repository: `SambhavSinghChouhan/office-update-automation`.
- Current branch is `main`. At the time this file was prepared, local `HEAD` and `origin/main` were both `8ff5ae2` (`Add work completion and next steps handoff`). Always run `git status --short`, `git log`, and inspect the latest remote state before assuming this remains true.
- This is an existing partially working project. Preserve useful Cloudflare business logic and do not rewrite the app from scratch without a specific reason.
- AWS application code is being built in parallel with a legacy Cloudflare Worker. Do not delete Cloudflare resources or legacy code during AWS work; cutover and cleanup require separate owner approval.
- Code and documentation changes have been requested/authorized. AWS resource creation, Terraform apply/destroy, real Teams messages, and Cloudflare deletion remain actions requiring explicit authorization and target-account confirmation.
- Never claim a resource, feature, integration, test, or deployment is complete just because Terraform declares it or a workflow exists.

## 2. Critical unknown: actual AWS state

The owner reported that a destroy workflow failed after removing many resources. The final error included a versioned frontend S3 bucket that still contained versions and missing IAM role-inspection permission. Code was changed to prepare the bucket for force deletion, grant version listing/object-version deletion, grant `iam:ListInstanceProfilesForRole`, and avoid re-preparing resources absent from Terraform state.

**The current live AWS resource state is unknown.** Before planning infrastructure work, review the latest GitHub Actions run, confirm `AWS_ACCOUNT_ID`, role ARN, state bucket and region, then use a read-only Terraform state/plan inspection. Do not assume the app stack is fully present or absent. Do not delete a lock file or state object as a response to an authorization error.

Terraform state locking was initially suspected by the owner, but the provided failures showed concrete AWS `AccessDenied`, missing Lambda artifact keys, and versioned bucket contents. The main Terraform backend uses S3 native locking (`use_lockfile=true`, Terraform 1.10+); normal failed commands release their lock.

## 3. AWS account and GitHub deployment setup

Current development defaults:

- AWS region: `ap-south-1`.
- Environment: `dev`.
- Resource prefix: `office-update-dev`.
- Timezone: `Asia/Kolkata`.
- Account originally used in discussion: `596144666648`; verify the currently selected account before any AWS operation.
- GitHub repo: `SambhavSinghChouhan/office-update-automation`.
- OIDC issuer/provider URL: `https://token.actions.githubusercontent.com`.
- OIDC audience: `sts.amazonaws.com`.
- Current Terraform-created role naming pattern: `office-update-dev-github-deploy` (ARN includes target account ID). Older user-provided IAM user/role names `github-oidc` / `github-oidc-role` may refer to earlier setup; do not confuse them with the current Terraform deployment role.

To use a new account, run bootstrap against that account with authorized human credentials (prefer AWS SSO/Identity Center), set its account guard, create/reuse its OIDC provider, and create that account's deployment role plus unique state/artifact buckets. The same Terraform modules are reused; never change each resource definition to switch accounts. Keep bootstrap local state securely and separately per account/environment. Do not commit `.tfstate` or `terraform.tfvars`.

GitHub Actions repository secrets (names are exact):

| Name | Value |
|---|---|
| `AWS_ACCOUNT_ID` | Target 12-digit account ID. |
| `OIDC` | Target account's full `office-update-dev-github-deploy` role ARN; **not** the provider ARN or IAM user ARN. |
| `TF_STATE_BUCKET` | Target account's `terraform_state_bucket_name` bootstrap output. |
| `GEMINI_API_KEY` | Gemini credential. |
| `TEAMS_WEBHOOK_URL` | Intended Teams incoming webhook URL. |

Do not ask the user to paste secret values into chat or write them into Terraform. `GEMINI_API_KEY` and `TEAMS_WEBHOOK_URL` are consumed by the Deploy application workflow, which writes them into Secrets Manager. Region/prefix/environment/timezone are currently code configuration, not secrets. The single repository-secret set is only suitable for one target at a time; simultaneous accounts need separate protected GitHub Environments with environment-scoped secrets and state keys.

### Workflows

- `.github/workflows/terraform.yaml`: `workflow_dispatch` choices are `plan`, `apply`, and `destroy`; destroy requires exact `DESTROY DEV`. OIDC is used for short-lived role credentials. Normal runs build/upload Lambda artifacts before plan; apply rebuilds/uploads/verifies them and applies the saved plan. Destroy preparatory apply only targets protected resources still listed in state.
- `.github/workflows/deploy-app.yaml`: `workflow_dispatch`; validates target account; reads Terraform outputs; builds/uploads and updates Lambda code; writes integration secret values into Secrets Manager; publishes static frontend/config and invalidates CloudFront.
- Current workflows are restricted to `main`, and only these two workflow files should remain under `.github/workflows/` unless the owner requests otherwise.
- Never add permanent AWS access keys to GitHub Actions.

## 4. AWS system map

```text
Browser/mobile
  -> CloudFront HTTPS
  -> private S3 static website assets (OAC)
  -> Cognito authorization-code + PKCE login
  -> API Gateway HTTP API with Cognito JWT authorizer
  -> session_api Lambda -> DynamoDB + EventBridge Scheduler
                                  EventBridge Scheduler
                                    -> report_processor Lambda
                                       -> DynamoDB state/lock
                                       -> Secrets Manager
                                       -> Gemini HTTPS API
                                       -> Microsoft Teams webhook
```

AWS resources are defined under `terraform/modules/` and composed in `terraform/environments/dev/`. Bootstrap resources live under `terraform/bootstrap/`. The app does not currently need a VPC: its external APIs use public HTTPS and Lambdas can call them outside a VPC. Do not add NAT Gateway/EC2/ECS/EKS/RDS without demonstrating a concrete requirement.

## 5. Current code versus the desired experience

### Current app features

- Mobile-friendly static page: `index.html`, `css/style.css`, `js/app.js`, `js/api.js`.
- Cognito sign-in with PKCE; ID token is held in browser `sessionStorage`.
- Session fields include work date, clock-in and optional clock-out full date-times, sprint tracking/date-times, ticket, ChatGPT URL and pasted transcript.
- Backend validation/time math is in `application/lambda/src/domain/`.
- Session API is `application/lambda/src/session.js`; scheduled processor is `application/lambda/src/processor.js`; AWS clients and keys are in `application/lambda/src/aws.js`.
- DynamoDB key currently uses `PK=USER#{sub}`, `SK=SESSION#{workDate}`. Status GSI supports fallback query. Items have versions, schedule versions, idempotency identifiers, processing leases, statuses, delivery attempt IDs and a TTL for completed/safely failed records.
- Saving explicit clock-out currently creates/updates a one-time EventBridge schedule at the exact clock-out instant. A daily Scheduler invokes the processor at 00:30 in the configured timezone.
- Processor re-reads current state, rejects stale schedule versions, acquires a conditional five-minute lease, calculates duration, uses Gemini, then sends Teams.
- `DELIVERY_UNKNOWN` blocks blind resend when Teams may have accepted the message but the Lambda cannot confirm/persist the response. UI exposes manual confirmation or an explicit retry with duplicate risk.

### Not implemented yet (do not represent as working)

1. Immediate Teams clock-in notification on save.
2. Owner's full `ELEPHANT` report wrapper (clock-in/out, `H hrs MM mins`, ticket, email, blocker, `Today's update`, Gemini paragraphs).
3. Email status and blocker form/API/data fields.
4. New post-00:30 rule: create a check at explicit clock-out + 10 minutes and send only if not already delivered.
5. Fallback default time requested as “11:30 or something.” It is ambiguous AM/PM; recommend configurable `23:30` local only after owner confirmation. **Current code instead uses 00:00 at the end of work date.**
6. Archive/history separation with active session null/empty after delivery. **Current code retains completed `SESSION#date` records until asynchronous TTL expiry.**
7. Owner's restriction that only the 00:30 worker or post-00:30 scheduled check can archive/clear active state.
8. Full ChatGPT URL retrieval. Current AWS app stores URL as reference and requires pasted transcript; legacy shared-link HTML preview is not a supported public full-conversation API. No cookie/private endpoint scraping. Never fabricate a report if transcript is absent.

The supplied Teams sample includes the label `Today's update` and sample body starting “Today,” while the current Gemini prompt forbids the words “today” and “yesterday.” The owner’s latest approved format should drive prompt changes; decide whether the label is fixed while the paragraph itself avoids those words. Do not copy sample work content as facts.

## 6. Exact intended automation lifecycle

1. User signs in and saves clock-in (and optional work details). API validates and writes one active session for user/date using conditional writes.
2. Send the clock-in Teams message immediately, with its own idempotency/delivery status and ambiguity handling. Avoid duplicating it on repeated form save.
3. When clock-out changes, increment `scheduleVersion`, update schedule, and ensure any previous invocation re-reads session state and exits if stale.
4. For clock-out before the next 00:30 fallback, the one-time schedule may send the final report at clock-out. The 00:30 job reconciles delivery; if already sent, it archives/clears active session; if eligible and missing, it processes/recoveries, then archives only after successful delivery.
5. At 00:30, no valid clock-in means stop and send nothing. If clock-out is empty, use the owner-confirmed configurable fallback clock-out. If clock-out is in the future after 00:30, preserve it and schedule a delivery check at clock-out + 10 minutes.
6. At post-00:30 clock-out + 10, re-read latest state. If final report is delivered, archive/clear; if not and eligible, process/send once, then archive/clear. Do not let an old event use stale field values.
7. Use one conditional execution lease for all relevant triggers so fallback and per-session events cannot concurrently send the same report.
8. Gemini input must be supplied/verified work content. Generation, validation, and Teams delivery each have separately recorded status. Failed/ambiguous delivery remains visible and recoverable.
9. After confirmed delivery, archive the final report metadata/content to history and clear/expire active fields only through allowed scheduler-driven logic. Keep active data for failures and ambiguous delivery. A recommended DynamoDB transaction conditional on session version and delivered state should perform archive + active-clear atomically.

Suggested but unconfirmed data design is documented in `detailed.md`: active key plus `LOG#...` history item in the per-user DynamoDB partition. Migration from current `SESSION#date` keys needs planning; do not replace/delete the table or existing records casually.

## 7. Teams report format

Use the owner's format, populated with data (not the sample's work claims):

```text
ELEPHANT

Clock in - {HH:mm}

Clock out - {HH:mm}

Total hours - {H} hrs {MM} mins

Current ticket - {ticket}

Email - {email status}

Blocker - {blocker or none}

Today's update - {Gemini-generated factual update, usually three paragraphs}
```

Calculate from timezone-aware timestamps, not isolated time strings. Example 14:12 to 23:20 is 9 hrs 08 mins. Sprint duration is independently calculated and only included if enabled, complete, and owner approves its location in the template. Never claim incomplete work is complete or send generated text from a failed/empty retrieval.

## 8. Permission errors already fixed in Terraform source

`terraform/bootstrap/main.tf` contains action-specific deploy-role updates based on the actual workflow errors. They cover the following observed AWS APIs (the precise statements and scopes are in source):

- S3 frontend bucket configuration reads; version list and object-version removal for confirmed destroy.
- CloudFront response-header/distribution/OAC/invalidation APIs.
- Cognito pool MFA/domain reads and pool/client/domain lifecycle.
- DynamoDB continuous-backup/PITR and table operations.
- EventBridge Scheduler schedule/group tagging and lifecycle.
- IAM role trust/inline policy inspection and lifecycle, including `ListInstanceProfilesForRole`; `PassRole` limited to application roles/services.
- Lambda function configuration/code-signing inspection, update and permission lifecycle.
- CloudWatch alarm tags and log groups.
- API Gateway HTTP API tagging/stages and API Gateway CloudWatch log delivery.
- Secrets Manager secret metadata/policy/value update within this app's prefix.
- S3 Lambda artifact upload/read and project deployment state object plus native lock object.

Some AWS actions do not support useful resource-level scope (for example CloudFront global APIs, `logs:DescribeLogGroups`, API Gateway log delivery/resource policies, and Cognito domain description), so limited `Resource="*"` statements exist. Do not react to a future AccessDenied by granting AdministratorAccess or broad wildcard resource permissions. Identify the API action and exact resource, update bootstrap code narrowly, then update the target account's deployment role via bootstrap.

## 9. Failure history and recovery notes

- Many early plan/apply attempts failed because Terraform's GitHub deployment role lacked AWS read/tag/create permissions during provider refresh and apply. Adding only the operation in the error fixed each class; state locking was not the cause.
- Lambda creation previously failed `S3 NoSuchKey`; build-and-upload now runs before plan/apply, checks objects, and uses artifact hashes. Confirm artifact bucket and object key if it recurs.
- CloudFront creation takes several minutes; this is normal and distinct from an authorization failure.
- API Gateway stage failed due missing tag or `logs:CreateLogDelivery`; policy now has the observed APIs.
- Most recent destroy log deleted many resources but failed deleting a nonempty versioned frontend bucket and deleting IAM roles because `iam:ListInstanceProfilesForRole` was missing. Terraform source/workflow fixes are present; current live account state must still be checked.
- A destroy error can leave a partial Terraform state and partial stack. Run a fresh plan and review it. Do not assume rerunning a stale plan is safe.
- Secret deletion has a recovery window. App destroy intentionally keeps bootstrap state/artifact buckets, OIDC provider and deployment role.

## 10. Verification and known limits

Prior checks on current Terraform and docs:

- `terraform fmt -check -recursive terraform` passed.
- Bootstrap and dev Terraform `validate` passed after init.
- Both workflow YAML files parsed.
- `git diff --check` passed.

These are syntax/config checks only. They do not verify live AWS permissions in every account, prove the current stack state, run end-to-end Cognito/API/DynamoDB/Scheduler/Gemini/Teams, or prove that Teams will deliver exactly once. The prior destroy's final AWS status was not inspected after failure. Automated tests should mock Gemini and Teams and must not post to the work channel.

## 11. Recommended next actions for the next agent

1. Read this file, `detailed.md`, `work-done.md`, Terraform docs, then inspect actual code/tests and current Git state.
2. Check the latest GitHub Actions run and establish AWS current state read-only. Verify the configured target account and whether destroy completed/partially completed. Never assume based on old logs.
3. Confirm with owner the fallback clock-out value and exact clock-in message, email/blocker behavior, and final template decisions. No credentials need to be requested.
4. Implement backend/domain tests first for clock-in notification state, clock-out scheduling, fallback rules, timezone boundaries, version races, leases, and archive/clear permissions.
5. Implement active/history schema/API/UI changes without losing existing records; design a safe compatibility/migration path for old `SESSION#date` items.
6. Add clock-in Teams delivery and compose report template; use mocks in tests; preserve ambiguous delivery guardrails.
7. Update Terraform IAM/function/schedule/table definitions only for the actual new implementation and least-privilege access. Validate Terraform and workflows.
8. Deploy to dev only after explicit authorization; review plan before apply, use an approved test channel for real external delivery, check CloudWatch, DynamoDB, Scheduler and DLQ.
9. Compare AWS behavior with Cloudflare; ask/receive explicit approval for cutover and separate Cloudflare cleanup.
10. Update `detailed.md`, `work-done.md`, and this file after each major implementation milestone, including what was actually tested and deployed.

## 12. Do not do these things

- Do not expose, print, commit, or ask the owner to paste API keys/webhook URLs.
- Do not search source/docs for a usable Gemini or Teams credential; use GitHub secrets/Secrets Manager.
- Do not scrape a shared ChatGPT URL using cookies, undocumented APIs, or access-control bypasses.
- Do not fabricate report text or call a report delivered when only Gemini succeeded.
- Do not clear active data when generation/delivery failed or is ambiguous.
- Do not assume deleting a Scheduler schedule cancels an already-running invocation.
- Do not add EC2/VPC/NAT or broad IAM access without a demonstrated requirement.
- Do not apply/destroy infrastructure, send real Teams messages, or remove Cloudflare resources without explicit current authorization.

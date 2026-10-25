# Office Work Update Automation

This repository is migrating a personal work-update application from Cloudflare to AWS. The existing Cloudflare Worker and D1 code remain in `worker/` for reference; the new AWS Lambda application is in `application/lambda/` and the static frontend is at the repository root.

## Current AWS application slice

- A Cognito Hosted UI sign-in flow protects the browser session; the API derives the user identity from the verified JWT.
- The static phone-friendly form saves the ChatGPT share URL, pasted transcript, work date, clock-in/out, and optional sprint times.
- Lambda validates full local date-times using the configured IANA timezone, stores one session per user and work date in DynamoDB, and creates or updates a clock-out schedule.
- A 00:30 EventBridge Scheduler invocation checks sessions from earlier work dates. A missing clock-out becomes midnight at the end of that date.
- Completed and safely failed DynamoDB sessions expire after 365 days. Active sessions and ambiguous Teams deliveries remain without TTL until resolved; TTL is cleanup only and never controls scheduling.
- The report processor uses the existing Gemini model/prompt intent and Teams webhook payload shape. It will not generate a report without pasted transcript text.
- Delivery outcome is persisted separately. An ambiguous Teams result is marked `DELIVERY_UNKNOWN` and is not automatically resent; the UI offers an explicit “confirm delivered” path or a warned retry that may duplicate.

The current `js/config.js` contains empty public configuration values for local development. The manual **Deploy application** workflow generates it from Terraform outputs, uploads the static files and Lambda packages, and copies integration secrets from GitHub Actions into Secrets Manager. Do not put secret values in `js/config.js`.

## Local domain tests

```sh
cd application/lambda
npm test
```

To build the Lambda ZIPs locally, install dependencies with `npm ci`, then archive `package.json`, `package-lock.json`, `node_modules/`, and `src/` into each configured artifact ZIP. The GitHub Actions Terraform workflow builds and uploads these ZIPs before planning.

## AWS deployment

The application stack is described by `terraform/environments/dev`. It is not deployed by local development or by this documentation. First run the manually dispatched **Terraform** workflow, review its plan, and choose `apply` to create the resources. Then run **Deploy application** to publish the Lambda code and frontend without applying infrastructure changes. Configure `GEMINI_API_KEY` and `TEAMS_WEBHOOK_URL` as GitHub Actions secrets in addition to the AWS/OIDC/state secrets documented in [`terraform/README.md`](terraform/README.md). The app workflow places these values directly into Secrets Manager; Terraform state and frontend assets contain no integration credentials.

The Cognito user pool is admin-created: an administrator must create the authorized user and deliver the initial sign-in details through a secure channel. Self-registration is disabled.

## Conversation retrieval limitation

The shared ChatGPT URL is stored only as a reference. The existing Worker merely fetched an HTML preview and did not extract the full conversation. The AWS version therefore asks the user to paste the transcript. It does not scrape private pages, use browser cookies, or invent report content if transcript text is missing.

## Reliability note

DynamoDB conditions and versioned schedules prevent stale and concurrent invocations from processing the same session. A Teams webhook cannot provide exactly-once semantics: if Teams accepts a message and the caller loses the response, the app records an ambiguous state and requires review rather than automatically sending a possible duplicate.

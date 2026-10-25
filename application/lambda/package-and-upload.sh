#!/usr/bin/env bash
set -euo pipefail

: "${TF_VAR_lambda_artifact_bucket_name:?TF_VAR_lambda_artifact_bucket_name must be set}"

npm ci --ignore-scripts
if [[ "${SKIP_LAMBDA_TESTS:-false}" != "true" ]]; then
  npm test
fi
node --check src/session.js
node --check src/processor.js
node --check ../../js/app.js
node --check ../../js/api.js

package_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/office-update-lambda"
mkdir -p "$package_dir"
find package.json package-lock.json src node_modules -exec touch -h -t 198001010000 {} +
zip -X -rq "$package_dir/session-api.zip" package.json package-lock.json node_modules src
cp "$package_dir/session-api.zip" "$package_dir/report-processor.zip"

session_hash="$(openssl dgst -sha256 -binary "$package_dir/session-api.zip" | openssl base64 -A)"
processor_hash="$(openssl dgst -sha256 -binary "$package_dir/report-processor.zip" | openssl base64 -A)"
if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "TF_VAR_lambda_artifact_hashes={\"session_api\":\"${session_hash}\",\"report_processor\":\"${processor_hash}\"}" >> "$GITHUB_ENV"
fi

aws s3 cp "$package_dir/session-api.zip" "s3://${TF_VAR_lambda_artifact_bucket_name}/dev/session-api.zip" --only-show-errors
aws s3 cp "$package_dir/report-processor.zip" "s3://${TF_VAR_lambda_artifact_bucket_name}/dev/report-processor.zip" --only-show-errors
aws s3api head-object --bucket "$TF_VAR_lambda_artifact_bucket_name" --key dev/session-api.zip >/dev/null
aws s3api head-object --bucket "$TF_VAR_lambda_artifact_bucket_name" --key dev/report-processor.zip >/dev/null

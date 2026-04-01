#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-k-faas}"
EXPORT_NAME="${2:-CholFrontendDistributionId}"
PATHS="${3:-/*}"

DISTRIBUTION_ID="$(
  aws cloudformation list-exports \
    --profile "$PROFILE" \
    --query "Exports[?Name=='${EXPORT_NAME}'].Value | [0]" \
    --output text
)"

if [[ -z "$DISTRIBUTION_ID" || "$DISTRIBUTION_ID" == "None" ]]; then
  echo "CloudFront distribution export not found: ${EXPORT_NAME}" >&2
  exit 1
fi

INVALIDATION_ID="$(
  aws cloudfront create-invalidation \
    --profile "$PROFILE" \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "$PATHS" \
    --query 'Invalidation.Id' \
    --output text
)"

echo "Created CloudFront invalidation ${INVALIDATION_ID} for distribution ${DISTRIBUTION_ID}"

aws cloudfront wait invalidation-completed \
  --profile "$PROFILE" \
  --distribution-id "$DISTRIBUTION_ID" \
  --id "$INVALIDATION_ID"

echo "CloudFront invalidation completed"

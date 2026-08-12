#!/usr/bin/env bash
set -euo pipefail

# Read-only readiness checks for the cost-constrained, single-node K3s track.
# This script never creates, changes, restores, or deletes AWS/Kubernetes state.

usage() {
  cat <<'EOF'
Usage:
  OPSFORGE_AWS_REGION=... \
  OPSFORGE_DR_REGION=... \
  OPSFORGE_INSTANCE_ID=i-... \
  OPSFORGE_BACKUP_BUCKET=... \
  OPSFORGE_BACKUP_KMS_KEY_ARN=arn:... \
  OPSFORGE_DR_BACKUP_BUCKET=... \
  OPSFORGE_DR_BACKUP_KMS_KEY_ARN=arn:... \
  OPSFORGE_DR_BACKUP_VAULT_ARN=arn:... \
  OPSFORGE_EXPECTED_AMI_ID=ami-... \
  OPSFORGE_EXPECTED_K3S_VERSION=v...+k3s... \
  OPSFORGE_EXPECTED_POSTGRES_IMAGE_REVISION=sha256:... \
  OPSFORGE_CLUSTER_CONTEXT=... \
  ./scripts/validate-single-node-readiness.sh

Required environment variables:
  OPSFORGE_AWS_REGION             Region containing the EC2/K3s node
  OPSFORGE_DR_REGION              Region receiving independent backup copies
  OPSFORGE_INSTANCE_ID            Exact EC2 instance ID to inspect
  OPSFORGE_BACKUP_BUCKET          S3 bucket containing logical/cluster backups
  OPSFORGE_BACKUP_KMS_KEY_ARN     Expected multi-Region primary recovery-key ARN
  OPSFORGE_DR_BACKUP_BUCKET       S3 bucket receiving replicated recovery objects
  OPSFORGE_DR_BACKUP_KMS_KEY_ARN  Expected multi-Region recovery-key replica ARN
  OPSFORGE_DR_BACKUP_VAULT_ARN    Destination AWS Backup vault ARN
  OPSFORGE_EXPECTED_AMI_ID        Exact approved AMI ID for the live node
  OPSFORGE_EXPECTED_K3S_VERSION   Exact approved K3s version for the live node
  OPSFORGE_EXPECTED_POSTGRES_IMAGE_REVISION Exact approved PostgreSQL image digest
  OPSFORGE_CLUSTER_CONTEXT        Exact kubectl context to inspect

Optional environment variables:
  OPSFORGE_AWS_PROFILE            AWS CLI profile
  OPSFORGE_ENVIRONMENT            staging (default) or production
  OPSFORGE_K3S_S3_PREFIX          k3s/etcd (default)
  OPSFORGE_K3S_TOKEN_S3_PREFIX    k3s/token (default)
  OPSFORGE_POSTGRES_S3_PREFIX     postgres/<environment> (default)
  OPSFORGE_K3S_MAX_AGE_HOURS      8 (default)
  OPSFORGE_K3S_TOKEN_MAX_AGE_HOURS 8 (default)
  OPSFORGE_POSTGRES_MAX_AGE_HOURS 8 (default)
  OPSFORGE_EBS_MAX_AGE_HOURS      25 (default)
  OPSFORGE_MIN_S3_RETENTION_DAYS  35 (default)
  OPSFORGE_MIN_DR_S3_RETENTION_DAYS 90 (default)
  OPSFORGE_REQUIRE_S3_REPLICATION true (default)
  OPSFORGE_STAGING_NAMESPACE      opsforge-staging (default)
  OPSFORGE_PRODUCTION_NAMESPACE   opsforge-production (default)

The check intentionally fails until backup artifacts and cross-Region EBS copy
jobs exist. Run it against staging first. It does not prove restorability; a
timed restore drill is still required.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

failures=0
warnings=0

pass() {
  printf 'PASS  %s\n' "$*"
}

warn() {
  warnings=$((warnings + 1))
  printf 'WARN  %s\n' "$*" >&2
}

fail() {
  failures=$((failures + 1))
  printf 'FAIL  %s\n' "$*" >&2
}

required_value() {
  local variable_name=$1
  if [[ -z "${!variable_name:-}" ]]; then
    fail "$variable_name is required"
  fi
}

for required_variable in \
  OPSFORGE_AWS_REGION \
  OPSFORGE_DR_REGION \
  OPSFORGE_INSTANCE_ID \
  OPSFORGE_BACKUP_BUCKET \
  OPSFORGE_BACKUP_KMS_KEY_ARN \
  OPSFORGE_DR_BACKUP_BUCKET \
  OPSFORGE_DR_BACKUP_KMS_KEY_ARN \
  OPSFORGE_DR_BACKUP_VAULT_ARN \
  OPSFORGE_EXPECTED_AMI_ID \
  OPSFORGE_EXPECTED_K3S_VERSION \
  OPSFORGE_EXPECTED_POSTGRES_IMAGE_REVISION \
  OPSFORGE_CLUSTER_CONTEXT; do
  required_value "$required_variable"
done

if (( failures > 0 )); then
  usage >&2
  exit 2
fi

: "${OPSFORGE_ENVIRONMENT:=staging}"
: "${OPSFORGE_K3S_S3_PREFIX:=k3s/etcd}"
: "${OPSFORGE_K3S_TOKEN_S3_PREFIX:=k3s/token}"
: "${OPSFORGE_POSTGRES_S3_PREFIX:=postgres/${OPSFORGE_ENVIRONMENT}}"
: "${OPSFORGE_K3S_MAX_AGE_HOURS:=8}"
: "${OPSFORGE_K3S_TOKEN_MAX_AGE_HOURS:=8}"
: "${OPSFORGE_POSTGRES_MAX_AGE_HOURS:=8}"
: "${OPSFORGE_EBS_MAX_AGE_HOURS:=25}"
: "${OPSFORGE_MIN_S3_RETENTION_DAYS:=35}"
: "${OPSFORGE_MIN_DR_S3_RETENTION_DAYS:=90}"
: "${OPSFORGE_REQUIRE_S3_REPLICATION:=true}"
: "${OPSFORGE_STAGING_NAMESPACE:=opsforge-staging}"
: "${OPSFORGE_PRODUCTION_NAMESPACE:=opsforge-production}"

case "$OPSFORGE_ENVIRONMENT" in
  staging|production) ;;
  *)
    printf 'OPSFORGE_ENVIRONMENT must be staging or production\n' >&2
    exit 2
    ;;
esac

case "$OPSFORGE_REQUIRE_S3_REPLICATION" in
  true|false) ;;
  *)
    printf 'OPSFORGE_REQUIRE_S3_REPLICATION must be true or false\n' >&2
    exit 2
    ;;
esac

if [[ "$OPSFORGE_AWS_REGION" == "$OPSFORGE_DR_REGION" ]]; then
  printf 'OPSFORGE_DR_REGION must differ from OPSFORGE_AWS_REGION\n' >&2
  exit 2
fi

if [[ ! "$OPSFORGE_INSTANCE_ID" =~ ^i-[0-9a-f]+$ ]]; then
  printf 'OPSFORGE_INSTANCE_ID is not a valid EC2 instance ID\n' >&2
  exit 2
fi

if [[ ! "$OPSFORGE_EXPECTED_AMI_ID" =~ ^ami-[0-9a-f]{8,17}$ ]]; then
  printf 'OPSFORGE_EXPECTED_AMI_ID is not a valid EC2 AMI ID\n' >&2
  exit 2
fi

if [[ ! "$OPSFORGE_EXPECTED_K3S_VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+\+k3s[0-9]+$ ]]; then
  printf 'OPSFORGE_EXPECTED_K3S_VERSION is not an exact K3s release\n' >&2
  exit 2
fi

if [[ ! "$OPSFORGE_EXPECTED_POSTGRES_IMAGE_REVISION" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  printf 'OPSFORGE_EXPECTED_POSTGRES_IMAGE_REVISION is not an exact image digest\n' >&2
  exit 2
fi

for numeric_value in \
  "$OPSFORGE_K3S_MAX_AGE_HOURS" \
  "$OPSFORGE_K3S_TOKEN_MAX_AGE_HOURS" \
  "$OPSFORGE_POSTGRES_MAX_AGE_HOURS" \
  "$OPSFORGE_EBS_MAX_AGE_HOURS" \
  "$OPSFORGE_MIN_S3_RETENTION_DAYS" \
  "$OPSFORGE_MIN_DR_S3_RETENTION_DAYS"; do
  if [[ ! "$numeric_value" =~ ^[1-9][0-9]*$ ]]; then
    printf 'Backup maximum ages must be positive whole hours\n' >&2
    exit 2
  fi
done

for required_command in aws kubectl python3; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    fail "$required_command is not installed"
  fi
done

if (( failures > 0 )); then
  exit 2
fi

aws_read() {
  if [[ -n "${OPSFORGE_AWS_PROFILE:-}" ]]; then
    aws --no-cli-pager --profile "$OPSFORGE_AWS_PROFILE" \
      --region "$OPSFORGE_AWS_REGION" "$@"
  else
    aws --no-cli-pager --region "$OPSFORGE_AWS_REGION" "$@"
  fi
}

aws_dr_read() {
  if [[ -n "${OPSFORGE_AWS_PROFILE:-}" ]]; then
    aws --no-cli-pager --profile "$OPSFORGE_AWS_PROFILE" \
      --region "$OPSFORGE_DR_REGION" "$@"
  else
    aws --no-cli-pager --region "$OPSFORGE_DR_REGION" "$@"
  fi
}

bucket_policy_has_required_denies() {
  local expected_key_arn=$1
  local expected_bucket_arn=$2
  OPSFORGE_EXPECTED_BUCKET_KEY_ARN="$expected_key_arn" \
    OPSFORGE_EXPECTED_BUCKET_ARN="$expected_bucket_arn" python3 -c '
import json
import os
import sys

try:
    document = json.load(sys.stdin)
except json.JSONDecodeError:
    raise SystemExit(1)

statements = {item.get("Sid"): item for item in document.get("Statement", [])}

def actions(statement):
    value = statement.get("Action", [])
    return {value} if isinstance(value, str) else set(value)

def resources(statement):
    value = statement.get("Resource", [])
    return {value} if isinstance(value, str) else set(value)

def public_principal(statement):
    return statement.get("Principal") in ("*", {"AWS": "*"})

transport = statements.get("DenyInsecureTransport", {})
without_kms = statements.get("DenyUploadsWithoutKMS", {})
wrong_key = statements.get("DenyUploadsWithWrongKMSKey", {})
expected_key = os.environ["OPSFORGE_EXPECTED_BUCKET_KEY_ARN"]
bucket = os.environ["OPSFORGE_EXPECTED_BUCKET_ARN"]
objects = bucket + "/*"
valid = (
    transport.get("Effect") == "Deny"
    and actions(transport) == {"s3:*"}
    and resources(transport) == {bucket, objects}
    and public_principal(transport)
    and transport.get("Condition") == {"Bool": {"aws:SecureTransport": "false"}}
    and without_kms.get("Effect") == "Deny"
    and actions(without_kms) == {"s3:PutObject"}
    and resources(without_kms) == {objects}
    and public_principal(without_kms)
    and without_kms.get("Condition") == {
        "StringNotEquals": {"s3:x-amz-server-side-encryption": "aws:kms"}
    }
    and wrong_key.get("Effect") == "Deny"
    and actions(wrong_key) == {"s3:PutObject"}
    and resources(wrong_key) == {objects}
    and public_principal(wrong_key)
    and wrong_key.get("Condition") == {
        "StringNotEquals": {
            "s3:x-amz-server-side-encryption-aws-kms-key-id": expected_key
        }
    }
)
raise SystemExit(0 if valid else 1)
'
}

lifecycle_has_required_retention() {
  local expected_rule_id=$1
  local minimum_days=$2
  OPSFORGE_EXPECTED_LIFECYCLE_RULE_ID="$expected_rule_id" \
    OPSFORGE_MINIMUM_RETENTION_DAYS="$minimum_days" python3 -c '
import json
import os
import sys

try:
    document = json.load(sys.stdin)
except json.JSONDecodeError:
    raise SystemExit(1)

expected_id = os.environ["OPSFORGE_EXPECTED_LIFECYCLE_RULE_ID"]
minimum = int(os.environ["OPSFORGE_MINIMUM_RETENTION_DAYS"])
enabled = [rule for rule in document.get("Rules", []) if rule.get("Status") == "Enabled"]
expected = [rule for rule in enabled if rule.get("ID") == expected_id]

def safe_expiration(rule):
    days = rule.get("Expiration", {}).get("Days")
    noncurrent_days = rule.get("NoncurrentVersionExpiration", {}).get("NoncurrentDays")
    return (
        isinstance(days, int)
        and days >= minimum
        and isinstance(noncurrent_days, int)
        and noncurrent_days >= minimum
    )

valid = (
    len(expected) == 1
    and expected[0].get("Filter", {}) == {}
    and safe_expiration(expected[0])
    and all(safe_expiration(rule) for rule in enabled)
)
raise SystemExit(0 if valid else 1)
'
}

hours_ago() {
  python3 - "$1" <<'PY'
from datetime import datetime, timedelta, timezone
import sys

print((datetime.now(timezone.utc) - timedelta(hours=int(sys.argv[1]))).isoformat())
PY
}

object_age_hours() {
  python3 - "$1" <<'PY'
from datetime import datetime, timezone
import sys

stamp = datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
print(int((datetime.now(timezone.utc) - stamp).total_seconds() // 3600))
PY
}

checksum_metadata_matches() {
  local checksum_b64=$1
  local checksum_type=$2
  local checksum_hex=$3
  local expected_checksum_b64

  [[ "$checksum_hex" =~ ^[0-9a-f]{64}$ ]] || return 1
  expected_checksum_b64=$(python3 - "$checksum_hex" <<'PY'
import base64
import sys

print(base64.b64encode(bytes.fromhex(sys.argv[1])).decode())
PY
)
  case "$checksum_type" in
    COMPOSITE)
      [[ "$checksum_b64" =~ ^[A-Za-z0-9+/]+={0,2}-[1-9][0-9]*$ ]]
      ;;
    FULL_OBJECT|None|"")
      [[ "$checksum_b64" == "$expected_checksum_b64" ]]
      ;;
    *)
      return 1
      ;;
  esac
}

latest_s3_object() {
  local prefix=$1
  local artifact_kind=$2
  local inventory

  inventory=$(aws_read s3api list-objects-v2 \
    --bucket "$OPSFORGE_BACKUP_BUCKET" \
    --prefix "$prefix" \
    --output json 2>/dev/null) || return 1

  OPSFORGE_ARTIFACT_KIND="$artifact_kind" python3 -c '
import json
import os
import sys

kind = os.environ["OPSFORGE_ARTIFACT_KIND"]
objects = json.load(sys.stdin).get("Contents", [])

def selected(key: str) -> bool:
    if kind == "etcd":
        return "/opsforge-recovery" in key and not key.endswith(".sha256")
    if kind == "token":
        return key.endswith("/server-token.kms")
    if kind == "postgres":
        return key.endswith(".dump")
    return False

matches = [item for item in objects if selected(item.get("Key", ""))]
if not matches:
    raise SystemExit(1)
latest = max(matches, key=lambda item: item["LastModified"])
print("{}\t{}\t{}".format(latest["Key"], latest["LastModified"], latest["Size"]))
' <<<"$inventory"
}

check_companion_object() {
  local label=$1
  local object_key=$2
  local expected_payload_checksum=${3:-}
  local expected_payload_name=${4:-}
  local metadata
  local size
  local encryption
  local key_id
  local checksum_b64
  local checksum_type
  local checksum_hex
  local replication
  local expected_checksum_b64
  local dr_metadata
  local dr_size
  local dr_key_id
  local dr_checksum_b64
  local dr_checksum_type
  local dr_checksum_hex
  local companion_content

  metadata=$(aws_read s3api head-object \
    --bucket "$OPSFORGE_BACKUP_BUCKET" \
    --key "$object_key" \
    --checksum-mode ENABLED \
    --query '[ContentLength,ServerSideEncryption,SSEKMSKeyId,ChecksumSHA256,ChecksumType,Metadata.sha256,ReplicationStatus]' \
    --output text 2>/dev/null) || {
      fail "$label is missing required companion object $object_key"
      return
    }

  IFS=$'\t' read -r size encryption key_id checksum_b64 checksum_type checksum_hex replication <<<"$metadata"
  if [[ "$size" =~ ^[1-9][0-9]*$ && "$encryption" == "aws:kms" && \
    "$key_id" == "$bucket_kms_key_id" ]] && \
    checksum_metadata_matches "$checksum_b64" "$checksum_type" "$checksum_hex"; then
    pass "$label companion is non-empty, checksum-verified, and KMS-encrypted"
  else
    fail "$label companion has invalid size, checksum, or encryption metadata: $object_key"
  fi

  if [[ -n "$expected_payload_checksum" || -n "$expected_payload_name" ]]; then
    if [[ "$size" =~ ^[1-9][0-9]*$ ]] && (( size <= 512 )); then
      companion_content=$(aws_read s3 cp \
        "s3://${OPSFORGE_BACKUP_BUCKET}/${object_key}" - \
        --only-show-errors 2>/dev/null || true)
      if [[ "$companion_content" == "$expected_payload_checksum  $expected_payload_name" ]]; then
        pass "$label checksum companion binds the artifact digest and filename"
      else
        fail "$label checksum companion does not match the artifact: $object_key"
      fi
    else
      fail "$label checksum companion has an invalid or excessive size: $object_key"
    fi
  fi

  if [[ "$OPSFORGE_REQUIRE_S3_REPLICATION" == "true" ]]; then
    if [[ "$replication" != "COMPLETED" ]]; then
      fail "$label companion replication is ${replication:-unknown}: $object_key"
      return
    fi
    if dr_metadata=$(aws_dr_read s3api head-object \
      --bucket "$OPSFORGE_DR_BACKUP_BUCKET" \
      --key "$object_key" \
      --checksum-mode ENABLED \
      --query '[ContentLength,SSEKMSKeyId,ChecksumSHA256,ChecksumType,Metadata.sha256]' \
      --output text 2>/dev/null); then
      IFS=$'\t' read -r dr_size dr_key_id dr_checksum_b64 dr_checksum_type dr_checksum_hex <<<"$dr_metadata"
      if [[ "$dr_size" == "$size" && \
        "$dr_key_id" == "$OPSFORGE_DR_BACKUP_KMS_KEY_ARN" && \
        "$dr_checksum_b64" == "$checksum_b64" && \
        "$dr_checksum_type" == "$checksum_type" && \
        "$dr_checksum_hex" == "$checksum_hex" ]]; then
        pass "$label companion has a checksum-identical DR replica"
      else
        fail "$label companion DR replica does not match: $object_key"
      fi
    else
      fail "$label companion is missing from the DR bucket: $object_key"
    fi
  fi
}

check_s3_object() {
  local label=$1
  local prefix=$2
  local maximum_age=$3
  local artifact_kind=$4
  local object_info
  local object_key
  local modified_at
  local object_size
  local age
  local encryption
  local key_id
  local checksum_b64
  local checksum_type
  local checksum_hex
  local replication
  local dr_metadata
  local dr_size
  local dr_key_id
  local dr_checksum_b64
  local dr_checksum_type
  local dr_checksum_hex
  local bundle_id

  if ! object_info=$(latest_s3_object "$prefix" "$artifact_kind"); then
    fail "$label has no matching primary artifact under s3://$OPSFORGE_BACKUP_BUCKET/$prefix"
    return
  fi

  IFS=$'\t' read -r object_key modified_at object_size <<<"$object_info"
  if [[ -z "$object_key" || "$object_key" == "None" ]]; then
    fail "$label has no S3 object under prefix $prefix"
    return
  fi
  bundle_id=$(basename "${object_key%/*}")
  case "$artifact_kind" in
    etcd) latest_etcd_bundle_id=$bundle_id ;;
    token) latest_token_bundle_id=$bundle_id ;;
  esac
  if [[ ! "$object_size" =~ ^[1-9][0-9]*$ ]]; then
    fail "$label latest object is empty: $object_key"
  else
    pass "$label latest object is non-empty ($object_size bytes)"
  fi

  if [[ -n "$maximum_age" ]]; then
    if age=$(object_age_hours "$modified_at" 2>/dev/null); then
      if (( age <= maximum_age )); then
        pass "$label is fresh (${age}h old; maximum ${maximum_age}h)"
      else
        fail "$label is stale (${age}h old; maximum ${maximum_age}h)"
      fi
    else
      fail "$label timestamp could not be parsed"
    fi
  fi

  local head_metadata
  if ! head_metadata=$(aws_read s3api head-object \
    --bucket "$OPSFORGE_BACKUP_BUCKET" \
    --key "$object_key" \
    --checksum-mode ENABLED \
    --query '[ServerSideEncryption,SSEKMSKeyId,ChecksumSHA256,ChecksumType,Metadata.sha256]' \
    --output text 2>/dev/null); then
    fail "$label object metadata could not be read"
    return
  fi
  IFS=$'\t' read -r encryption key_id checksum_b64 checksum_type checksum_hex <<<"$head_metadata"
  if [[ "$encryption" == "aws:kms" && "$key_id" == "$bucket_kms_key_id" ]]; then
    pass "$label object uses the configured backup KMS key"
  else
    fail "$label object does not use the configured backup KMS key"
  fi

  if checksum_metadata_matches "$checksum_b64" "$checksum_type" "$checksum_hex"; then
    pass "$label S3 checksum metadata is valid for its checksum type"
  else
    fail "$label is missing a verifiable SHA-256 checksum"
  fi

  case "$artifact_kind" in
    token)
      latest_token_object_key=$object_key
      latest_token_checksum_hex=$checksum_hex
      ;;
    postgres)
      latest_postgres_object_key=$object_key
      latest_postgres_checksum_hex=$checksum_hex
      latest_postgres_size=$object_size
      ;;
  esac

  local object_directory=${object_key%/*}
  case "$artifact_kind" in
    etcd)
      check_companion_object "$label" "$object_directory/etcd-snapshot.sha256" \
        "$checksum_hex" "$(basename "$object_key")"
      ;;
    token)
      check_companion_object "$label" "$object_directory/server-token.kms.sha256" \
        "$checksum_hex" "server-token.kms"
      check_companion_object "$label" "$object_directory/server-token.manifest.json"
      ;;
    postgres)
      local dump_stem=${object_key%.dump}
      check_companion_object "$label" "$dump_stem.sha256" \
        "$checksum_hex" "$(basename "$object_key")"
      check_companion_object "$label" "$dump_stem.manifest.json"
      ;;
  esac

  if [[ "$OPSFORGE_REQUIRE_S3_REPLICATION" == "true" ]]; then
    replication=$(aws_read s3api head-object \
      --bucket "$OPSFORGE_BACKUP_BUCKET" \
      --key "$object_key" \
      --query 'ReplicationStatus' --output text 2>/dev/null || true)
    if [[ "$replication" == "COMPLETED" ]]; then
      pass "$label object has completed S3 replication"
    else
      fail "$label object replication is ${replication:-unknown}, not COMPLETED"
    fi

    if dr_metadata=$(aws_dr_read s3api head-object \
      --bucket "$OPSFORGE_DR_BACKUP_BUCKET" \
      --key "$object_key" \
      --checksum-mode ENABLED \
      --query '[ContentLength,SSEKMSKeyId,ChecksumSHA256,ChecksumType,Metadata.sha256]' \
      --output text 2>/dev/null); then
      IFS=$'\t' read -r dr_size dr_key_id dr_checksum_b64 dr_checksum_type dr_checksum_hex <<<"$dr_metadata"
      if [[ "$dr_size" == "$object_size" && \
        "$dr_key_id" == "$OPSFORGE_DR_BACKUP_KMS_KEY_ARN" && \
        "$dr_checksum_b64" == "$checksum_b64" && \
        "$dr_checksum_type" == "$checksum_type" && \
        "$dr_checksum_hex" == "$checksum_hex" ]]; then
        pass "$label has a checksum-identical, DR-key-encrypted replica"
      else
        fail "$label destination object size, checksum, or KMS key does not match"
      fi
    else
      fail "$label destination object is not readable from the DR bucket"
    fi
  fi
}

printf 'Single-node K3s readiness (read-only)\n'
printf 'Environment: %s\n\n' "$OPSFORGE_ENVIRONMENT"

identity_record=$(aws_read sts get-caller-identity \
  --query '[Account,Arn]' --output text 2>/dev/null || true)
if [[ -z "$identity_record" ]]; then
  fail "AWS caller identity could not be read"
  aws_account=""
  aws_partition="aws"
else
  IFS=$'\t' read -r aws_account caller_arn <<<"$identity_record"
  arn_without_prefix=${caller_arn#arn:}
  aws_partition=${arn_without_prefix%%:*}
  pass "AWS caller identity is available for account $aws_account"
fi

bucket_region=$(aws_read s3api get-bucket-location \
  --bucket "$OPSFORGE_BACKUP_BUCKET" \
  --query 'LocationConstraint' --output text 2>/dev/null || true)
if [[ "$bucket_region" == "None" ]]; then
  bucket_region="us-east-1"
fi
if [[ "$bucket_region" == "$OPSFORGE_AWS_REGION" ]]; then
  pass "backup bucket is in the workload Region"
else
  fail "backup bucket Region is ${bucket_region:-unknown}, expected $OPSFORGE_AWS_REGION"
fi

bucket_versioning=$(aws_read s3api get-bucket-versioning \
  --bucket "$OPSFORGE_BACKUP_BUCKET" \
  --query 'Status' --output text 2>/dev/null || true)
if [[ "$bucket_versioning" == "Enabled" ]]; then
  pass "backup bucket versioning is enabled"
else
  fail "backup bucket versioning is not enabled"
fi

primary_lifecycle=$(aws_read s3api get-bucket-lifecycle-configuration \
  --bucket "$OPSFORGE_BACKUP_BUCKET" --output json 2>/dev/null || true)
if lifecycle_has_required_retention "expire-recovery-objects" \
  "$OPSFORGE_MIN_S3_RETENTION_DAYS" <<<"$primary_lifecycle"; then
  pass "backup bucket retention is at least ${OPSFORGE_MIN_S3_RETENTION_DAYS} days"
else
  fail "backup bucket lifecycle has a missing, scoped, or shorter expiration rule"
fi

object_lock=$(aws_read s3api get-object-lock-configuration \
  --bucket "$OPSFORGE_BACKUP_BUCKET" \
  --query 'ObjectLockConfiguration.ObjectLockEnabled' \
  --output text 2>/dev/null || true)
if [[ "$object_lock" == "Enabled" ]]; then
  pass "backup bucket Object Lock is enabled"
else
  warn "backup bucket Object Lock is not enabled; document the accepted deletion risk"
fi

bucket_encryption_record=$(aws_read s3api get-bucket-encryption \
  --bucket "$OPSFORGE_BACKUP_BUCKET" \
  --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.[SSEAlgorithm,KMSMasterKeyID]' \
  --output text 2>/dev/null || true)
IFS=$'\t' read -r bucket_encryption bucket_kms_key_id <<<"$bucket_encryption_record"
if [[ "$bucket_encryption" == "aws:kms" && \
  "$bucket_kms_key_id" == "$OPSFORGE_BACKUP_KMS_KEY_ARN" ]]; then
  pass "backup bucket defaults to the expected KMS key"
else
  fail "backup bucket does not default to the expected KMS key"
fi

primary_key_record=$(aws_read kms describe-key \
  --key-id "$OPSFORGE_BACKUP_KMS_KEY_ARN" \
  --query 'KeyMetadata.[Arn,KeyState,MultiRegion,MultiRegionConfiguration.MultiRegionKeyType]' \
  --output text 2>/dev/null || true)
IFS=$'\t' read -r primary_key_arn primary_key_state primary_key_multi_region primary_key_type \
  <<<"$primary_key_record"
if [[ "$primary_key_arn" == "$OPSFORGE_BACKUP_KMS_KEY_ARN" && \
  "$primary_key_state" == "Enabled" && \
  "$primary_key_multi_region" == "True" && \
  "$primary_key_type" == "PRIMARY" ]]; then
  pass "primary recovery KMS key is an enabled multi-Region primary"
else
  fail "primary recovery KMS key is not the expected enabled multi-Region primary"
fi

dr_key_record=$(aws_dr_read kms describe-key \
  --key-id "$OPSFORGE_DR_BACKUP_KMS_KEY_ARN" \
  --query 'KeyMetadata.[Arn,KeyState,MultiRegion,MultiRegionConfiguration.MultiRegionKeyType]' \
  --output text 2>/dev/null || true)
IFS=$'\t' read -r dr_key_arn dr_key_state dr_key_multi_region dr_key_type \
  <<<"$dr_key_record"
if [[ "$dr_key_arn" == "$OPSFORGE_DR_BACKUP_KMS_KEY_ARN" && \
  "$dr_key_state" == "Enabled" && \
  "$dr_key_multi_region" == "True" && \
  "$dr_key_type" == "REPLICA" && \
  "${dr_key_arn##*/}" == "${primary_key_arn##*/}" ]]; then
  pass "DR recovery KMS key is the enabled replica of the primary key"
else
  fail "DR recovery KMS key is not the expected enabled multi-Region replica"
fi

public_access=$(aws_read s3api get-public-access-block \
  --bucket "$OPSFORGE_BACKUP_BUCKET" \
  --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' \
  --output text 2>/dev/null || true)
if [[ "$public_access" == $'True\tTrue\tTrue\tTrue' ]]; then
  pass "backup bucket blocks all public access paths"
else
  fail "backup bucket does not report all four public-access blocks"
fi

primary_bucket_policy=$(aws_read s3api get-bucket-policy \
  --bucket "$OPSFORGE_BACKUP_BUCKET" --query Policy --output text 2>/dev/null || true)
if bucket_policy_has_required_denies "$OPSFORGE_BACKUP_KMS_KEY_ARN" \
  "arn:${aws_partition}:s3:::${OPSFORGE_BACKUP_BUCKET}" \
  <<<"$primary_bucket_policy"; then
  pass "backup bucket policy denies insecure and incorrectly encrypted writes"
else
  fail "backup bucket policy lacks the required transport/KMS deny controls"
fi

dr_bucket_region=$(aws_dr_read s3api get-bucket-location \
  --bucket "$OPSFORGE_DR_BACKUP_BUCKET" \
  --query LocationConstraint --output text 2>/dev/null || true)
if [[ "$dr_bucket_region" == "None" ]]; then
  dr_bucket_region="us-east-1"
fi
if [[ "$dr_bucket_region" == "$OPSFORGE_DR_REGION" ]]; then
  pass "DR backup bucket is in the recovery Region"
else
  fail "DR backup bucket Region is ${dr_bucket_region:-unknown}, expected $OPSFORGE_DR_REGION"
fi

dr_bucket_versioning=$(aws_dr_read s3api get-bucket-versioning \
  --bucket "$OPSFORGE_DR_BACKUP_BUCKET" \
  --query Status --output text 2>/dev/null || true)
if [[ "$dr_bucket_versioning" == "Enabled" ]]; then
  pass "DR backup bucket versioning is enabled"
else
  fail "DR backup bucket versioning is not enabled"
fi

dr_lifecycle=$(aws_dr_read s3api get-bucket-lifecycle-configuration \
  --bucket "$OPSFORGE_DR_BACKUP_BUCKET" --output json 2>/dev/null || true)
if lifecycle_has_required_retention "expire-cross-region-recovery-objects" \
  "$OPSFORGE_MIN_DR_S3_RETENTION_DAYS" <<<"$dr_lifecycle"; then
  pass "DR backup bucket retention is at least ${OPSFORGE_MIN_DR_S3_RETENTION_DAYS} days"
else
  fail "DR bucket lifecycle has a missing, scoped, or shorter expiration rule"
fi

dr_bucket_encryption_record=$(aws_dr_read s3api get-bucket-encryption \
  --bucket "$OPSFORGE_DR_BACKUP_BUCKET" \
  --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.[SSEAlgorithm,KMSMasterKeyID]' \
  --output text 2>/dev/null || true)
IFS=$'\t' read -r dr_bucket_encryption dr_bucket_kms_key_id <<<"$dr_bucket_encryption_record"
if [[ "$dr_bucket_encryption" == "aws:kms" && \
  "$dr_bucket_kms_key_id" == "$OPSFORGE_DR_BACKUP_KMS_KEY_ARN" ]]; then
  pass "DR backup bucket defaults to the expected KMS replica"
else
  fail "DR backup bucket does not default to the expected KMS replica"
fi

dr_public_access=$(aws_dr_read s3api get-public-access-block \
  --bucket "$OPSFORGE_DR_BACKUP_BUCKET" \
  --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' \
  --output text 2>/dev/null || true)
if [[ "$dr_public_access" == $'True\tTrue\tTrue\tTrue' ]]; then
  pass "DR backup bucket blocks all public access paths"
else
  fail "DR backup bucket does not report all four public-access blocks"
fi

dr_bucket_policy=$(aws_dr_read s3api get-bucket-policy \
  --bucket "$OPSFORGE_DR_BACKUP_BUCKET" --query Policy --output text 2>/dev/null || true)
if bucket_policy_has_required_denies "$OPSFORGE_DR_BACKUP_KMS_KEY_ARN" \
  "arn:${aws_partition}:s3:::${OPSFORGE_DR_BACKUP_BUCKET}" \
  <<<"$dr_bucket_policy"; then
  pass "DR bucket policy denies insecure and incorrectly encrypted writes"
else
  fail "DR bucket policy lacks the required transport/KMS deny controls"
fi

latest_etcd_bundle_id=""
latest_token_bundle_id=""
latest_token_object_key=""
latest_token_checksum_hex=""
latest_postgres_object_key=""
latest_postgres_checksum_hex=""
latest_postgres_size=""
check_s3_object "K3s embedded-etcd snapshot" \
  "$OPSFORGE_K3S_S3_PREFIX" "$OPSFORGE_K3S_MAX_AGE_HOURS" etcd
check_s3_object "K3s server-token backup" \
  "$OPSFORGE_K3S_TOKEN_S3_PREFIX" "$OPSFORGE_K3S_TOKEN_MAX_AGE_HOURS" token
check_s3_object "PostgreSQL logical backup" \
  "$OPSFORGE_POSTGRES_S3_PREFIX" "$OPSFORGE_POSTGRES_MAX_AGE_HOURS" postgres

if [[ -n "$latest_etcd_bundle_id" && \
  "$latest_etcd_bundle_id" == "$latest_token_bundle_id" ]]; then
  pass "latest K3s snapshot and server token belong to the same recovery bundle"
else
  fail "latest K3s snapshot and server token do not share a recovery-bundle timestamp"
fi

if [[ -n "$latest_token_object_key" ]]; then
  token_manifest_key="${latest_token_object_key%/*}/server-token.manifest.json"
  token_manifest=$(aws_read s3 cp \
    "s3://${OPSFORGE_BACKUP_BUCKET}/${token_manifest_key}" - \
    --only-show-errors 2>/dev/null || true)
  if OPSFORGE_TOKEN_BUNDLE_ID="$latest_token_bundle_id" \
    OPSFORGE_TOKEN_CHECKSUM="$latest_token_checksum_hex" \
    OPSFORGE_TOKEN_KMS_KEY_ARN="$OPSFORGE_BACKUP_KMS_KEY_ARN" \
    python3 -c '
import json
import os
import sys

try:
    document = json.load(sys.stdin)
except json.JSONDecodeError:
    raise SystemExit(1)
valid = (
    document.get("schema") == 1
    and document.get("created_at") == os.environ["OPSFORGE_TOKEN_BUNDLE_ID"]
    and document.get("ciphertext") == "server-token.kms"
    and document.get("sha256") == os.environ["OPSFORGE_TOKEN_CHECKSUM"]
    and document.get("kms_key_arn") == os.environ["OPSFORGE_TOKEN_KMS_KEY_ARN"]
    and document.get("encryption_context") == "purpose=opsforge-k3s-server-token"
)
raise SystemExit(0 if valid else 1)
' <<<"$token_manifest"; then
    pass "K3s token manifest binds the matching bundle, checksum, key, and context"
  else
    fail "K3s token manifest content is missing or invalid"
  fi
fi

if [[ -n "$latest_postgres_object_key" ]]; then
  postgres_bundle_id=$(basename "${latest_postgres_object_key%/*}")
  postgres_manifest_key="${latest_postgres_object_key%.dump}.manifest.json"
  postgres_manifest=$(aws_read s3 cp \
    "s3://${OPSFORGE_BACKUP_BUCKET}/${postgres_manifest_key}" - \
    --only-show-errors 2>/dev/null || true)
  if OPSFORGE_PG_BUNDLE_ID="$postgres_bundle_id" \
    OPSFORGE_PG_CHECKSUM="$latest_postgres_checksum_hex" \
    OPSFORGE_PG_ENVIRONMENT="$OPSFORGE_ENVIRONMENT" \
    OPSFORGE_PG_IMAGE_REVISION="$OPSFORGE_EXPECTED_POSTGRES_IMAGE_REVISION" \
    OPSFORGE_PG_SIZE="$latest_postgres_size" \
    python3 -c '
import json
import os
import re
import sys

try:
    document = json.load(sys.stdin)
except json.JSONDecodeError:
    raise SystemExit(1)
created_at = os.environ["OPSFORGE_PG_BUNDLE_ID"].removeprefix("opsforge-")
valid = (
    document.get("schema") == 1
    and document.get("environment") == os.environ["OPSFORGE_PG_ENVIRONMENT"]
    and isinstance(document.get("database"), str)
    and bool(document.get("database"))
    and document.get("created_at") == created_at
    and document.get("format") == "postgres-custom"
    and isinstance(document.get("postgres_version"), str)
    and bool(document.get("postgres_version"))
    and bool(re.fullmatch(r"sha256:[0-9a-f]{64}", document.get("image_revision", "")))
    and document.get("image_revision") == os.environ["OPSFORGE_PG_IMAGE_REVISION"]
    and document.get("size_bytes") == int(os.environ["OPSFORGE_PG_SIZE"])
    and document.get("sha256") == os.environ["OPSFORGE_PG_CHECKSUM"]
)
raise SystemExit(0 if valid else 1)
' <<<"$postgres_manifest"; then
    pass "PostgreSQL manifest binds the latest dump to its environment, image, size, and checksum"
  else
    fail "PostgreSQL backup manifest content is missing or invalid"
  fi
fi

instance_record=$(aws_read ec2 describe-instances \
  --instance-ids "$OPSFORGE_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].[State.Name,Placement.AvailabilityZone,MetadataOptions.HttpTokens,MetadataOptions.HttpPutResponseHopLimit,RootDeviceName,IamInstanceProfile.Arn,ImageId]' \
  --output text 2>/dev/null || true)
if [[ -z "$instance_record" || "$instance_record" == "None" ]]; then
  fail "EC2 instance could not be read"
  instance_az=""
  root_device=""
else
  IFS=$'\t' read -r instance_state instance_az metadata_tokens metadata_hop_limit root_device instance_profile image_id <<<"$instance_record"
  if [[ "$instance_state" == "running" ]]; then
    pass "EC2 instance is running"
  else
    fail "EC2 instance state is $instance_state"
  fi
  if [[ "$metadata_tokens" == "required" ]]; then
    pass "EC2 requires IMDSv2 tokens"
  else
    fail "EC2 does not require IMDSv2 tokens"
  fi
  if [[ "$metadata_hop_limit" == "2" ]]; then
    pass "EC2 metadata hop limit supports the scoped ESO credential path"
  else
    fail "EC2 metadata hop limit is ${metadata_hop_limit:-unknown}, expected 2"
  fi
  if [[ -n "$instance_profile" && "$instance_profile" != "None" ]]; then
    pass "EC2 has an instance profile (permissions still require policy review)"
  else
    fail "EC2 has no instance profile for host-level backup access"
  fi
  if [[ "$image_id" == "$OPSFORGE_EXPECTED_AMI_ID" ]]; then
    pass "EC2 uses the exact approved AMI"
  else
    fail "EC2 AMI is ${image_id:-unknown}, expected $OPSFORGE_EXPECTED_AMI_ID"
  fi
fi

block_devices=$(aws_read ec2 describe-instances \
  --instance-ids "$OPSFORGE_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[].[DeviceName,Ebs.VolumeId,Ebs.DeleteOnTermination]' \
  --output text 2>/dev/null || true)
data_volume_count=0
data_volume_ids=""
expected_data_volume_id=""
while IFS=$'\t' read -r device_name volume_id delete_on_termination; do
  [[ -n "$volume_id" ]] || continue
  if [[ "$device_name" != "$root_device" ]]; then
    # JMESPath backticks are literals and must not be expanded by the shell.
    # shellcheck disable=SC2016
    purpose=$(aws_read ec2 describe-volumes --volume-ids "$volume_id" \
      --query 'Volumes[0].Tags[?Key==`Purpose`]|[0].Value' --output text 2>/dev/null || true)
    if [[ "$purpose" != "k3s-data-and-local-path-pvcs" ]]; then
      warn "ignoring unrelated non-root volume $volume_id"
      continue
    fi
    data_volume_count=$((data_volume_count + 1))
    data_volume_ids="$data_volume_ids $volume_id"
    expected_data_volume_id="$volume_id"
    if [[ "$delete_on_termination" == "False" ]]; then
      pass "data volume $volume_id is retained on instance termination"
    else
      fail "data volume $volume_id has DeleteOnTermination enabled"
    fi
  fi
done <<<"$block_devices"

if (( data_volume_count == 1 )); then
  pass "EC2 has exactly one tagged retained K3s data volume"
else
  fail "expected exactly one tagged K3s data volume, found $data_volume_count"
fi

termination_protection=$(aws_read ec2 describe-instance-attribute \
  --instance-id "$OPSFORGE_INSTANCE_ID" \
  --attribute disableApiTermination \
  --query 'DisableApiTermination.Value' --output text 2>/dev/null || true)
if [[ "$termination_protection" == "True" ]]; then
  pass "EC2 API termination protection is enabled"
else
  fail "EC2 API termination protection is not enabled"
fi

for volume_id in $data_volume_ids; do
  volume_record=$(aws_read ec2 describe-volumes \
    --volume-ids "$volume_id" \
    --query 'Volumes[0].[AvailabilityZone,Encrypted,State]' \
    --output text 2>/dev/null || true)
  IFS=$'\t' read -r volume_az volume_encrypted volume_state <<<"$volume_record"
  if [[ "$volume_az" == "$instance_az" ]]; then
    pass "data volume $volume_id is in the instance AZ ($instance_az)"
  else
    fail "data volume $volume_id is in ${volume_az:-unknown}, not $instance_az"
  fi
  if [[ "$volume_encrypted" == "True" ]]; then
    pass "data volume $volume_id is encrypted"
  else
    fail "data volume $volume_id is not encrypted"
  fi
  if [[ "$volume_state" == "in-use" ]]; then
    pass "data volume $volume_id is attached"
  else
    fail "data volume $volume_id state is ${volume_state:-unknown}"
  fi

  if [[ -n "$aws_account" ]]; then
    volume_arn="arn:${aws_partition}:ec2:${OPSFORGE_AWS_REGION}:${aws_account}:volume/${volume_id}"
    ebs_cutoff=$(hours_ago "$OPSFORGE_EBS_MAX_AGE_HOURS")
    backup_jobs=$(aws_read backup list-backup-jobs \
      --by-resource-arn "$volume_arn" \
      --by-state COMPLETED \
      --by-created-after "$ebs_cutoff" \
      --query 'length(BackupJobs)' --output text 2>/dev/null || true)
    if [[ "$backup_jobs" =~ ^[1-9][0-9]*$ ]]; then
      pass "data volume $volume_id has a recent completed AWS Backup job"
    else
      fail "data volume $volume_id has no completed AWS Backup job in the last ${OPSFORGE_EBS_MAX_AGE_HOURS}h"
    fi

    copy_jobs=$(aws_read backup list-copy-jobs \
      --by-resource-arn "$volume_arn" \
      --by-state COMPLETED \
      --by-created-after "$ebs_cutoff" \
      --by-destination-vault-arn "$OPSFORGE_DR_BACKUP_VAULT_ARN" \
      --query 'length(CopyJobs)' --output text 2>/dev/null || true)
    if [[ "$copy_jobs" =~ ^[1-9][0-9]*$ ]]; then
      pass "data volume $volume_id has a recent completed cross-Region copy"
    else
      fail "data volume $volume_id has no recent completed copy to the DR vault"
    fi
  fi
done

if [[ "$OPSFORGE_DR_BACKUP_VAULT_ARN" == *":${OPSFORGE_DR_REGION}:"* ]]; then
  pass "destination backup vault ARN is in $OPSFORGE_DR_REGION"
else
  fail "destination backup vault ARN is not in $OPSFORGE_DR_REGION"
fi

dr_vault_name=${OPSFORGE_DR_BACKUP_VAULT_ARN##*:}
dr_vault_record=$(aws_dr_read backup describe-backup-vault \
  --backup-vault-name "$dr_vault_name" \
  --query '[BackupVaultArn,EncryptionKeyArn,Locked]' \
  --output text 2>/dev/null || true)
if [[ -z "$dr_vault_record" ]]; then
  fail "destination backup vault could not be read in $OPSFORGE_DR_REGION"
else
  IFS=$'\t' read -r observed_vault_arn vault_key_arn vault_locked <<<"$dr_vault_record"
  if [[ "$observed_vault_arn" == "$OPSFORGE_DR_BACKUP_VAULT_ARN" ]]; then
    pass "destination backup vault exists at the expected ARN"
  else
    fail "destination backup vault ARN or state does not match"
  fi
  if [[ "$vault_key_arn" == "$OPSFORGE_DR_BACKUP_KMS_KEY_ARN" && \
    "$dr_key_state" == "Enabled" ]]; then
    pass "destination backup vault uses the exact enabled DR recovery key"
  else
    fail "destination backup vault does not use the exact enabled DR recovery key"
  fi
  if [[ "$vault_locked" == "True" ]]; then
    pass "destination backup vault lock is enabled"
  else
    warn "destination backup vault lock is not enabled; document the accepted deletion risk"
  fi
fi

current_context=$(kubectl config current-context 2>/dev/null || true)
if [[ "$current_context" == "$OPSFORGE_CLUSTER_CONTEXT" ]]; then
  pass "kubectl context matches the explicitly selected cluster"
else
  fail "kubectl context is ${current_context:-unset}, expected $OPSFORGE_CLUSTER_CONTEXT"
fi

node_records=$(kubectl --context "$OPSFORGE_CLUSTER_CONTEXT" get nodes \
  --no-headers 2>/dev/null || true)
node_count=$(printf '%s\n' "$node_records" | awk 'NF {count++} END {print count+0}')
ready_node_count=$(printf '%s\n' "$node_records" | \
  awk '$2 ~ /^Ready/ {count++} END {print count+0}')
if [[ "$node_count" == "1" && "$ready_node_count" == "1" ]]; then
  pass "exactly one Kubernetes node is Ready (explicitly non-HA)"
else
  fail "expected one Ready node; found $ready_node_count Ready of $node_count total"
fi

node_storage_record=$(kubectl --context "$OPSFORGE_CLUSTER_CONTEXT" get nodes \
  --output json 2>/dev/null | python3 -c '
import json
import sys

items = json.load(sys.stdin).get("items", [])
annotations = items[0].get("metadata", {}).get("annotations", {}) if len(items) == 1 else {}
print("{}\t{}\t{}".format(
    annotations.get("opsforge.io/k3s-data-volume-id", ""),
    annotations.get("opsforge.io/k3s-data-mount", ""),
    annotations.get("opsforge.io/k3s-data-boot-id", ""),
))
' || true)
IFS=$'\t' read -r annotated_volume_id annotated_mount annotated_boot_id <<<"$node_storage_record"
live_node_info=$(kubectl --context "$OPSFORGE_CLUSTER_CONTEXT" get nodes \
  --output jsonpath='{.items[0].status.nodeInfo.kubeletVersion}{"\t"}{.items[0].status.nodeInfo.bootID}' \
  2>/dev/null || true)
IFS=$'\t' read -r live_k3s_version live_boot_id <<<"$live_node_info"
if [[ -n "$expected_data_volume_id" && \
  "$annotated_volume_id" == "$expected_data_volume_id" && \
  "$annotated_mount" == "/var/lib/rancher/k3s" && \
  -n "$live_boot_id" && "$annotated_boot_id" == "$live_boot_id" ]]; then
  pass "current node boot attests the expected retained EBS volume and K3s mount"
else
  fail "current node boot does not attest the expected retained EBS volume/mount"
fi

if [[ "$node_count" == "1" && "$live_k3s_version" == "$OPSFORGE_EXPECTED_K3S_VERSION" ]]; then
  pass "Ready node runs the exact approved K3s version"
else
  fail "live K3s version is ${live_k3s_version:-unknown}, expected $OPSFORGE_EXPECTED_K3S_VERSION"
fi

if kubectl --context "$OPSFORGE_CLUSTER_CONTEXT" get namespace \
  "$OPSFORGE_STAGING_NAMESPACE" >/dev/null 2>&1; then
  pass "staging namespace exists"
else
  fail "staging namespace $OPSFORGE_STAGING_NAMESPACE does not exist"
fi

argocd_inventory=$(kubectl --context "$OPSFORGE_CLUSTER_CONTEXT" --namespace argocd \
  get applications.argoproj.io,applicationsets.argoproj.io --output json 2>/dev/null || true)
argocd_readiness=$(OPSFORGE_VALIDATED_ENVIRONMENT="$OPSFORGE_ENVIRONMENT" python3 -c '
import json
import os
import sys

try:
    items = json.load(sys.stdin).get("items", [])
except json.JSONDecodeError:
    raise SystemExit(2)

apps = [item for item in items if item.get("kind") == "Application"]
sets = [item for item in items if item.get("kind") == "ApplicationSet"]
unhealthy = []
production = []
set_errors = []
for item in items:
    metadata = item.get("metadata", {})
    name = metadata.get("name", "")
    environment = metadata.get("labels", {}).get("opsforge.io/environment", "")
    if environment == "production" or "production" in name:
        production.append("{}/{}".format(item.get("kind", "unknown"), name))
for app in apps:
    name = app.get("metadata", {}).get("name", "")
    sync = app.get("status", {}).get("sync", {}).get("status")
    health = app.get("status", {}).get("health", {}).get("status")
    if sync != "Synced" or health != "Healthy":
        unhealthy.append("{}:{}/{}".format(name, sync or "missing", health or "missing"))
names = {item.get("metadata", {}).get("name") for item in apps}
set_names = {item.get("metadata", {}).get("name") for item in sets}
expected_apps = {
    "opsforge-platform-root",
    "platform-bootstrap",
    "cert-manager",
    "cert-manager-config",
    "external-secrets-operator",
    "external-secrets-config",
    "ingress-nginx",
    "kube-prometheus-stack",
    "opsforge-observability-config",
    "loki",
    "alloy",
    "opsforge-staging",
}
expected_sets = {"workloads-staging"}
if os.environ["OPSFORGE_VALIDATED_ENVIRONMENT"] == "production":
    expected_apps.update({"opsforge-production-enable", "opsforge-production"})
    expected_sets.add("workloads-production")
for item in sets:
    name = item.get("metadata", {}).get("name", "")
    conditions = item.get("status", {}).get("conditions", [])
    up_to_date = any(
        condition.get("type") == "ResourcesUpToDate" and condition.get("status") == "True"
        for condition in conditions
    )
    active_error = any(
        condition.get("status") == "True"
        and (condition.get("type") == "ErrorOccurred" or "error" in condition.get("reason", "").lower())
        for condition in conditions
    )
    if not up_to_date or active_error:
        set_errors.append(name or "unnamed")
missing_apps = sorted(expected_apps - names)
missing_sets = sorted(expected_sets - set_names)
print("|".join([
    "valid",
    ",".join(missing_apps),
    ",".join(missing_sets),
    ",".join(sorted(unhealthy)),
    ",".join(sorted(production)),
    ",".join(sorted(set_errors)),
]))
' <<<"$argocd_inventory" 2>/dev/null || true)
IFS='|' read -r inventory_status missing_apps missing_sets unhealthy_apps production_reconcilers unhealthy_sets \
  <<<"$argocd_readiness"
if [[ "$inventory_status" != "valid" ]]; then
  fail "Argo Application/ApplicationSet inventory could not be read"
else
  if [[ -z "$missing_apps" && -z "$missing_sets" ]]; then
    pass "all required Argo Applications and ApplicationSets exist"
  else
    fail "required Argo reconcilers are missing (applications: ${missing_apps:-none}; application sets: ${missing_sets:-none})"
  fi
  if [[ -z "$unhealthy_apps" ]]; then
    pass "all Argo Applications are Synced and Healthy"
  else
    fail "Argo Applications are not ready: $unhealthy_apps"
  fi
  if [[ -z "$unhealthy_sets" ]]; then
    pass "all Argo ApplicationSets report ResourcesUpToDate without active errors"
  else
    fail "Argo ApplicationSets are not ready: $unhealthy_sets"
  fi
fi
if [[ "$OPSFORGE_ENVIRONMENT" == "staging" && "$inventory_status" == "valid" ]]; then
  if [[ -z "$production_reconcilers" ]]; then
    pass "no production Argo reconciler is active"
  else
    fail "production Argo reconcilers exist during staging-only validation: $production_reconcilers"
  fi
fi

external_secret_inventory=$(kubectl --context "$OPSFORGE_CLUSTER_CONTEXT" \
  get externalsecrets.external-secrets.io --all-namespaces --output json 2>/dev/null || true)
external_secret_status=$(OPSFORGE_VALIDATED_ENVIRONMENT="$OPSFORGE_ENVIRONMENT" python3 -c '
import json
import os
import sys

try:
    items = json.load(sys.stdin).get("items", [])
except json.JSONDecodeError:
    raise SystemExit(2)
not_ready = []
observed = set()
for item in items:
    metadata = item.get("metadata", {})
    namespace = metadata.get("namespace", "")
    name = metadata.get("name", "")
    conditions = item.get("status", {}).get("conditions", [])
    ready = any(c.get("type") == "Ready" and c.get("status") == "True" for c in conditions)
    if not ready:
        not_ready.append(f"{namespace}/{name}")
    observed.add((namespace, name))
required = {
    ("argocd", "opsforge-gitops-repository"),
    ("monitoring", "grafana-admin"),
    ("monitoring", "opsforge-alertmanager"),
    ("opsforge-staging", "opsforge-ghcr"),
    ("opsforge-staging", "opsforge-runtime"),
}
if os.environ["OPSFORGE_VALIDATED_ENVIRONMENT"] == "production":
    required.update({
        ("opsforge-production", "opsforge-ghcr"),
        ("opsforge-production", "opsforge-runtime"),
    })
print("|".join([
    "valid",
    ",".join("/".join(item) for item in sorted(required - observed)),
    ",".join(sorted(not_ready)),
]))
' <<<"$external_secret_inventory" 2>/dev/null || true)
IFS='|' read -r external_secret_inventory_status missing_external_secrets unready_external_secrets \
  <<<"$external_secret_status"
if [[ "$external_secret_inventory_status" != "valid" ]]; then
  fail "ExternalSecret inventory could not be read"
else
  if [[ -z "$missing_external_secrets" ]]; then
    pass "all required platform and workload ExternalSecrets exist"
  else
    fail "required ExternalSecrets are missing: $missing_external_secrets"
  fi
  if [[ -z "$unready_external_secrets" ]]; then
    pass "all ExternalSecrets report Ready"
  else
    fail "ExternalSecrets are not Ready: $unready_external_secrets"
  fi
fi

if [[ "$OPSFORGE_ENVIRONMENT" == "staging" ]]; then
  production_workload_inventory=""
  production_inventory_error=""
  production_inventory_status=0
  production_inventory_error=$(mktemp)
  if production_workload_inventory=$(kubectl --context "$OPSFORGE_CLUSTER_CONTEXT" \
    -n "$OPSFORGE_PRODUCTION_NAMESPACE" \
    get deployment,statefulset,cronjob,job,pod --no-headers \
    2>"$production_inventory_error"); then
    if [[ -z "$production_workload_inventory" ]]; then
      pass "no production workload resources exist during staging-only validation"
    else
      fail "production workloads exist while running the staging-only readiness check"
    fi
  else
    production_inventory_status=$?
    if grep -qiE '(notfound|not found)' "$production_inventory_error"; then
      pass "production namespace/resources do not exist during staging-only validation"
    else
      fail "production workload inventory could not be read (kubectl exit $production_inventory_status)"
    fi
  fi
  rm -f "$production_inventory_error"
fi

printf '\nResult: %d failure(s), %d warning(s).\n' "$failures" "$warnings"
if (( failures > 0 )); then
  exit 1
fi

printf 'Read-only prerequisites passed. A timed isolated restore drill is still required.\n'

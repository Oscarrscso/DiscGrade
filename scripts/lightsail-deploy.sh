#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"

SERVICE_NAME="${LIGHTSAIL_SERVICE_NAME:-discgrade}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
POWER="${LIGHTSAIL_POWER:-micro}"
SCALE="${LIGHTSAIL_SCALE:-2}"
BOOTSTRAP_SCALE="${LIGHTSAIL_BOOTSTRAP_SCALE:-1}"
IMAGE_LABEL="${LIGHTSAIL_IMAGE_LABEL:-discgrade}"
LOCAL_IMAGE="${LOCAL_IMAGE:-discgrade:lightsail}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
CONTAINER_NAME="${LIGHTSAIL_CONTAINER_NAME:-app}"
CONTAINER_PORT="${PORT:-7000}"
DATA_DIR="${DATA_DIR:-/app/.data}"
PUBLIC_BASE_URL_OVERRIDE="${PUBLIC_BASE_URL:-}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
USER_AGENT="${USER_AGENT:-DiscGradeBot/0.1 (contact: you@example.com)}"
CACHE_TTL_DAYS="${CACHE_TTL_DAYS:-30}"
REQUEST_TIMEOUT_MS="${REQUEST_TIMEOUT_MS:-20000}"
MIN_SOURCE_INTERVAL_MS="${MIN_SOURCE_INTERVAL_MS:-50}"

mkdir -p "$RUN_DIR"

AWS_CMD=(aws --region "$AWS_REGION")
if [[ -n "${AWS_PROFILE:-}" ]]; then
  AWS_CMD+=(--profile "$AWS_PROFILE")
fi

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

aws_cli_is_v2() {
  local version
  version="$(aws --version 2>&1)"
  [[ "$version" == aws-cli/2* ]]
}

service_exists() {
  local result
  result="$("${AWS_CMD[@]}" lightsail get-container-services \
    --service-name "$SERVICE_NAME" \
    --query 'containerServices[0].containerServiceName' \
    --output text 2>/dev/null || true)"
  [[ -n "$result" && "$result" != "None" ]]
}

service_state() {
  "${AWS_CMD[@]}" lightsail get-container-services \
    --service-name "$SERVICE_NAME" \
    --query 'containerServices[0].state' \
    --output text
}

service_url() {
  "${AWS_CMD[@]}" lightsail get-container-services \
    --service-name "$SERVICE_NAME" \
    --query 'containerServices[0].url' \
    --output text
}

service_state_detail() {
  "${AWS_CMD[@]}" lightsail get-container-services \
    --service-name "$SERVICE_NAME" \
    --query 'containerServices[0].stateDetail.code' \
    --output text 2>/dev/null || true
}

service_scale() {
  "${AWS_CMD[@]}" lightsail get-container-services \
    --service-name "$SERVICE_NAME" \
    --query 'containerServices[0].scale' \
    --output text
}

service_power() {
  "${AWS_CMD[@]}" lightsail get-container-services \
    --service-name "$SERVICE_NAME" \
    --query 'containerServices[0].power' \
    --output text
}

wait_for_service() {
  local target_one="$1"
  local target_two="${2:-}"
  local state
  local attempt

  for attempt in {1..60}; do
    state="$(service_state)"
    if [[ "$state" == "$target_one" || ( -n "$target_two" && "$state" == "$target_two" ) ]]; then
      return 0
    fi

    if [[ "$state" == "READY" && "$target_one" == "RUNNING" ]]; then
      break
    fi

    sleep 5
  done

  echo "Lightsail service did not reach the expected state." >&2
  echo "Current state: $(service_state)" >&2
  echo "State detail: $(service_state_detail)" >&2
  return 1
}

bootstrap_scale() {
  if [[ "$SCALE" =~ ^[0-9]+$ ]] && [[ "$BOOTSTRAP_SCALE" =~ ^[0-9]+$ ]] && (( SCALE < BOOTSTRAP_SCALE )); then
    printf '%s\n' "$SCALE"
    return
  fi

  printf '%s\n' "$BOOTSTRAP_SCALE"
}

ensure_service_exists() {
  if service_exists; then
    echo "Using existing Lightsail service '$SERVICE_NAME'..."
  else
    local initial_scale
    initial_scale="$(bootstrap_scale)"
    echo "Creating Lightsail service '$SERVICE_NAME' in $AWS_REGION at $POWER x$initial_scale..."
    "${AWS_CMD[@]}" lightsail create-container-service \
      --service-name "$SERVICE_NAME" \
      --power "$POWER" \
      --scale "$initial_scale" \
      --tags key=app,value=discgrade key=environment,value=production >/dev/null
  fi

  wait_for_service READY RUNNING
}

update_capacity_if_needed() {
  local current_power current_scale
  current_power="$(service_power)"
  current_scale="$(service_scale)"

  if [[ "$current_power" == "$POWER" && "$current_scale" == "$SCALE" ]]; then
    return
  fi

  echo "Updating Lightsail service '$SERVICE_NAME' to $POWER x$SCALE..."
  "${AWS_CMD[@]}" lightsail update-container-service \
    --service-name "$SERVICE_NAME" \
    --power "$POWER" \
    --scale "$SCALE" >/dev/null

  wait_for_service RUNNING READY
}

build_image() {
  echo "Building Docker image '$LOCAL_IMAGE' for platform '$DOCKER_PLATFORM'..."
  docker build --platform "$DOCKER_PLATFORM" -t "$LOCAL_IMAGE" "$ROOT_DIR"
}

push_image() {
  echo "Pushing image to Lightsail..."
  "${AWS_CMD[@]}" lightsail push-container-image \
    --service-name "$SERVICE_NAME" \
    --label "$IMAGE_LABEL" \
    --image "$LOCAL_IMAGE" >/dev/null
}

write_deployment_files() {
  local containers_file="$RUN_DIR/lightsail-containers.json"
  local public_endpoint_file="$RUN_DIR/lightsail-public-endpoint.json"
  local public_base_url="$1"

  LIGHTSAIL_CONTAINERS_FILE="$containers_file" \
  LIGHTSAIL_PUBLIC_ENDPOINT_FILE="$public_endpoint_file" \
  LIGHTSAIL_CONTAINER_NAME="$CONTAINER_NAME" \
  LIGHTSAIL_CONTAINER_PORT="$CONTAINER_PORT" \
  LIGHTSAIL_CONTAINER_IMAGE=":$SERVICE_NAME.$IMAGE_LABEL.latest" \
  LIGHTSAIL_PUBLIC_BASE_URL="$public_base_url" \
  LIGHTSAIL_ADMIN_TOKEN="$ADMIN_TOKEN" \
  LIGHTSAIL_DATA_DIR="$DATA_DIR" \
  LIGHTSAIL_CACHE_TTL_DAYS="$CACHE_TTL_DAYS" \
  LIGHTSAIL_REQUEST_TIMEOUT_MS="$REQUEST_TIMEOUT_MS" \
  LIGHTSAIL_MIN_SOURCE_INTERVAL_MS="$MIN_SOURCE_INTERVAL_MS" \
  LIGHTSAIL_USER_AGENT="$USER_AGENT" \
  node --input-type=module <<'EOF'
import fs from "node:fs";

const containersPath = process.env.LIGHTSAIL_CONTAINERS_FILE;
const publicEndpointPath = process.env.LIGHTSAIL_PUBLIC_ENDPOINT_FILE;
const containerName = process.env.LIGHTSAIL_CONTAINER_NAME;
const containerPort = process.env.LIGHTSAIL_CONTAINER_PORT;

const environment = {
  PORT: containerPort,
  DATA_DIR: process.env.LIGHTSAIL_DATA_DIR,
  CACHE_TTL_DAYS: process.env.LIGHTSAIL_CACHE_TTL_DAYS,
  REQUEST_TIMEOUT_MS: process.env.LIGHTSAIL_REQUEST_TIMEOUT_MS,
  MIN_SOURCE_INTERVAL_MS: process.env.LIGHTSAIL_MIN_SOURCE_INTERVAL_MS,
  USER_AGENT: process.env.LIGHTSAIL_USER_AGENT
};

if (process.env.LIGHTSAIL_PUBLIC_BASE_URL) {
  environment.PUBLIC_BASE_URL = process.env.LIGHTSAIL_PUBLIC_BASE_URL;
}

if (process.env.LIGHTSAIL_ADMIN_TOKEN) {
  environment.ADMIN_TOKEN = process.env.LIGHTSAIL_ADMIN_TOKEN;
}

const containers = {
  [containerName]: {
    image: process.env.LIGHTSAIL_CONTAINER_IMAGE,
    environment,
    ports: {
      [containerPort]: "HTTP"
    }
  }
};

const publicEndpoint = {
  containerName,
  containerPort: Number(containerPort),
  healthCheck: {
    path: "/health",
    successCodes: "200-299",
    intervalSeconds: 10,
    timeoutSeconds: 5,
    healthyThreshold: 2,
    unhealthyThreshold: 3
  }
};

fs.writeFileSync(containersPath, JSON.stringify(containers, null, 2));
fs.writeFileSync(publicEndpointPath, JSON.stringify(publicEndpoint, null, 2));
EOF

  echo "$containers_file"
  echo "$public_endpoint_file"
}

deploy_image() {
  local public_base_url="$1"
  local containers_file public_endpoint_file deployment_files

  deployment_files="$(write_deployment_files "$public_base_url")"
  containers_file="$(printf '%s\n' "$deployment_files" | sed -n '1p')"
  public_endpoint_file="$(printf '%s\n' "$deployment_files" | sed -n '2p')"

  echo "Creating deployment..."
  "${AWS_CMD[@]}" lightsail create-container-service-deployment \
    --service-name "$SERVICE_NAME" \
    --containers "file://$containers_file" \
    --public-endpoint "file://$public_endpoint_file" >/dev/null
}

print_result() {
  local service_public_url manifest_url
  service_public_url="$(service_url)"
  manifest_url="${service_public_url%/}/manifest.json"

  echo
  echo "Lightsail deployment is live."
  echo "Service URL: $service_public_url"
  echo "Manifest URL: $manifest_url"
  echo "Guide URL: ${service_public_url%/}/guide/tt0056592"
}

require_command docker
require_command aws
require_command lightsailctl

if ! aws_cli_is_v2; then
  echo "AWS CLI v2 is required for Lightsail container image pushes." >&2
  exit 1
fi

docker info >/dev/null 2>&1 || {
  echo "Docker Desktop is not running. Start Docker and rerun this script." >&2
  exit 1
}

ensure_service_exists
build_image
push_image

SERVICE_PUBLIC_URL="$PUBLIC_BASE_URL_OVERRIDE"
if [[ -z "$SERVICE_PUBLIC_URL" || "$SERVICE_PUBLIC_URL" == "None" ]]; then
  SERVICE_PUBLIC_URL="$(service_url)"
fi
if [[ "$SERVICE_PUBLIC_URL" == "None" ]]; then
  SERVICE_PUBLIC_URL=""
fi

deploy_image "$SERVICE_PUBLIC_URL"
wait_for_service RUNNING
update_capacity_if_needed
print_result

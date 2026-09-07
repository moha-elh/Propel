#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

CONFIG_FILE=".dev-env"
COMPOSE_FILE="docker-compose.yml"

SERVICES=(
  "postgres"
  "minio"
  "agents"
)

LABELS=(
  "1) postgres"
  "2) minio"
  "3) agents (unified AI sidecar :8000)"
)

ALL_SERVICES="1 2 3"

load_defaults() {
  if [[ -f "$CONFIG_FILE" ]]; then
    cat "$CONFIG_FILE"
  else
    echo ""
  fi
}

save_defaults() {
  echo "$1" > "$CONFIG_FILE"
}

show_menu() {
  echo "=== CV Generator — Docker Services ===" >&2
  echo "  0) All" >&2
  for label in "${LABELS[@]}"; do
    echo "  $label" >&2
  done
  echo "" >&2
}

pick_services() {
  local default="$1"
  local input
  echo -n "Select services (space-separated numbers, 0=all) [$default]: " >&2
  read -r input

  if [[ -z "$input" ]]; then
    input="$default"
  fi

  input="${input#"${input%%[! ]*}"}"  # trim leading
  input="${input%"${input##*[! ]}"}"  # trim trailing

  if [[ "$input" == "0" ]]; then
    echo "$ALL_SERVICES"
    return
  fi

  local validated=""
  for num in $input; do
    if [[ "$num" =~ ^[1-3]$ ]]; then
      validated="$validated $num"
    fi
  done

  validated="${validated#"${validated%%[! ]*}"}"
  if [[ -z "$validated" ]]; then
    echo "No valid selections, using defaults: $default" >&2
    echo "$default"
    return
  fi
  echo "$validated"
}

resolve_services() {
  local picks="$1"
  local result=()
  for num in $picks; do
    case "$num" in
      [[:digit:]]*) ;;
      *) continue ;;
    esac
    local idx=$((num - 1))
    if [[ $idx -ge 0 && $idx -lt ${#SERVICES[@]} ]]; then
      result+=("${SERVICES[$idx]}")
    fi
  done
  echo "${result[*]}"
}

main() {
  local default
  default=$(load_defaults)

  if [[ -z "$default" ]]; then
    default="$ALL_SERVICES"
  fi

  show_menu
  local picks
  picks=$(pick_services "$default")
  save_defaults "$picks"

  local services
  services=$(resolve_services "$picks")

  if [[ -z "$services" ]]; then
    echo "No services selected. Nothing to start." >&2
    exit 0
  fi

  echo ""
  echo "Starting: $services" >&2
  docker compose -f "$COMPOSE_FILE" up -d $services

  echo ""
  echo "=== Done ===" >&2
  echo "Services running in Docker:" >&2
  for s in $services; do
    echo "  - $s" >&2
  done
  echo ""
  echo "Run monolith locally:" >&2
  echo "  cd monolith/backend && dotnet run" >&2
}

main

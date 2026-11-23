#!/usr/bin/env bash
# VOICERO Cal.diy dev install — disk-guarded build wrapper (task 4.6)
#
# Implements the standing disk rule from the 2026-11-23 07:29 PKT incident
# as code: the buildkit cache grew to 17G+ across three API rebuilds and
# pushed the shared VPS root to 94% free-disk (14G free, below the KumoMTA
# 10% floor) — mail was at risk. Rule: never start a build without
# >= 25G free on /, and always prune the builder cache after a build.
#
#   ./build-with-disk-guard.sh [web|api|all]     # default: all
#
# Pre-flight (all must pass, or the build is refused):
#   - docker is installed; the `voicero-caldev` buildx builder exists
#   - no other build holds /tmp/voicero-caldev-build.lock
#   - database + redis containers are running (build-time DB must resolve)
#   - .env.dev exists and the required build args are set
#   - >= 25G free on / — if below the floor, the builder cache is pruned
#     once and disk is re-checked; still below the floor means REFUSE.
#
# Post-build: the builder cache is ALWAYS pruned (success, failure, or
# interrupt), because failed builds leave cache behind too.
#
# Scope — the ONLY prune command this script can run is:
#   docker buildx prune --builder voicero-caldev --force
# It touches only that builder's build cache. This script never prunes
# other builders, images, volumes, or containers, and never runs
# `docker system prune` / `docker builder prune` / `docker volume prune`.
#
# The script never prints .env values. Build arguments are passed to
# `docker buildx build` exactly as documented in DOCKER-DEV-INSTALL.md
# (working buildx form — the old `docker build --memory/--cpus` flags do
# not exist in Docker 29.5.2; the dedicated builder carries the caps via
# `docker update`, see WORKLOG 2026-11-23 session 3).
#
# Exit codes: 0 = build OK and cache pruned; 1 = pre-flight or build
# failure (see the FAIL line); 2 = build OK but the post-build prune
# failed — run the prune command above by hand before the next build.
#
# Like pre-build-check.sh, the checks are functions so they can be
# unit-tested by sourcing this file. When sourced, nothing runs (main is
# guarded by BASH_SOURCE).

set -uo pipefail

BUILDER="voicero-caldev"          # incident rule: prune is scoped to this builder ONLY
MIN_DISK_GB=25                    # incident rule: refuse to build below this floor
BUILD_LOCK="${BUILD_LOCK:-/tmp/voicero-caldev-build.lock}"
ENV_FILE=".env.dev"
WEB_IMAGE="voicero-caldev-calcom:dev"
API_IMAGE="voicero-caldev-calcom-api:dev"

BUILD_STARTED=0                   # set to 1 before the first buildx invocation
PRUNE_DONE=0                      # set to 1 once the post-build prune has run

log() { echo "[disk-guard] $*"; }

usage() {
  cat <<'EOF'
Usage: ./build-with-disk-guard.sh [web|api|all]

  web   build the web image only (voicero-caldev-calcom:dev)
  api   build the API v2 image only (voicero-caldev-calcom-api:dev)
  all   build both (default)

Pre-flight refuses the build unless >= 25G is free on / (pruning the
builder cache once and re-checking first). The builder cache is always
pruned after the build, via `docker buildx prune --builder voicero-caldev
--force` — nothing else is ever pruned.
EOF
}

# --- disk -----------------------------------------------------------------

free_gb_on_root() {
  # Prints free GB on / (integer). Fails loudly if df is unavailable or
  # its output cannot be parsed — a missing disk reading must never be
  # treated as "enough space". Errors go to STDERR: callers capture this
  # function's stdout via $(...), and a failure message captured into a
  # variable would be silently discarded.
  if ! command -v df >/dev/null 2>&1; then
    log "FAIL disk: \`df\` is not available — cannot verify free space, refusing to build" >&2
    return 1
  fi
  local free_gb
  free_gb=$(df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9')
  if [ -z "$free_gb" ]; then
    log "FAIL disk: could not parse \`df\` output for / — refusing to build" >&2
    return 1
  fi
  echo "$free_gb"
}

prune_builder_cache() {
  # The ONLY prune command in this script. Scoped to the voicero-caldev
  # builder: it frees that builder's build cache and touches nothing else
  # (no images, volumes, containers, or other builders).
  log "Pruning builder cache: docker buildx prune --builder ${BUILDER} --force"
  if docker buildx prune --builder "$BUILDER" --force; then
    log "PASS prune: builder cache pruned"
    docker buildx du --builder "$BUILDER" 2>/dev/null | head -5 || true
    return 0
  fi
  log "FAIL prune: \`docker buildx prune --builder ${BUILDER} --force\` failed"
  return 1
}

check_disk_or_recover() {
  local free_gb
  free_gb=$(free_gb_on_root) || return 1
  if [ "$free_gb" -ge "$MIN_DISK_GB" ]; then
    log "PASS disk: ${free_gb} GB free on / (>= ${MIN_DISK_GB} GB)"
    return 0
  fi
  # Below the floor: the builder cache itself is the usual cause (it grew
  # to 17G+ in the incident), so prune once and re-check before refusing.
  log "WARN disk: ${free_gb} GB free on / (< ${MIN_DISK_GB} GB) — pruning builder cache and re-checking"
  prune_builder_cache || log "WARN disk: pre-flight prune failed; re-checking disk anyway"
  free_gb=$(free_gb_on_root) || return 1
  if [ "$free_gb" -ge "$MIN_DISK_GB" ]; then
    log "PASS disk: ${free_gb} GB free on / after prune (>= ${MIN_DISK_GB} GB)"
    return 0
  fi
  log "FAIL disk: ${free_gb} GB free on / (< ${MIN_DISK_GB} GB) even after pruning — refusing to build"
  log "Free disk on the shared host (or remove a superseded image) and retry."
  return 1
}

# --- pre-flight -----------------------------------------------------------

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log "FAIL docker: \`docker\` is not installed or not on PATH — refusing to build"
    return 1
  fi
  log "PASS docker: $(docker --version 2>/dev/null || echo "present")"
  return 0
}

check_builder() {
  if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
    log "FAIL builder: buildx builder '${BUILDER}' does not exist — refusing to build"
    log "Create it (once per host) with:"
    log "  docker buildx create --name voicero-caldev --driver docker-container --driver-opt network=voicero-caldev"
    log "  docker buildx inspect --bootstrap --builder voicero-caldev"
    log "  docker update --memory 6.5g --memory-swap 6.5g --cpus 2 <builder-container>"
    return 1
  fi
  log "PASS builder: buildx builder '${BUILDER}' exists"
  return 0
}

acquire_lock() {
  if [ -e "$BUILD_LOCK" ]; then
    log "FAIL lock: $BUILD_LOCK exists — another build may be running, refusing to build"
    log "If no build is running (check: ps aux | grep \"[d]ocker buildx build\"), remove the stale lock and retry."
    return 1
  fi
  echo "$$ $(date -u +%FT%TZ)" > "$BUILD_LOCK"
  log "PASS lock: acquired $BUILD_LOCK"
  return 0
}

release_lock() {
  # Only remove a lock this process owns, never another build's lock.
  if [ -e "$BUILD_LOCK" ] && [ "$(cut -d' ' -f1 "$BUILD_LOCK" 2>/dev/null)" = "$$" ]; then
    rm -f "$BUILD_LOCK"
    log "Lock released: $BUILD_LOCK"
  fi
}

check_services() {
  # The build-time DB must be reachable (DOCKER-DEV-INSTALL.md step 3).
  local missing=0
  local running
  for container in voicero-caldev-database voicero-caldev-redis; do
    running=$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || echo "missing")
    if [ "$running" != "true" ]; then
      log "FAIL services: container ${container} is not running (got: ${running})"
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    log "Start the data services first:"
    log "  docker compose --env-file .env.dev -f docker-compose.dev.yml up -d database redis"
    return 1
  fi
  log "PASS services: database + redis containers are running"
  return 0
}

load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    log "FAIL env: ${ENV_FILE} not found in $(pwd) — copy .env.dev.example and fill it first"
    return 1
  fi
  # shellcheck disable=SC1090
  set -a; . "./${ENV_FILE}"; set +a
  log "PASS env: loaded ${ENV_FILE} (values never printed)"
  return 0
}

require_var() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    log "FAIL env: ${name} is empty or unset in ${ENV_FILE} — refusing to build"
    return 1
  fi
  return 0
}

# --- builds ---------------------------------------------------------------

build_web() {
  log "Building web image ${WEB_IMAGE} ..."
  # Reduced footprint (session 6, option B): 3 GB heap — the 4 GB heap
  # build OOMed the 6.5g builder cgroup in session 5 (the Next.js build
  # process alone held 5.32 GiB anon RSS). The builder memory cap stays
  # 6.5g; only the heap (and the builder CPU cap, 2.5 -> 2 via
  # `docker update` on the host) is reduced.
  docker buildx build --builder "$BUILDER" --network host --load \
    --build-arg MAX_OLD_SPACE_SIZE=3072 \
    --build-arg DATABASE_URL="$DATABASE_URL" \
    --build-arg DATABASE_DIRECT_URL="$DATABASE_URL" \
    --build-arg NEXT_PUBLIC_WEBAPP_URL="${NEXT_PUBLIC_WEBAPP_URL:-http://127.0.0.1:3300}" \
    --build-arg NEXT_PUBLIC_API_V2_URL="${NEXT_PUBLIC_API_V2_URL:-http://127.0.0.1:3301/api/v2}" \
    --build-arg NEXT_PUBLIC_DISABLE_SIGNUP=true \
    --build-arg CALCOM_TELEMETRY_DISABLED=1 \
    --build-arg NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
    --build-arg CALENDSO_ENCRYPTION_KEY="$CALENDSO_ENCRYPTION_KEY" \
    -t "$WEB_IMAGE" .
}

build_api() {
  log "Building API image ${API_IMAGE} ..."
  docker buildx build --builder "$BUILDER" --network host --load \
    --build-arg DATABASE_URL="$DATABASE_URL" \
    --build-arg DATABASE_DIRECT_URL="$DATABASE_URL" \
    -f apps/api/v2/Dockerfile -t "$API_IMAGE" .
}

# --- cleanup (lock + interrupt-time prune) --------------------------------

cleanup() {
  # Runs on every exit (success, failure, interrupt). The post-build prune
  # normally runs explicitly in main; this is the backstop for interrupts
  # mid-build, when main never reaches it.
  if [ "$BUILD_STARTED" -eq 1 ] && [ "$PRUNE_DONE" -eq 0 ]; then
    log "Build interrupted after it started — pruning builder cache before exit"
    prune_builder_cache || log "WARN: interrupt-time prune failed; run by hand: docker buildx prune --builder ${BUILDER} --force"
    PRUNE_DONE=1
  fi
  release_lock
}

# --- main -----------------------------------------------------------------

main() {
  local target="${1:-all}"
  case "$target" in
    web | api | all) ;;
    -h | --help) usage; return 0 ;;
    *)
      log "FAIL usage: unknown target '${target}'"
      usage
      return 1
      ;;
  esac

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$script_dir" || { log "FAIL: cannot cd to ${script_dir}"; return 1; }

  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  log "Disk-guarded build: target=${target}, builder=${BUILDER}, disk floor=${MIN_DISK_GB}G free on /"
  log "Reminder: run ./pre-build-check.sh and confirm no Ashemail/VOICERO deploy is in flight (manual step)."

  check_docker || return 1
  check_builder || return 1
  acquire_lock || return 1
  check_services || return 1
  load_env || return 1
  case "$target" in
    web | all)
      require_var DATABASE_URL || return 1
      require_var NEXTAUTH_SECRET || return 1
      require_var CALENDSO_ENCRYPTION_KEY || return 1
      ;;
    api)
      require_var DATABASE_URL || return 1
      ;;
  esac
  check_disk_or_recover || return 1

  local build_exit=0
  BUILD_STARTED=1
  case "$target" in
    web) build_web || build_exit=$? ;;
    api) build_api || build_exit=$? ;;
    all)
      build_web || build_exit=$?
      if [ "$build_exit" -eq 0 ]; then
        build_api || build_exit=$?
      else
        log "FAIL build: web build failed (exit ${build_exit}) — skipping API build"
      fi
      ;;
  esac

  # ALWAYS prune after the build — failed builds leave cache behind too.
  local prune_exit=0
  prune_builder_cache || prune_exit=$?
  PRUNE_DONE=1

  local free_gb
  free_gb=$(free_gb_on_root 2>/dev/null || echo "?")
  log "Disk after build + prune: ${free_gb} GB free on /"

  if [ "$build_exit" -ne 0 ]; then
    log "RESULT: BUILD FAILED (exit ${build_exit}) — builder cache was still pruned."
    return "$build_exit"
  fi
  if [ "$prune_exit" -ne 0 ]; then
    log "RESULT: BUILD OK, but the post-build prune FAILED — run this before the next build:"
    log "  docker buildx prune --builder ${BUILDER} --force"
    return 2
  fi
  log "RESULT: BUILD OK — builder cache pruned."
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi

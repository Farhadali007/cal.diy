#!/usr/bin/env bash
# Dry-run verification for build-with-disk-guard.sh (task 4.6).
#
# Runs the wrapper against MOCKED docker + df — no real build, no real
# prune, no VPS contact. Each case gets a fresh temp dir with a copy of
# the wrapper and a fake .env.dev (canary values, no real secrets).
#
#   ./build-with-disk-guard.dry-run.sh
#
# Exit 0 = every case passed. A failing case prints its evidence.
#
# The mock docker logs every invocation, so each case can assert exactly
# which docker commands the wrapper ran (builds, prunes, inspections).
# The wrapper is located beside this harness in the fork; in the
# session-4 deliverables dir it lives under new-files/ instead.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The wrapper sits beside this harness in the fork; in the session-4
# deliverables dir it lives under new-files/. Prefer the sibling.
if [ -f "$SCRIPT_DIR/build-with-disk-guard.sh" ]; then
  WRAPPER_SRC="$SCRIPT_DIR/build-with-disk-guard.sh"
else
  WRAPPER_SRC="$SCRIPT_DIR/../new-files/build-with-disk-guard.sh"
fi
CANARY="CANARY_SECRET_XYZ"
BASH_BIN="$(command -v bash)"

PASS_COUNT=0
FAIL_COUNT=0

pass() { PASS_COUNT=$((PASS_COUNT + 1)); echo "PASS: $1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); echo "FAIL: $1"; }

# --- mock setup -----------------------------------------------------------

# Build a mock bin dir: mock docker + mock df + symlinks to the real
# tools the wrapper needs (tail, tr, cut, date, dirname, head, rm).
# Args: $1 = mockbin dir, $2 = "nodf" to omit df, $3 = "nodocker" to omit docker.
make_mockbin() {
  local mockbin="$1" mode="${2:-}" mode3="${3:-}"
  mkdir -p "$mockbin"
  for tool in tail tr cut date dirname head rm cat grep; do
    ln -sf "/usr/bin/$tool" "$mockbin/$tool" 2>/dev/null || ln -sf "$(command -v "$tool")" "$mockbin/$tool"
  done
  # The mocks' #!/usr/bin/env bash shebangs must resolve inside the mock PATH.
  ln -sf "$BASH_BIN" "$mockbin/bash"
  if [ "$mode" != "nodf" ] && [ "$mode3" != "nodf" ]; then
    cat > "$mockbin/df" <<'MOCKDF'
#!/usr/bin/env bash
# Mock df: prints GNU `df -BG --output=avail` output. Returns MOCK_DF_GB
# until a prune has been recorded in MOCK_DF_STATE, then MOCK_DF_AFTER_PRUNE.
if [ -n "${MOCK_DF_STATE:-}" ] && [ -f "$MOCK_DF_STATE" ] && grep -q pruned "$MOCK_DF_STATE" 2>/dev/null; then
  gb="${MOCK_DF_AFTER_PRUNE:-38}"
else
  gb="${MOCK_DF_GB:-38}"
fi
echo "Avail"
echo "${gb}G"
MOCKDF
    chmod +x "$mockbin/df"
  fi
  if [ "$mode" != "nodocker" ] && [ "$mode3" != "nodocker" ]; then
    cat > "$mockbin/docker" <<'MOCKDOCKER'
#!/usr/bin/env bash
# Mock docker: logs every invocation to MOCK_LOG, then behaves per env.
echo "docker $*" >> "$MOCK_LOG"
case "$1" in
  --version)
    echo "Docker version 29.5.2, build mock"
    exit 0
    ;;
  buildx)
    case "$2" in
      inspect)
        exit "${MOCK_INSPECT_EXIT:-0}"
        ;;
      build)
        tag=""
        prev=""
        for a in "$@"; do
          if [ "$prev" = "-t" ]; then tag="$a"; fi
          prev="$a"
        done
        echo "BUILD tag=$tag exit=${MOCK_BUILD_EXIT:-0}" >> "$MOCK_LOG"
        exit "${MOCK_BUILD_EXIT:-0}"
        ;;
      prune)
        [ -n "${MOCK_DF_STATE:-}" ] && echo pruned >> "$MOCK_DF_STATE"
        echo "Total reclaimed space: 9.777GB"
        exit "${MOCK_PRUNE_EXIT:-0}"
        ;;
      du)
        echo "Total: 121.0MB"
        exit 0
        ;;
    esac
    ;;
  inspect)
    case "${MOCK_SERVICE_RUNNING:-true}" in
      true) echo "true"; exit 0 ;;
      false) echo "false"; exit 0 ;;
      missing) echo "Error: No such container" >&2; exit 1 ;;
    esac
    ;;
esac
echo "mock docker: unhandled: $*" >&2
exit 1
MOCKDOCKER
    chmod +x "$mockbin/docker"
  fi
}

# Set up one case dir: wrapper copy + fake .env.dev + mockbin.
# Args: $1 = case dir, $2 = mockbin mode ("" | nodf | nodocker), $3 = "noenv" to skip .env.dev.
setup_case() {
  local dir="$1" mode="${2:-}" noenv="${3:-}"
  mkdir -p "$dir"
  cp "$WRAPPER_SRC" "$dir/build-with-disk-guard.sh"
  chmod +x "$dir/build-with-disk-guard.sh"
  if [ "$noenv" != "noenv" ]; then
    cat > "$dir/.env.dev" <<EOF
DATABASE_URL=postgres://user:${CANARY}@database:5432/calendso
NEXTAUTH_SECRET=${CANARY}
CALENDSO_ENCRYPTION_KEY=${CANARY}
NEXT_PUBLIC_WEBAPP_URL=http://127.0.0.1:3300
NEXT_PUBLIC_API_V2_URL=http://127.0.0.1:3301/api/v2
EOF
    chmod 600 "$dir/.env.dev"
  fi
  make_mockbin "$dir/mockbin" "$mode"
  touch "$dir/docker.log"
  touch "$dir/df-state"
}

# Run the wrapper in a case dir with a controlled env.
# Args: $1 = case dir, $2.. = extra env assignments (VAR=value), then "--" then wrapper args.
run_wrapper() {
  local dir="$1"; shift
  local envs=()
  while [ $# -gt 0 ] && [ "$1" != "--" ]; do envs+=("$1"); shift; done
  [ $# -gt 0 ] && shift # drop "--"
  env -i PATH="$dir/mockbin" BUILD_LOCK="$dir/build.lock" MOCK_LOG="$dir/docker.log" \
    MOCK_DF_STATE="$dir/df-state" "${envs[@]}" \
    "$BASH_BIN" "$dir/build-with-disk-guard.sh" "$@" >"$dir/out.txt" 2>&1
  echo $?
}

count_in_log() { # $1 = dir, $2 = grep pattern (fixed string)
  grep -c -F "$2" "$1/docker.log" 2>/dev/null || true
}

assert_no_canary() { # $1 = dir, $2 = case name
  if grep -q -F "$CANARY" "$1/out.txt"; then
    fail "$2: secret canary leaked into wrapper output"
  else
    pass "$2: no secret value in wrapper output"
  fi
}

assert_lock_released() { # $1 = dir, $2 = case name
  if [ -e "$1/build.lock" ]; then
    fail "$2: build lock was not released"
  else
    pass "$2: build lock released"
  fi
}

# --- cases ----------------------------------------------------------------

TMP_BASE="$(mktemp -d /tmp/disk-guard-dryrun.XXXXXX)"
trap 'rm -rf "$TMP_BASE"' EXIT

# 1. Refuse below the floor (10G, prune cannot recover: df stays 10G).
D="$TMP_BASE/c1-refuse"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=10 MOCK_DF_AFTER_PRUNE=10 -- all)
[ "$exit_code" -ne 0 ] && pass "c1 refuse-below-floor: exit=$exit_code (nonzero)" || fail "c1 refuse-below-floor: exit=$exit_code (expected nonzero)"
[ "$(count_in_log "$D" "BUILD tag=")" -eq 0 ] && pass "c1: no build invoked" || fail "c1: a build was invoked below the floor"
[ "$(count_in_log "$D" "buildx prune")" -eq 1 ] && pass "c1: prune attempted once (recovery attempt)" || fail "c1: prune count wrong: $(count_in_log "$D" "buildx prune")"
grep -q "refusing to build" "$D/out.txt" && pass "c1: refusal message printed" || fail "c1: no refusal message"
assert_no_canary "$D" "c1"
assert_lock_released "$D" "c1"

# 2. Below floor, prune recovers (df 10G -> 38G after prune).
D="$TMP_BASE/c2-recover"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=10 MOCK_DF_AFTER_PRUNE=38 -- all)
[ "$exit_code" -eq 0 ] && pass "c2 recover-after-prune: exit=0" || fail "c2 recover-after-prune: exit=$exit_code"
[ "$(count_in_log "$D" "BUILD tag=")" -eq 2 ] && pass "c2: both builds ran" || fail "c2: build count wrong"
[ "$(count_in_log "$D" "buildx prune")" -eq 2 ] && pass "c2: prune ran twice (pre-flight recovery + post-build)" || fail "c2: prune count wrong: $(count_in_log "$D" "buildx prune")"
assert_no_canary "$D" "c2"
assert_lock_released "$D" "c2"

# 3. Healthy disk: build proceeds, prune exactly once (post-build).
D="$TMP_BASE/c3-healthy"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 -- all)
[ "$exit_code" -eq 0 ] && pass "c3 healthy-disk: exit=0" || fail "c3 healthy-disk: exit=$exit_code"
[ "$(count_in_log "$D" "BUILD tag=voicero-caldev-calcom:dev")" -eq 1 ] && pass "c3: web build ran once" || fail "c3: web build count wrong"
[ "$(count_in_log "$D" "BUILD tag=voicero-caldev-calcom-api:dev")" -eq 1 ] && pass "c3: api build ran once" || fail "c3: api build count wrong"
[ "$(count_in_log "$D" "buildx prune")" -eq 1 ] && pass "c3: post-build prune ran exactly once" || fail "c3: prune count wrong: $(count_in_log "$D" "buildx prune")"
grep -q -F "docker buildx prune --builder voicero-caldev --force" "$D/docker.log" && pass "c3: exact scoped prune command invoked" || fail "c3: prune command not the exact scoped one"
assert_no_canary "$D" "c3"
assert_lock_released "$D" "c3"

# 4. Build failure: prune still runs, exit code is the build's, API skipped.
D="$TMP_BASE/c4-buildfail"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 MOCK_BUILD_EXIT=1 -- all)
[ "$exit_code" -eq 1 ] && pass "c4 build-fails: exit=1 (build's code)" || fail "c4 build-fails: exit=$exit_code (expected 1)"
[ "$(count_in_log "$D" "BUILD tag=voicero-caldev-calcom:dev")" -eq 1 ] && pass "c4: web build attempted" || fail "c4: web build not attempted"
[ "$(count_in_log "$D" "BUILD tag=voicero-caldev-calcom-api:dev")" -eq 0 ] && pass "c4: api build skipped after web failure" || fail "c4: api build ran after web failure"
[ "$(count_in_log "$D" "buildx prune")" -eq 1 ] && pass "c4: prune ran after failed build" || fail "c4: prune missing after failed build"
grep -q "BUILD FAILED" "$D/out.txt" && pass "c4: failure reported" || fail "c4: no failure report"
grep -q "was still pruned" "$D/out.txt" && pass "c4: RESULT reports the prune succeeded" || fail "c4: RESULT does not report the prune"
assert_no_canary "$D" "c4"
assert_lock_released "$D" "c4"

# 5. df unavailable: fail loudly, no build, no prune.
D="$TMP_BASE/c5-nodf"; setup_case "$D" nodf
exit_code=$(run_wrapper "$D" -- all)
[ "$exit_code" -ne 0 ] && pass "c5 df-missing: exit=$exit_code (nonzero)" || fail "c5 df-missing: exit=$exit_code (expected nonzero)"
[ "$(count_in_log "$D" "BUILD tag=")" -eq 0 ] && pass "c5: no build invoked" || fail "c5: a build was invoked without df"
grep -q "df.*not available" "$D/out.txt" && pass "c5: loud df-missing failure" || fail "c5: no df-missing message"
assert_lock_released "$D" "c5"

# 6. Builder missing: fail with the create instructions, no build.
D="$TMP_BASE/c6-nobuilder"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 MOCK_INSPECT_EXIT=1 -- all)
[ "$exit_code" -ne 0 ] && pass "c6 builder-missing: exit=$exit_code (nonzero)" || fail "c6 builder-missing: exit=$exit_code (expected nonzero)"
[ "$(count_in_log "$D" "BUILD tag=")" -eq 0 ] && pass "c6: no build invoked" || fail "c6: a build was invoked without a builder"
grep -q "docker buildx create --name voicero-caldev" "$D/out.txt" && pass "c6: builder create instructions printed" || fail "c6: no create instructions"
assert_lock_released "$D" "c6"

# 7. Lock present: refuse, no build, pre-existing lock NOT removed.
D="$TMP_BASE/c7-lock"; setup_case "$D"
echo "99999 2026-11-23T00:00:00Z" > "$D/build.lock"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 -- all)
[ "$exit_code" -ne 0 ] && pass "c7 lock-present: exit=$exit_code (nonzero)" || fail "c7 lock-present: exit=$exit_code (expected nonzero)"
[ "$(count_in_log "$D" "BUILD tag=")" -eq 0 ] && pass "c7: no build invoked" || fail "c7: a build was invoked despite the lock"
[ -e "$D/build.lock" ] && pass "c7: foreign lock left untouched" || fail "c7: foreign lock was removed"

# 8. Targets: web-only and api-only build exactly one image each.
D="$TMP_BASE/c8-web"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 -- web)
[ "$exit_code" -eq 0 ] && [ "$(count_in_log "$D" "BUILD tag=")" -eq 1 ] && [ "$(count_in_log "$D" "BUILD tag=voicero-caldev-calcom:dev")" -eq 1 ] \
  && pass "c8 web-only: one web build, exit=0" || fail "c8 web-only: wrong builds/exit ($exit_code)"
[ "$(count_in_log "$D" "buildx prune")" -eq 1 ] && pass "c8 web-only: prune ran once" || fail "c8 web-only: prune count wrong"
D="$TMP_BASE/c8-api"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 -- api)
[ "$exit_code" -eq 0 ] && [ "$(count_in_log "$D" "BUILD tag=")" -eq 1 ] && [ "$(count_in_log "$D" "BUILD tag=voicero-caldev-calcom-api:dev")" -eq 1 ] \
  && pass "c8 api-only: one api build, exit=0" || fail "c8 api-only: wrong builds/exit ($exit_code)"

# 9. Bad target: usage error, no build.
D="$TMP_BASE/c9-badtarget"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 -- bogus)
[ "$exit_code" -ne 0 ] && pass "c9 bad-target: exit=$exit_code (nonzero)" || fail "c9 bad-target: exit=$exit_code (expected nonzero)"
grep -q "Usage:" "$D/out.txt" && pass "c9: usage printed" || fail "c9: no usage text"
[ "$(count_in_log "$D" "BUILD tag=")" -eq 0 ] && pass "c9: no build invoked" || fail "c9: a build was invoked"

# 10. Prune fails after a successful build: exit 2 + manual command.
D="$TMP_BASE/c10-prunefail"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 MOCK_PRUNE_EXIT=1 -- web)
[ "$exit_code" -eq 2 ] && pass "c10 prune-fails: exit=2 (build OK, prune failed)" || fail "c10 prune-fails: exit=$exit_code (expected 2)"
grep -q -F "docker buildx prune --builder voicero-caldev --force" "$D/out.txt" && pass "c10: manual prune command printed" || fail "c10: no manual prune command"

# 11. Data services down: refuse before any build.
D="$TMP_BASE/c11-services"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 MOCK_SERVICE_RUNNING=false -- all)
[ "$exit_code" -ne 0 ] && pass "c11 services-down: exit=$exit_code (nonzero)" || fail "c11 services-down: exit=$exit_code (expected nonzero)"
[ "$(count_in_log "$D" "BUILD tag=")" -eq 0 ] && pass "c11: no build invoked" || fail "c11: a build was invoked with services down"

# 12. No .env.dev: refuse before any build.
D="$TMP_BASE/c12-noenv"; setup_case "$D" "" noenv
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 -- all)
[ "$exit_code" -ne 0 ] && pass "c12 no-env: exit=$exit_code (nonzero)" || fail "c12 no-env: exit=$exit_code (expected nonzero)"
[ "$(count_in_log "$D" "BUILD tag=")" -eq 0 ] && pass "c12: no build invoked" || fail "c12: a build was invoked without .env.dev"

# 13. No docker at all: refuse.
D="$TMP_BASE/c13-nodocker"; setup_case "$D" nodocker
exit_code=$(run_wrapper "$D" -- all)
[ "$exit_code" -ne 0 ] && pass "c13 no-docker: exit=$exit_code (nonzero)" || fail "c13 no-docker: exit=$exit_code (expected nonzero)"
grep -q "docker.*not installed" "$D/out.txt" && pass "c13: loud docker-missing failure" || fail "c13: no docker-missing message"

# 14. Static safety scan of the wrapper source.
if bash -n "$WRAPPER_SRC"; then pass "c14: bash -n clean"; else fail "c14: bash -n failed"; fi
for forbidden in "system prune" "builder prune" "volume prune" "image prune" "container prune" "docker rmi" "docker rm " "rm -rf /" "docker network prune"; do
  if grep -q -F "$forbidden" "$WRAPPER_SRC"; then
    # "builder prune" appears in comments explaining it is NEVER run — allow comment-only mentions.
    if grep -v '^\s*#' "$WRAPPER_SRC" | grep -q -F "$forbidden"; then
      fail "c14: forbidden command in executable code: $forbidden"
    else
      pass "c14: '$forbidden' appears only in a comment (never executed)"
    fi
  else
    pass "c14: no '$forbidden' anywhere"
  fi
done
grep -q -F 'docker buildx prune --builder "$BUILDER" --force' "$WRAPPER_SRC" \
  && pass "c14: prune is the single scoped command (BUILDER=voicero-caldev)" \
  || fail "c14: scoped prune command not found"
[ "$(grep -c "buildx prune" "$WRAPPER_SRC")" -ge 1 ] && pass "c14: prune command present" || fail "c14: prune command missing"

# 15. Reduced footprint (session 6, option B): the web build passes the
# 3 GB heap build arg — guards the session-5 OOM fix against regression
# (the 4 GB heap build OOMed the 6.5g builder cgroup).
D="$TMP_BASE/c15-heap"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 -- web)
[ "$exit_code" -eq 0 ] && pass "c15 reduced-heap: web-only run exit=0" || fail "c15 reduced-heap: exit=$exit_code (expected 0)"
grep -q -F "MAX_OLD_SPACE_SIZE=3072" "$D/docker.log" && pass "c15: web build passes MAX_OLD_SPACE_SIZE=3072" || fail "c15: web build did not pass MAX_OLD_SPACE_SIZE=3072"
grep -q -F "MAX_OLD_SPACE_SIZE=4096" "$D/docker.log" && fail "c15: stale 4096 heap arg still passed" || pass "c15: no stale 4096 heap arg"
assert_no_canary "$D" "c15"
assert_lock_released "$D" "c15"

# 16. Build fails AND prune fails (session 6 flag): the RESULT line must
# NOT claim the cache was pruned — it must report the prune failure and
# print the manual prune command. Exit code stays the build's.
D="$TMP_BASE/c16-buildfail-prunefail"; setup_case "$D"
exit_code=$(run_wrapper "$D" MOCK_DF_GB=38 MOCK_BUILD_EXIT=1 MOCK_PRUNE_EXIT=1 -- web)
[ "$exit_code" -eq 1 ] && pass "c16 build+prune fail: exit=1 (build's code)" || fail "c16 build+prune fail: exit=$exit_code (expected 1)"
grep -q "BUILD FAILED" "$D/out.txt" && pass "c16: failure reported" || fail "c16: no failure report"
grep -q "prune ALSO FAILED" "$D/out.txt" && pass "c16: RESULT reports the prune failure" || fail "c16: RESULT does not report the prune failure"
grep -q "was still pruned" "$D/out.txt" && fail "c16: RESULT falsely claims the cache was pruned" || pass "c16: RESULT does not falsely claim a prune"
grep -q -F "docker buildx prune --builder voicero-caldev --force" "$D/out.txt" && pass "c16: manual prune command printed" || fail "c16: no manual prune command"
assert_no_canary "$D" "c16"
assert_lock_released "$D" "c16"

echo
echo "dry-run result: ${PASS_COUNT} passed, ${FAIL_COUNT} failed"
[ "$FAIL_COUNT" -eq 0 ]

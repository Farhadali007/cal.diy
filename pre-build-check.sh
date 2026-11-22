#!/usr/bin/env bash
# VOICERO Cal.diy dev install — pre-build checklist (task 1.7)
#
# Implements IMPLEMENTATION-PLAN.md §C guard 9. Run on VPS A before
# EVERY image build; abort the build if any check fails. Read-only:
# it changes nothing on the host.
#
#   ./pre-build-check.sh
#
# Exit 0 = all automated checks pass. Exit 1 = at least one failed.
# Manual confirmations (no deploy in flight, no backup window overlap
# beyond the clock check) are printed as reminders — the operator
# confirms them before running the build.
#
# The checks are functions so they can be unit-tested by sourcing this
# file: `source ./pre-build-check.sh && check_ram_mb 100` etc. When
# sourced, nothing runs (main is guarded by BASH_SOURCE).

MIN_RAM_MB=8192        # guard 9: available RAM >= 8 GB
MAX_LOAD=2.0           # guard 9: 1-min load < 2.0
MIN_DISK_GB=15         # guard 9: >= 15 GB free on /
BUILD_LOCK=/tmp/voicero-caldev-build.lock

fail=0

check_ram_mb() {
  local min_mb="$1"
  local avail_kb avail_mb
  avail_kb=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
  avail_mb=$((avail_kb / 1024))
  if [ "$avail_mb" -ge "$min_mb" ]; then
    echo "PASS ram: ${avail_mb} MB available (>= ${min_mb} MB)"
    return 0
  fi
  echo "FAIL ram: ${avail_mb} MB available (< ${min_mb} MB) — do not build"
  return 1
}

check_load() {
  local max_load="$1"
  local load
  load=$(awk '{print $1}' /proc/loadavg)
  if awk -v l="$load" -v m="$max_load" 'BEGIN { exit !(l < m) }'; then
    echo "PASS load: 1-min load ${load} (< ${max_load})"
    return 0
  fi
  echo "FAIL load: 1-min load ${load} (>= ${max_load}) — do not build"
  return 1
}

check_disk_gb() {
  local min_gb="$1"
  local free_gb
  free_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
  if [ "$free_gb" -ge "$min_gb" ]; then
    echo "PASS disk: ${free_gb} GB free on / (>= ${min_gb} GB)"
    return 0
  fi
  echo "FAIL disk: ${free_gb} GB free on / (< ${min_gb} GB) — do not build"
  return 1
}

check_time_window() {
  local hhmm
  hhmm=$(date -u +%H%M)
  # Guard 4: avoid 03:30-04:30 UTC (backups) and 05:20-05:35 UTC (image prune).
  if { [ "$hhmm" -ge 0330 ] && [ "$hhmm" -le 0430 ]; } || \
     { [ "$hhmm" -ge 0520 ] && [ "$hhmm" -le 0535 ]; }; then
    echo "FAIL time: ${hhmm} UTC is inside a forbidden window (03:30-04:30 or 05:20-05:35 UTC) — do not build"
    return 1
  fi
  echo "PASS time: ${hhmm} UTC outside forbidden windows"
  return 0
}

check_no_build_lock() {
  if [ -e "$BUILD_LOCK" ]; then
    echo "FAIL lock: $BUILD_LOCK exists — another build may be running"
    return 1
  fi
  echo "PASS lock: no build lock present"
  return 0
}

main() {
  check_ram_mb "$MIN_RAM_MB" || fail=1
  check_load "$MAX_LOAD" || fail=1
  check_disk_gb "$MIN_DISK_GB" || fail=1
  check_time_window || fail=1
  check_no_build_lock || fail=1
  echo "---"
  echo "MANUAL (confirm before building): no Ashemail deploy in flight;"
  echo "no VOICERO deploy in flight; build window agreed (prefer 01:00-03:00 UTC)."
  if [ "$fail" -ne 0 ]; then
    echo "RESULT: FAIL — do not build."
    return 1
  fi
  echo "RESULT: PASS — automated checks green; proceed only after the manual confirmations."
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi

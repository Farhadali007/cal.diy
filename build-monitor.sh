#!/usr/bin/env bash
# VOICERO Cal.diy dev install — build monitor (canonical; session 7).
#
# Samples host memory, builder memory, load, disk, and production site
# status every 60s during a guarded build. Aborts the build if host
# MemAvailable falls below the abort floor (default 1,000,000 kB) by
# killing the buildx CLI — the wrapper then runs its normal failure
# path (prune + lock release). Stops when no build lock exists and no
# buildx build is running. Max 90 samples (~90 min) as a runaway guard.
# Writes only to its own log; prints no secrets.
#
#   BUILD_MONITOR_LOG=/root/s7-build-logs/s7-build-monitor-20261124.log \
#     ./build-monitor.sh &
#
# Env overrides: BUILD_MONITOR_LOG (default ./build-monitor.log),
# BUILD_LOCK (default /tmp/voicero-caldev-build.lock),
# ABORT_FLOOR_KB (default 1000000), DOCKER_TIMEOUT (default 15s),
# MAX_SAMPLES (default 90), SAMPLE_SECS (default 60).
#
# Session 6 fixes, folded in here:
# - docker calls are wrapped in `timeout` — under the session-6 load
#   storm each `docker stats` sample took minutes, so the monitor went
#   blind for 23:12:00 -> 23:16:57 exactly when the abort floor fired.
# - pgrep/pkill patterns use the bracketed form (`[b]uildx ...`) so the
#   monitor never matches its own process (the self-match footgun hit
#   twice in session 6 remote checks).

set -u

LOG="${BUILD_MONITOR_LOG:-./build-monitor.log}"
LOCK="${BUILD_LOCK:-/tmp/voicero-caldev-build.lock}"
FLOOR_KB="${ABORT_FLOOR_KB:-1000000}"
DOCKER_TIMEOUT="${DOCKER_TIMEOUT:-15}"
MAX_SAMPLES="${MAX_SAMPLES:-90}"
SAMPLE_SECS="${SAMPLE_SECS:-60}"

# The buildx CLI invocation the monitor watches for (bracketed so the
# pattern never matches this script's own process list entry).
BUILD_PATTERN='[b]uildx build --builder voicero-caldev'

n=0
while [ "$n" -lt "$MAX_SAMPLES" ]; do
  n=$((n + 1))
  ts=$(date -u +%H:%M:%S)
  avail=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
  builder=$(timeout "$DOCKER_TIMEOUT" docker stats --no-stream --format '{{.MemUsage}}' buildx_buildkit_voicero-caldev0 2>/dev/null || echo "?")
  load=$(awk '{print $1}' /proc/loadavg)
  disk=$(df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9')
  voicero=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://voicero.io/ 2>/dev/null || echo "???")
  app=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://app.voicero.io/login 2>/dev/null || echo "???")
  echo "$ts avail=${avail}kB builder=${builder} load=${load} disk=${disk}G voicero=${voicero} app=${app}" >> "$LOG"
  if [ -n "$avail" ] && [ "$avail" -lt "$FLOOR_KB" ]; then
    echo "$ts ABORT: MemAvailable ${avail}kB < floor ${FLOOR_KB}kB — killing buildx build" >> "$LOG"
    pkill -TERM -f "$BUILD_PATTERN" >> "$LOG" 2>&1 || echo "$ts ABORT: no buildx build process found to kill" >> "$LOG"
    echo "$ts ABORT issued; monitor keeps sampling until the build stops" >> "$LOG"
  fi
  sleep "$SAMPLE_SECS"
  if [ ! -e "$LOCK" ] && ! pgrep -f "$BUILD_PATTERN" >/dev/null 2>&1; then
    echo "$(date -u +%H:%M:%S) MONITOR STOPPING (no lock, no build)" >> "$LOG"
    exit 0
  fi
done
echo "$(date -u +%H:%M:%S) MONITOR STOPPING (${MAX_SAMPLES}-sample guard reached)" >> "$LOG"

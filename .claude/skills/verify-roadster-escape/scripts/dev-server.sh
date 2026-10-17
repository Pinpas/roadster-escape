#!/usr/bin/env bash
# Usage: dev-server.sh start|start-cf|doctor|stop [port]
#   start     Vite dev server (port defaults to $VERIFY_PORT, then 5100)
#   start-cf  build, then wrangler dev on the Workers runtime (port defaults to 5106)
#   doctor    check the server this skill started on the port
#   stop      stop that server, after the same ownership checks
set -euo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
command="${1:-}"
case "$command" in
  start-cf) port="${2:-5106}" ;;
  *) port="${2:-${VERIFY_PORT:-5100}}" ;;
esac
state="$root/.verify"
pidfile="$state/server-$port.pid"
log="$state/server-$port.log"
url="http://hugo-agentbox-macbookpro:$port/"

port_busy() { ss -ltnH "sport = :$1" | grep -q .; }

first_free_port() {
  local candidate
  for candidate in 5101 5102 5103 5104 5105 5109; do
    if ! port_busy "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  echo "none free in 5101-5109"
}

# Prints the pid when this skill started the server on the port and it still owns it.
owned_pid() {
  local pid listener
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  [[ -n $pid ]] && kill -0 "$pid" 2>/dev/null || return 1
  [[ "$(readlink "/proc/$pid/cwd")" == "$root" ]] || return 1
  # The listener may be a child (workerd), so match any process in the started group.
  for listener in $(ss -ltnpH "sport = :$port" | grep -oP 'pid=\K[0-9]+' || true); do
    if [[ "$(ps -o pgid= -p "$listener" | tr -d ' ')" == "$pid" ]]; then
      echo "$pid"
      return 0
    fi
  done
  return 1
}

doctor() {
  local pid
  if ! pid="$(owned_pid)"; then
    echo "doctor: FAIL no server started by this skill owns port $port in $root"
    return 1
  fi
  if ! curl -fsS "$url" | grep -q '<canvas id="game">'; then
    echo "doctor: FAIL $url does not serve the game page"
    return 1
  fi
  echo "doctor: OK pid $pid serves $root at $url (HEAD $(git -C "$root" rev-parse --short HEAD))"
  # Only Vite forwards the browser console; wrangler dev has no such log.
  if tr '\0' ' ' <"/proc/$pid/cmdline" | grep -q 'vite.js'; then
    echo "doctor: browser console errors forwarded to $log: $(grep -cE '\[console\.error\]|\[Unhandled' "$log" || true)"
  fi
}

# Stops the process group and waits up to 5 s for it to exit, so the port is free on return.
stop_group() {
  kill -- "-$1" 2>/dev/null || true
  for _ in $(seq 1 25); do
    kill -0 -- "-$1" 2>/dev/null || return 0
    sleep 0.2
  done
  kill -KILL -- "-$1" 2>/dev/null || true
}

preflight() {
  if port_busy "$port"; then
    echo "start: port $port is busy. Check it with: $0 doctor $port, and stop your own server with: $0 stop $port. Otherwise use a free port: $0 $command $(first_free_port)"
    exit 1
  fi
  if [[ ! -d $root/node_modules ]]; then
    echo "start: run ~/projects/agentbox/scripts/heavy npm ci in $root first"
    exit 1
  fi
  mkdir -p "$state/evidence"
}

launch() {
  local pid
  cd "$root"
  setsid "$@" >"$log" 2>&1 </dev/null &
  pid=$!
  echo "$pid" >"$pidfile"
  # This run started the group, so every failure below stops it rather than orphaning it.
  fail() {
    echo "start: $1. Last log lines:"
    tail -n 15 "$log"
    stop_group "$pid"
    rm -f "$pidfile"
    exit 1
  }
  for _ in $(seq 1 60); do
    kill -0 "$pid" 2>/dev/null || fail "the server exited"
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then
      doctor || fail "another process answered on port $port"
      return
    fi
    sleep 0.5
  done
  fail "no answer on $url after 30 s"
}

case "$command" in
  start)
    preflight
    launch node node_modules/vite/bin/vite.js --port "$port" --strictPort
    ;;
  start-cf)
    preflight
    if ! ~/projects/agentbox/scripts/heavy npm --prefix "$root" run build >"$state/build.log" 2>&1; then
      echo "start-cf: the build failed. Last log lines:"
      tail -n 15 "$state/build.log"
      exit 1
    fi
    # The build may wait minutes for a heavy slot, so check the port again.
    preflight
    WRANGLER_SEND_METRICS=false launch node node_modules/wrangler/bin/wrangler.js dev --ip 0.0.0.0 --port "$port"
    ;;
  doctor)
    doctor
    ;;
  stop)
    if pid="$(owned_pid)"; then
      stop_group "$pid"
      rm -f "$pidfile"
      echo "stop: stopped process group $pid on port $port; evidence kept in $state/evidence"
    elif [[ -f $pidfile ]] && pid="$(cat "$pidfile")" && kill -0 "$pid" 2>/dev/null \
      && [[ "$(readlink "/proc/$pid/cwd")" == "$root" ]] \
      && tr '\0' ' ' <"/proc/$pid/cmdline" | grep -qE 'vite\.js|wrangler\.js'; then
      stop_group "$pid"
      rm -f "$pidfile"
      echo "stop: stopped process group $pid, which this skill started but which held no port"
    elif [[ -f $pidfile ]]; then
      rm -f "$pidfile"
      echo "stop: the recorded server is gone; removed the stale pidfile and killed nothing"
    else
      echo "stop: this skill started no server on port $port; killed nothing"
    fi
    ;;
  *)
    echo "usage: $0 start|start-cf|doctor|stop [port]" >&2
    exit 2
    ;;
esac

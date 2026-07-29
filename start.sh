#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"
PID_FILE="$ROOT_DIR/.xe-schet.pid"
LOG_FILE="$ROOT_DIR/xe-schet.log"
NEXT_BIN="$ROOT_DIR/node_modules/.bin/next"

cd "$ROOT_DIR"

for required_command in npm lsof ps curl; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Ошибка: не найдена команда '$required_command'." >&2
    exit 1
  fi
done

if [[ ! -x "$NEXT_BIN" ]]; then
  echo "Ошибка: зависимости не установлены. Сначала выполните: npm ci" >&2
  exit 1
fi

if [[ ! "$PORT" =~ ^[0-9]+$ ]] || ((PORT < 1 || PORT > 65535)); then
  echo "Ошибка: PORT должен быть числом от 1 до 65535." >&2
  exit 1
fi

process_cwd() {
  local pid="$1"
  local line

  while IFS= read -r line; do
    case "$line" in
      n*)
        printf '%s\n' "${line#n}"
        return 0
        ;;
    esac
  done < <(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null)

  return 1
}

is_project_server() {
  local pid="$1"
  local cwd
  local command

  cwd="$(process_cwd "$pid" || true)"
  command="$(ps -ww -p "$pid" -o command= 2>/dev/null || true)"

  [[ "$cwd" == "$ROOT_DIR" ]] &&
    [[ "$command" == *next-server* || "$command" == *node_modules/.bin/next* ]]
}

stop_process() {
  local pid="$1"
  local attempt

  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  echo "Останавливаю предыдущий процесс (PID $pid)..."
  kill "$pid"

  for attempt in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.25
  done

  echo "Процесс не завершился вовремя, отправляю SIGKILL (PID $pid)." >&2
  kill -KILL "$pid"
}

old_pid=""
if [[ -f "$PID_FILE" ]]; then
  old_pid="$(tr -d '[:space:]' < "$PID_FILE")"
fi

if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
  if is_project_server "$old_pid"; then
    stop_process "$old_pid"
  else
    echo "PID-файл устарел: процесс $old_pid не относится к серверу этого проекта." >&2
  fi
fi
rm -f "$PID_FILE"

listener_pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | sort -u || true)"

for pid in $listener_pids; do
  if ! is_project_server "$pid"; then
    command="$(ps -ww -p "$pid" -o command= 2>/dev/null || true)"
    echo "Ошибка: порт $PORT занят чужим процессом $pid: $command" >&2
    echo "Скрипт не будет завершать его автоматически." >&2
    exit 1
  fi
done

for pid in $listener_pids; do
  stop_process "$pid"
done

echo "Собираю production-версию..."
npm run build

echo "Запускаю сервер на http://$HOST:$PORT ..."
printf '\n[%s] Новый запуск\n' "$(date '+%Y-%m-%d %H:%M:%S')" >>"$LOG_FILE"
nohup "$NEXT_BIN" start --hostname "$HOST" --port "$PORT" >>"$LOG_FILE" 2>&1 &
new_pid=$!
printf '%s\n' "$new_pid" >"$PID_FILE"

started=false
for attempt in {1..60}; do
  if ! kill -0 "$new_pid" 2>/dev/null; then
    break
  fi

  if curl --silent --fail --output /dev/null "http://$HOST:$PORT/"; then
    started=true
    break
  fi

  sleep 0.5
done

if [[ "$started" != true ]]; then
  echo "Ошибка: сервер не запустился. Последние строки лога:" >&2
  tail -n 40 "$LOG_FILE" >&2 || true
  kill "$new_pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  exit 1
fi

echo "Готово: http://$HOST:$PORT"
echo "PID: $new_pid"
echo "Лог: $LOG_FILE"

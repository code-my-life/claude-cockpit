#!/bin/sh
# Claude Code hook of the cockpit: one command for every event, declared in the
# user's settings.json by the setup assistant. It writes where the conversation
# stands to ~/.claude/cockpit/status/<session id>.json, which the cockpit reads,
# on Windows and in each WSL distro. A file, not a socket: nothing is lost while
# the cockpit is closed, and Claude Code never waits for it.
#
# POSIX sh only (Git Bash on Windows, dash or bash on Linux): no jq, no node.
# Always exits 0 and prints nothing, so it never changes what Claude Code does.

payload=$(cat | tr -d '\r\n')

# The first "key": "value" of the payload; the event fields come before tool_input.
field() {
  printf '%s' "$payload" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -n 1 | sed 's/^.*:[[:space:]]*"//; s/"$//'
}

session=$(field session_id)
event=$(field hook_event_name)
case "$session" in
  ''|*[!A-Za-z0-9_-]*) exit 0 ;;
esac

dir="${HOME}/.claude/cockpit/status"
file="${dir}/${session}.json"

case "$event" in
  SessionEnd)
    rm -f "$file"
    exit 0
    ;;
  Notification)
    # Only the notices that say where the conversation stands.
    case "$(field notification_type)" in
      permission_prompt|idle_prompt) ;;
      *) exit 0 ;;
    esac
    ;;
  SessionStart|UserPromptSubmit|PreToolUse|PostToolUse|PostToolUseFailure|PermissionRequest|Stop|StopFailure) ;;
  *) exit 0 ;;
esac

mkdir -p "$dir" 2>/dev/null || exit 0
at=$(date +%s)
# The hooks run in the background ("async"), out of order at times: a late tool hook must not
# undo the end of the turn.
case "$event" in
  PreToolUse|PostToolUse|PostToolUseFailure)
    if [ -f "$file" ]; then
      previous=$(tr -d '\r\n' < "$file")
      case "$previous" in
        *'"event":"Stop"'*|*'"event":"StopFailure"'*)
          ended=$(printf '%s' "$previous" | grep -o '"at":[0-9]*' | sed 's/"at"://')
          [ -n "$ended" ] && [ $((at - ended)) -le 2 ] && exit 0
          ;;
      esac
    fi
    ;;
esac
temporary="${file}.$$.tmp"
printf '{"sessionId":"%s","event":"%s","notification":"%s","tool":"%s","cwd":"%s","at":%s}\n' \
  "$session" "$event" "$(field notification_type)" "$(field tool_name)" "$(field cwd)" "$at" > "$temporary" 2>/dev/null \
  && mv -f "$temporary" "$file" 2>/dev/null
rm -f "$temporary" 2>/dev/null
exit 0

#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
import urllib.error

MAX_DIFF_LENGTH = 50000
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

def read_diff():
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        with open(sys.argv[1], "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    if not sys.stdin.isatty():
        return sys.stdin.read()
    return ""

def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ Error: ANTHROPIC_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    model = os.environ.get("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219")
    diff_text = read_diff()

    if not diff_text.strip():
        print("ℹ️ Diff is empty. Skipping Claude review.")
        with open("claude-review-report.md", "w") as f:
            f.write("## 🧠 Claude Code Review\n\nNo code changes detected in diff.")
        sys.exit(0)

    if len(diff_text) > MAX_DIFF_LENGTH:
        print(f"⚠️ Truncating diff from {len(diff_text)} to {MAX_DIFF_LENGTH} chars.")
        diff_text = diff_text[:MAX_DIFF_LENGTH] + "\n\n... [Diff truncated for token limits]"

    system_prompt = (
        "You are Claude, lead architect for ÆTHERGENESIS (React, TypeScript, Three.js, GLSL physics simulation).\n"
        "Review the provided git diff for PR code changes.\n"
        "Rules:\n"
        "1. Focus strictly on real bugs, security issues, type safety errors, and performance bottlenecks.\n"
        "2. Skip unnecessary praise or conversational fluff.\n"
        "3. Reference PROJECT-LOG.md and architectural constraints where relevant.\n"
        "4. If no bugs or major issues are found, state clearly that the PR looks clean."
    )

    user_message = f"Please review the following PR diff:\n\n```diff\n{diff_text}\n```"

    payload = {
        "model": model,
        "max_tokens": 2048,
        "system": system_prompt,
        "messages": [
            {
                "role": "user",
                "content": user_message
            }
        ]
    }

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }

    print(f"📡 Sending diff ({len(diff_text)} chars) to Anthropic Messages API ({model})...")

    req = urllib.request.Request(
        ANTHROPIC_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            review_text = ""
            for block in data.get("content", []):
                if block.get("type") == "text":
                    review_text += block.get("text", "")

            report = f"## 🧠 Claude Architect Code Review\n\n{review_text}\n"
            print(report)
            with open("claude-review-report.md", "w") as f:
                f.write(report)

    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print(f"❌ Anthropic API Error {e.code}: {err_body}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

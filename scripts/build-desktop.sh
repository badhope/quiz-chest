#!/usr/bin/env bash
# Linux / macOS 桌面构建入口。Windows 用同目录的 build-desktop.cmd。
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/node_modules/.bin:$PATH"

if [[ "${1:-}" == "--no-bundle" ]]; then
  exec tauri build --no-bundle
fi
exec tauri build

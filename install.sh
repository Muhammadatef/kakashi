#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://raw.githubusercontent.com/Muhammadatef/kakashi/main"
MIN_NODE=18

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
cyan() { printf '\033[36m%s\033[0m\n' "$*"; }

node_major() {
  node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>/dev/null || echo 0
}

if ! command -v node >/dev/null 2>&1; then
  red "Node.js is required (>= ${MIN_NODE}). Install from https://nodejs.org/"
  exit 1
fi

MAJOR="$(node_major)"
if [ "$MAJOR" -lt "$MIN_NODE" ]; then
  red "Node.js >= ${MIN_NODE} required (found $(node -v))"
  exit 1
fi

cyan "Kakashi Installer"
echo ""

INSTALL_ARGS=("$@")

if npm install -g @muhammadatef/kakashi 2>/dev/null; then
  green "Installed @muhammadatef/kakashi globally via npm"
  kakashi --version 2>/dev/null || true
else
  cyan "Falling back to npx (GitHub source)..."
  npx -y github:Muhammadatef/kakashi --help >/dev/null 2>&1 || true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/bin/install.js" ]; then
  node "$SCRIPT_DIR/bin/install.js" --all "${INSTALL_ARGS[@]}"
elif [ -d "$SCRIPT_DIR/../bin" ]; then
  node "$SCRIPT_DIR/../bin/install.js" --all "${INSTALL_ARGS[@]}"
else
  npx -y github:Muhammadatef/kakashi -- node bin/install.js --all "${INSTALL_ARGS[@]}"
fi

green "Installation complete."

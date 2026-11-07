#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"

# 从 tauri.conf.json 自动读取版本号（单一事实来源，改版本只改这一处）
VERSION=$(node -e "process.stdout.write(require('./src-tauri/tauri.conf.json').version)")
if [ -z "$VERSION" ]; then
  echo "error: 无法从 src-tauri/tauri.conf.json 读取 version" >&2
  exit 1
fi
echo "Release version: $VERSION"

# 各平台 tag 前缀（须与 .github/workflows/release-*.yml 的 on.tags 保持一致）
PREFIXES=(macos-apple-silicon-v macos-intel-v windows-x64-v linux-x64-v)

# 1) 本地把 4 个 tag 强制移到当前 HEAD（含已提交的全部改动）
TAGS=()
for p in $PREFIXES; do
  TAGS+=("${p}${VERSION}")
  git tag -f "${p}${VERSION}"
done

# 2) 强制推到远端（覆盖旧 tag，触发 4 条 release workflow）
git push origin -f $TAGS

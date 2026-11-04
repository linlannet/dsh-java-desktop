#!/bin/zsh
# 打包 dsh-java-desktop 桌面应用（供任意工作目录调用）：先构建前端，再 tauri build
cd "$(dirname "$0")/.." || exit 1
npm run build || exit 1
npx tauri build "$@"

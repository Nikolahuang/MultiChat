# MultiChat macOS 打包指南

## 概述

MultiChat 基于 Tauri v2 构建，Rust 代码无平台特定条件编译，天然支持 macOS。本文档说明如何将应用打包为 macOS 可用的 `.dmg` 安装包。

---

## 方案一：本地 macOS 机器直接构建（推荐）

> ⚠️ **Tauri 不支持交叉编译**，必须在 macOS 系统上构建 macOS 安装包。

### 前置条件

1. **macOS 10.15+** 系统
2. **Xcode Command Line Tools**：`xcode-select --install`
3. **Rust**：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
4. **Node.js 18+**：`brew install node`

### 构建步骤

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd MultiChat

# 2. 安装前端依赖
npm install

# 3. 构建 macOS 安装包
npx tauri build --target universal-apple-darwin
# 或者分别构建：
# npx tauri build --target aarch64-apple-darwin   # Apple Silicon (M1/M2/M3/M4)
# npx tauri build --target x86_64-apple-darwin      # Intel Mac

# 4. 产物位置
# src-tauri/target/universal-apple-darwin/release/bundle/dmg/MultiChat_0.1.0_universal.dmg
# src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/MultiChat_0.1.0_aarch64.dmg
# src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/MultiChat_0.1.0_x64.dmg
```

### Universal Binary（同时支持 Intel + Apple Silicon）

```bash
# 需要安装两个 target
rustup target add aarch64-apple-darwin x86_64-apple-darwin

# 构建通用二进制
npx tauri build --target universal-apple-darwin
```

---

## 方案二：GitHub Actions 自动构建（无需 Mac 电脑）

项目已配置 `.github/workflows/build-macos.yml`，推送 tag 即可自动构建。

### 触发自动构建

```bash
# 打 tag 触发构建
git tag v0.1.0
git push origin v0.1.0

# 或者手动在 GitHub Actions 页面点击 "Run workflow"
```

### 下载产物

1. 进入 GitHub → 仓库 → Actions → 最近的 workflow run
2. 在 Artifacts 区域下载 `MultiChat-macOS-arm64` 和 `MultiChat-macOS-x64`

### 开启自动 Release 发布

如果想自动创建 GitHub Release 并附带 DMG 文件，编辑 `.github/workflows/build-macos.yml`，在 `tauri-action` 步骤添加：

```yaml
- name: Build and Release
  uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    tagName: ${{ github.ref_name }}
    releaseName: 'MultiChat ${{ github.ref_name }}'
    releaseBody: 'See the assets below to download the installer for your platform.'
    releaseDraft: true
    prerelease: false
```

---

## 已完成的配置更改

以下文件已为 macOS 支持做了修改：

### 1. `src-tauri/tauri.conf.json`

- `bundle.targets` 从 `["nsis"]` 改为 `["nsis", "dmg"]`
- 新增 `bundle.macOS` 配置节：
  - `minimumSystemVersion`: "10.15"（Catalina）
  - `entitlements`: "MultiChat.entitlements"

### 2. `src-tauri/MultiChat.entitlements`（新建）

macOS 应用沙盒权限声明：
- `network.client` / `network.server`：允许网络访问（AI 平台 WebView）
- `files.user-selected.read-write`：文件读写（导出数据）
- `cs.allow-javascript`：WebView 中执行 JS
- `cs.allow-unsigned-executable-memory`：Tauri 运行时需要
- `cs.disable-library-validation`：Tauri 插件加载

### 3. `.github/workflows/build-macos.yml`（新建）

GitHub Actions CI 工作流，支持：
- macOS arm64 (Apple Silicon) 构建
- macOS x64 (Intel) 构建
- 手动触发或 tag 推送自动触发

### 4. 图标资源

`src-tauri/icons/icon.icns` (88 KB) 已存在，无需额外准备。

---

## macOS 特定注意事项

### 1. 无边框窗口

MultiChat 使用 `decorations: false` 自定义标题栏。macOS 上这意味着没有原生红绿灯按钮（关闭/最小化/最大化），你的自定义标题栏已通过 `minimize_window`、`toggle_maximize`、`close_window` 命令实现了等效功能。

如果想保留原生红绿灯按钮同时自定义标题栏，可在 `tauri.conf.json` 中添加：

```json
"windows": [{
  "titleBarStyle": "overlay"
}]
```

### 2. macOS 安全提示

首次打开未签名的 DMG 时，macOS 会弹出"无法验证开发者"提示。用户需要：

1. 右键点击应用 → 选择"打开"
2. 或在"系统设置 → 隐私与安全性"中点击"仍要打开"

### 3. 代码签名（分发所需）

如果需要正式分发（避免安全提示），需要 Apple Developer 证书：

```bash
# 查看可用签名身份
security find-identity -v -p codesigning

# 构建时签名
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
npx tauri build
```

在 GitHub Actions 中，需要配置以下 Secrets：
- `APPLE_CERTIFICATE`：Base64 编码的 .p12 证书
- `APPLE_CERTIFICATE_PASSWORD`：证书密码
- `APPLE_SIGNING_IDENTITY`：签名身份名称
- `APPLE_ID`：Apple ID 邮箱
- `APPLE_PASSWORD`：App-specific password
- `APPLE_TEAM_ID`：团队 ID

### 4. 公证（Notarization）

macOS 10.15+ 要求分发的应用经过 Apple 公证。Tauri 支持自动公证：

```bash
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # App-specific password
export APPLE_TEAM_ID="XXXXXXXXXX"
npx tauri build
```

### 5. WebView 兼容性

macOS 使用 WKWebView（Safari 引擎），与 Windows 的 WebView2（Chromium）有以下差异：
- CSS `-webkit-` 前缀可能需要
- `navigator.sendBeacon` 行为一致
- `document.execCommand('selectAll')` 行为一致
- 建议在 macOS 上测试每个 AI 平台的 Bridge 注入脚本

---

## 快速上手（最简路径）

如果你有一台 Mac：

```bash
# 1. 安装依赖
npm install

# 2. 一键构建
npx tauri build

# 3. DMG 在这里 ↓
open src-tauri/target/release/bundle/dmg/
```

如果你没有 Mac：

```bash
# 1. 推送代码到 GitHub
git push origin main

# 2. 打 tag 触发构建
git tag v0.1.0 && git push origin v0.1.0

# 3. 去 GitHub Actions 页面下载 DMG
```

---

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| `xcode-select: error` | 运行 `xcode-select --install` |
| `linker 'cc' not found` | 安装 Xcode Command Line Tools |
| DMG 无法打开 | 右键 → 打开，或在安全设置中允许 |
| 应用闪退 | 检查 Console.app 中的崩溃日志 |
| WebView 白屏 | 检查 CSP 设置和 WKWebView 兼容性 |
| 构建超时 | 增加 GitHub Actions timeout 或使用 rust-cache |

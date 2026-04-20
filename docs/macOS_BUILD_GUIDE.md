# MultiChat macOS 安装包构建指南

> ✅ 项目已配置完毕，可在 macOS 上直接构建 .app 和 .dmg 安装包

---

## 一、已完成的项目配置

| 配置项 | 状态 | 说明 |
|--------|------|------|
| `tauri.conf.json` bundle 配置 | ✅ | 添加了 `bundle` 节，包含 macOS 专属配置 |
| `.icns` 图标 | ✅ | 从 icon.png 自动生成，含全尺寸 |
| PNG 图标集 | ✅ | 32x32, 128x128, 128x128@2x, 1024x1024 |
| 代码跨平台兼容性 | ✅ | 无 Windows 专属 API，纯 Tauri v2 标准 API |

---

## 二、在 macOS 上构建的步骤

### 前提条件

```bash
# 1. 安装 Homebrew（如果没有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. 安装 Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# 3. 安装 Node.js（推荐通过 fnm 或 nvm）
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 20
fnm use 20

# 4. 安装 macOS 系统依赖
brew install openssl
```

### 构建流程

```bash
# 1. 克隆/进入项目目录
cd /path/to/MultiChat

# 2. 安装前端依赖
npm install

# 3. 构建（自动生成 .app 和 .dmg）
npm run tauri build
```

**或者使用 Tauri CLI 直接操作：**

```bash
# 仅构建 .app（不打包 dmg）
npx tauri build --target universal-apple-darwin

# 或指定特定架构
npx tauri build --target aarch64-apple-darwin    # Apple Silicon (M1/M2/M3/M4)
npx tauri build --target x86_64-apple-darwin      # Intel Mac
```

### 构建产物位置

```
MultiChat/
└── src-tauri/target/release/bundle/
    ├── dmg/                    # DMG 安装包
    │   └── MultiChat_0.1.0_aarch64.dmg
    ├── macos/                  # .app 应用包
    │   └── MultiChat.app
    └── ...
```

---

## 三、当前 `tauri.conf.json` 的 macOS 配置详解

```jsonc
{
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],        // 生成 .dmg + .app
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",              // macOS 专用
      "icons/icon.ico"                // Windows 专用
    ],
    "macOS": {
      "minimumSystemVersion": "10.15", // 最低支持 Catalina
      "entitlements": null,            // 无沙盒权限需求
      "exceptionDomain": null,         // 无网络例外域
      "frameworks": [],                // 无额外框架
      "signingIdentity": null,         // 开发阶段不签名
      "provisioningProfilePath": null, // 无描述文件
      "infoPlist": {
        "NSHighResolutionCapable": true,       // 支持 Retina
        "NSRequiresAquaSystemAppearance": false // 允许暗色模式
      }
    },
    "shortDescription": "多AI对话客户端 — 一键同时与多个AI助手聊天"
  }
}
```

---

## 四、签名与公证（发布到 App Store 或分发给他人时）

开发测试阶段不需要签名。如果要分发：

### 4.1 本地签名（Ad-hoc）

```bash
npx tauri build -- --sign "Apple Development: Your Name (TEAM_ID)"
```

### 4.2 公证分发（推荐）

需要 Apple Developer 账号 ($99/年)：

```jsonc
// tauri.conf.json 中配置
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
      "provisioningProfilePath": "./path/to/profile.provisionprofile"
    }
  }
}
```

然后构建并公证：
```bash
npx tauri build
# 构建完成后自动触发 notarization（Tauri v2 内置支持）
```

---

## 五、常见问题排查

| 问题 | 解决方案 |
|------|----------|
| `openssl` 找不到 | `brew install openssl` 并设置 `OPENSSL_DIR` |
| 图标显示异常 | 确认 `icons/icon.icns` 存在且格式正确 |
| `.dmg` 打不开 | 右键 → 打开，或运行 `xattr -cr MultiChat.dmg` |
| WebView 白屏 | 检查 CSP 配置是否限制了资源加载 |
| Apple Silicon 兼容 | 使用 `--target universal-apple-darwin` 构建 Universal 版本 |

---

## 六、快速命令参考卡

```bash
# 🔨 开发模式（带热重载）
npm run tauri dev

# 📦 构建正式版（Intel）
npm run tauri build -- --target x86_64-apple-darwin

# 📦 构建正式版（Apple Silicon）
npm run tauri build -- --target aarch64-apple-darwin

# 📦 构建 Universal 版本（同时支持 Intel + M 系列）
npm run tauri build -- --target universal-apple-darwin

# 🧹 清理构建缓存
rm -rf src-tauri/target

# 🏗️ 仅检查编译（不产出二进制）
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## 七、注意事项

1. **必须在 macOS 上构建** — Tauri 的 macOS 打包依赖系统工具（codesign、hdiutil 等），无法跨平台交叉编译
2. **首次构建较慢** — 需要编译 Rust 依赖和前端资源，后续增量构建会很快
3. **Universal 二进制体积较大** — 包含两套架构，约 ~150MB；单架构约 ~80MB
4. **WebView 内核** — macOS 上 Tauri v2 使用 WKWebView（基于 WebKit），与 Windows 的 WebView2 行为略有差异，建议在 Mac 上实际测试各 AI 平台的发送逻辑

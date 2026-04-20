# MultiChat 项目记忆

## 项目概述
MultiChat — 基于 Tauri v2 + React + Zustand 的多AI桌面聊天客户端
- 核心：同时向多个 AI 平台发送消息，收集/展示回复
- 架构：Rust 后端创建子 WebView → mc:// 自定义协议通信 → JS 注入(Bridge v3) → Tauri emit 推送前端
- 13 个国产 AI 平台适配（DeepSeek/Kimi/智谱/千问/豆包/元宝/MiniMax/星火/天工/iFlow/LongCat/IMA/小米Mimo）
- 双模式：同步模式（广播+标签切换）/ 群聊模式（多AI角色+上下文注入）

## 技术栈
- Frontend: React 19 + Zustand 5 + TailwindCSS 4 + Vite 6 + react-markdown + remark-gfm + rehype-highlight
- Backend: Tauri v2 (Rust) + tokio + mc:// 自定义 URI 协议
- 存储：localStorage (zustand/persist)

## 项目路径
- 项目根目录: f:\mixapp\MultiChat
- 前端: src/renderer/ (App.tsx, stores/appStore.ts, components/)
- 共享类型: src/shared/ (types.ts, providers.ts)
- Rust 后端: src-tauri/src/ (lib.rs, commands.rs, js_handlers.rs, providers.rs)

## 关键设计决策
- WebView 懒加载：只在发送消息时创建，不在启动时
- Bridge v4 注入脚本：通过 Image.src + sendBeacon 双通道与 Rust 通信，支持平台特定选择器和 30s 思考期
- 数据持久化：zustand/persist + localStorage，只持久化关键数据（groups、syncMessages、enabledProviders、theme）
- broadcast_message 使用 tokio::time::sleep 异步等待，不阻塞 UI；发送成功后必须同步更新 state.responding HashMap（关键！）
- destroy_webview 通过 navigate to about:blank 释放页面资源
- contenteditable 编辑器注入统一用 `execCommand('selectAll')` + `execCommand('insertText')`，**禁止用 `selectNodeContents(t)`**

## 2026-04-19 完成的改进
1. 修复天工AI发送脚本 JS 语法错误（for循环缺闭合括号）
2. broadcast_message 从 thread::sleep 改为 tokio::time::sleep（异步不阻塞）
3. 删除 ensure_webview_exists 中嵌套 tokio runtime 的危险代码
4. destroy_webview 改为 navigate to about:blank 释放内存
5. 添加 zustand/persist 数据持久化（群聊/消息/设置重启保留）
6. 添加 Markdown 渲染（react-markdown + remark-gfm + rehype-highlight + GitHub Dark 主题）
7. 添加发送失败 UI 反馈（Sidebar 红色 AlertCircle 图标 + Rust emit send-failed 事件）
8. 清理项目根目录调试输出文件
9. 修复启动白屏问题：zustand persist hydration 异步延迟 → 加 isHydrated/onHydrated 机制，hydration 完成前显示 loading；初始化 useEffect 去掉 enabledProviders/activeProviderTab 依赖改用 getState() 读取，避免 hydration 后重复触发
10. Bridge v3→v4 升级：平台特定 AI 消息 DOM 选择器（解决回复检测不到的问题）、30s 思考期防过早判定空闲、回复捕获失败 2s 后重试
11. 修复 Kimi 白屏：URL 从 kimi.com 改为 kimi.moonshot.cn
12. 修复通义千问输入框异常：ProseMirror 编辑器不用 selectAll+delete（会破坏编辑器状态），改用 Selection API + insertText
13. 修复天工AI发送：return 语句缺右括号 + 增加更多发送按钮选择器
14. 所有 contenteditable 编辑器的文本注入统一改为 Selection API 方式（不再用 selectAll+delete）
15. **关键 Bug**：broadcast_message 发送成功后必须同步更新 Rust 端 state.responding HashMap（设为 true），否则 Bridge 后续的 responding:false 被 changed 检查过滤 → 回复概览永远显示"等待回复"
16. 所有 contenteditable 编辑器注入统一改为 `execCommand('selectAll')` + `insertText`（替代 `selectNodeContents(t)`，后者会选中 DOM 结构包装元素导致 ProseMirror 等富编辑器状态损坏、发送按钮失效）
17. 登录状态计数优化：WebView 未创建时显示"—"而非误导性的"0/12"
18. 移除右侧"回复概览"组件：状态不可靠，改为纯 tab 切换 + 底部回复面板模式
19. Tab 点击切换 WebView 对话：点击上方模型名称 → create_webview + show_provider 切换到对应平台对话界面 + 底部回复面板覆盖层显示捕获内容
20. 窗口自适应修复：w-screen h-screen 改为 w-full h-full，html/body/#root 全部设为 100% 填充
21. **WebView 遮挡修复**：新增 webview_top_offset（Rust AppState），前端用 ResizeObserver 测量 Tab 栏+信息栏高度动态通知后端，WebView 的 y 坐标和高度都基于此偏移计算，不再从窗口顶部 (y=0) 开始覆盖
22. **Resize 空边修复**：前端 ResizeObserver 同时测量侧边栏宽度（DOM 查询 bg-[#0d0d15] 元素）→ set_sidebar_width；Rust resize handler 同时更新 WebView 位置(x,y)和尺寸(w,h)；去掉硬编码 titleBarHeight=36 改用实际测量
23. **群聊界面重构**：去掉右侧成员面板改为顶栏紧凑头像+可折叠成员栏；去掉WebView模式切换改为点击头像打开；useMemo 重写消息合并逻辑（Set去重）；去掉系统提示消息；添加5分钟时间分组；用户消息右对齐蓝气泡、AI消息左对齐带头像+昵称（类微信）
24. **群聊成员栏始终可见**：成员栏从可折叠（默认关闭）改为始终展示，每个AI成员显示为带图标+昵称+状态的可点击按钮，点击打开其WebView对话页面
25. **主题切换系统**：CSS 变量体系（:root 深色 + .light-theme 浅色）+ store setTheme action + data-theme 属性切换；SettingsDialog 组件含主题切换/数据导出(MD+JSON)/清除数据/关于信息；TitleBar 新增设置按钮；核心组件(Sidebar/TitleBar/GroupChat/App)全部适配 CSS 变量
26. **Tauri 插件**：已注册 tauri-plugin-dialog + tauri-plugin-fs；capabilities 配置 dialog:allow-save + fs:allow-write-text-file 权限

## macOS 打包支持（2026-04-20）
- tauri.conf.json：targets 加入 dmg，新增 bundle.macOS 配置（minimumSystemVersion: "10.15", entitlements）
- MultiChat.entitlements：网络、文件、JS、内存权限声明
- GitHub Actions CI：.github/workflows/build-macos.yml（arm64 + x64 双架构）
- Rust 代码无平台特定编译，跨平台兼容
- 详细文档：docs/macos-build-guide.md

## 待做
- 添加设置页面（API Key/代理等）
- 亮色主题
- 国际 AI 平台（ChatGPT/Claude/Gemini）
- iflow/longcat 专用发送脚本
- CSP 安全策略收紧
- IPC 类型定义与实际调用同步
- macOS Bridge 脚本 WKWebView 兼容性测试
- Apple 代码签名和公证配置

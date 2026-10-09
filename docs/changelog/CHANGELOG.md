# Changelog

本文件按时间倒序记录本仓库相对于上游 `meomeo-dev/deepseek-cdp-cli` v0.2.1 的本地改动。
`package.json` 版本仍为 `0.2.1`，以下改动尚未发版。

## Unreleased — 2026-10-09（linux 分支）

### Fixed — Linux / Garuda

- Chrome 可执行文件改为按候选顺序探测（`src/shared/runtime/managedChromeDefaults.ts`）。
  此前 linux 分支直接返回裸名 `google-chrome` 并依赖 PATH 查找，但 Arch / Garuda 只提供
  `google-chrome-stable`，Debian 提供 `google-chrome`，只装了 Chromium 的系统则只有
  `chromium`，默认路径在这类发行版上必然启动失败。
  候选顺序：`/usr/bin/google-chrome-stable` → `/usr/bin/google-chrome` →
  `/usr/bin/chromium` → `/usr/bin/chromium-browser` → `/snap/bin/chromium`；
  全部不存在时回退到裸名 `google-chrome`，保留原行为。
- 修正 `test/managedChromeDefaults.test.ts` 中 win32 fixture 在 POSIX 主机上必然失败的
  断言：fixture 原先用 `join()` 拼目录，而 win32 解析使用反斜杠分隔符，真实 `existsSync`
  探测永远匹配不上。这是唯一一个在 Linux 上跑不起来的既有用例。

### Tests

- 新增三个 linux 可执行文件解析用例：`google-chrome-stable` 优先、`google-chrome`
  优先于 `chromium`、回退到 `chromium`。

### Known limitations

- user data dir 仍固定为 `~/.config/google-chrome`，不会探测 `~/.config/chromium`。
  只用 Chromium 的系统需要显式传 `--chrome-user-data-dir ~/.config/chromium`。

## Unreleased — 2026-10-09

### Fixed — Windows 兼容性

- 原子写入在 Windows 上跳过目录 `fsync`
  （`src/infrastructure/preferences/privateAtomicFile.ts`）。Windows 不支持对目录句柄
  `fsync`，此前偏好设置与 last-session 指针的写入会抛 `EPERM`，导致 `reply` 已经拿到内容
  却报失败、用户看不到回复。
- Chrome 可执行文件与 user data dir 的发现改为「按候选顺序探测第一个真实存在的路径」
  （`src/shared/runtime/managedChromeDefaults.ts`）。可执行文件新增 `PROGRAMFILES(X86)`
  与 `LOCALAPPDATA` 候选；user data dir 的 home 目录回退到 `USERPROFILE`。
- cookie 路径按平台解析（`src/domain/browser/browserRuntimeManager.ts`）。Windows 上
  Chrome 使用 `Default/Network/Cookies` 而非 `Default/Cookies`，此前
  `--clone-chrome-profile` 在该平台上会 fail closed。
- 页面快照读取对 SPA 导航竞态做重试（新增 `src/shared/runtime/retryPageEvaluation.ts`）。
  不再抛 `Execution context is destroyed`。默认 5 次、线性退避 200ms；非导航类错误
  快速失败。已接入 composer 快照读取与 localStorage 读出/写入。

### Changed — DeepSeek 新版网页适配

- 新版网页移除了 Instant / Expert / Vision 模式选择器，改用「深度思考」与「智能搜索」
  两个开关（`src/infrastructure/deepseek/deepSeekComposerMode.ts`）。检测不到模式选择器时
  不再 fail closed，而是保留当前模式并用 DeepThink / Search 表达意图；页面上仍有选择器时
  保持原有行为。

  | 请求 | 新 UI 下的实际结果 |
  | --- | --- |
  | `--chat-mode expert` | Instant + DeepThink `on`（Expert 模型不可达） |
  | `--chat-mode instant` | Instant，是否推理由 `--deep-think` 决定 |
  | `--chat-mode vision` | 无对应模式，静默跳过，不报错 |

  请改用 `--deep-think on|off` 与 `--search on|off` 表达意图。

### Tests

- 新增 `retry-page-evaluation`、`managedChromeDefaults`、`private-atomic-file`、
  `deepseek-composer-mode-selector-fallback` 四组单测。
- 修正 `deepseek-stored-session`、`http-service-routes`、`openai-http-state-foundation`
  中硬编码的 POSIX 路径断言，使其在 Windows 上可通过。

### Docs

- README：Windows 使用说明与 `reply.chatMode` 语义变化。
- SKILL.md：新增「平台与 Windows」章节与 chat-mode 降级对照表。

### Known limitations

- 包 `os` 字段仍声明 `["darwin"]`，Windows 安装需 `npm install -g ... --force`。
- Windows 上不要使用 `--headless`：headless Chrome 的 UA 含 `HeadlessChrome`，
  DeepSeek 会跳转到 `/sign_in` 并最终超时。macOS 不受影响。
- 在 IDE 集成终端（CodeBuddy / Craft）中执行时，需先 `$env:NODE_OPTIONS=""`，
  否则注入的删除保护 shim 会拦截 CLI 清理 runtime 目录。
- 偏好设置目录仍沿用 `~/.config/deepseek-cdp-cli`，未使用 `APPDATA`；目录权限位
  `0o700` 在 Windows 上无实际效果。
- `browserRuntimeManager` 新增的 `platform` 注入参数在生产路径上尚无调用方传入，
  实际走 `process.platform` 兜底。

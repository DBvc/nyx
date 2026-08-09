# Experiment 01：上下文 Composer 技术方案

> Status: v3.1 sealed; E1-E4 completed and reviewed; E5 stopped after
> `RC-E5-4K-MEMORY-01` VALID_STOP; no E slice is executable pending user decision
>
> Plan ID: `context-composer-exp-01`
>
> v3.0 把已通过的 Worker、preview 与 stable URL 证据组合成生效方案；独立
> review 已以 `RC-V3-PLAN-03` PASS。v2.1 E0E、v2.0 E0D、
> v1.9 E0C 与其余 v1.8 正文是失败的历史候选与证据记录，不是当前实现
> 方案或 scope 授权。
> 旧 v1.8 的 Worker/JPEG allowlist、容量数值以及 E1-E5 切片均已失效；只有
> 下述 v3.0 选择与重写后的 E1-E5 切片生效。
>
> 当前生效约束：E1 已在 `1bf91cf` 完成并通过 `RC-E1-CODE-02`；E2 已在
> `36e32e6` 完成并通过 `RC-E2-CODE-03`；E3 已在 `7677868` 完成并通过
> `RC-E3-CODE-02`；E4 已在 `b13d3b8` 完成并通过 `RC-E4-CODE-02`。下述 v3.1
> amendment 已通过 `RC-E5-PLAN-A-02`；E5 随后在 fresh-process 4K import
> memory gate 停止，等待新的用户决策。
> Electron main 仍权威验证并持有 durable state，不得扩大 scope。历史状态以
> [runthrough 候选表](./context-composer-experiment-runthrough.md#historical-v18-candidate-limits-status-reference)
> 为准。
>
> E0B 观察仅限 Electron 41.7.2 / Chromium 146.0.7680.216 / macOS 26.6.1
> arm64 与已记录的 synthetic fixtures：OS-temp production-shape Vite
> Worker harness 的静态 Worker 在 dev、build、`app.asar` 加载，但 synthetic
> JPEG 输出 ICC APP2，触发 v1.8 候选 allowlist 的拒绝条件。

## v3.0 生效方案：stable image URL 的最小多模态闭环

### 一句话方案

PNG/JPEG 通过 picker、paste 或 drop 进入原生 textarea Composer；sandboxed
Renderer 的一个 Web Worker 一次 decode，同时生成移除来源 metadata 的 same-MIME
canonical 与 512-edge PNG preview；JPEG 只保留已实测的固定 ICC。Electron main
严格验证并先持久化图片 pair，
再提交 current-thread v3 pending turn；只有收到 main 的 `chat:accepted` 后，
Renderer 才清草稿并插入消息。已发送与 hydration 图片只使用 main-authorized
`nyx-image:` stable URL；Provider 仍由 main 临时构造 data URL，OCaml 仍只有文字投影。

这不是通用附件或 Asset 平台。首轮 assistant 仍只输出现有文字流；未来富文本、
HTML、Artifact 与 Generative UI 使用独立的 assistant output model，不把它们预埋进
本轮 user image contract。

### 范围与固定选择

| 问题          | v3.0 选择                                                                |
| ------------- | ------------------------------------------------------------------------ |
| 输入          | text、PNG、JPEG；支持 text-only、image-only、text + ordered images       |
| 入口          | 原生 file input、系统粘贴、拖放；普通文字 paste/drop 保持浏览器行为      |
| 内容模型      | 现有 `content` + 可选有序 `imageRefs`；不引入通用 parts union            |
| 转换          | 一个 lazy sandboxed module Worker；`createImageBitmap + OffscreenCanvas` |
| durable owner | Electron main 的 current-thread v3 record 与同级 image pair 目录         |
| 消息显示      | preview stable URL；原图只在一个原生 `<dialog>` 内按需加载               |
| Provider      | 现有 OpenAI-compatible Chat Completions；main 临时 data URL              |
| capability    | 当前 target 一律 `unknown`，诚实尝试；不猜 model/provider 名             |
| Runtime       | OCaml 只接收 `userContent`，image-only 使用空字符串                      |

明确不做 PDF/文档/音频/视频、HEIC/SVG/GIF/WebP、OCR、裁剪/标注、拖动排序、
远程 upload/file id、hash dedupe、跨 thread 共享、数据库、通用 Asset/thumbnail
service、Worker pool、capability registry、assistant image/rich output、新 OCaml
协议或新 IPC namespace。真实 target 若只接受远程上传而不接受 inline image data URL，
本实验对该 target fail closed，不扩 scope。

### 证据如何约束设计

| 已有证据            | v3.0 采用的结论                                                                         |
| ------------------- | --------------------------------------------------------------------------------------- |
| E0 main encode STOP | main 只验证，不同步重编码                                                               |
| E0B/E0C             | Worker same-MIME canonicalization 可用；JPEG 只接受已证实的 exact APP0/APP2             |
| E0D                 | 持久化 512-edge PNG preview；消息流不 decode 全尺寸历史图                               |
| E0F                 | full/preview 使用 standard+secure main-authorized stable URL 与 native cache            |
| E0 request-build    | 当前 thread canonical 总量保留 32 MiB 上界，E5 必须复测真实 UI + request-build 组合峰值 |

E0F 的临时 scheme 名与 harness 不直接复制；复用的是 canonical Request identity、
main-only id authorization、`net.fetch(file:)` streaming、Renderer JS byte isolation、
native cache reuse 与 restart revocation 这些已经通过的行为。

### Owner 与数据流

```mermaid
flowchart LR
  Draft["Renderer draft<br/>File + derived preview URL"]
  Worker["sandboxed Worker<br/>canonical + preview bytes"]
  Bridge["existing startChat bridge<br/>optional image refs + new bytes"]
  Main["Electron main<br/>strict validation"]
  Files["current-thread image pairs"]
  Record["current-thread v3 JSON<br/>content + refs only"]
  Accepted["chat:accepted<br/>identity only"]
  Protocol["nyx-image protocol<br/>preview/full stable URLs"]
  View["Renderer thread projection<br/>refs + availability"]
  Provider["OpenAI-compatible provider<br/>transient data URLs"]
  Runtime["OCaml runtime<br/>text only"]

  Draft --> Worker --> Bridge --> Main
  Main --> Files --> Record --> Accepted
  Record --> Protocol
  Accepted --> View
  Protocol --> View
  Record --> Provider
  Record --> Runtime
```

- Renderer 只拥有未发送草稿、短命 preview object URL、Worker 生命周期和可重建
  UI projection；accepted 后立即丢弃 canonical/preview bytes 并 revoke draft URL。
- Electron main 单独拥有接受策略、file IO、durable record、协议授权、Provider
  materialization、target resolution 与错误净化。Worker 输出始终是不可信输入。
- Provider 不看到 local path、Nyx image id、preview 或原文件名；Renderer 不看到
  local path、full bytes、credentials 或 raw Provider config。

### 最小 shared contract

新增边界类型只有：

```ts
interface NyxChatImageRef {
  imageId: string
  mediaType: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

interface NyxChatNewImage {
  imageId: string
  canonicalBytes: Uint8Array
  previewBytes: Uint8Array
}
```

- `turnUserMessage.imageRefs` 与 request `newImages` 都是可选字段；text-only 请求继续
  完全省略，保持现有 text body 与 bridge fixture。含图 `new_user_message` 必须两者
  同序一一对应；Retry 固定不带 `newImages`，复用 durable refs/files。
- `NyxChatInputMessage` 保持现有纯文字 compatibility list。Renderer 仍提交它供 main
  比对；main 从 durable record 单独重建含 refs 的 main-only Provider messages。
  Compatibility history 必须为每个 durable user turn 保留一项；含 refs 的 image-only
  user 也必须保留
  `{ role: 'user', content: '' }`，确保下一轮、Retry 与 hydration 后的 history 一致。
- Renderer message projection 可带 `images: Array<NyxChatImageRef & { available: boolean }>`；
  availability 不是 durable identity。record 不存 URL、bytes、path、data URL、原文件名
  或 Renderer 声明的 byte size。
- `chat:accepted` 只增加 `requestId`、`userMessageId`、`assistantMessageId` 与
  `turnIntent`；不返回 bytes、refs、content、URL、target 或 transaction metadata。
  Renderer 用被锁定且已被 main 严格接受的 active turn 构造消息。

URL shape 是一个窄 shared boundary：`nyx-image://preview/<uuid>` 与
`nyx-image://full/<uuid>`。只共享 scheme/variant 与 URL builder；main route parser、
record authorization 和 file path 仍是 main-only。图片 ID 在 current thread 内永不
复用，因此 URL 对同一 immutable pair 稳定。

### v3 record 与 file layout

- `CurrentThreadRecordV3` 保留 v2 全部字段；每个 turn 增加 required `imageRefs`，
  可为空。含图时 `userContent` 可为空；二者不能同时为空。
- v1/v2 stable read 不写盘。v1 的文字 mutation/recovery 仍只到 v2；v2 的文字
  mutation/recovery 保持 v2。第一次成功接受含图 turn 才把完整历史升级 v3，旧 turn
  补空 refs；一旦是 v3，后续 text-only turn 继续写 v3 空 refs。
- refs 是 user turn identity；append、target bind、terminal settlement、Retry 都不能
  改写。全 thread `imageId` 唯一，Retry 只更新 request id 与 assistant 状态。
- 文件固定为 `userData/threads/current-thread-assets/<imageId>.full` 与
  `<imageId>.preview`；目录 `0700`，文件 `0600`，JSON 永不保存绝对路径。
- unknown future version/malformed record fail closed：不覆写、不 Provider send、
  不协议授权、也不执行 orphan cleanup。

### 固定的首轮 guardrails

这些是该实验的实现常量，不是跨设备承诺；E5 在真实 product grid 和完整 request
build 中复核，任一 stop line miss 都阻止完成。

| 限制                       |                                         值 |
| -------------------------- | -----------------------------------------: |
| MIME                       |                                 PNG / JPEG |
| images / turn              |                                          4 |
| Renderer source / image    |                                      8 MiB |
| canonical / image          |                                      8 MiB |
| preview / image            |                                      1 MiB |
| new canonical / turn       |                                     16 MiB |
| current-thread canonical   |                                     32 MiB |
| current-thread preview     |                                     12 MiB |
| current-thread images      |                                         12 |
| current-thread full pixels |                                 24,883,200 |
| max full pixels            |                                  8,294,400 |
| max edge                   |                                    8192 px |
| preview                    | max edge 512; max 262,144 pixels; PNG only |

Preview dimensions由 full dimensions 使用固定 scale 公式计算；main 要求 Worker
输出与期望整数尺寸完全一致。main 从真实 bytes、header、decode 与 file stat 计算
所有预算，不信任 Renderer byte count。孤儿文件不计入当前 thread budget。

### Worker 与 main trust boundary

1. Renderer 先拒绝 empty、超过 8 MiB、声明 MIME 与 PNG/JPEG magic 冲突、header
   截断、edge/pixels 超限；随后把 owned source buffer transfer 给唯一 Worker。Draft
   保留原 `File`/`Blob` 引用直到 Worker ready；ready 后立即释放 source 引用，只保留
   canonical/preview buffers 与一份 preview URL。Worker crash/decode/encode failure
   保留 source，允许用户 Retry 或 remove，不保留 bitmap、canvas 或第二份 full bytes。
2. Worker 用 `createImageBitmap(..., { imageOrientation: 'from-image' })` decode 一次，
   画入同尺寸 full canvas，输出 same-MIME canonical；同一 decoded bitmap 再输出
   固定 512-edge PNG preview。JPEG quality 固定 0.95；source/full/preview buffers
   使用 transfer，bitmap/canvas 在每个 terminal path 释放。
3. Main 严格拒绝 request/nested extra fields、非 UUID、ref/payload 顺序或数量不符、
   重复/已存在 id、budget 超限。先用无状态 header parser 限制尺寸，再分别用
   `nativeImage.createFromBuffer` 交叉校验 MIME 与 decode dimensions；main 不重编码。
4. Full PNG 只允许正确顺序的 `IHDR`、一个或多个 `IDAT`、`IEND`；拒绝全部
   ancillary metadata。Preview 额外要求 `image/png`、固定计算尺寸和同一严格 chunks。
5. JPEG marker sequence 必须精确为
   `APP0,APP2,DQT,DQT,SOF0,DHT,DHT,DHT,DHT,SOS,EOI`；APP0 payload 必须是
   `4a46494600010100000100010000`，APP2 必须恰好一个且 sequence=1/count=1。
   APP2 payload SHA-256 必须是
   `c3bb12de30d7357252ec3a5ec781bd2f8a6dd8c69dd7d3de97bbac262d9e1fd4`，
   ICC bytes SHA-256 必须是
   `12afb4d9953adee0607d347daee5b78b18d6b3cab2d572b88970703f5edb37bc`。
   任一 mutation/extra/split/reorder、APP1/APP3-APP15、COM 或任意 APP0 fail closed。
6. Electron/Chromium upgrade 若改变 exact output，fixture 必须先失败并重新走证据/
   review；不得按版本、profile name 或相似 hash 自动放宽。

Renderer parser 只提供早反馈；main parser、decode 和预算才是安全边界。Main 每张
validation 的同步段继续 ≤250 ms；Worker heartbeat gap ≤50 ms，4 张 ordinary ready
≤1.5 s，单张 4K high-entropy ready ≤1 s，whole-process peak delta ≤192 MiB。

### Durable acceptance 与竞态

新消息按以下唯一顺序执行：

1. Renderer 等所有 draft `ready`，锁定文字、图片和 target，生成 fresh request/
   message/image IDs，进入 `accepting`；草稿保持可见但不可修改。
2. Main parse/validate 全部 pair；每张 image 先写 temp，再 rename `.full` 和
   `.preview` final。任一失败都不写 record，尽力删除本轮 final；cleanup 失败只留
   unreachable orphan，下次 Send 使用 fresh IDs。
3. 所有 pair final 后，Coordinator 才 create/append v3 pending record。record rename
   resolve 是唯一 durable commit 点；其后到 prepared result 不得再做 fallible IO/
   parse。只有 manager 仍拥有同一 active session 时才发 `chat:accepted`。
4. Renderer 收到 accepted 后才 revoke draft preview URL、丢弃 byte buffers、清除对应
   Composer 内容、插入 user + pending assistant，并把 captured target 写入
   `committedTarget`。随后可起草下一轮，但 active response 结束前不能再 Send。
5. Main 再 resolve target、persist attribution、投影 Runtime、materialize Provider
   messages 并发起请求。

Retry 只生成新 request id、锁定当前 target；main 把同一 durable failed turn 转回
pending 后发 accepted，不复制/重写图片。Renderer accepted 前保留原 assistant error
和当前未发送 Composer draft，accepted 后才把 assistant 改回 pending。

当前 adapter contract 只承诺本地 app-process crash 边界：`rename` resolve 才提交，
reject 表示 final 未改变；record rename 后无 fallible post-step。图片已 rename、record
未 commit 时 crash 可留 orphan；record commit 后 crash 在 restart 被 pending recovery
恢复。这里不宣称 power-loss/OS/filesystem durability，也不加 fsync、transaction manager、
第二个 Store 或 fresh-disk recovery。

- accepted 前 parser/image/record failure：解锁并保留完整草稿，不插消息，不改
  `committedTarget`，不触发 target/Runtime/Provider。
- Stop 在 record commit 前生效：AbortSignal 在 pair 间、write 前、record 前检查；
  cleanup 后用现有 `chat:error(cancelled)` 结束 accepting，草稿保留。
- Stop 与 commit 竞速且 record 已提交：先 accepted，再 settle cancelled；不 resolve
  target/Runtime/Provider。
- New thread 先使 active session 失效并 abort，等待旧 operation，再 reset record；
  record reset 成功后才删除 image directory。目录删除失败只留不可达 orphan；record
  reset 失败则旧 record/files 保持可恢复。失效 session 不发迟到 accepted/error。
- target bind write 失败发生在 accepted 后：不启动 Runtime/Provider，也不尝试新的
  模糊 terminal write；Renderer 复用现有非 Retry `unknown` safe error 并提示重启，
  restart 将 unbound pending 恢复成 retryable interrupted turn。

### Stable image protocol 与 hydration

- 在 `app.ready` 前注册 product scheme `nyx-image`，privileges 只有 `standard` 与
  `secure`；显式禁用 Fetch API、CORS、CSP bypass、Service Worker、extensions 与
  media stream。`protocol.handle` 在 ready 后使用 default session。
- Authorization 只使用 handler 收到的 canonical Request：GET、exact scheme、host
  `preview | full`、一个 UUID path segment、无 observable query。Chromium 已抹除的
  raw port/case/fragment/credentials spelling 是同一 identity；unknown id/host、
  traversal、query、non-GET fail closed。若 credentials 在未来 Electron 中重新成为
  handler 可观察字段，现有 username/password 检查必须 fail closed。
- Handler 每次 cache miss 从 current durable record 确认 id 仍被引用，再构造 main-only
  deterministic path，拒绝 symlink/non-file/empty/oversized file，并用
  `net.fetch(file:)` 的 `Response.body` streaming 返回。Measured path 不 `readFile`/
  `arrayBuffer` full bytes；preview 固定返回 `image/png`，full 使用 durable ref MIME，
  response 使用 immutable native-cache headers。
- Snapshot 只返回 refs + availability，不返回 bytes/URL/path。Hydration 对每个 pair 做
  bounded stat/header availability check；一张缺失只变 placeholder，不阻断文字/其他图。
  Provider/Retry/继续对话需要任一 missing/corrupt full 时整体 fail closed，不静默省略。
- Renderer 通过 shared URL builder 显示 preview；dialog 打开时 DOM 最多一个 full
  `<img>`，close 后移除。Sent/hydrated images 不创建 Blob/object URL；E0F native cache
  负责重复 open。New thread 清空 projection，image IDs 永不复用；逻辑删除不承诺
  forensic secure erase。
- Reconcile 只在 record 成功解析为已知 version 后删除未引用 pair/temp；record 不存在
  可清整个 directory。malformed/unknown record 禁止 GC。

这里不承诺同一进程内撤销一个 Renderer 已经渲染过的 immutable native-cache URL：
New thread 会清 DOM、删除授权记录且 image id 永不复用，Renderer JS 仍不能读取 bytes；
若旧 URL 被故意保留，它可能在该进程退出前再次显示。要求即时撤销将需要禁用 native
cache 或增加 token/version owner，都会推翻 E0F 的内存路径，本实验不引入。

### v3.1 E5 canonical identity amendment

E5 packaged product 首轮在 Electron 41.7.2 / Chromium 146.0.7680.216 发现：尚未
warm 的 `nyx-image://user:pass@full/<authorized-id>` 在进入 handler 前被规范化为
canonical URL，首次 load 成功且 `currentSrc` 不含 credentials。handler 无法观察
raw username/password，和已批准的 non-default port alias 属于同一平台边界。
独立 review `RC-E5-EVIDENCE-01` 判定原 credentials fail-before-handler 要求不可实现，
结论为 `VALID_STOP`。

用户批准继续采用 policy A：授权唯一依据仍是 handler 收到的 canonical `Request`
与 main-owned durable id map。任何在该边界前被 Chromium 擦除的 raw spelling，
包括已观察的 port、case、fragment 与 credentials，都只是同一资源 identity；它不
携带授权、不进入持久化、不写日志、不转发 Provider。observable query、wrong host、
unknown id、traversal、non-GET 仍必须 fail closed，Renderer fetch/XHR/canvas 仍必须
阻断，restart 后 main 撤销 id 仍必须压过 native disk cache。

这项 amendment 不改变 scheme、URL builder、handler、parser、IPC、Store 或产品代码。
parser 保留 username/password 检查，以便 Chromium/Electron 未来若不再擦除它们时
自动拒绝。绑定独立 plan review `RC-E5-PLAN-A-02` 已 PASS；E5 用 fresh process 重跑
security/revocation。4K import 内存只采 ingress → Worker → accepted/main-validation
settle，Provider build 前结束；product grid + 32 MiB Provider build 仍在独立组合相位
按原 ≤192 MiB 红线测量，不能沿用首轮混相的 302.328 MiB 判定通过或失败。

Fresh-process 分相重跑使用真实 drop handler 与 production Worker。3840×2160
high-entropy JPEG source 为 5,801,864 bytes，canonical 为 8,359,933 bytes，preview
为 500,128 bytes；ready 243.3 ms、heartbeat 14.2 ms、accepted/main prepare
124.1 ms 均通过。页面稳定后，以 20 ms 间隔取得 20 个 baseline samples，median
为 406.156 MiB；约每 20-27 ms 的 whole-process sampling 在 ready 前 t=169 ms
达到 716.016 MiB，delta
+309.859 MiB，超过固定 +192 MiB。独立 evidence review
`RC-E5-4K-MEMORY-01` 判定 `VALID_STOP`：峰值属于 import Worker 相位，不是后续
Provider build；无需重测。E5 的 grid/32 MiB Provider、revocation 与 real-target
remainder 未运行，当前没有可执行 E slice。

### Provider、错误与 Runtime

- Main-only Provider message 从 v3 record 构造；text-only 保持现有 string content。
  含图 user 使用 text-first content array，随后按 refs 顺序追加
  `{ type: 'image_url', image_url: { url: 'data:<mime>;base64,...' } }`；image-only
  不制造空 text part。system/assistant 保持 string。
- Provider build 用同一个 bounded canonical reader，顺序读取、复验并 materialize；
  body/log/snapshot/error 不出现 path、image id、original filename 或 Base64 回显。
- 现有 target 没有可信 capability，一律 `unknown` 并尝试。Image-bearing 400/413/415
  映射为 v3-only safe retryable `content_rejected`；先 durable settle，再发 error，用户
  可换 target Retry。Text-only 400 继续是现有 non-retryable `invalid_request`。
- Runtime replay/start 只投影 `userContent`；image-only 传空字符串。Provider context
  永远不从 OCaml state 反推，不改 OCaml type、action 或 NDJSON protocol。

### Renderer 体验

- 保留现有 textarea。上方增加紧凑 preview shelf 与一个 accessible attachment button，
  触发 hidden native file input。Paste 只接管图片 items；drop 只有在包含支持图片时
  prevent navigation。第 5 张或超限立即用 `aria-live` 说明。
- Draft 状态只有 `preparing | ready | failed`。Preparing 显示 skeleton，不 decode
  full source 到 DOM；ready 从 Worker preview bytes 建立一个 object URL；failed 保留
  原 source 并显示 Retry/remove。每项有序号、状态和明确 remove button；不支持 reorder。
- Send 条件为 trimmed text 或至少一张 image，且全部 draft ready。Enter/Shift+Enter/
  IME 保持现状。Accepting 时草稿锁定且 Stop 可用；accepted 后才清该快照。Streaming
  时仍可编辑下一轮草稿，但不能 Send。
- User message 固定 text-first、preview grid second。Image-only sidebar title/preview 为
  `Image`。Unavailable pair 使用固定 placeholder。点击 available preview 用原生
  `<dialog>` 打开 stable full URL；Escape、focus return 与按钮 label 可访问。
- Draft preview URL 在 remove、accepted、New thread、unmount、stale Worker result 和
  error replacement 中恰好 revoke；sent/hydrated path 没有 Renderer URL cache/helper。

### 实现切片与放行顺序

`RC-V3-PLAN-03` 已 PASS，E1-E4 已完成并通过 review；E5 在 v3.1 amendment 通过
独立 review 后成为唯一可执行切片：

1. **E1 — contract + current-thread v3**：image refs、v3 schema/migration、identity、
   snapshot shape；不写文件、不注册 protocol、不改 Provider/UI。
2. **E2 — main import + accepted + protocol**：strict parser/validation、pair files、
   orphan/reset、stable URL handler、availability、`chat:accepted` 与 Stop/New thread
   commit boundary；不启用 UI ingress/Provider images。
3. **E3 — Provider + Runtime projection**：main-only materialization、text body parity、
   image array、`content_rejected`、Retry、empty text Runtime regressions。
4. **E4 — Composer + thread UI**：Worker、picker/paste/drop、draft lifecycle、accepted
   reducer、preview grid、dialog、placeholders；首次启用 product ingress。
5. **E5 — full acceptance + docs**：自动和真实 target runthrough、combined product
   memory、packaged protocol/Worker、restart/rollback，失败回到 owning slice。

任何片都不得顺手加入 general Asset abstraction、new IPC namespace、dependency、
utility process、contenteditable、capability policy 或 assistant rich output。

### 必须留下的自动验证

- v1/v2 byte-stable read、v1 text→v2、v2 text stays v2、first image→v3、v3 text stays
  v3、unknown v4/malformed no-write/no-GC。
- request/ref/pair parser 的 extra-field、UUID、ordering、budget、magic/header/decode、
  exact PNG/JPEG metadata adversarial fixtures；Electron upgrade 改 ICC 时测试先失败。
- image pair write/rename/record failure、cleanup double failure、crash orphan、reset order、
  pending recovery、bind failure；accepted 绝不早于 record commit。
- protocol canonical alias、unknown/query/host/traversal/non-GET/credentials、fetch/XHR/
  canvas negative、path leak、native cache exact-once、restart revocation、`app.asar`。
- text-only Provider body byte-for-byte parity；text+image/image-only/multi-turn ordering；
  32 MiB bounded read/request build；safe error no Base64/path；target switch Retry no copy。
- reducer pre-accepted failure retains draft/target/error state；accepted new/retry commit；
  Stop before/after commit、New thread stale event、Worker stale result、all draft URL revokes。
- packaged product 通过真实 E4 import handler 分别跑 4 张 ordinary 与单张 4K
  high-entropy fixture，覆盖 picker/paste/drop 到 Worker 与 main validation：4 张 ready
  ≤1.5 s、4K ready ≤1 s、heartbeat gap ≤50 ms、单张 main sync ≤250 ms、各自
  whole-process peak delta ≤192 MiB。
- product grid at 12 refs/24,883,200 pixels, max-image grid + one full dialog, and 32 MiB
  Provider build while UI is mounted: open ≤500 ms、heartbeat ≤50 ms、main sync ≤250 ms、
  whole-process peak delta ≤192 MiB，repeated full open post-close plateau 继续采用
  E0F 16/8 MiB noise allowance。任一失败 E5 不完成。

### Rollout 与 forward-only 边界

这是个人本地应用，不建 feature flag、telemetry 或灰度系统。E1-E5 与真实 runthrough
全过后才进入日常使用。一旦写入 v3，即使暂时移除新图片入口，也必须保留 v3 reader、
protocol display、历史 Provider reconstruction、Retry、missing/corrupt fail-closed、
safe error 与 orphan/reset；不能只保留“看得到图”却破坏继续对话。旧 binary 不承诺
读取 future v3，回退通过 git/backup 明确处理，不伪装成双写兼容。

## v2.2 已完成修订：E0F canonical request identity 门禁

用户在 2026-08-09 批准方案 A。E0F 不再尝试验证 Chromium 已经删除的 raw URL
语法；授权 source of truth 改为 `protocol.handle` 实际收到的 canonical
`Request`。一个资源身份只有 `GET + exact scheme + exact host + one opaque id`。
main 仍单独持有 id → immutable validated file；Renderer 仍只看到 URL 与 safe
display metadata。

显式 port、host case 或 fragment 等若在 handler 前被 Chromium 消除，就不是新的
授权输入，只是同一 canonical identity 的 raw spelling。query、wrong host、
unknown id、encoded traversal 与 non-GET 若仍可观察，则必须拒绝；credentials
继续在 handler 前 fail closed。该调整不新增 token、cache owner 或 raw-string
parser，也不允许 arbitrary file access。

### E0F 可证伪矩阵

1. 在 OS temp 重建最小 standard+secure protocol harness，保留 E0E 的 default
   session、sandbox/context isolation 与 privilege deny list。准备同级别 synthetic
   full/preview dataset，不导入 production Renderer，不增加 dependency。
2. Identity 与每个 memory repetition 使用唯一、初始为空的 user-data/profile。
   Fresh identity/security process 在 full-id phase counter 为 0 时，依次 load
   canonical、`:444` alias、canonical，逐次 remove/settle。记录 `src`、
   `currentSrc`、handler URL/id 与 counter；必须得到 `0→1→1→1`。
3. Warm identity process 退出后，用同一 profile 与 scheme 重启，但 main 不注册
   target id，并把 synthetic file 暂移出 served set；不得 `clearCache`。旧 URL
   必须 load fail，证明 disk cache 不能越过 process-lifetime main authorization。
   记录后才恢复 synthetic file。
4. Identity process 重跑 JS-read negative 与 observable route matrix：fetch/XHR/canvas
   必须阻断；unknown/query/wrong host/traversal/non-GET 必须 fail closed；surface、
   response 与 log 不得出现 path。port alias 本身不再算 unauthorized。
5. Identity/revocation/security 通过后，三个 fresh production-build process 先挂载九个 stable
   preview，完成 decode/two frames/settle 后取 500 ms baseline；同一 canonical 4K
   URL open/close 三次，始终一个 full DOM node，close settle 500 ms，取最后
   200 ms working-set median。每个 isolated phase full counter 必须 `0→1→1→1`。
6. 继续使用 20 ms whole-process sampling；open ≤500 ms、heartbeat ≤50 ms、main
   sync ≤250 ms、peak delta ≤192 MiB；second/third post-close 各 ≤first+16 MiB，
   third ≤second+8 MiB。任一 miss 都 Stop，不改 redline。
7. 只有 identity、revocation、security 与三次 memory 全部通过，才把同一 build 打成
   `app.asar` 并验证 canonical image load。sanitized harness 经绑定独立审查后
   删除，只保留脱敏 evidence。

E0F 不实现 manual cache、token service、alternate URL shape、non-standard scheme、
product protocol/IPC/schema 或 OCaml change。若 canonical/alias 没有共用 native
cache identity、第二次 open 重放 handler/file transport、安全或内存失败，立即
返回用户决策。若 same-profile restart 在 id/file 撤销后仍从 disk cache load，
同样立即 Stop；不得在本门禁里换 transport 或用 cache clearing 掩盖。

### E0F evidence result（PASS）

在 Electron 41.7.2 / Chromium 146.0.7680.216 / macOS 26.6.1 arm64 的
OS-temp production-shape harness 中，canonical → `:444` alias → canonical
连续加载得到 `0→1→1→1` handler counter。Fetch、XHR、canvas readback 与 sealed
unauthorized route matrix 全部 fail closed；同 profile 重启、main 撤销 id 且移走
source 后，warmed URL 在不调用 `clearCache` 的前提下 load fail。

三个 fresh-profile memory repetition 先挂载九个 512-edge preview，再三次
open/close 同一 3840×2160 / 8,009,319-byte JPEG。whole-process peak delta 分别为
105.297、103.555、104.844 MiB；handler counter 均为 `0→1→1→1`，open、heartbeat、
main sync 与 post-close plateau 全部通过固定 stop line。同一 production build
随后从 `app.asar` 加载 3840×2160 图片，handler hit 为 1。

独立 strict review 先绑定 source fingerprint
`14637395415f46fa6697af6917b08b143e9e81890690bd7e1210850eff2a6961`，仅要求
packaged smoke 增加运行来源自证；scoped repair 只增加 `app.isPackaged`、
`app.getAppPath()` 与 `process.execPath` 三个只读结果字段。复审绑定新 fingerprint
`d6d41f4f8b52626e0ecd873f134791f7fec2b553f2cb5f900285f478ec8642fc` 后 PASS。
reviewed harness 与 synthetic data 已删除。

这个结果证明 bounded stable canonical URL / native-cache 方向可行，但不自动
选择 product protocol、shared/IPC contract 或 capacity policy。在 E0F 结束时，
E1-E5 仍 blocked，直到 revised implementation plan 通过独立 review。

## v2.1 历史修订：E0E 稳定、main 授权的图片 URL 门禁（已停止）

用户在 2026-08-09 批准推荐方向。E0E 只验证一个问题：E0D 已证明 derived
preview grid 可行后，能否让 full view 使用稳定、opaque、main-authorized 的本地
URL，从而避免每次 open 都通过 preload/IPC 创建 JS-owned full typed array、Blob
和 object URL，并保持既有安全与 +192 MiB 内存线。

### Owner、身份与生命周期

- 核心实体只有 prepared image file 与 opaque asset id；一份 immutable file
  只有一个 process-lifetime stable URL
- Electron main 单独持有 id → validated file record；Renderer 只看到 URL、MIME、
  safe dimensions 和 label，不看到 path、map 或 JS-owned full bytes
- probe-only scheme `nyx-e0e-asset` 在 `app.ready` 前只注册 `standard`、`secure`；
  不启用 CSP bypass、Service Worker、Fetch API、CORS、extension 或 media stream
- handler 只接受 exact host、单段 opaque id、无 query/credentials/port 的 GET；
  unknown、traversal 或其他 method 返回 generic 404/405
- authorized file 由 `net.fetch(file:)` 流入一个 streaming `Response`；measured
  path 不调用 `readFile`/`arrayBuffer`，不构造 full Buffer/typed array，不创建 Blob

该 scheme 名、URL shape、map 和 handler 都是 OS-temp evidence plumbing，不是
product protocol、shared type、preload method、persisted schema 或 migration 选择。
未来 owner 仍是 current-thread main durable state；E0E 不提前实现它。

### 为什么只测这一条路

- Renderer 缓存 object URL 仍需要 JS-owned full bytes，并把释放策略移到 UI；不测
- `file:` URL 暴露本地路径并绕过 main authorization；拒绝
- data URL/Base64 增加复制与常驻体积；拒绝
- token service、Asset service、Service Worker 或 general cache 都超出本问题；不建

### E0E 可证伪矩阵

1. 在 OS temp 重建最小 Electron/Vite harness，保持 default session、sandbox、
   context isolation 和 no Node integration。准备一张 3840×2160、7.5-8 MiB
   canonical 与八张 1920×1080 image，并为九张图各准备一个 max-edge 512 PNG
   preview；所有 file 在 measurement 前由 main 注册。
2. Security run 必须证明：authorized `<img>` 可加载；Renderer 不能通过任何 JS API
   读取 bytes，至少 `fetch` 与 `XMLHttpRequest` 都失败，canvas readback 被
   cross-origin 阻断；三者任一成功即 Stop。unknown id、query、credentials/port、
   encoded traversal、wrong host、non-GET fail closed；surface/error/log 不出现 path。
3. Production build 必须加载协议与图片。只有 security/memory 尚未 Stop 时才打包
   `app.asar` 并跑 smoke；没跑不得沿用 E0B 结果代替。
4. 三个 fresh production-build process 分别先挂载九个 stable preview URL，await
   decode/load/error、两帧与 settled，再取 500 ms baseline。随后用同一个 stable 4K
   URL open/close 三次；每次只允许一个 full DOM node，close 后 remove 并等 500 ms，
   取最后 200 ms sample 的 post-close working-set median。
5. 每 20 ms 采 main+Renderer+Worker/GPU whole-process working set；记录每次 open、
   heartbeat、main sync、handler hits、URL equality、post-close working set 与 live full
   count。固定线沿用 open ≤500 ms、heartbeat ≤50 ms、main sync ≤250 ms、每个
   process peak delta ≤192 MiB。首轮 warm-up 后必须 plateau：second、third
   post-close median 各自不得高于 first 16 MiB，third 不得高于 second 8 MiB。

16/8 MiB 都严格小于一帧 4K RGBA，只是 plateau noise allowance，不是产品内存
预算。若 stable URL 仍超过 peak line、首轮后继续增长、安全隔离失败，或需要
cache/service/token manager/new product IPC/dependency 才成立，E0E Stop；不得在
门禁内换 transport。

### 验证与 handoff

计划只允许五份 docs tracked change，probe 全部留在 OS temp。sanitized harness
保留到一次绑定的 independent strict review，之后删除。E0E 全部 PASS 也只能回到
技术方案收敛，不能直接解锁历史 E1-E5。

### E0E 结果

production build 与 synthetic preparation 通过。3840×2160 canonical JPEG 为
8,009,319 bytes，512×288 PNG preview 为 500,603 bytes。authorized `<img>`
显示为 3840×2160；Renderer `fetch` 抛 `TypeError`、XHR 失败、canvas readback
抛 `SecurityError`，safe surface 未出现 local path。valid GET 为 200；unknown、
query、wrong host、encoded traversal 为 404，credentials 在 handler 前被拒绝，
non-GET 为 405。

门禁停止在 explicit-port case。初次 `:443` 返回 200，因可能属于默认端口语义，
probe 只把它当作需辨别证据；随后唯一 bounded repair 改用 non-default `:444` 并
记录 handler request。结果仍为 200，而 handler 收到的 URL 已被 Chromium 规范化
为无端口 canonical URL。因此 `url.port` check 没有信息可以拒绝该 alias，sealed
exact-route authorization 在当前 standard custom scheme 上无法实现。

独立审查绑定 source-tree fingerprint
`7e11f7d0c9c87f7fd809d9a51c8aa1330687f3a5bcd136d1a6d8070d0a27053d`
并判定 `VALID_STOP`。memory repetition 与 `app.asar` 在 security Stop 后没有运行。
该结论只否决 E0E sealed standard-scheme exact-route 模型，不能外推为所有 stable
URL 方向不可行。没有冻结 capacity、ICC、preview、scheme、URL 或 transport。

## v2.0 历史修订：E0D 派生预览与按需原图门禁（已停止）

用户在 2026-08-09 批准 E0D。它只改变显示内存假设：未来 accepted image
仍由 Electron main 持有 full canonical bytes，但消息流只显示一份已验证、
持久化尺寸的派生 PNG preview；用户主动打开时，Renderer 最多解码一张 full
canonical image。E0D 只验证该模型，不写产品代码，也不恢复历史 E1-E5。

### 最小数据与 owner 模型

一个临时 accepted image pair 只有两个字节实体：

- `canonical`：Provider、Retry 和 full view 使用的 same-MIME full image；沿用
  E0C exact ICC/PNG candidate validation，但尚未冻结为产品规则
- `preview`：同一个 Worker 在 canonicalization decode 生命周期中生成的一份
  aspect-preserving PNG，max edge 512 px、max pixels 262,144、max bytes 1 MiB，
  只允许 `IHDR`/`IDAT`/`IEND`

Electron main 在 probe 中权威验证并成对持有两者。Renderer 在 accepted 后必须
丢弃 source/full bytes，message grid 只拿 preview。临时 full-open IPC 只模拟
未来读取路径，不是 product contract 选择；E0D 不决定 schema、文件布局、IPC
命名或 migration。

不增加多级缩略图、virtualization、cache、Asset/thumbnail service、Worker pool
或 dependency。preview 不是第二份可编辑 source of truth；它只由 canonical
导出，未来若缺失可重建，但首屏不得靠 hydration 时重解 full image 才显示。

### E0D 可证伪矩阵

1. 在 OS temp 用当前 Electron/Vite、sandbox/context-isolation 和静态 module
   Worker 重建 harness。Worker 对每张 source 只 decode 一次，同时输出 same-MIME
   canonical 与 512 px-edge PNG preview；验证 orientation、aspect、PNG chunks、
   size/pixels、JPEG visual、PNG alpha/visual、production build、`app.asar` 和
   E0C exact ICC candidate。
2. 四张 1600×1200 daily images 的 full+preview 在 ≤1.5 s ready；一张
   3840×2160 高熵图在 ≤1 s ready；heartbeat ≤50 ms、main sync segment
   ≤250 ms、whole-process peak delta ≤192 MiB。
3. prepare 与 display 分进程：synthetic pairs 先写 OS temp，fresh Electron
   process 在 main 读完 canonical+preview 后采 500 ms baseline，Renderer 只接收
   preview。避免把 import Worker/cache 高水位混进 display delta。
4. count/cumulative candidate 使用 12 张不同的 1920×1080 图片，共
   24,883,200 pixels；挂载真实可见 preview `<img>`，等待 decode、两帧和 settled
   sample。fresh process 重复三次，grid ready ≤500 ms，delta ≤192 MiB。
5. max-image candidate 使用一张 3840×2160 加八张 1920×1080，同样共
   24,883,200 pixels。preview grid ready 后只请求/解码 4K full image；open
   ≤500 ms、heartbeat ≤50 ms、delta ≤192 MiB。open/close 三次，始终最多一个
   full DOM image，并释放 node/object URL；fresh process 重复三次。
6. 全进程 sampling 每 20 ms 覆盖 main、Renderer、Worker/GPU。记录 environment、
   seed/hash、pair bytes/dimensions、baseline/peak/delta、ready/open/heartbeat/main
   segment、repetition 和脱敏命令。sanitized harness 经绑定独立审查后删除。

固定候选只有：per-turn 4、current-thread count 12、cumulative pixels
24,883,200、full source/canonical 8 MiB、full max pixels 8,294,400、preview
1 MiB/512 edge/262,144 pixels。它们在 E0D 全矩阵与 independent review PASS 前
都不冻结。

若 preview/grid/full-open 任一固定线失败，跨 open/close 出现增长，或需要
virtualization、多级 preview、通用 service、新 dependency/process/product IPC、
产品代码或 OCaml protocol，E0D Stop 并返回用户决策；本门禁不换第三种显示
架构。E0D PASS 后也只能重新收敛产品实现方案，不能直接沿用历史切片。

### E0D 结果

派生 preview 的生成、验证和 message grid 显示均通过：四张日常图的
full+preview 总耗时 246.0-252.4 ms，4K 为 315.2-326.3 ms；三次 fresh
preview-grid 的 ready 为 131.0-131.5 ms，whole-process peak delta 为
+29.656 到 +45.813 MiB。

门禁停止在第一轮 fresh full-open：preview grid 已挂载并建立 baseline 后，三次
单张 4K open 虽只需 77.5-82.8 ms，但 whole-process peak delta 达
+271.047 MiB，超过固定 +192 MiB。每次 close 均移除 DOM node、revoke object
URL 并回到 0 个 full image；本次封存路径仍会在每次打开时从 main 复制新的
8,366,208-byte typed array，再建立 Blob/object URL。

独立审查绑定 source-tree fingerprint
`d08f54374b7d93eccce1784413374a73d47c2049c4c5f395b7d289d3a036c879`
并判定 `VALID_STOP`。该结论只否决 E0D 临时 full-open 数据路径，不能外推为
derived-preview 模型普遍不可行。没有冻结容量、preview 常量、product ICC
allowlist 或 full-image transport；production build 通过，但有效 Stop 后未再跑
`app.asar`。

## v1.9 E0C 精确 Chromium ICC 门禁（已停止）

用户在 2026-08-09 选择方案 A。该决策当时只修订 JPEG metadata 候选规则：
Electron main 可以接受 **一个由当前 production-shape Chromium Worker
证据冻结、完整字节相等的 sRGB ICC APP2 payload**。这不是通用 ICC 支持，
也不恢复 v1.8 的实现许可。E0C 后续在 visible DOM memory gate 停止，所以下述
规则只保留为已执行证据边界，不再是 executable gate。

E0C 当时只允许在 OS 临时目录重建最小 Electron/Vite harness，复用当前
`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false` 和静态
module Worker 形状；不得导入 production Renderer、修改产品代码、增加依赖、
process、IPC、持久化、OCaml 协议或通用抽象。

### JPEG 接受边界

Main 仍把 Worker 输出当作不可信输入。只有同时满足以下条件才可接受：

- 输出 magic/header/尺寸/像素/字节/MIME 与独立 `nativeImage` decode 均通过
- JPEG marker 结构只含编码所需 marker、至多一个经 fixture 证明必要的精确
  最小 JFIF APP0，以及恰好一个 APP2
- APP2 payload 以 `ICC_PROFILE\0` 开头，sequence=`1`、count=`1`
- 整个 APP2 payload 与 E0C 冻结 payload 完整字节相等；同时记录 full payload
  和去掉 framing 后 ICC bytes 的 SHA-256

以下任一情况必须 fail closed：APP2 单字节变化、截断、扩展、重复、额外、
拆分、多段、sequence/count 变化或顺序变化；APP1、APP3-APP15、COM；任意、
重复或扩展 APP0；metadata-bearing PNG chunk。Chromium/Electron 升级后只要
payload 不再完整匹配，就必须拒绝并重新走显式证据/评审，不得按版本或
profile 名模糊匹配。

### E0C 证据与完成条件

E0C 当时必须一次性完成，不能只证明 ICC：

1. 真实 Worker 用相同 seed 的确定性 JPEG 连续运行三次；三份 canonical
   hash、marker 序列、APP2 payload hash 和 ICC hash 全部一致，否则 Stop。
2. adversarial matrix 覆盖 ICC 单字节变化、缺字节/多字节、sequence/count、
   重复/额外/拆分/换序 APP2，以及 EXIF orientation、GPS/device、XMP、COM、
   PNG text/eXIf；只允许精确已冻结形状通过。
3. 完成 dev、build、`app.asar` Worker loading，JPEG/PNG 同 MIME、orientation、
   视觉等价和 main 独立验证。
4. 完成 remove、New thread、unmount、stale result、timeout、error 和四图顺序
   生命周期；迟到结果不得产生 main 副作用。
5. 每个日常四图与 3840×2160 高熵场景各重复三次；heartbeat gap ≤50 ms，
   main 同步验证段 ≤250 ms，四图 ready ≤1.5 s，4K ready ≤1 s，source 与
   canonical ≤8 MiB，canonical pixels ≤8,294,400。
6. OS-temp visible DOM grid 必须挂载真实 object URL `<img>`，等待 decode/load/
   error 终态并采样 main+Renderer+Worker whole-process peak working set；增量
   ≤192 MiB 时才可冻结实用的 current-thread image count 与 cumulative pixels，
   否则 Stop。
7. 记录 current environment、seed/hash、重复次数、peak 采样方法和脱敏命令；
   sanitized harness 经一次绑定独立审查后删除，只保留 runthrough 证据。

最终 exact ICC 假设通过，但 12×1080p 与 8×1080p visible DOM grid 分别达到
+259.031 MiB 与 +269.453 MiB，均超过 +192 MiB 止损线。绑定临时 source-tree
fingerprint `6e12136f051cf8ecb9cc74945391eb1076100c87cda2fd4c0a1399fe4e39768c`
的独立 strict review 判定 `VALID_STOP`。E0C 没有 PASS，不冻结 product ICC
allowlist、image count、cumulative pixels 或其他容量；在 E0C Stop 时 E1-E5
继续 blocked。

## v1.8 历史候选摘要（非生效方案）

v1.8 曾提议一个纵向闭环：**PNG/JPEG 图片通过粘贴、拖放或选择进入 Composer，由 sandboxed Renderer 的一个原生 Web Worker 做临时 canonicalization，再作为 `userContent` 旁边的一组有序 `imageRefs` 被 Electron main 权威验证并持久化，随后映射为 OpenAI-compatible Chat Completions 图片输入；assistant 输出、Provider resolver、Connections 和 OCaml 协议全部保持现状。**

该候选不是“上传系统”的第一版，也不为未来搭 Asset 平台。它拟增加当前单线程聊天的图片文件目录、引用关系和生命周期，但已经失败且不生效。

## v1.8 历史候选边界（非生效策略）

| 问题          | 历史候选                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 第一轮输入    | 文字、PNG、JPEG；支持 text-only、image-only、text + images                                                                    |
| 进入方式      | 原生 file input、系统粘贴、拖放                                                                                               |
| 内容模型      | user message 保留 `userContent`，只增加有序 `imageRefs`；assistant 仍是单段文字                                               |
| 图片转换      | Renderer 内一个 sandboxed Web Worker 使用 `createImageBitmap + OffscreenCanvas`；不接触文件系统、Provider 或 durable state    |
| 图片存储      | Electron main 管理当前 thread 的一个图片目录；JSON 只存引用，不存 Base64                                                      |
| Provider 传输 | main 在请求前读取去 metadata 后的 canonical 图片并临时转成 data URL；只在含图 user message 上使用 content array               |
| 发送确认      | main 落盘 user turn 与图片后发出 `chat:accepted`，返回 canonical bytes，并提交本次 target selection；确认前 Composer 不清空   |
| 能力判断      | 现有 target 没有可信能力数据，一律按 `unknown` 诚实尝试；不猜模型名，不新增 capability registry                               |
| 失败恢复      | 图片请求被目标拒绝时保留 durable user turn，允许切换 target 后 Retry                                                          |
| Runtime       | OCaml 只接收用户文字投影；image-only 投影为空字符串，不传图片或引用                                                           |
| 回滚          | 一旦写入 v3，回退版本必须保留 reader、图片读取/展示、历史 Provider 重建、Retry 与缺图 fail-closed；不承诺旧 binary 读取新记录 |

## v1.8 历史候选的目标与完成标准

该候选只验证一个体验问题：图片能否像文字一样自然地成为本轮上下文，而不引入模式切换和数据焦虑。

完成时必须同时成立：

1. 用户可以粘贴截图、拖入图片或打开系统选择器。
2. Composer 内可以预览和删除图片；没有文字也能发送。
3. 发送确认前发生任何校验或落盘失败，文字和图片仍留在 Composer。
4. 发送确认后，用户消息中的图片与文字在当前会话和应用重启后都可读。
5. 至少一个真实 OpenAI-compatible 多模态 target 能收到正确图片并返回现有文字流。
6. Unknown target 拒绝图片后，用户可以切换 target 并 Retry，同一图片不重复导入。
7. Stop、Retry、restart、New thread、target attribution 与 text-only 请求行为不回退。
8. Provider 收到的是去除 EXIF/文本块等 metadata 后的 canonical 像素内容，不会附带用户不可见的位置、设备或拍摄信息。

## 明确不做

- PDF、Word、文本附件、音频、视频、HEIC、SVG、GIF、WebP。
- 图片压缩设置、裁剪、标注、OCR、圈选、拖动排序。
- 富文本编辑器或 `contenteditable` Composer。
- assistant 图片输出、typed rich stream、Artifact、HTML 渲染。
- 通用 Asset entity、数据库、哈希去重、引用计数、云上传、跨 thread 共享。
- Provider adapter registry、Connections schema 迁移、手工 capability 配置、模型名推断。
- 新 IPC namespace、自定义文件协议、新 OCaml action 或 Electron ↔ OCaml 消息。
- 为暂不存在的多窗口或多线程历史做同步与 GC 设计。

一旦真实 target 只接受“先上传文件，再传 URL/file id”，立即停止本实验，不把远程上传偷偷塞进这一轮。

## 证据边界

### 仓库事实

- Renderer 当前在主进程持久化前就清空输入并乐观插入消息；`startChat` IPC 自身不会等待持久化完成。[`chat-reducer.ts`](../../apps/desktop/src/ui/chat/chat-reducer.ts) [`session.ts`](../../apps/desktop/electron/main/chat/session.ts)
- current-thread v2 只接受非空 `userContent` 字符串，无法表达 image-only；store 已具备严格 schema、原子 JSON 写入、稳定 turn identity 与懒迁移模式。[`schemas.ts`](../../apps/desktop/electron/main/current-thread/schemas.ts) [`store.ts`](../../apps/desktop/electron/main/current-thread/store.ts)
- Provider 请求映射集中在一个纯函数边界，text-only body 已有精确回归测试。[`client.ts`](../../apps/desktop/electron/main/chat/client.ts)
- target catalog 和 resolved target 都没有 capability；现有方向也禁止按 hostname 或 model name 猜能力。[`provider-adapter-direction.md`](provider-adapter-direction.md)
- OCaml runtime 是可重建的文字状态投影，Provider context 的真实来源仍是 Electron main 的 durable record。[`runtime-protocol.md`](../architecture/runtime-protocol.md)

### 外部事实

- Electron IPC 使用 Structured Clone，不能把 DOM `File` 或 `ImageBitmap` 直接发给 main；Renderer 必须先转成可序列化字节。[Electron ipcRenderer](https://www.electronjs.org/docs/latest/api/ipc-renderer)
- Electron `nativeImage.createFromBuffer` 可以在 main 同步解码 PNG/JPEG，用于 canonical bytes 的独立可解码性与尺寸交叉校验；E0 已证明不能再把高熵 PNG 的同步重编码放在 main。[Electron nativeImage](https://www.electronjs.org/docs/latest/api/native-image)
- Sandboxed Renderer 保持普通 Chromium 能力；Web Worker 可用 `createImageBitmap` 解码并按 EXIF orientation 定向，`OffscreenCanvas.convertToBlob` 可在 Worker 内输出 PNG/JPEG。Vite 原生支持 `new Worker(new URL(..., import.meta.url))` 的独立 chunk 构建。[Electron sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox) [Worker createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/createImageBitmap) [OffscreenCanvas convertToBlob](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/convertToBlob) [Vite Web Workers](https://vite.dev/guide/features.html#web-workers)
- OpenAI 官方确认 `/v1/chat/completions` 可接收图片输入，但这不证明任意 OpenAI-compatible target 或任意 model 都支持同一形状，所以真实 target fixture 与 runthrough 仍是放行条件。[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data#image-and-file-inputs)

## v1.8 候选中的权威边界

```mermaid
flowchart LR
  Draft["Renderer draft<br/>File + object URL"]
  Worker["sandboxed Renderer Web Worker<br/>ephemeral canonicalization"]
  Bridge["existing chat bridge<br/>content + image refs + bytes"]
  Trust["Electron main<br/>strict validation"]
  Files["current-thread image files"]
  Record["current-thread v3 JSON<br/>content + image refs"]
  Provider["OpenAI-compatible provider<br/>transient data URLs"]
  Runtime["OCaml runtime<br/>text projection only"]
  View["Renderer thread projection<br/>content + local object URLs"]

  Draft --> Worker --> Bridge --> Trust
  Trust --> Files
  Files --> Record
  Files -- "chat:accepted<br/>canonical bytes" --> View
  Record --> Provider
  Record --> Runtime
  Record -- "hydrate snapshot" --> View
```

- Renderer 拥有未发送草稿、预览 URL、粘贴/拖放交互和可重建的消息投影；一个无 Node 能力的 Worker 只执行当前草稿的临时像素转换。
- Electron main 拥有接受策略、canonical bytes 权威验证、metadata 缺失验证、文件 IO、durable current thread、target 解析、Provider 请求和错误净化。Worker 输出未通过 main 验证前没有可信身份。
- Provider 只看到请求时生成的 data URL，不看到本地路径或 Nyx image id。
- OCaml 继续只拥有文字聊天状态，不成为图片存储或 Provider context 的来源。

## v1.8 候选的最小内容模型

首轮 Composer 的真实顺序只有“文字在前、图片按加入顺序在后”，所以保留现有 `userContent`，只增加 `imageRefs`。等产品真的允许文字与不同内容任意交错时，再为那个已出现的行为迁移到 parts；本轮不预先设计文件、音频、工具或 Artifact union。

| 语义              | 最小字段                                    | 约束                                                                   |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| user content      | `content: string`                           | 保持当前 trim；v3 仅在至少一张图存在时允许空字符串                     |
| image ref         | `imageId`, `mediaType`                      | 按加入顺序；request、record 与 snapshot 共用；MIME 仅 PNG/JPEG         |
| new image payload | `imageId`, `bytes: Uint8Array`              | Worker canonical bytes；只随 `new_user_message` 发送；与 refs 一一对应 |
| accepted image    | `imageId`, `mediaType`, `bytes: Uint8Array` | 只返回本轮刚写入的 canonical bytes；顺序与 refs 一致；Retry 固定为空   |

规则：

- `content.trim()` 非空或 `imageRefs` 非空，两者不能同时为空。
- 每轮最多 4 张图片；Retry 不携带 `new image payload`，只引用 durable image id。
- `imageId` 在同一 current thread 中只允许出现一次；Retry 更新原 turn，不追加第二份引用。
- Draft 只有 renderer-local key，并记录 `preparing | ready | failed`；`imageId`、user message id 和 assistant message id 在每次 Send 尝试时生成，只有 accepted 后才成为稳定身份。
- system 与 assistant message 继续保存字符串 `content`。
- assistant stream 的 `start/delta/done/error` 形状保持不变，只增加一个发送生命周期事件 `chat:accepted`。
- text-only user message 在 Provider wire 上继续使用字符串 `content`，保证现有 body 逐字兼容。

`chat:accepted` 的最小字段固定为 `type`、`requestId`、`userMessageId`、`assistantMessageId`、`turnIntent` 与 `acceptedImages`。Main 不回显 `content`、`imageRefs` 或 target：它们在严格校验后不会被规范化，Renderer 继续使用本次 active turn 被锁定的提交值；`acceptedImages` 只包含本轮已写入文件的 canonical bytes，顺序与 `imageRefs` 一致，供当前消息立即建立与 Provider、重启 snapshot 完全相同的预览。Retry 的 `acceptedImages` 固定为空。事件不携带 Provider 信息或通用 transaction metadata。

Main 对既有 history 比较完整 `content + imageRefs`；对本轮新消息比较文字、
image id、声明 MIME 与 canonical payload 对应关系。Canonical 字节数和
thread 总量是 main 从 `Uint8Array` 或实际文件 `stat` 得出的存储事实，
不进入 message identity，也不接受 Renderer 声明。原始 draft 字节数不跨
bridge，只是 Renderer 的体验限制。

不增加 `partId`、通用 metadata、display name 或原文件名。图片本身已有稳定 `imageId`；其他字段等出现真实用途再加。

## v1.8 候选的输入限制与权威验证

E0 的 25 MP 常量已被高熵 fixture 否决。下面仅记录 v1.8 当时准备验证的
历史候选值；E0B 已停止，没有任何容量限制被冻结，状态以
[runthrough 候选表](./context-composer-experiment-runthrough.md#historical-v18-candidate-limits-status-reference)
为准：

| 限制                  | 数值                      |
| --------------------- | ------------------------- |
| 类型                  | `image/png`, `image/jpeg` |
| 每轮张数              | 4                         |
| Renderer draft 源文件 | 8 MiB                     |
| 单张 canonical 文件   | 8 MiB                     |
| 每轮新增图片总量      | 16 MiB                    |
| 当前 thread 图片总量  | 32 MiB                    |
| 当前 thread 图片总数  | 未冻结                    |
| 当前 thread 累计像素  | 未冻结                    |
| 单边像素              | 8192                      |
| 单张总像素            | 8,294,400（3840×2160）    |

draft 源文件限制只是 Renderer 的早期反馈；main 不接收也不信任原文件大小。
canonical bytes、尺寸、MIME、metadata、单轮与 thread 预算全部由 main
权威计算。

32 MiB compressed bytes 不能约束 object URL 解码后的历史图片内存。
v1.8 曾要求 E0B 再验证 current-thread 图片总数和累计像素上限，但 Stop
前未完成；这些值以及表中所有其他容量值都没有冻结。

v1.8 历史候选的处理顺序为：

1. Renderer 拒绝空文件、非 PNG/JPEG 声明、超过 8 MiB 的 draft，并在
   Worker 解码前用同一个纯 `image-file` parser 检查 magic、header、单边
   与总像素；通过后才把 owned `ArrayBuffer` transfer 给唯一 Worker。
2. Worker 用 `createImageBitmap(..., { imageOrientation: 'from-image' })`
   解码，按解码后的方向与尺寸画进同尺寸 `OffscreenCanvas`；不 resize。
3. Worker 以相同 MIME 输出；PNG 使用 `image/png`，JPEG 使用
   `image/jpeg`、quality 0.95。返回 Blob MIME 必须等于请求 MIME，随后把
   canonical `ArrayBuffer` transfer 回 Renderer。
4. Renderer 只把 canonical `Uint8Array` 放进现有 chat request；原始
   `File` 与 Worker 中间态仍是未发送草稿，不跨 typed bridge。
5. Main 对 request 与每个 nested object 严格拒绝额外字段；`imageId` 必须
   是 UUID，payload 与本轮 `imageRefs` 必须同序、一一对应且不重复。
6. Main 把 canonical payload 当作不可信输入：再次调用同一个无状态
   `image-file` parser 检查非空、8 MiB、PNG/JPEG magic、PNG IHDR 或
   JPEG SOF；截断、越界、无 SOF、单边或总像素超限立即拒绝。共用的是纯
   规则代码，不是 Renderer 的校验结果。
7. Main 用 `nativeImage.createFromBuffer` 做独立解码，交叉校验 MIME、
   header 与解码尺寸；这里不再调用 `toPNG` / `toJPEG`。
8. Main 用受限 parser 拒绝 metadata-bearing 结构：PNG 只允许 E0B fixture
   证明必要的视觉 chunk，明确拒绝 text/EXIF 类 chunk；JPEG 拒绝
   APP1-APP15、COM 以及任意、重复或扩展 APP0。只有 production Worker
   fixture 证明必需时，才可 allowlist 最多一个精确的最小 JFIF
   APP0 形状，不含 thumbnail 或任意 payload。parser 不能尝试保留或
   解释原 metadata。
9. 新图片不能覆盖已有 id；thread 总量只统计已知 record 的唯一 refs 对应
   文件 `stat.size`，再加本轮 canonical bytes。缺图、重复 ref、异常文件
   或无法读取时 fail closed；目录孤儿不参与预算。
10. 任一项失败时，不写图片、不写 record、不启动 Runtime、不解析 target、
    不调用 Provider。

Worker 不拥有安全结论：main 的 decoder、header parser 和 metadata
allowlist 才是接受边界。E0B 必须用 EXIF orientation、GPS/device、XMP、
JPEG COM、自定义/重复/扩展 APP0、PNG text/eXIf fixtures 证明画面方向正确且 canonical bytes
不再包含原 metadata；证明不了就停止。Composer 不增加确认弹窗；
canonical 超限或验证失败时保留草稿并显示安全错误。

## Durable commit 与 `chat:accepted`

### 新消息

1. 图片加入 draft 时，Renderer 立即把它标为 `preparing` 并交给唯一的
   image Worker；UI 主线程继续响应。Worker 成功后 draft 变为 `ready` 并
   只持有 canonical bytes；失败则保留可见错误，不能 Send。
2. Renderer 捕获当前文字、全部 ready 图片与 target，为本次尝试生成
   request/user/assistant/image IDs，进入短暂的 `accepting` 状态；Composer
   内容可见但锁定，不能被第二次 Send 修改。
3. Renderer 通过现有 `startChat` bridge 发送 `content`、`imageRefs` 与
   本轮 canonical image payload；原始 `File` 不跨 bridge。
4. Main 严格解析并权威验证全部 canonical 图片，图片之间显式 yield。
5. Main 把每张 canonical 图片写入临时文件，再原子 rename 到最终文件。
6. Main 写入引用这些图片的 pending record；首个含图 turn 才使用 v3，纯文字继续沿用既有版本规则。
7. 只有第 6 步成功后，durable prepare 才把结果返回 `ChatSessionManager`；manager 再次确认 `activeSession === session` 且 sender 存活，才发出带本轮 canonical bytes 的 `chat:accepted`。Coordinator、store 和图片 helper 都不能自行发事件。
8. Renderer 收到 accepted 后，撤销 draft URLs，用 accepted canonical bytes 为 sent message 建立新 URLs，把捕获的 `content + imageRefs` 移入 thread，并把本次 active turn 的 target selection 写成 `committedTarget`；随后才清空对应 Composer 内容并允许起草下一轮。
9. Main 随后解析 target、持久化 attribution、提交文字投影给 Runtime，再调用 Provider。

### Retry

1. Retry 保持 user/assistant/image IDs，只生成新的 request ID，并采用当前 Composer target draft。
2. Main 先把 durable failed turn 转回 pending，再发 `chat:accepted`；不复制图片文件。
3. accepted 前 Renderer 保留原错误；accepted 后才把 assistant message 改回 pending。

### 失败分界

- **accepted 前失败：** Composer 原内容不动；不出现假的 user message；错误显示在 Composer 附近。
- **accepted 后、terminal write 成功：** user message 已 durable，main 先把安全错误写成 terminal failure，再通知 Renderer；只有此时才承诺立即 Retry。
- target resolve 失败继续使用现有 `target_unavailable` settlement。target attribution 写失败时，按下文的本地 write contract 可确定 binding 未提交：不启动 Runtime/Provider，也不再尝试专用 terminal transition；Renderer 只显示安全、非 Retry 的“保存失败，请重启恢复”。磁盘中的 unbound pending turn 由既有 restart recovery 转成 retryable interrupted failure。
- 图片文件成功但 record 写失败时，main 尽力删除本次新文件；若清理也失败，草稿仍保留，但下一次 Send 生成全新的 IDs，因此不会被旧孤儿永久卡住。
- `chat:accepted` 继承下述本地 adapter contract：覆盖应用进程失败与正常重启，不声称抵抗断电或 OS/filesystem 崩溃。若未来要承诺 power-loss durability，再按 image file → asset directory → record file → thread directory 的顺序增加 sync；本轮不引入 transaction abstraction。

这一个事件解决真实的数据所有权切换，不扩展成通用 transaction/event 框架。

### accepting 期间 Stop / New thread

- Durable prepare 接收本次 session 的 `AbortSignal`，在每张图片之间、写文件前和写 record 前检查；Stop 在 record commit 前生效时，清理本轮临时内容、保留 Composer 草稿且不发 accepted。Manager 对仍 active 的 session 复用现有 `chat:error` 发出安全、非 Retry 的 `cancelled`；Renderer 把它当作 pre-accepted attempt 终止，只解锁 Composer，不插入消息、不清草稿、不改 `committedTarget`。若 New thread 已让 session 失效，则抑制该事件。
- Stop 与 record commit 竞速时，以 commit 结果为边界：若 pending record 已成功写入，manager 先发 accepted，再把尚未绑定的 pending turn 持久化为 `cancelled`；不解析 target，不启动 Runtime/Provider。Store 只为这条 accepted-after-Stop 路径允许 unbound cancelled settlement。
- New thread 先让 active session 失效并 abort，再等待旧 operation 结束；因此迟到的 prepare 结果过不了 manager 的 active-session check，不会发 accepted。随后才按既有顺序 reset record 和图片目录。
- accepted、cancel/error 与 reset 的测试都使用 request/session identity；迟到事件不得重新插入已清空消息或创建无人拥有的 object URL。

## current-thread v3 与图片文件

### Record

- v3 保留每个 turn 的 `userContent`，只增加有序 `imageRefs`；`userContent` 仅在 `imageRefs` 非空时允许空字符串，其余 assistant content、status、safe error、target binding 和 ID 语义保持不变。
- image refs 属于 user turn 的稳定身份；terminal transition、Retry 与后续 append 都不能改写。
- v1/v2 稳定 record 继续原样读取，不因 hydration 被重写。
- 既有兼容行为保持：v1 在下一次真实文字 mutation 或 pending recovery 时升级为 v2；v2 的文字发送、Retry、terminal transition 与 pending recovery 继续保持 v2。
- 只有第一次成功接受含图的新 user turn 时，才把当前 v1/v2 完整记录升级为 v3：旧 `userContent` 保持原值并补空 `imageRefs`，再追加含图的新 turn。写过 v3 后，后续文字 turn 继续使用 v3，并写空 `imageRefs`。
- 未知 future version 或 malformed record 继续 fail closed，不覆写，也不触发图片清理。

### 本地 atomic write contract

- current-thread 与图片 helper 的最终提交操作都是本地文件系统 `rename(temp, final)`；`rename` resolve 才算提交，reject 就表示 final path 未改变。本轮不支持远程、网络或自定义存储 adapter。
- `writeAtomic` 在 final rename 后不执行任何可能失败的操作，Store 也只在 rename resolve 后更新内存缓存。测试 adapter 只能在调用真实 rename 前注入失败，禁止“先 rename 再抛错”这种违反契约的假故障。
- create、append、Retry pending、target bind 和 terminal settlement 共用这一个结果语义；因此 rejected write 可以安全使用旧缓存继续判断，resolved pending write 才允许 manager 发 `chat:accepted`。
- Durable prepare 必须在 record write 前完成 schema、history、canonical bytes 与返回对象的构造；record rename resolve 后到 manager 接收 prepared result 之间不得再做 I/O、解析或其他可能失败的工作。
- 应用进程若在 rename resolve 后、Renderer 收到 accepted 前退出，下一次启动从磁盘恢复 pending；这仍属于本文已声明的 app-process crash 边界，不是同进程的模糊结果。
- 未来若增加 fsync、post-rename chmod、网络文件系统或可在提交后报错的 adapter，必须停止并为所有写路径统一重做 commit/recovery 模型；本轮不保留 fresh reload、第二个 Store 或 transaction manager。

### Files

- 路径固定为 `userData/threads/current-thread-assets/<imageId>`；record 永远不保存绝对路径。
- 目录 mode 为 `0700`，图片 mode 为 `0600`；不记录原文件名。
- 沿用现有临时文件 + rename 模式，不新增 store interface、数据库或 transaction abstraction；“durable”在本文中特指现有应用进程崩溃边界。
- Provider 与 hydration 共用一个 main-only bounded read：先拒绝 symlink、非普通文件、空文件和超限文件，再按受限大小读取并复查实际长度、magic、header 与持久化 MIME。Provider 遇到任一 unavailable ref 就安全失败，不能静默省略；hydration 则为该 ref 返回 unavailable 描述并继续加载其余内容。本轮不增加哈希或完整 bit-rot 检测。

### Hydration

- 扩展现有 current-thread snapshot，在独立的 bounded image payload 列表中携带 record 所引用的 `Uint8Array`；不新增 read-asset IPC。
- Message 只保存 `content`、image id 与安全描述；Renderer 从 snapshot bytes 建立 object URL。
- 单个文件缺失时仍加载 thread 文字和其他图片，并把该位置显示为“图片不可用”；Retry/继续对话若需要这张历史图片则 fail closed。

### Reconcile 与 New thread

- 只有 record 成功解析为已知版本时，启动 reconcile 才能删除目录中未被引用的孤儿。
- record 不存在时可以删除整个 current-thread-assets 目录。
- New thread 必须先成功删除/reset record，再删除图片目录；目录删除失败只留下不可达文件，下次确认 record 不存在后重试。
- record reset 失败时，旧 record 与全部图片必须保持可恢复，不能先删文件。

## Provider 映射与错误语义

Provider adapter 仍只有当前 OpenAI-compatible Chat Completions 路径：

- text-only user：保持 `{ role: 'user', content: '...' }`。
- 含图 user：按固定的 text-first 顺序映射成 content array，再按 `imageRefs` 顺序追加 image；image 使用 main 刚读取的 `data:<mime>;base64,...`。
- image-only user：只发送 image content entries，不制造假文字。
- system/assistant：保持字符串 content。
- request body、日志、snapshot 和 renderer error details 都不能出现本地路径；Provider 原始错误不得把 data URL/Base64 回显到 UI 或磁盘。

能力策略：

- 当前所有 target 都是 `unknown`，允许尝试。
- 不从 provider id、base URL、model id 或一次 400 反推并缓存 `unsupported`。
- image-bearing 请求收到 400/413/415 时，映射为新的安全、可 Retry 的 `content_rejected`；文案只说明“所选目标拒绝了这次图片请求”，提示可切换 target。
- text-only 400 继续沿用现有非 Retry 的 `invalid_request`，不改变旧行为。
- `content_rejected` 必须先写入 durable assistant failure，再发 Renderer error event；snapshot/restart 后仍保持可 Retry。
- 所有 image-bearing HTTP error path 都使用固定安全文案并丢弃 upstream body/details；400/413/415 之外仍沿用既有错误类别，但同样不能回显 data URL。
- 未来只有 main 获得权威 capability 数据后，`known unsupported` 才能在 accepted 前阻止发送并保留草稿；这不属于本实验。

## Renderer 体验

### Composer

- 保留原生 `textarea`，在上方增加紧凑的图片预览 shelf；不换编辑器。
- 一个带可访问名称的按钮触发隐藏的原生 `<input type="file" accept="image/png,image/jpeg" multiple>`。
- Paste 只接管 clipboard 中的图片项；普通文字粘贴行为不变。
- Drop 只在确实包含受支持图片时接管并阻止浏览器导航；普通文本拖放不被吞掉。
- 每张图显示稳定缩略图、序号与明确的移除按钮；顺序按加入时间，不支持拖动排序。
- Send 条件从“非空文字”改成“文字或至少一张有效图片”。Enter/Shift+Enter 与 IME 行为保持现状。
- 读取、拒绝、超限和 accepted 前失败通过 `aria-live` 简短反馈；拖放不是唯一入口。
- 新消息和 Retry 发起时只捕获 target selection，不更新 `committedTarget`；accepted 后才提交。accepted 前失败保留旧 committed target，当前选择仍只是 Composer draft。

### Thread

- user message 固定显示文字在前、图片网格在后；点击图片使用原生 `<dialog>` 做大图预览。
- image-only 的 thread title/preview 使用稳定文案 `Image`，不显示空白或旧的 New thread fallback。
- 缺失图片显示固定占位，不让整个 thread 崩溃。
- assistant message、streaming indicator、Retry 与 target attribution 保持当前样式和行为。

### Object URL 所有权

- draft 为原始 `File` 创建 object URL；remove、拒绝、reset、unmount 必须 revoke。
- accepted 后撤销原始 draft URL，并从 `acceptedImages` 的 canonical bytes 创建 sent message URL；不能把原始 URL 直接转给消息。
- hydration 用 snapshot bytes 新建 URL；projection generation 变化或迟到异步结果必须 revoke。
- 用一个 renderer-local 小 helper 管生命周期，不建全局 image cache。

## Runtime 投影

- 新消息与 replay 直接投影 `userContent`；image-only 传空字符串。
- 不传 marker、本地路径、image id、MIME 或 Base64。
- Provider messages 不从 Runtime 反推；main durable record 仍是唯一上下文来源。
- 增加 image-only 的 default-on runtime send/fail/retry/restart/New thread 回归检查，但不修改 OCaml 类型与 NDJSON 协议。

## 实现切片

本节完整保留失败的 v1.8 历史切片，便于审计。T1-T5 的 owner、文件清单、
完成条件和验证项均不生效，不构成实现许可；对应 E1-E5 仍 blocked。新的
用户批准门禁可以改变任何切片或文件细节。

### T0A — 原同步 main gate（STOP）

真实 target、4 图普通 fixture、32 MiB hydration 与 32 MiB 历史请求构建
通过。最初的 25 MP fixture 只有 0.7 MiB → 0.1 MiB，不能代表 byte
上限；补测后：

- 25 MP / 7.78 MiB 高熵 PNG：main 同步 encode 1014 ms。
- 最低 8 MP / 7.67 MiB 高熵 PNG：main 同步 encode 1046 ms。

两者都违反 250 ms 止损线，因此 synchronous main canonicalization 被
否决。T0A 不授权 T1-T5。

### T0B — Native off-main canonicalization feasibility（STOP）

**当时的唯一候选（现已失败）**

- 复用当前 sandboxed Renderer，只增加一个普通 Web Worker。
- Worker 使用 `createImageBitmap + OffscreenCanvas` 做同 MIME、同尺寸
  canonicalization；不启用 Node，不接触文件系统、bridge、Provider 或
  durable state。
- Main 不再同步重编码，只做 header、magic、`nativeImage` decode、
  metadata allowlist、预算与 identity 的权威验证。
- 不增加 dependency、`utilityProcess`、worker pool、第二 bridge、图片
  service 或 product code abstraction。

**已有候选证据**

- 8 MP / 7.67 MiB PNG：Worker 282 ms，Renderer 最大 heartbeat gap 12 ms，
  main validation 38 ms，app working-set +173.8 MiB。
- 3840×2160 / 7.53 MiB PNG：Worker 218 ms，heartbeat gap 12 ms，main
  validation 37 ms，app working-set +175.7 MiB。
- 25 MP 输出 8.19 MiB 且 working-set +371.5 MiB，明确不保留。
- 在已记录环境中，OS-temp production-shape Vite Worker harness 的静态
  Worker 已在 dev、build、`app.asar` 加载；这不是 production Renderer
  integration。

**Stop 时尚未完成**

- 用普通 Retina 截图、4 张日常图、3840×2160 高熵 PNG、JPEG quality 0.95、
  EXIF orientation、GPS/device/XMP/COM、自定义/重复/扩展 APP0、PNG
  text/eXIf fixtures 验证方向、视觉、MIME、canonical 上限和
  metadata allowlist。
- 覆盖 remove/New thread/unmount 时的 stale result 丢弃、Worker termination、
  transferable buffer 失效，以及 error/timeout 后 draft 可恢复。
- 测量 Renderer heartbeat、main 单段 validation、单图/4 图总时间与
  main+Renderer+Worker peak working set；不得只取完成后的 RSS。
- 在 OS-temp harness 内，按候选 count/pixel 用多张高压缩比、
  满像素的 canonical 图片生成 object URLs 和真实 `<img>`，挂入
  可见 DOM grid；等待 `img.decode()` 或 load/error 终态后，记录
  main+Renderer+Worker 全进程 peak working set。这个 harness 不导入
  production Renderer components，也不要求实现或运行仍被 E4 阻塞的
  `ChatMessage`/product message grid；32 MiB typed-array 接收时间不能
  代替这条证据。据此冻结 thread 图片总数与累计像素，不预设数字。
- 审查证据保留执行过的脱敏命令形状（不含绝对路径/私密数据）、确定性
  seed 与 fixture hash、重复次数、peak 采样方法和 packaged Worker 加载
  证据。Sanitized harness/fixtures 只可留在 OS temp 供本轮独立审查，审查
  后已删除；现存命令形状不是自包含复现。不得提交 probe code。

**放行/Stop**

- Renderer 主线程 heartbeat gap ≤50 ms；main 任一同步 validation 段
  ≤250 ms；4 张日常图全部 ready ≤1.5 s；3840×2160 高熵单图 ready ≤1 s；
  peak working-set 增量 ≤192 MiB。
- source 与 canonical 各 ≤8 MiB，canonical pixels ≤8,294,400；最终常量
  仍满足 4 张/turn、16 MiB/turn 与 32 MiB/thread，并从 visible-DOM
  harness 证据冻结
  thread 图片总数与累计像素。
- JPEG 输出 MIME fallback、orientation 错误、metadata 无法 fail closed、
  production Worker 无法加载、UI/main 超线或 peak memory 超线时停止。
- 如果找不到无 thumbnail/lazy-load 也能满足 peak memory 的实用 thread
  图片总数与累计像素上限，停止并要求新的方向决策。
- Stop 后不得自动加入 dependency、`utilityProcess`、放宽体验线或开始
  T1-T5；这些都需要新的方向决策。

### T1 — Image refs 与 current-thread v3

**主要 owner**

- `apps/desktop/shared/chat/types.ts`
- `apps/desktop/shared/chat/snapshot.ts`
- `apps/desktop/electron/main/current-thread/schemas.ts`
- `apps/desktop/electron/main/current-thread/store.ts`
- `apps/desktop/electron/main/current-thread/session-coordinator.ts`
- `apps/desktop/electron/main/current-thread/snapshot.ts`

**完成条件**

- text-only 全链路仍通过；v1/v2 read 不改字节，v1 文字 mutation/recovery 仍只到 v2，v2 文字 mutation/recovery 仍是 v2，首次含图 mutation 才升级 v3，v3 文字 mutation 保持 v3。
- text、image-only、text+images、text-first image 顺序、全 thread 唯一 image id、稳定 identity、Retry 和 unknown-version fixtures 齐全。
- v3 JSON 只含图片 refs，没有 bytes、路径或 data URL。
- Coordinator 在 T1 只负责 v3 identity、迁移和文字 history 校验；不预埋
  图片导入、bounded file read、Provider mapping 或 `content_rejected`。

### T2 — Main 图片导入与 durable acceptance

**主要 owner**

- `apps/desktop/electron/main/chat/session.ts`
- `apps/desktop/electron/main/index.ts`
- `apps/desktop/electron/main/current-thread/store.ts` 及既有 file adapter
- `apps/desktop/electron/main/current-thread/session-coordinator.ts`
- `apps/desktop/electron/main/current-thread/snapshot.ts`
- `apps/desktop/electron/main/current-thread/` 下一个直接的图片文件 helper
- `apps/desktop/shared/chat/image-file.ts` 下一个 main/Renderer 共用的纯
  header 与 metadata parser
- `apps/desktop/shared/chat/events.ts`

**完成条件**

- 严格 request/image validator、解码前 header 限额、magic/decode 交叉校验、
  PNG/JPEG metadata allowlist 和文件 mode 测试通过；main 不同步重编码。
- Main composition 用 `userData` 组装唯一 current-thread 图片 owner，同一
  helper 供 session prepare/reset/reconcile 和 snapshot bounded reads 使用。
- Coordinator 完成含图新消息的 prepare、Retry、reset 与 orphan reconcile；
  snapshot service 通过同一 bounded read 返回可用 bytes 或 unavailable 描述。
- 文件写失败、rename 失败、record 写失败都不会启动 Runtime/Provider，也不会生成坏引用。
- record write 与 cleanup 同时失败后，同一 draft 使用新 IDs 可以再次发送；旧孤儿只在安全 reconcile 时删除。
- `chat:accepted` 严格发生在 pending durable 之后、target 解析之前；新消息返回的 bytes 与磁盘 canonical 文件逐字节相同，Retry 返回空 `acceptedImages`。
- file adapter contract test 固定“rename reject 不改变 final path，resolve 后不再有 fallible step”；create、append、Retry、bind 和 terminal write 都用同一断言，不增加 post-rename 模糊故障。
- target bind rename 失败后不启动 Runtime/Provider、不尝试专用 terminal transition，只发安全且非 Retry 的 restart-required 错误；重启后 pending recovery 才恢复 Retry。
- bounded read 覆盖缺失、symlink、目录、空文件、超限、截断、PNG/JPEG magic 与 persisted MIME 互换；Provider 和 hydration 不各写一套读取规则。

### T3 — Provider 与 Runtime 投影

**主要 owner**

- `apps/desktop/electron/main/chat/client.ts`
- `apps/desktop/electron/main/chat/session.ts`
- `apps/desktop/shared/chat/types.ts`
- `apps/desktop/electron/main/current-thread/schemas.ts`
- `apps/desktop/electron/main/current-thread/session-coordinator.ts`
- `apps/desktop/electron/main/current-thread/runtime-replay.ts`

**完成条件**

- text-only body 精确不变；text+image、image-only、多图顺序、多轮历史 fixture 正确。
- body 不含本地路径、image id、原文件名；错误不回显 Base64。
- `content_rejected` 只作用于 image-bearing 400/413/415；换 target Retry 使用原图。
- Shared chat error code、v3 safe-error schema/message 与 coordinator settlement 在本片
  一次加入 `content_rejected`；v1/v2 persisted schema 不改。
- OCaml 协议不改，runtime chat-state 集成覆盖 image-only 文字投影。

### T4 — Composer、消息展示与 hydration

**主要 owner**

- `apps/desktop/src/ui/chat/use-chat-session.ts`
- `apps/desktop/src/ui/chat/chat-reducer.ts`
- `apps/desktop/src/ui/chat/chat-types.ts`
- `apps/desktop/src/ui/chat/image-canonicalizer.worker.ts`
- `apps/desktop/src/ui/chat/components/ChatWorkspace.tsx`
- `apps/desktop/src/ui/chat/components/ChatComposer.tsx`
- `apps/desktop/src/ui/chat/components/ChatMessage.tsx`
- `apps/desktop/src/ui/chat/chat-presenters.ts`

**完成条件**

- picker、paste、drop 都归一到同一个 draft image path；一个 lazy Worker
  顺序处理 `preparing → ready | failed`，不引入 pool/manager abstraction。
- Worker 使用 Vite 的静态 `new Worker(new URL(...))` 形状；source/canonical
  buffer 都用 transfer，remove/New thread/unmount 后 stale result 被忽略且
  Worker/bitmap/object URL 全部释放。
- 含图 Send 只在所有 draft ready 后可用，bridge 接收 canonical bytes；
  Worker 错误留在对应 draft，不产生 request 或 main side effect。
- accepted 前失败保留草稿；accepted 后才插入消息和清空；当前消息 URL 必须来自 accepted canonical bytes，Retry accepted 前保留旧错误。
- 新消息与 Retry 都只在 accepted 后更新 `committedTarget`；accepted 前 parser/image/store 失败保持旧值，重启 snapshot 与当前投影一致。
- object URL 所有终止分支均有纯函数/注入式回归检查，不新增 DOM 测试库。
- v1.8 原计划让真实 product message grid 按 E0B 后续冻结的 thread 图片
  总数与累计像素上限回归；E0B 实际未冻结任何上限。
- image-only title、missing placeholder、键盘操作和原生 dialog runthrough 通过。

### T5 — 生命周期与完整验收

**完成条件**

- restart、interrupted pending、Stop、Retry、换 target Retry、New thread 与孤儿 reconcile 全部通过。
- accepting 中 Stop 覆盖 commit 前 `chat:error(cancelled)` 解锁，以及 commit 后 accepted→cancelled；record 写入中 New thread 不得收到迟到 accepted/error。
- 关闭/移除新图片入口后，v3 fixture 仍能 hydration、继续对话、Provider 重建与 Retry；缺图仍 fail closed。
- 一个真实 target 完成 text+image 与 image-only；若本机有第二个 target，再完成 reject/switch/retry 实测。
- v1.8 曾要求用 E0B 冻结的 thread 图片总数与累计像素上限验收真实
  product message grid；E0B 实际未冻结任何上限。
- 更新独立 runthrough 文档，记录真实差异和本轮未解决问题；不借验收扩大 scope。

## 风险到验证的对应关系

| 风险                  | 必须失败的注入点                                                         | 放行断言                                                                     |
| --------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Composer 丢草稿       | Worker error/timeout、parser、image write、image rename、record rename   | accepted 前草稿完整；无 Provider/Runtime side effect                         |
| record 引用缺图       | 图片成功后 record 失败；应用进程崩溃留下孤儿                             | 在既有 app-crash 保证内允许孤儿、不允许 committed 坏引用；下次安全 reconcile |
| 孤儿阻塞重发          | record write 与 cleanup 同时失败                                         | 草稿不丢；下一次 Send 使用新 IDs 并可成功                                    |
| 本地 write 契约漂移   | create/append/Retry/bind/terminal 的 rename 前失败与成功                 | reject 时 final/cache 不变；resolve 后没有 fallible post-step                |
| accepted 后 bind 失败 | target bind rename reject                                                | 无 Runtime/Provider/专用 terminal；安全提示重启，pending 由 restart recovery |
| target 提前提交       | new/retry accepted 前 parser、image、store 失败                          | `committedTarget` 保持旧值；accepted 后才等于 captured selection             |
| accepting 无法结束    | commit 前 Stop；record write 中 New thread                               | active session 收 cancelled error 解锁；失效 session 不发迟到 accepted/error |
| 路径或资源攻击        | `../` id、额外字段、MIME spoof、SVG、截断 header、无法解码、超限、空文件 | main 解码前先拒绝异常尺寸；磁盘无新 record/文件                              |
| 历史文件异常出站      | symlink、目录、截断、magic/MIME 互换、超限                               | hydration/Provider 共用 bounded read 并 fail closed                          |
| 隐藏 metadata 出站    | 带 EXIF/GPS/PNG text chunk 的 fixtures                                   | canonical 文件与 Provider body 不再含原 metadata；可见方向/像素验收通过      |
| Worker 阻塞或泄漏     | 4 图、remove、New thread、unmount、decode/encode error                   | UI heartbeat/main validation 达线；stale result/buffer/bitmap/Worker 全释放  |
| text-only 回退        | 现有 body fixture、stream fixture、target tests                          | body 与事件语义不变                                                          |
| Retry 丢图或复制图    | reject → switch → Retry；restart → Retry                                 | image id/文件稳定，request id 改变，只有一次文件                             |
| 历史缺图被静默忽略    | 手工删除一个 image file                                                  | thread 可读，图片占位；Provider 请求明确失败                                 |
| 错误泄漏图片          | upstream 回显 body/data URL/path                                         | UI、日志、JSON 均无原始错误与 Base64                                         |
| URL 泄漏              | remove、reject、accepted、reset、unmount、stale hydration                | 每个 URL 恰好 revoke 一次                                                    |
| 当前/重启图片不一致   | 带 metadata/orientation 的图片发送后立即查看并重启                       | 当前消息、磁盘、Provider body 与 hydration 均来自同一 canonical bytes        |
| main/hydration 卡顿   | Worker canonicalization、main validation、32 MiB snapshot/Base64/JSON    | UI/main/peak memory 达到 T0B 止损线；否则停止                                |
| 历史图解码内存失控    | OS-temp 可见 DOM grid 中高压缩比满像素图的 object URL 解码               | 候选要求冻结 thread 图片总数/累计像素且 peak 达线；Stop 前未完成             |
| schema 回退           | v1/v2 stable read、文字 mutation/recovery、首次含图 mutation、unknown v4 | stable read 不写；v1→v2 与首次含图→v3 边界准确；unknown 不写不 GC            |
| 功能回退破坏历史      | 去掉 Composer 新导入入口后加载 v3 fixture                                | hydrate、继续、历史 Provider 映射、Retry 仍正确；缺图 fail closed            |

## 自动验证

实现完成后至少运行：

```bash
mise run desktop:test
mise run desktop:typecheck
mise run desktop:typecheck:compat
mise run desktop:lint
mise run desktop:build
mise run runtime:chat-state:check
```

跨边界收尾再运行：

```bash
mise run desktop:check
mise run check
```

## 手工 runthrough

1. 普通 text-only 发送、流式、Stop、Retry 与当前行为一致。
2. 粘贴一张 macOS 截图，添加文字，删除，再重新粘贴发送。
3. 拖入 JPEG；拖入普通文本不被 Composer 错误拦截。
4. 选择 4 张图；第 5 张、超大图、伪装 MIME、SVG 均在 Composer 中清楚失败。
5. image-only 发送，user bubble 与 sidebar preview 正确。
6. text + 2 images 的顺序在 user bubble、durable record 与 Provider request 中一致；发送后立即显示与重启后的像素方向一致。
7. accepted 前注入 record 与 cleanup 双失败，草稿仍在；恢复后无需重新选择文件，并使用新 IDs 成功发送。
8. accepted 后注入 target bind rename 失败：binding 与 Provider 均未提交，只提示重启；重启把 pending 恢复为可 Retry failure。
9. 新消息与 Retry 在 accepted 前分别注入失败，`committedTarget` 保持旧值；accepted 后才更新。
10. accepting 中 Stop：commit 前收到安全 cancelled error 后解锁并保留草稿，commit 后先 accepted 再 cancelled；record write 中 New thread 不接收迟到 accepted/error。
11. Unknown target 返回 400，图片仍在 thread；切换 target 后 Retry 成功。
12. 发送中 Stop，重启应用，失败 turn 与图片仍可读且可 Retry。
13. New thread 清空视图与 record；图片目录删除失败时不恢复旧 thread，下次启动完成清理。
14. 手工造成一张历史图片缺失、截断和 MIME 互换：thread 其余内容可读，继续请求不会默默漏掉图片。
15. 只用键盘完成选择、预览、移除、发送与关闭 dialog；VoiceOver 能读出状态。
16. 导入带 GPS/设备 metadata 和 EXIF orientation 的 JPEG；发送后的 canonical 文件无 metadata，画面方向正确。
17. 暂时移除新图片入口后加载 v3 fixture，继续对话与 Retry 仍携带历史图片。

## Rollout、回滚与止损

- 这是个人本地应用，不建设 feature flag、灰度系统或 telemetry。
- 首次实现只在开发构建使用；自动检查与手工 runthrough 全过后再进入日常版本。
- v3 是 forward-only 数据。写入 v3 后，如需关闭新图片发送，只能移除 Composer ingress；必须保留 v3 reader、图片文件读取、snapshot hydration、展示、历史 Provider 映射、Retry、错误净化与缺图 fail-closed。不能完整回退到只认识 v2 或只会展示图片的 binary。
- 未知版本、损坏 record 或无法确认引用集合时禁止自动 GC。
- T0A 已证明同步 main 重编码在最低能力仍失败。T0B 只验证一个 native Web
  Worker；它不通过时停止，不自动加入 dependency、`utilityProcess`、缩略图、
  懒加载或 asset store。
- 若真实使用反复需要 PDF/文档、远程 file id、跨 thread 复用或 assistant 产物，再单独规划下一种内容，而不是扩展本实验。

## 被拒绝的替代方案

| 方案                                | 不采用的原因                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Base64 直接塞 current-thread JSON   | 每次 pending/bind/terminal 都重写整份图片；重启 IPC 与未来迁移成本被放大                                     |
| 首轮直接迁移到通用 parts union      | 当前只有 text-first + image list，没有任意交错；会无谓扩大 shared contract、迁移、snapshot 与 Runtime 投影   |
| 把 `File` 直接发 IPC                | Electron 官方明确不支持 DOM File 跨 IPC                                                                      |
| Renderer 直接读路径或 Provider 凭据 | 破坏现有 main ownership 与安全边界                                                                           |
| 模型名/域名推断 vision              | 仓库没有可信事实，兼容服务命名不可控                                                                         |
| 先建通用 Asset service/registry     | 当前只有一个 thread、一种文件类型、一个 owner；接口与注册表都没有第二个真实实现                              |
| 现在修改 OCaml 协议                 | Runtime 不是 Provider context owner，图片对当前状态机没有行为语义                                            |
| 发送原始 JPEG 或首次确认 metadata   | 原始文件会无感带出位置/设备信息，确认弹窗又打断核心路径；Worker transform + main metadata allowlist 才能放行 |
| `utilityProcess` + 图片 codec       | v1.8 当时先验证无依赖 Worker；该候选随后失败，本表不选择后续方向                                             |

## v1.8 历史最终门禁（已失败）

以下是 v1.8 当时的门禁。E0B Stop 后它不能满足，已不生效；开始任何实现需要
新的用户批准门禁，而不是继续完成此清单：

- E0B 使用 production Vite Worker、PNG/JPEG metadata/orientation、OS-temp
  可见 DOM grid 的 object-URL/`<img>` decode 与 peak memory fixtures 完整通过，包括
  thread 图片总数和累计像素在内的最终常量按当时要求冻结；实际未冻结。
- E0B 的 sanitized OS-temp harness 已经过本轮独立审查并删除，
  runthrough 保留了执行过的脱敏命令形状、seed/hash、重复次数、peak 方法和
  packaged Worker 证据；harness 已删除，因此命令形状不是自包含复现。
- 当前版本与 fingerprint 已被 convergence reviewer 绑定并检查。
- 持久化、shared contract、ownership、迁移与错误语义没有未决 blocker。
- 独立 Linus Review 没有 critical/high 未解决 finding，也没有要求新增通用平台的 scope creep。
- 用户明确确认开始执行该 named slice。

## 决策记录

- 2026-08-07 / v0.1：选择窄 current-thread 图片目录而非 Base64 JSON 或通用 Asset 平台。
- 2026-08-07 / v0.1：增加 durable `chat:accepted`，解决 Composer 在主进程确认前丢内容的现有时序缺口。
- 2026-08-07 / v0.1：现有 targets 全部按 unknown 处理；不新增 capability schema，不做模型名推断。
- 2026-08-07 / v0.1：首轮只支持 PNG/JPEG，assistant stream 与 OCaml 协议不扩展。
- 2026-08-07 / v0.2：对抗检查后固定 accepted 事件的最小 payload、history/byteSize 权威校验、durable `content_rejected` 顺序，并把真实 target 证据移到 scope gate 之前。
- 2026-08-07 / v0.3：独立 gate 后补齐回退的完整历史/Retry 兼容面；改为解码前 header 限制与 nativeImage 同 MIME 重编码去 metadata；accepted 前失败重发改用新 IDs；durability 明确收窄到现有 app-process crash 保证。
- 2026-08-07 / v1.0：独立 reviewer 对 v0.3 的五项 revision contract 全部判定 resolved；无新 critical/high，方案冻结为 ready for handoff。
- 2026-08-07 / v1.1：新一轮严格复核撤销 ready：统一当前显示与持久化的 canonical bytes，移除 message identity 中的 `byteSize`，把 v3 升级推迟到首次含图 mutation，并增加同步图片处理与 hydration 的性能止损。
- 2026-08-08 / v1.2：接受 v1.1 full review 的四项局部 finding：首轮收缩为 `userContent + imageRefs`；闭合 accepted 后 target bind 双写失败；T0 加入完整历史 Base64/JSON probe；Provider/hydration 共用 bounded read。
- 2026-08-08 / v1.3：最终 full gate 证明普通 Store read 不能判断模糊写结果；增加 queued fresh-disk recovery，并把 accepted 固定为 Renderer target commit 与 accepting Stop/New thread 的唯一事件边界。
- 2026-08-08 / v1.4：scoped re-review 关闭 fresh reload 与 target commit，只补齐 commit 前 Stop 复用现有 cancelled error 解锁 Renderer 的最后一条事件。
- 2026-08-08 / v1.5：decision owner 选择 A：本轮 local adapter 以 rename resolve/reject 作为唯一提交结果，删除 fresh reload 与专用 unknown settlement；target bind 写失败统一要求 restart recovery。
- 2026-08-09 / v1.6：代码棘轮证明 25 MP 与最低 8 MP 高熵 PNG 的同步 main
  encode 都约 1 秒，撤销 E0 PASS。用户选择保留最低能力与体验线，只重开
  canonicalization 执行边界；当时唯一候选是 sandboxed Renderer native
  Web Worker，main 保留权威验证与 durable ownership。
- 2026-08-09 / v1.7：`RC-E3-R1` 的一轮局部修订补齐 E2/E3 真实
  owner，增加历史图解码的 count/pixel 门禁、严格 JPEG APP0 策略和
  可审计 E0B 证据生命周期。没有改变产品、owner 或 public contract 方向。
- 2026-08-09 / v1.8：`RC-E3-R2` 只关闭 `F-EXEC-02`：E0B 改用
  OS-temp 可见 DOM `<img>` grid 采集解码 peak，production message grid 仍由
  E4/E5 按原计划在 E0B 冻结上限后回归/验收；上限实际从未冻结。这是本轮
  closure，不是 E0B PASS。
- 2026-08-09 / E0B evidence：静态 Vite Worker 在 dev、build 和 `app.asar`
  均加载成功；确定性 JPEG 经 `OffscreenCanvas` 重编码后仍含 470-byte
  `ICC_PROFILE` APP2，main 按 v1.8 严格规则拒绝。触发 Stop，不放宽规则，
  不冻结 count/pixel，不进入 E1-E5。
- 2026-08-09 / v1.9：用户选择方案 A，只授权 E0C 验证当前 Chromium Worker
  的单一、完整、字节相等 sRGB ICC APP2 payload。任意变体继续 fail closed；
  E0C 不授权产品实现，也不恢复历史 E1-E5 切片。
- 2026-08-09 / E0C evidence：exact ICC 与十个 APP2 adversarial cases 通过，
  但 12×1080p 与最终 8×1080p visible DOM grid 均超过 +192 MiB。独立审查
  判定 `VALID_STOP`；harness 删除，不运行 `review-ready`，不冻结容量。
- 2026-08-09 / v2.0：用户批准 E0D，只重开 display memory 边界：main-owned
  full canonical + one 512 px PNG preview，message grid 只 decode preview，主动
  full view 最多 decode 一张原图。仍不授权产品代码或 E1-E5。
- 2026-08-09 / E0D evidence：preview grid 三次均低于 +46 MiB，但临时
  fresh-byte/Blob/object-URL full-open 路径达到 +271.047 MiB。独立审查判定
  `VALID_STOP`；不冻结容量、preview 常量或 product transport。
- 2026-08-09 / v2.1：用户批准 E0E，只验证 main-authorized stable opaque URL；
  不批准 Renderer full-byte cache、file URL、Asset service 或 product protocol。
- 2026-08-09 / E0E evidence：non-default `:444` 在进入 handler 前被规范化为
  no-port URL，使 sealed explicit-port reject 无法执行。独立审查判定
  `VALID_STOP`；未运行 memory/`app.asar`，不冻结 scheme 或 transport。
- 2026-08-09 / v2.2：用户批准 E0F policy A，以 handler 收到的 canonical
  request identity 授权，并验证 alias/cache identity、security、memory 与 packaged
  load；仍不授权 product code 或 E1-E5。
- 2026-08-09 / v2.3：E0F identity、revocation、security、三次 memory 与
  `app.asar` gate 全部通过；独立 evidence review 在一次 packaged-source scoped
  repair 后 PASS。结果只进入 revised implementation plan，不直接解锁 E1-E5。
- 2026-08-09 / v3.0：用 stable main-authorized URL 替换历史方案的
  accepted/hydration bytes；把 `chat:accepted` 收窄为 durable identity handoff，
  保留 current-thread v3、Worker canonicalization、main-only Provider materialization
  与 text-only Runtime projection。`RC-V3-PLAN-03` 关闭三项有界 finding 后 PASS，
  只解锁 E1。

## Convergence 记录

- Epoch 1 / Round 1：两份独立只读证据分别覆盖 source of truth、迁移/回归面，以及数据丢失、安全、能力来源和验证映射。
- Epoch 1 / Round 2：作者对 v0.1 做 adversarial pass；归并后的 revision contract 只有四项：补足 accepted contract、补足 main 的字节权威校验、固定 reject 持久化顺序、把 target evidence 前置。没有新增平台或新 scope。
- Epoch 1 / Round 3：全新独立 Linus reviewer 对 v0.2 给出 2 high、3 medium。Revision contract 严格限于回退兼容、metadata、孤儿重发、durability 边界和解码前尺寸保护，没有扩大产品 scope。
- Epoch 1 / Round 4：同一独立 reviewer 只复核 revision contract；五项全部 resolved，无新 critical/high，无 scope/复杂度回归，最终 gate `PASS`。
- Epoch 2 / Initial review：主线程重新按当前实现检查 v1.0，发现 2 high、2 medium：当前预览不是 canonical bytes、同步图片处理没有性能门禁、`byteSize` 污染语义模型、纯文字 mutation 过早把数据推进 v3。四项均判定为局部修订，core owner、Provider 路径和产品 scope 不变。
- Epoch 2 / Round 1：v1.1 修改 accepted payload、message identity、迁移触发点和性能验证；全新独立 reviewer 绑定 fingerprint 后给出 2 high、2 medium，明确无 direction failure。四项归并为 revision contract `RC-E2-R2`：target bind failure matrix、历史请求构建 probe、删除过早 parts union、bounded historical read。
- Epoch 2 / Round 2：v1.2 只执行 `RC-E2-R2`，没有改变 Electron main owner、Provider 路径或产品 scope；同一 reviewer 的一次 scoped re-review 判定 F1–F4 全部 resolved，无新 S0/S1、anchor drift 或复杂度回归。
- Epoch 2 / Round 3：第二个全新 reviewer 对 v1.2 做最终 full gate，明确无 direction failure，但发现 1 high、2 medium。Revision contract `RC-E2-R3` 只允许增加 queued fresh-disk recovery、延后 Renderer target commit、固定 manager-only accepted 与 Stop/New thread 顺序；禁止新 store、transaction 层或 scope 扩张。
- Epoch 2 / Round 3 scoped re-review：fresh reload 与 target commit 已关闭，Stop/New thread 只剩 commit 前缺少 Renderer 终止事件，没有新 S0/S1、anchor drift 或复杂度膨胀。
- Epoch 2 / Round 4：v1.4 仅复用现有安全 cancelled error 结束 pre-accepted attempt；等待第三个全新 reviewer 对最终候选做 full gate。
- Epoch 2 / Round 4 hard gate：第三个全新 reviewer 发现重复根因。方案把“rename 已生效但 adapter 抛错”视为可能，却只给 target bind 设计 fresh recovery；create、append 与 Retry pending write 仍会让磁盘和缓存分裂，`chat:accepted` 因而不可靠。
- Decision `D-E2-WRITE`：用户明确选择 A，并授权 1 个额外有界轮次；B 被拒绝，不再作为模糊 fallback。
- Epoch 2 / bounded extension Round 5：revision contract `RC-E2-X1` 只允许统一本地 rename 结果语义、删除 fresh recovery/专用 unknown settlement，并把 bind failure 改为 restart recovery；禁止新增 recovery layer 或修改其他 anchors。
- Epoch 2 / bounded extension Round 5 scoped re-review：同一 hard-gate reviewer 绑定技术正文候选指纹 `5d3fdc9340bf3950546be8ba959e86225860bf7bb00b3555e41fbc14915463bb`；原 S1 resolved，无新 S0/S1、anchor drift、scope 或复杂度回归，结论 `PASS`。
- Epoch 3 / ratchet direction gate：独立 diff reviewer 发现 upper-bound fixture
  不具代表性；补测 25 MP 与最低 8 MP 后均违反 250 ms main stop line。第二个
  独立 strict reviewer 判定 synchronous main canonicalization
  `direction_health=failed`，不是产品方向失败。
- Epoch 3 / revision round 1：v1.7 只执行 `RC-E3-R1`，修复切片 owner、
  decoded-history 内存门禁、JPEG APP0 边界和证据可审计性；没有
  引入 dependency、新 process/IPC、cache 或 Asset 抽象。
- Epoch 3 / revision round 2：v1.8 只执行 `RC-E3-R2`，将 E0B 的
  production grid 依赖替换为 OS-temp 可见 DOM harness；E4/E5 的真实
  product grid 回归/验收边界不变。
- Epoch 4 / E0C：方案 A 的 exact ICC 假设通过，但 visible-grid capacity
  stop line 失败。独立 reviewer 认为 failure delta 的采样顺序有效，不是需要
  局部修复的 harness 假失败；lifecycle/metadata 只能描述为 probe coverage，
  不能写成生产验证。
- Epoch 5 / user decision：用户批准用单一 persisted-size preview 与 on-demand
  full decode 隔离 message grid 的 decoded-memory 成本；不批准通用 thumbnail
  service、virtualization、多级 preview 或 product implementation。
- Epoch 6 / E0D evidence：preview-only grid 方向成立，但 sealed temporary
  full-open path 超出内存线。reviewer 判定为有效 Stop，并要求只做路径级结论。
- Epoch 7 / user decision：用户批准 E0E stable main-authorized asset URL gate，
  只在 OS temp 证明 security、lifetime 与 memory，不选 product contract。
- Epoch 8 / E0E evidence：standard custom scheme 在 handler 前丢失 explicit port，
  无法实现 sealed exact-route reject；reviewer 判定有效 Stop，不允许在 E0E 内换
  scheme shape 或放宽规则。
- Epoch 9 / user decision：用户批准按 browser-native normalization 定义
  authorization identity，不再把被平台抹除的 raw spelling 当独立权限输入。
- Epoch 10 / E0F evidence：canonical identity/native cache、restart revocation、
  Renderer byte isolation、三次 memory 与 `app.asar` load 全部通过；独立 review
  在补足 packaged runtime marker 后 PASS。
- Epoch 11 / v3.0 plan rewrite：重新沿当前 request、durable coordinator、Provider、
  Runtime 与 Renderer reducer 链路核对 owner；删除 accepted/snapshot full bytes、
  fresh recovery 与通用 Asset 倾向，形成 stable URL 的最小 E1-E5 候选。
- Epoch 11 / `RC-V3-PLAN-02`：独立 full gate 判定方向正确但有 2 S1、1 S2
  局部缺口。修订只保留 image-only 空 user compatibility entry、补 packaged real
  import 性能门、把 source `File` 生命周期延长到 Worker ready；没有改 owner、协议、
  容量或 scope。
- Epoch 12 / E5 policy A：首轮 packaged acceptance 发现 Chromium 在 handler 前
  同样擦除 credentials spelling；`RC-E5-EVIDENCE-01` 判定原 fail-before-handler
  要求为有效 Stop。用户批准把该 spelling 纳入 canonical identity；v3.1 amendment
  不改产品代码或既有可观察安全边界，并通过 `RC-E5-PLAN-A-02`。
- 当前判断：v3.0 已通过独立 review；E1 已在 `1bf91cf` 完成并通过
  `RC-E1-CODE-02`；E2 已在 `36e32e6` 完成并通过 `RC-E2-CODE-03`；E3 已在
  `7677868` 完成并通过 `RC-E3-CODE-02`；E4 已在 `b13d3b8` 完成并通过
  `RC-E4-CODE-02`。v3.1 amendment 已通过 `RC-E5-PLAN-A-02`；E5 随后在
  `RC-E5-4K-MEMORY-01` 的 fresh-process 4K memory gate 停止，等待用户决策。

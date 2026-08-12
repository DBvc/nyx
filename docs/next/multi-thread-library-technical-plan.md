# Nyx Multi-Thread Library 技术方案 v4

状态：review candidate；不授权产品实现。

模式：architecture change + migration plan。
长期产品决策：永久删除必须在当前 Nyx 进程内立即撤销访问；不能做到时，不开放永久删除。

## 1. Goal 与 Non-goals

### Goal

把当前唯一 durable current thread 升级为 Electron Main 拥有的本地 Thread Library，可靠支持：

- New、切换、重启恢复；
- 每 Thread 草稿、标题与目标选择；
- 每 Thread 最多一个运行，Thread 之间可并行，切换不取消；
- Pinned、Recent、Rename、Archive、Trash、Restore；
- 只在删除承诺成立后开放 Permanent delete；
- 标题、消息和附件提取文本搜索；
- 单个逻辑记录或 sidecar 故障不阻断其他 Thread。

### Non-goals

- Folders、Tags、Projects、全库 Manual 排序；
- 多窗口同步、云同步、自动清空 Trash；
- durable Run/Step 平台、daemon、隐式队列；
- 通用 Asset Service、ORM、Repository interface、额外 Renderer 状态库；
- OCaml Thread domain 或新 Runtime protocol；
- tools、MCP、Agent picker、Artifacts、第三主面板；
- 法证级 SSD、文件系统快照或系统备份擦除。

## 2. 证据边界与 Source of truth

### 已确认

- `PRD.md` 把多会话、创建/删除/重命名、搜索、本地持久化与 SQLite 列为长期能力。
- `docs/next/agent-workbench-direction.md` 的用户模型是 local-first、thread-first：一条 Thread 对应一件想完成的事。
- `DESIGN.md` 要求保留 264px Sidebar + 单一聊天主区，Sidebar 低噪音，不增加第三主区。
- 当前 `CurrentThreadStore` 只有一个 v5 JSON record 和全局 operation queue。
- 当前 `ChatSessionManager` 只有一个 global `activeSession`，Runtime client 由 WebContents 所有；Renderer 销毁会终止运行。
- 当前 chat request/event/cancel 没有 `threadId`，request 仍携带 Renderer messages。
- 当前 Renderer 是一份全局 ChatState，标题和预览从 messages 推导。
- 当前图片协议使用一年期 `immutable` native cache；现有计划明确不承诺同进程 warmed URL 立即撤权。
- 当前 Responses sidecar 在 durable settlement 失败时做 rollback；附件 sidecar 已有完整性与容量约束。
- 当前 Electron runtime 能加载 `node:sqlite` 且 SQLite 包含 FTS5；尚未证明真实 packaged/signed 与主线程性能。

### 新 workstream 的 canonical source of truth

S0 必须更新，而不是绕过：

1. `docs/next/agent-workbench-task-slices.md`：增加唯一可执行的 `multi-thread-library` workstream 与切片状态；
2. `AGENTS.md`、`apps/desktop/AGENTS.md`：只对该命名 workstream 精确 supersede persistent history、Thread IPC 与 SQLite 禁令；同时精确 supersede D workstream 的“未发送 target 只在 Renderer 内存”规则，允许 materialized Thread 持久化 safe target selection id，但继续禁止持久化 resolved target、Provider 配置、凭据或改变全局默认；
3. 新的 repo-relative technical plan：记录本文最终 reviewed 版本；
4. `DESIGN.md`：只补 Thread Library IA 与交互合同，不扩成 dashboard。

必须继承现有 v5、Responses、图片、文档、Provider target、Main/Renderer/Runtime 安全不变量。S0 通过前只能改文档。

### 假设与未知

- 当前迁移对象是假设为个人开发环境中的 v5 current-thread 数据，不是已发布产品的自动升级。如果发现真实发布用户，S0 停止并改为正式幂等 upgrader/rollback policy。
- 未验证 packaged `node:sqlite`、Main event-loop stall、2/4/8 并发 Runtime、删除残留、同进程图片撤权和 live UI。
- SQLite 的 journal mode 不在计划文本中假装已验证；G1 先测单连接 `DELETE`，只有证据要求才评估 WAL。

## 3. 产品与交互合同

### 3.1 用户可见对象和位置

用户只有一个核心对象：Thread。用户可见位置只有：

```text
Available | Archived | Trash
```

Draft、运行状态、最后结果、attention 和 purge operation 都是正交状态，不是更多资料库位置。

- Archive：可逆整理；Archived Thread 可阅读，Composer 明示“发送后恢复到 Recent”。
- Trash：可逆删除；只读，只允许 Restore 或 Permanent delete。
- Permanent delete：仅 Trash 中提供；开始后不可 Restore，失败只允许 Retry。
- 运行中直接 Archive/Trash 不静默隐藏或取消；UI 提供 Keep running 与 Stop & archive / Stop & move to Trash。

### 3.2 Sidebar IA

保持两栏，不增加页面级第三面板：

```text
Nyx
New thread
Search
Pinned
Recent
Archived
Trash
Connections / Local user
```

- 普通 Thread row 只显示标题和一个最高优先状态；消息摘要只在 Search result 中显示。
- 主状态优先级：需要处理的失败/Interrupted > Running > Unseen completion > Draft。
- Selected 用行背景表达，不再增加 pill。
- Archived/Trash 是次级入口；进入后替换 Sidebar collection，Main 只显示该 mode 内的选择或对应空状态。
- 后台 completion 不改变 Recent 顺序，不弹打断式通知，只产生一次安静 attention。

Sidebar 有明确的 `available | archived | trash | search` mode。进入 Archived/Trash 时，只能恢复该 mode 内仍有效的上次选择、选择第一项，或显示该 mode 的空状态；Main 不得继续显示集合外可编辑的 Thread。Search 只显示命中集合，允许选择 Available 或 Archived 命中；退出 Search 恢复此前 mode 与有效选择。加载、空集合和安全错误都显示对应空详情，不复用旧 Thread。Pinned 不在 Recent 重复出现。

任何 row 离开当前 mode 后，选择/焦点按同位置下一项、上一项回退；若没有候选，Available 才进入 untouched placeholder，Archived/Trash 留在各自空状态，Search 回到 Search input 与空结果状态。Archived Thread 的 Send 一旦 Draft→Turn commit 成功，UI 原子切到 Available mode、保持该 Thread selected 与 Main/Composer focus；commit 失败则仍留在 Archived。

### 3.3 Search contract

- 范围：Available + Archived；排除 Trash、Purging/Purge failed。
- 语料：标题、已提交 Turn 的消息、Turn-owned 且已验证的附件提取文本；首版不搜索未发送 Draft body 或 Draft-owned attachment。
- 结果：Thread 标题、匹配来源、短摘要；选择消息/附件命中后定位到对应 Turn anchor。
- Search 临时替换 Pinned/Recent 列表，不增加独立搜索页面。
- 查询与候选文本统一做 Unicode `NFKC` + 默认、非 locale-sensitive lowercase 后按字面 substring 匹配；短中文、一至两个字符不得分词。
- 每 Thread 只返回最佳命中：title > user message > assistant message > document；同优先级取最早 Turn/文档位置。Thread 间按 `last_user_activity_at DESC, created_at DESC, id ASC`；迟到 query result 由 Renderer query epoch 丢弃。

### 3.4 New、Draft 与焦点

- 全应用最多一个 untouched placeholder；不落库、不进列表。
- 第一次非空文字、显式 Rename 或 Main 接受附件后 materialize；仅切换 target 不创建 Thread。Materialized Thread 的 safe target selection id 与 Draft 一起持久化，切换 Thread/重启后恢复；它不改变 Connections 全局默认。
- create ack 只把 placeholder 原地 rekey，再 flush 最新 overlay；不能插入第二行。
- 正常 autosave 不显示噪音；明显延迟或失败在 Composer 附近显示 Saving / Not saved，dirty overlay 不得被迟到 snapshot 覆盖，除非用户明确选择 `Close without saving`。
- “零 Turn + auto title + 空 Draft + 无附件”的 materialized Thread 是可回收空壳：正常导航/关闭只能在当前 mutation queue drained、没有 dirty/preparing overlay 且空 Draft 已 Main ack 后，由 Main 用 exact Draft revision 和上述条件原子删除；启动恢复可直接按 canonical 状态检查。显式 Rename 过的 Thread 永不自动回收。任一条件或竞态失败就保留，不做 best-effort 猜测。
- selection 与 reading anchor 可保存在 Renderer localStorage；attention 的 seen revision 必须由 Main 持久化。

Main ack 是草稿持久化边界。选择/New/mode change/Archive/Trash/Send/普通窗口关闭/App quit 共用当前 Thread 的同一 navigation-save barrier：先 flush/等待 Main ack，再改变选择、可编辑性、location 或执行空壳回收；失败时保持原选择/mode/location 并给 Retry。Renderer 因此只保留当前 Thread 或 placeholder 的一份 dirty Draft overlay/preparing bytes，不积累跨 Thread dirty copies。Close/quit 额外提供 `Close without saving`，明确列出该 Thread title 和将丢弃的文字/附件，默认安全动作是 Stay/Retry；只有用户明确确认才丢失。进程崩溃、强制结束或断电时，只承诺恢复已经 Main ack 的文字、target 与附件；仍在 Renderer 的 keystroke/preparing bytes 不作虚假持久化承诺。

### 3.5 Keyboard / accessibility contract

- 每个 Thread collection 使用一个 roving Tab stop；New、Search input、Archived/Trash 和 Connections 保持普通 Tab 顺序。collection 内 Arrow、Home、End 移动，Enter 选择，Shift+F10 打开菜单。
- Rename：F2/菜单进入，Enter 保存，Escape 取消，错误与输入关联。
- Pin 排序必须有 Move up/down/top/bottom；拖拽不是唯一入口。
- 菜单关闭后焦点回触发行；行被移除时按确定性 fallback 移焦。
- Streaming token 不逐个播报；terminal/failed 只做一次 polite announcement。
- 状态有文字 accessible name，不以颜色为唯一线索；截断标题保留完整 accessible name。
- Focus ring 与 selected background 必须可区分，selected row 使用 `aria-current`；row menu 在 `focus-within` 时可见。Search input 的 ArrowDown 进入 results，Escape 先清 query、再次退出 Search；Enter 打开命中并把焦点移到 Main 的 matched anchor，标题命中则移到 Thread heading。

## 4. Target architecture 与 owner

### Renderer

只拥有：

- lightweight Thread summaries；
- 当前选中 Thread detail projection；
- untouched placeholder；
- 当前 placeholder/selected Thread 的一份 dirty Draft overlay 与 preparing attachment bytes；
- local selection、reading anchor、search query epoch。

Renderer 不拥有历史权威、Provider messages、生命周期、attention 或文件路径。

只有窗口在前台且有焦点、Thread 已选中、对应 terminal/bottom anchor 实际可见时，Renderer 才用 exact `result_revision` 调用 `markSeen`；hydrate 或单纯选择不算已读。Sidebar 折叠时，toggle 仍显示一个安静的 attention indicator/count，并提供完整 accessible name。

### Preload / shared contracts

保留两个真实边界，不做 namespace churn：

- `window.nyx.threads`：list/get/create/saveDraft/rename/pin/archive/trash/restore/purge/search/markSeen/subscribe；
- `window.nyx.chat`：start/cancel/retrySettlement/subscribe execution events。

Shared 与 preload 边界类型保留 `Nyx*`；Main/Renderer implementation-local 名称不加 `Nyx`。

### Electron Main

拥有：

- 一个窄的 SQL owner 和 Thread Library service；
- thread-owned sidecar 文件 IO 与自定义图片协议授权；
- `Map<threadId, ActiveRun>`；
- 每 ActiveRun 一个独立 Runtime client；
- Provider target resolution、Provider 调用、Responses state；
- 一个进程内 `eventEpoch + cursor` publisher；
- 每 Thread 的短临界区协调器。

协调器不得跨 Provider、Runtime、文件递归删除或其他异步长操作持锁。

### OCaml Runtime

每个运行独立创建、重放 exact Thread 的文本历史，终态关闭。它仍是可重建投影，不拥有 Thread、Provider、文件或凭据；本 workstream 不改 Runtime protocol。

## 5. Canonical data model

SQLite 使用 strict tables、bound parameters、FK、defensive、`trusted_schema=OFF`、`secure_delete=ON`。目录 0700、数据库文件 0600。不开 ORM，不建只有一个实现的 interface/factory。

### `threads`

- `id`：UUID primary key；
- `location`：`available | archived | trash`；
- `trashed_from_location`：仅 Trash 非空，值为 `available | archived`；
- `trashed_pin_position`：从 Available Pinned 进入 Trash 时保存；Restore 时按当前位置边界插回并事务内重排；
- `pin_position`：仅 Available Pinned 非空；partial unique index 保证位置唯一，所有 move/archive/trash/restore 在事务内重排为连续位置；
- `title`、`title_source: auto | manual`；
- `thread_revision`：只保护 Rename/location 等 Thread metadata mutation；
- `last_user_activity_at`；
- `result_revision`、`seen_result_revision`；
- `created_at`、`updated_at`。

Pinned position 只对 Available 生效。Archive 会取消 Pin；从 Archived 进入 Trash 不保存 Pin。Restore 到 Available 时，只有从 Pinned Available 进入 Trash 的 Thread 恢复 Pin。Pinned 按 `pin_position ASC, id ASC`；Recent 排除 Pinned，并按 `last_user_activity_at DESC, created_at DESC, id ASC`，重启不改变 tie-break。

`last_user_activity_at` 只在下列 Main commit 更新：materialize/非空 Draft 内容或附件变化、Send、Retry、手工 Rename、Restore。选择、mark seen、Pin reorder、后台 delta/terminal 不更新。

### `drafts`

每 Thread 恰好一行：`thread_id`、`draft_revision`、text、safe target selection id、updated_at。Draft revision 同时保护 text、target 与 ordered attachment refs；发送消费 revision `r` 后清空 text/attachment refs、保留本次 accepted safe target id 与 row，并递增到 `r+1`；迟到 autosave 必须 CAS 失败。

### `turns`

`thread_id + ordinal` 为顺序主键；保存 attempt request id、user/assistant ids、内容、pending/terminal status、safe error、target binding/attribution、provider state ref 与时间。SQLite 约束每 Thread 最多一个 pending，且 pending 必须是最后一个 Turn。Retry 更新 exact failed Turn 的 attempt identity，不按 Thread 模糊匹配。

### `images` / `documents`

- metadata、owner (`draft | turn`) 与 Turn position 在 SQLite；文件路径只能由 Main 从已验证 UUID 和固定根派生。
- 图片 canonical bytes 保留在 thread-owned sidecar。
- 文档 raw source 保留在 thread-owned sidecar；已验证且有现有容量上限的 extracted text 存入 SQLite `documents`，成为 Provider materialization 与 substring Search 的 canonical text。新库不再复制 `.text` sidecar。
- v5 importer 必须同时验证旧 source/text hashes，再写 source sidecar 与 SQLite extracted text。
- Draft attachment rows 保存 owner、稳定 id 与 position；一个 Draft CAS 可提交完整 ordered existing refs 与本次新增的受现有容量/类型约束 payload。Main 先 stage/verify 新文件，再在 DB transaction 提交 text/target/refs/order 并递增同一 Draft revision；CAS 失败保留 Renderer overlay，staged 文件进入 orphan reconcile，Renderer 只在 ack 后释放 bytes。

### `provider_state_refs`

完成 Turn 只保存 integrity metadata；Responses payload 保留在线程 sidecar。只能回放到 exact target + execution identity。

### `purge_jobs`

独立 operation 表：thread id、phase、safe error、attempt count、started/updated time。它不把 Purging 变成 Thread location。只要 job 存在，所有 detail/search/image/provider 读取都拒绝；只允许安全的 deletion-status projection 和 Retry。

不建 `runs`、全局 catalog 或基础 `search_documents` 表。Thread summary 和初始 substring search 直接查询 canonical SQLite 数据；只有 Q1 性能门禁失败才规划派生 FTS index。

## 6. Contract identity matrix

| 操作                         | 必需身份 / CAS                                                                                                                                             | 不应携带                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| save Draft                   | `threadId + expectedDraftRevision`；payload 同时含 text、safe target id、ordered attachment refs/new payload；Renderer 每 Thread 只允许一个 in-flight save | run identity / redundant mutation id      |
| Rename/Archive/Trash/Restore | `threadId + expectedThreadRevision`                                                                                                                        | requestId/runRevision                     |
| Pin move                     | `threadId + canonical destination`，Main 在当前集合事务内验证                                                                                              | full Renderer-owned order source of truth |
| start/retry Run              | `threadId + requestId + expectedDraftRevision`                                                                                                             | Renderer messages                         |
| cancel/retry settlement      | `threadId + requestId`                                                                                                                                     | generic Thread revision                   |
| run event                    | `threadId + requestId + eventEpoch + cursor`                                                                                                               | duplicated runRevision                    |
| mark seen                    | `threadId + observedResultRevision`                                                                                                                        | requestId                                 |
| search                       | IPC 只带 bounded literal query；`queryEpoch` 仅由 Renderer 丢弃迟到结果                                                                                    | run identity / Main-owned search session  |

Main 为 accepted Turn 生成/确认 canonical message identity，并从 exact Thread 构建 Provider history。旧 Renderer `messages` request source of truth 在 C1 切换时删除。

## 7. 关键事务与线性化规则

### 7.1 Materialize / autosave

- 当前 placeholder/thread 使用一个 Renderer mutation queue；Main 仍以一个覆盖 text/target/attachments 的 Draft CAS 为准。
- 首次 create 返回 thread id/revision，只做 rekey；队列随后发送最新 overlay。
- CAS conflict 返回 canonical revision，但不得用 snapshot 覆盖 dirty overlay；Renderer 重新基于最新 revision 提交或显示 Not saved。
- 附件只有在 Main 完成 staging、完整性校验和 durable write 后才能释放 Renderer bytes。
- 所有 navigation/lifecycle/close/quit 复用同一 queue barrier，不另建第二保存路径；失败时保持原对象，只有 close/quit 提供 3.4 的明确失效确认。

### 7.2 Draft → pending Turn

一个短 SQLite transaction 完成：

1. 校验 Thread location、没有 purge job、没有 pending、Draft expected revision；
2. Archived 自动恢复 Available；
3. 插入 user/assistant pending Turn；
4. 将 ready attachment owner 从 Draft 迁移到 Turn；
5. 清空 Draft、递增 tombstone revision；
6. 首次发送冻结 Main-derived auto title；
7. 更新 `last_user_activity_at`；
8. commit。

Commit 后才创建 Runtime client 和发起 Provider side effect。若起点是 Archived，commit 同时恢复 Available；UI 收到 ack 后必须按 3.2 切 mode 并保持选择/焦点。

### 7.3 Terminal settlement

所有 terminal 使用 exact conditional update：

```sql
... WHERE thread_id = ? AND attempt_request_id = ? AND status = 'pending'
```

影响行必须恰好为 1。Stop/Complete/Fail 只有一个赢家；输家不发 terminal event并重读 canonical terminal。

Responses sidecar 先 prepare/verify/atomic rename，再做 DB transaction；DB 失败继续 best-effort rollback，rollback 失败成为 reconcile orphan。此时不产生 durable `storage-blocked`：

- `ActiveRun` 转为进程内 `settlement_failed`，保留可显示/复制的 final overlay 与 exact terminal input；
- Thread 内禁止新 Run，但其他 Thread 不受影响；
- `retrySettlement(threadId, requestId)` 重试同一 terminal commit；
- App exit 不把它写成 Cancelled，pending 下次恢复 Interrupted。

### 7.4 Stop & Archive / Trash

不等待持锁：

1. 在 per-thread 短临界区定位 exact ActiveRun，写入一次性 `postStopAction`，设置明确 abort reason，然后释放；
2. 该 Run 的 terminal settlement 在同一个 DB transaction 中 settle Turn 并消费 `postStopAction` 改 location；
3. 如果 terminal 已先完成，生命周期命令在下一短事务按 canonical terminal 改 location；
4. Send/Retry 不得插入已登记 postStopAction 的 Thread。

`Keep running` 只取消本次 Archive/Trash 意图，不登记延后移动。`Stop and archive/trash` 的 row 在 terminal + location canonical commit 前留在当前集合并显示 Stopping；settlement 失败时显示独立的 `Couldn't save result` / `Retry saving`，普通 Provider Retry 不可用。C1 暴露该安全状态，E1 保留 exact terminal input，U1/L1 提供恢复动作；`Retry saving` 不得再次调用 Provider。

测试必须覆盖 Complete 与 Stop-action 同时到达，证明无死锁、恰好一个 terminal、最终 location 一致。

### 7.5 Snapshot / event ordering

- Renderer 先 subscribe 并 buffer，再调用 snapshot。
- Main 在一个无 `await` 的同步步骤读取 SQLite projection、匹配的 ActiveRun overlay，并返回 `eventEpoch + includedThroughCursor`。
- Snapshot 只有在 DB 最新 Turn 仍 pending 且 thread/request 完全匹配时才合并 live overlay；DB terminal 优先。
- Renderer 只应用同 epoch、cursor 更大且身份匹配的 event；cursor gap 或 epoch 变化时重新 hydrate。
- Cursor 不持久化，Thread/Draft/result revisions 才是跨重启 CAS/attention 数据。

### 7.6 App/window lifecycle

- Renderer 或窗口销毁不自动 abort；只撤销 event sink。Mac 上应用仍运行时后台 Run 继续。
- App quit 先设置 shutdown fence，从可接受集合撤销 ActiveRuns，再以 `app_exit` abort reason 中止 Runtime/Provider；catch 禁止写 Cancelled。
- 已提交 terminal 可以胜出；其余 pending 重启恢复 Interrupted。

### 7.7 Permanent delete

产品前置条件：G2 证明同进程 warmed preview/full URL 在 purge 后不可再次显示，同时保持现有 Renderer byte/path 隔离与支持范围内的内存线。

单窗口 UI 在调用 purge 前清除当前 Thread 的 DOM/preview；Main 的不可恢复线性化点是：

1. 短 DB transaction 校验 Trash/no ActiveRun，建立 `purge_job`；
2. 从此所有内容读取与 Restore 拒绝，Sidebar 只可投影 generic deleting/failed status + Retry；
3. thread-owned sidecar 根同卷 rename 到 `purging/<threadId>`；
4. 幂等递归删除目录；
5. final DB transaction 删除 Thread/Draft/Turn/resources 和 purge job；
6. 任一步失败写 safe `purge_failed`，只允许 Retry；启动时恢复一次，仍失败则显式留待用户 Retry。

数据库和文件系统不存在伪原子事务；failure-injection 覆盖每个 commit/rename/remove/restart 边界。Permanent delete 的 UI/IPC 在旧 v5 root 清理并证明不可读取前保持不存在。

确认框在不可恢复线性化前显示 exact Thread title、`No undo`、只承诺删除本设备 Nyx managed data 且外部/系统备份可能仍存在；默认焦点为 Cancel，Escape 取消。确认后 Main 立即撤销 detail/search/image/provider 授权，Main 显示 generic `Deleting thread`，不再投影 title 或内容；失败显示 generic `Couldn't delete thread` + `Retry deletion`，成功/失败各只 announcement 一次，并按 3.4 的确定性规则移动焦点。

## 8. Search implementation rule

Q1 首版从 SQLite 分块读取符合 lifecycle 的 canonical title/committed messages/Turn-owned document text，在 Main 用 3.3 的 NFKC + lowercase 做 bounded literal scan，不写第二份 normalized corpus：

- query 先做长度上限与已冻结的 normalization；
- SQL 只用 bound parameters；
- title/message/document text 命中统一返回 Thread/Turn/document anchor；
- canonical `location` 与 `purge_jobs` 在 query 中强制过滤；
- 结果数量有上限，Renderer query epoch 丢弃迟到结果。

只有真实 100+ Thread / 大 Thread 门禁超过响应线时，停止 Q1 并另写 FTS5 派生索引 amendment；不得在实现中顺手加 FTS。

## 9. Migration、Rollout 与 rollback

### 迁移对象

当前选择：个人开发环境的一次性显式 v5 importer；产品 runtime 不带长期 v5 reader、dual-read、dual-write 或 silent fallback。

### Import

在 `thread-library.importing/`：

1. strict parse v5 current thread；
2. 把 abandoned pending 转为现有 Interrupted 语义；
3. 验证并复制图片、文档 source、文档 extracted text、Responses sidecar；
4. 写 SQLite 与新 thread-owned root；
5. 关闭 DB、处理 journal，完整复核引用/hash；
6. 原子 rename staging root 为 `thread-library/`。

旧 `userData/threads` 在迁移验收期只读，字节不变。Importer 幂等：目标已存在时不得重放或覆盖。

### Rollback ratchet

- M1 验收前：可回退旧 binary + 未修改旧 root；新库不向 v5 回写。
- M1 验收通过后：单独、显式清理旧 root，记录 rollback boundary 关闭；失败则 Permanent delete 保持禁用。
- 旧 root 清理后：只能备份/恢复完整新 Thread Library；不支持 v6→v5。
- 用户自行保留的系统/外部备份不属于 Nyx managed data，产品文案必须说明。

如果 S0 发现真实已发布升级对象，整条 migration 方案停止，改为自动幂等 migration + release rollback，不复用上述开发 importer 假设。

## 10. 实施切片

### S0 — Canonical scope lock（docs only）

- Allowed：更新 canonical task slices、root/desktop scope、reviewed plan、DESIGN IA。
- Forbidden：任何产品代码、数据库、IPC 或行为变化。
- Invariant：精确继承现有 Provider/Responses/附件/Runtime 安全边界。
- Validation：relative links、scope priority、allowed/forbidden file inventory、format-check、独立 scope review。
- Stop if：删除语义、迁移对象、继承不变量或 supersede 范围仍需实现者猜测。

### G1 — Packaged SQLite + Main-stall gate（OS temp）

- Allowed：production-shape probe；验证 Electron dev/build/asar/package 的 `node:sqlite`、strict/FK/transaction/reopen、DELETE journal、权限与 crash fixture。
- Forbidden：业务 schema、DB Worker、ORM、产品 wiring。
- Invariant：stream/Stop/Renderer heartbeat 可观测。
- Validation：100+ Thread、大 Thread、Draft burst、substring search、import/purge-maintenance candidate 并行测量；routine Main task 不跨一帧，Stop 调度附加延迟不超过 50ms。
- Stop if：packaged 不一致或主线程超线；失败后另行 replan 一个整体 DB Worker，不在本 slice 预建逃生层。

### G2 — Same-process image revocation gate（OS temp）

- Allowed：依次测试最小 cache revalidation/no-store 候选和必要的 session cache eviction；沿用当前 main-streaming custom protocol 与权限边界。
- Forbidden：产品 purge、JS-owned bytes/path、Blob URL、弱化现有图片支持/内存/security 线。
- Invariant：warm old URL、旧 `<img>` identity、新建 `<img>`、preview/full 在 purge authorization revoke 后均不可达；fetch/XHR/canvas 仍失败。
- Validation：dev/build/asar/package、同进程 warm/reload、当前 DOM teardown、same-profile restart、支持上限内的重复 preview/full memory matrix。
- Stop if：只能靠缩小删除承诺、暴露 bytes/path 或突破既有内存线才能成功；此时 Permanent delete 整体保持禁用并返回产品决策。

### D1 — SQLite domain + explicit importer foundation

- Allowed：窄 SQL owner、strict schema/constraints、Thread/Draft/Turn/resource/purge tables、transaction helpers、显式 v5 importer tests；暂不接 Renderer。
- Forbidden：generic repository interface、FTS、UI、ActiveRuns、Runtime/Provider changes。
- Invariant：每 Thread pending 唯一；Draft tombstone；trash origin；old root read-only；provider target/state identity preserved。
- Validation：schema constraints、transaction rollback、strict corrupt row isolation、migration text/image/document/Responses/pending/disk-full/repeat cases。
- Stop if：需要 dual-read/write、无法无损导入已验证 v5，或单 DB 物理隔离成为硬产品要求。

### D2 — Thread-owned resources + Draft/settlement domain

- Allowed：新 sidecar root/staging/reconcile、文档 extracted text 入 DB、Draft CAS、Draft→Turn transaction、terminal CAS 与 in-memory settlement_failed retry。
- Forbidden：Library UI、Purge UI、durable settlement journal、改变附件容量与 Provider wire behavior。
- Invariant：DB transaction 内无文件/Provider IO；orphan 可 reconcile；terminal 失败不假装成功；其他 Thread 不受阻。
- Validation：autosave/send race、sidecar/DB failure injection、retry settlement、app exit→Interrupted、现有附件/Responses fixture parity。
- Stop if：需要第二 durable truth 才能恢复 terminal，或 sidecar rollback/reconcile 不可界定。

### C1 — Thread Library API + thread-scoped chat cutover

- Allowed：新增 `window.nyx.threads`；保留并 thread-scope `window.nyx.chat`；移除 request.messages；subscribe-buffer-snapshot/cursor；Renderer adapter 仍可只显示一条 imported Thread。
- Forbidden：删除整个 chat namespace、全库 Renderer message cache、多窗口同步、OCaml changes。
- Invariant：Main-derived exact history；Provider/credentials 不跨 preload；A/B late event 不污染选择。
- Validation：shared parser tests、preload compat、A/B hydration race、epoch restart、invalid/stale identities、current behavior parity。
- Stop if：需要双 IPC source of truth 或 snapshot 无法在同步 publication step 建立边界。

### E1 — Per-Thread execution and shutdown

- Allowed：`Map<threadId, ActiveRun>`、每 Run Runtime client、exact cancel、postStopAction、global safety-cap evidence gate。若 gate 需要容量上限，达到上限时在 Draft→Turn commit 前明确拒绝 Start，保留 Draft 并提示用户停止其他 Run 后重试；不隐式排队。
- Forbidden：queue、daemon、durable Runs、sender-owned run、Runtime protocol changes。
- Invariant：一 Thread 一 Run、跨 Thread 可并行、Renderer 销毁不取消、App quit 留 Interrupted、terminal CAS 唯一。
- Validation：2/4/8 并发，A/B streaming/switch/Stop/Retry，Complete-vs-Stop action，Runtime/provider/storage failures，容量拒绝不消费 Draft，window close/app quit。
- Stop if：运行相互污染、死锁、终态双写，或资源证据要求 queue/daemon 才能成立。

### U1 — Core Thread Library UI

- Allowed：New/placeholder、list/select、per-thread Draft、title fallback、Pinned/Recent row/status、selection/scroll restore、collapsed attention、`settlement_failed` 的 `Retry saving`、上述 keyboard/focus/close-flush contract。
- Forbidden：Archive/Trash/Purge/Search、第三面板、虚拟列表、新状态库、视觉重构。
- Invariant：主聊天保持视觉中心；未保存 overlay 不丢；后台完成不跳序；每行一个主状态。
- Validation：100+ Thread、长中英文标题、first-character→clear→立即 New/切换/Trash 的 save-barrier 与空壳回收、disk-full 时导航不切换、close/quit 单 Thread loss confirm、attention seen/collapse、Retry saving 不重发 Provider、keyboard/VoiceOver smoke、minimum window。
- Stop if：264px Sidebar 无法保持低噪音，或实现需要全库 detail cache。

### L1 — Reversible library lifecycle

- Allowed：Rename、Pin/move、Archive、Trash、Restore、Undo、Archived auto-restore-on-send、running Stop-action flow。
- Forbidden：Permanent delete、Empty Trash、auto expiry、folders/tags/manual mode。
- Invariant：Trash origin/order 可恢复；Archive/Trash 不静默取消；无锁等待；Recent 只按冻结的用户活动规则变化。
- Validation：所有 location transitions/restart、Pin order/tie-break/restore、Archived Send→Available、Available/Archived/Trash/Search 的 mode-aware empty/focus fallback、stale thread revision、Keep running/Stop dialogs、keyboard menus。
- Stop if：需要把 purge operation 混入 Thread location，或用户动作存在不可逆结果。

### Q1 — Bounded literal Search

- Allowed：canonical SQLite rows + Main literal scan、result snippet/source/anchor、Active+Archived filtering、Renderer query epoch。
- Forbidden：FTS、独立搜索页、Trash hit、持久化第二 corpus。
- Invariant：搜索永不泄露 Trash/Purge；结果定位 exact Turn/document；短中文正确。
- Validation：NFKC/case、1/2 字中文、长英文、ranking/tie-break、message/Turn-owned document/Archived 命中、Draft exclusion、rename/trash/purge stale result、100+ Thread latency。
- Stop if：真实性能超线；只允许提交 FTS amendment，不在本 slice 扩张。

### M1 — Cutover acceptance + legacy cleanup ratchet

- Allowed：执行显式 importer、packaged migration matrix、确认新库、在单独用户确认后删除旧 Nyx v5 root、记录 rollback boundary 关闭。
- Forbidden：silent fallback、v6→v5、在验证前删除旧 root、开放 Permanent delete。
- Invariant：迁移前 old root 字节不变；清理前可回滚；清理后 Nyx 不再拥有隐藏旧副本。
- Validation：fresh/repeat/interrupted import、disk-full、corrupt item、packaged restart、old root absence and authorization scan。
- Stop if：导入或 cleanup 失败、发现真实发布迁移对象，或无法证明旧内容不再被 Nyx 读取。

### P1 — Permanent delete

- Dependencies：G2 PASS、M1 legacy cleanup PASS。
- Allowed：purge journal、quarantine rename/delete/retry、Trash-only confirm/UI、image authorization revocation、secure delete residue checks。
- Forbidden：自动清空、法证承诺、全局 best-effort reset、在失败时假装成功。
- Invariant：purge linearization 后不可 Restore/读取；失败只 Retry；其他 Thread 可用。
- Validation：每个 DB/file/restart failure boundary、warm URL、确认后 title/detail/search/provider/image 均不可访问、DB/journal residue、Cancel-first focus、generic retry row 与 confirmation copy。
- Stop if：任一 Nyx access path 在确认后仍可读取，或删除失败无法可靠重试。

### A1 — Full acceptance and cleanup

- Allowed：完整 desktop checks、packaged product matrix、删除旧 current-thread runtime/API/code/tests、同步 canonical docs。
- Forbidden：顺手加入 deferred features 或 Runtime domain。
- Invariant：Connections、target selection、Responses、images/documents、Stop/Retry 与现有安全边界保持。
- Validation：typecheck/compat/lint/build、automated unit/integration、real provider two-target、restart、concurrency、migration、search、lifecycle、purge、keyboard/VoiceOver runthrough。
- Stop if：任何 inherited acceptance 退化或 residual blocker 未关闭。

依赖顺序：

```text
S0
├─ G1
└─ G2
G1 → D1 → D2 → C1 → E1 → U1 → L1 → Q1 → M1
G2 + M1 → P1
P1 + Q1 → A1
```

图中每个产品切片入口都包含一个必需的 docs-only
`multi-thread-library/<slice>-scope-lock` 控制步骤：前置依赖通过后，只允许在
canonical task-slices 文档中登记该切片的 exact allowed-file inventory、验证和
review binding；该单文件 diff 独立评审并进入 HEAD 后，产品切片才可开始。这个
控制步骤不增加产品能力，也不适用于保持 tracked worktree 干净的 G1/G2。

## 11. 风险到验证映射

| 风险                      | 预防                               | 关键验证                             |
| ------------------------- | ---------------------------------- | ------------------------------------ |
| Main 被同步 SQLite 卡住   | G1 在业务 schema 前停止            | heartbeat/stream/Stop latency        |
| A/B 迟到事件污染          | identity matrix + epoch/cursor     | subscribe-buffer-snapshot race       |
| autosave 复活已发送 Draft | tombstone revision + CAS           | delayed save after Send              |
| Stop/Complete 双终态      | exact conditional settlement       | deferred concurrent terminal         |
| Stop-action 死锁          | postStopAction，不跨等待持锁       | Complete vs Stop&Archive/Trash       |
| settlement DB 失败        | in-memory retry + pending recovery | sidecar/DB failure + restart         |
| Trash Restore 错位置      | trashed origin/pin position        | all location/pin restart transitions |
| Purge 半完成              | durable purge job + quarantine     | every failure/restart boundary       |
| cached 图片仍可见         | G2 immediate revocation            | same-process retained old URL        |
| 旧 v5 副本违背删除        | M1 cleanup ratchet before P1       | filesystem + authorization scan      |
| 搜索泄漏已删内容          | canonical location/job filter      | stale query after Trash/Purge        |
| Sidebar 状态过载          | one-primary-status contract        | 100+ Thread + failure mixtures       |

## 12. 对抗检查结果

- 没有第二业务 source of truth：SQLite canonical；sidecars 是受引用、完整性校验的 bytes；Renderer/Runtime/Search result 都是投影。
- 没有为未来 Agent 预建 Run/Step/queue；Folders/Tags/Projects 仍被排除。
- 没有把迁移、可逆整理和永久删除塞入一个 slice；P1 被 G2 与 M1 双 gate 阻断。
- 没有为了多会话重写 chat namespace；execution 与 library 保留不同边界。
- 不可逆 human checkpoint：M1 旧 root cleanup 与 P1 confirm 都必须明确，controller/implementer 不能代替。
- 当前方案会被推翻的证据：packaged SQLite 不可靠；Main stall 失败且 DB Worker 方向不被接受；同进程撤权无法在现有图片安全/内存线内成立；产品改为要求物理单 Thread DB corruption 隔离；发现真实发布升级对象。

## 13. Handoff

本 artifact 只可交给独立 product/design/strict technical review。三者无 material blocker 后，仍只允许从 S0 docs-only 开始；产品代码必须等待 S0 canonical scope review 与对应 G gates。任何 review 修改本文都会产生新版本与新 fingerprint。

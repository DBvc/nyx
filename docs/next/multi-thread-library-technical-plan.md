# Nyx Multi-Thread Library 技术方案 v5.3

状态：reviewed landing candidate；G1/G2 已 `VALID_STOP`。本文记录的 exact-byte reviews 全部通过且这些字节进入 HEAD 时，本状态自动成为 complete，不再用状态补丁改变已评审 artifact；随后只授权 G1W/G2R OS-temp gates，不授权产品实现。

模式：architecture change + migration plan。
长期产品决策：永久删除必须在当前 Nyx 进程内立即撤销访问；不能做到时，不开放永久删除。

## 1. Goal 与 Non-goals

### Goal

把当前唯一 durable current thread 升级为 Electron Main 拥有的本地 Thread Library，可靠支持：

- New、切换、重启恢复；
- 每 Thread 草稿、标题与目标选择；
- 每 Thread 最多一个运行，Thread 之间可并行，切换不取消；
- Pinned、Recent、Rename、Archive、Unarchive、Trash、Restore；
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
- G1 已证明 Electron dev/production-build 的单连接 SQLite correctness、DELETE journal、权限与 SIGKILL recovery；production build 一次同步 Draft commit 为 `19.623 ms`，超过固定 `16.667 ms` Main stall line，因此 G1=`VALID_STOP`，Main-event-loop `DatabaseSync` 被否决。完整结果记录在 [multi-thread-library-runthrough.md](./multi-thread-library-runthrough.md)。
- G2 已证明 `no-cache` 和 `session.clearCache()` 无法撤销 warmed native image；`no-store` 能立即撤权但重复 4K full-view 的 post-close plateau 超过既有 `16/8 MiB` 线，因此 G2=`VALID_STOP`，Permanent delete 继续不存在。完整结果记录在 [multi-thread-library-runthrough.md](./multi-thread-library-runthrough.md)。
- Electron 41 的 `webFrame.clearCache()` 明确用于在页面实际减少内容后释放不再使用的 Renderer resource cache；它与只清 HTTP cache 的 `session.clearCache()` 不同，但尚未经过 Nyx production-shape 验证。

### 新 workstream 的 canonical source of truth

S0 已完成并进入 HEAD；G1/G2 的有效 Stop 与后续 full-review findings 触发本 v5.3 amendment，而不是绕过：

1. `docs/next/agent-workbench-task-slices.md`：增加唯一可执行的 `multi-thread-library` workstream 与切片状态；
2. `AGENTS.md`、`apps/desktop/AGENTS.md`：只对该命名 workstream 精确 supersede persistent history、Thread IPC 与 SQLite 禁令；同时精确 supersede D workstream 的“未发送 target 只在 Renderer 内存”规则，允许 materialized Thread 持久化 safe target selection id，但继续禁止持久化 resolved target、Provider 配置、凭据或改变全局默认；
3. repo-relative technical plan 与 runthrough：记录本文最终 reviewed 版本和可复核 gate 证据；
4. `DESIGN.md`：只补 Thread Library IA 与交互合同，不扩成 dashboard。

必须继承现有 v5、Responses、图片、文档、Provider target、Main/Renderer/Runtime 安全不变量。本 amendment 按上述 self-ratchet complete 前只能改文档。

### 假设与未知

- 当前迁移对象是假设为个人开发环境中的 v5 current-thread 数据，不是已发布产品的自动升级。如果发现真实发布用户，D1 停止并改为正式幂等 upgrader/rollback policy。
- G1 因固定 Main stall line 触发 Stop 后未运行 `app.asar`/packaged；一个静态 Node Worker 在 dev/build/`app.asar`/packaged 中加载 `node:sqlite`、Worker FIFO snapshot barrier 和 crash/restart 语义尚未验证。
- G2 的三个封闭候选均失败；`no-store + webFrame.clearCache()` 的 detail-scope teardown 和 immutable cache 的双层 eviction barrier 尚未验证。
- 2/4/8 并发 Runtime、删除残留和 live UI 仍未验证。
- G1 已验证单连接 `DELETE` journal；不因 Worker amendment 顺手引入 WAL。

## 3. 产品与交互合同

### 3.1 用户可见对象和位置

用户只有一个核心对象：Thread。用户可见位置只有：

```text
Available | Archived | Trash
```

Draft、运行状态、最后结果、attention 和 purge operation 都是正交状态，不是更多资料库位置。

Thread-scoped unavailable 也是正交错误状态，不是第四个位置或新持久化字段：只有 Main 仍能安全确定 Thread id、location/order 与 safe summary，但 canonical Thread/Draft/Turn 内容行无法安全重建，或 exact Responses repair 自身失败时，才由 canonical read 派生该状态。row 保持原位置与顺序并显示最高优先级错误；Main detail 只显示 `Couldn't open this thread` 与 Retry。该 Thread 的 canonical content、Search、Provider/Image authorization 和一切 mutation 都 fail closed，不允许 Start fresh/reset/隐式删除；其他 Thread 仍可选择、搜索、运行和修改。若连安全 Thread identity/location 都不能确定，升级为 4 节的 Library unavailable，而不是猜测归属。

资源故障不走上述整 Thread 分支：缺失/损坏的图片或文档 sidecar 继续使用现有 per-resource unavailable placeholder，只阻断需要该资源的 open/Provider/Retry；无关文本、健康资源和已在 SQLite 中验证的 extracted text 仍可读、可搜索。Responses continuation sidecar 损坏时，先用 exact `threadId + requestId + providerStateRef/hash` 执行现有 controlled ref repair，清除该 exact 引用并回退 durable visible text；只有 repair transaction/reconciliation 本身无法安全完成才进入 Thread-scoped unavailable。不得因为一种资源坏掉隐藏或锁死整条 Thread。

- Archive：可逆整理。Archived Thread 可阅读，并提供不发送新消息的 Unarchive；Composer 同时明示“发送后恢复到 Recent”。
- Unarchive：`Archived → Available`，不恢复已被 Archive 清除的 Pin；成功后仍选中原 Thread。菜单触发时焦点落到 Available 中的选中 row，Main banner 触发时落到 Composer；失败则留在 Archived 并把 safe error 关联到原触发器。
- Trash：可逆移除；只读并继续占用本设备存储。P1 不可用时只提供 Restore，不显示禁用或伪装成可用的 Permanent delete。Restore 回到 `trashed_from_location`；从 Pinned Available 移入的 Thread 按已保存位置边界恢复 Pin。成功后切到目标 mode、仍选中原 Thread并把焦点落到该 row；失败留在 Trash。
- Permanent delete：仅在 G2R、核心 A1 与旧根清理 M1 都通过后才出现在 Trash；开始后不可 Restore，失败只允许 Retry。
- 运行中直接 Archive/Trash 不静默隐藏或取消；UI 提供 Keep running 与 Stop & archive / Stop & move to Trash。对话框捕获焦点，初始焦点与默认动作都是 Keep running，Escape 等价取消；取消后焦点回到原触发器，移动成功后使用当前 mode 的确定性 row fallback。

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
- Archived/Trash mode 顶部提供可见、可键盘操作的 `Back to threads`，它不修改任何 Thread。该动作复用 navigation-save barrier；成功后恢复上次仍有效的 Available selection，否则选择第一个 Pinned/Recent row，空集合则进入 untouched placeholder，并把焦点落到选中 row 或 New thread。失败保持原 mode/detail，焦点按 3.4 进入安全确认框。
- 后台 completion 不改变 Recent 顺序，不弹打断式通知，只产生一次安静 attention。
- Sidebar 只有一个滚动区：Nyx/New thread/Search 固定在顶部，当前 Pinned/Recent、Search results、Archived 或 Trash collection 占中间 `min-height: 0; overflow-y: auto` 区域，Archived/Trash/Connections/Local user 固定在底部；Archived/Trash mode 的 Back to threads 固定在滚动 collection 上方。100+ rows 不得把 mode 入口或 Connections 埋到列表末尾。
- Available、Archived、Trash 的 collection 使用一个 semantic `listPage`，每页固定最多 50 个 summary；Available page 按 Pinned 后 Recent 的 canonical combined order。首屏显示 `Loading threads` 且 collection `aria-busy=true`。有下一页时尾部提供普通 Tab 顺序的 `Load more threads`；激活后显示 `Loading more`。没有 pending selection 时，成功将焦点移到第一条新增 row并 polite 播报 `N more threads loaded`；有 pending selection 时按下一条规则处理。最后一页移除按钮并只在显式 load 后播报一次 `End of threads`。初始页失败显示 `Couldn't load threads` + Retry并使用 mode error detail；load-more 失败保留已加载 rows、selection/detail/scroll，在尾部显示 `Couldn't load more` + Retry并聚焦 Retry。迟到页不能重设 collection。
- collection 内 Home/End 只移动到当前已加载的第一/最后 row；Load more 是独立 Tab stop，不伪装成 row。Page cursor 是 Worker 返回的 opaque keyset cursor 并带 `includedThroughCursor`；matching library event 更新/移除已加载 summary，迟到 page 按 cursor 丢弃并从当前最后 canonical row 重试。Renderer 只按 id 去重，不拥有全库顺序真相，也不引入虚拟列表。
- 所有“canonical selection 有效但其 row 尚未加载”的路径共用一个规则：启动恢复、Back to threads、Cancel Search、Search result open、Pin/Unpin/Move 后重排，以及 matching event 让 selected row 移出 loaded window。Main 先用 `get(threadId)` 验证 location；selection 与 Main detail 保持该 Thread，collection/scroll 不跳，Renderer 只暂存一个 `pendingFocusThreadId`。若动作本身要求聚焦 matched Thread heading、Composer、attachment 或 Turn anchor，则保留该 exact match focus并只公告一次“selected title；load more to show in list”；其余路径在首屏 settle 后聚焦 `Load more threads`。用户每次显式 Load more 时，目标未出现则焦点回新的 Load more，出现后聚焦该 row 并清除 pending id；没有 pending selection 时仍使用上一条的 first-new-row 规则。不得自动循环加载未知页数、伪造乱序 row 或新增 around-page API。
- Pending target 的 load-more 失败保留 selection/detail/pending id 并聚焦 Retry；Retry 继续同一 cursor。若 target 在加载期间被移出 mode/删除，matching event 清除 pending id并按确定性 fallback；若到达 end 仍未出现，Main 重新验证 target 与 event epoch：失效则 fallback，仍有效则把它当 cursor gap，清空该 mode pages 后只重试一次首屏；再次到 end 仍缺失时显示 `Couldn't load threads` + Retry，绝不丢 selection、伪造 row 或循环。切到另一个 selection/mode 会清除旧 pending id。初始 page error 暂时显示 mode error detail，但保留已验证 selection/pending id，Retry 成功后恢复其 detail/focus。

Sidebar 有明确的 `available | archived | trash | search` mode。进入 Archived/Trash 时，只能恢复该 mode 内仍有效的上次选择、选择第一项，或显示该 mode 的空状态；Main 不得继续显示集合外可编辑的 Thread。Search 只显示命中集合，允许选择 Available 或 Archived 命中。`Cancel search` 恢复进入 Search 前的 mode 与仍有效 selection；点击或 Enter 打开结果则退出 Search、进入命中 Thread 的真实 Available/Archived mode、保持该 Thread selected 与 Draft 不变，并使用命中来源的焦点规则。加载、空集合和安全错误都显示对应空详情，不复用旧 Thread。Pinned 不在 Recent 重复出现。

任何 row 离开当前 mode 后，选择/焦点按同位置下一项、上一项回退；若没有候选，Available 才进入 untouched placeholder，Archived/Trash 留在各自空状态，Search 回到 Search input 与空结果状态。Archived Thread 的 Send 一旦 Draft→Turn commit 成功，UI 原子切到 Available mode、保持该 Thread selected 与 Main/Composer focus；commit 失败则仍留在 Archived。

Archived 按 `last_user_activity_at DESC, created_at DESC, id ASC`；Trash 按进入 Trash 时写入的 `updated_at DESC, created_at DESC, id ASC`。Trash 在可逆 A1 中只读，后续 purge operation 也不改 Thread 的该排序字段，因此重启、失败和 row fallback 都有唯一顺序。

### 3.3 Search contract

- 范围：Available + Archived；排除 Trash、Purging/Purge failed。
- 语料：标题、Main 已确认的 Draft 文字、已提交 Turn 的消息，以及 Draft/Turn-owned 且已验证的附件提取文本；绝不搜索 Renderer dirty overlay 或 preparing bytes。
- 结果：Thread 标题、匹配来源、短摘要；选择 Turn 消息/附件命中后定位到对应 Turn anchor，Draft 文字命中聚焦 Composer，Draft 附件命中聚焦其附件 card，均不清空 Draft。
- Search 临时替换 Pinned/Recent 列表，不增加独立搜索页面。
- Search input 旁有可见、可 Tab、具 `Cancel search` accessible name 的取消按钮；query 非空时 Escape 先清空，空 query 时 Escape 与 Cancel search 同义。打开结果不是 Cancel，不恢复进入 Search 前的选择。
- 查询与候选文本统一做 Unicode `NFKC` + 默认、非 locale-sensitive lowercase 后按字面 substring 匹配；短中文、一至两个字符不得分词。
- Query 最多 256 Unicode code points；IME composition 期间不发请求，`compositionend`/最后输入后 120ms debounce。全应用至多一个 in-flight Search，只保留一个最新 pending query；旧请求完成前的中间 query 不入 Worker 队列，空 query 清除 pending/results，已 in-flight result 只由 epoch 丢弃。
- 最多返回 50 个 Thread result，每个 snippet 最多 160 Unicode code points；Worker 同时返回一个 bounded `truncated` boolean，扫描发现第 51 个 distinct matching Thread 时为 true，但不返回第 51 条内容。Q1 不增加 Search 分页。
- 每 Thread 只返回最佳命中：title > Draft body > user message > assistant message > document；同优先级 Draft 文档优先于最早 Turn/文档位置。Thread 间按 `last_user_activity_at DESC, created_at DESC, id ASC`；迟到 query result 由 Renderer query epoch 与 library cursor 丢弃。
- 新 debounced epoch 立即清掉旧 results，给 results collection 设置 `aria-busy=true` 并显示 `Searching`；只有该 epoch 真正 dispatch 时才在一个 polite live region 播报一次 `Searching`。完成时，未截断只显示/播报一次 `N results` 或 `No results`；`truncated=true` 时只显示/播报一次 `Showing first 50 results`，不能说成共有 50 条，并清除 busy。空 query、Cancel search 或打开结果离开 Search 必须同步清除 visible `Searching`、`aria-busy`、pending/results 并递增 epoch；被更新 query 替换的 pending epoch、迟到 query 与退出 Search 后完成的旧 query不得重设状态或播报。每个 result 的 accessible name 包含完整 Thread title、匹配来源和必要的 bounded snippet。
- 最新 Search timeout/Worker safeError 清除 visible `Searching` 与 `aria-busy`，保留 query，清除旧 results并显示 `Couldn't search` + Retry；只播报一次该 safe error，焦点留在 Search input，用户 Tab 到 Retry。激活 Retry 后焦点回 Search input并用同一 bounded query 创建新 epoch；再失败只更新关联错误并播报一次，迟到 success/failure 不得改变 UI。Cancel 在所有 Search error/loading 状态下始终可用。

### 3.4 New、Draft 与焦点

- 全应用最多一个 untouched placeholder；不落库、不进列表。
- 第一次非空文字、显式 Rename 或 Main 接受附件后 materialize；仅切换 target 不创建 Thread。Materialized Thread 的 safe target selection id 与 Draft 一起持久化，切换 Thread/重启后恢复；它不改变 Connections 全局默认。
- Main 在首次 materialize 调用内先生成并保留稳定 `threadId`；Worker 用 `threadId + expected absent` 在一个 transaction 中创建 Thread/Draft。create ack 只把 placeholder 原地 rekey，再 flush 最新 overlay；不能插入第二行。
- `title_source=auto` 且尚未首次发送时，自动标题与每次成功 Draft commit 在同一 transaction 更新：非空文字使用现有可见规则（trim、连续空白折叠；总长最多 48 个 Unicode code points，超长为前 45 个去尾空白后加 `...`）；否则使用首个 Draft document 的安全 display name；图片-only 使用 `Image · YYYY-MM-DD HH:mm:ss`，完全为空使用 `Untitled draft · YYYY-MM-DD HH:mm:ss`。Main 在 materialize 时一次生成并持久化本地 creation second；第一次需要 generic fallback 时，同一 Worker transaction 在该 second 内分配从 1 起最小的当前未使用 `fallback_ordinal`，1 不显示，2 起追加 ` · 2`、` · 3`。单 Worker + partial unique constraint 保证同时存在的同秒 generic fallback 可区分；后续在 Image/Untitled 间切换复用同一 second/ordinal，重启、时区变化或其他 Thread Rename/Delete 都不重算仍存在的标题。Thread/空壳删除后可由未来 Thread 复用空出的 ordinal，不需要永久计数表。第一次 Send transaction 冻结当时的自动标题；`title_source=manual` 永不被 Draft 或 Send 覆盖。标题只来自 Main-acked Draft 与 persisted creation fallback，不读取 Renderer overlay，不调用模型。
- 手工 Rename 复用一个 Main-authoritative pure validator，Renderer 只复用它做即时提示，Main 在发给 Worker 前仍重验：trim 后必须为 1–48 个 Unicode code points，不静默截断，允许与其他 Thread 重名。空值、纯空白或第 49 个 code point 返回安全 field error，不提交 transaction、不更新 revision/activity/title；inline input 保留用户输入与焦点，原标题和所有其他 surface 保持。Enter 只提交有效值，Escape 放弃编辑并恢复原标题。完整标题可在 row/Search/accessible name/退出结果 barrier 中使用；重名仍按 7.6 的 creation time/必要时完整 UUID 消歧。
- 正常 autosave 不显示噪音；明显延迟或失败在 Composer 附近显示 Saving / Not saved，dirty overlay 不得被迟到 snapshot 覆盖，除非用户明确选择 `Close without saving`。
- “零 Turn + auto title + 空 Draft + 无附件”的 materialized Thread 是可回收空壳：正常导航/关闭只能在当前 mutation queue drained、没有 dirty/preparing overlay 且空 Draft 已 Main ack 后，由 Main 用 exact Draft revision 和上述条件原子删除；启动恢复可直接按 canonical 状态检查。显式 Rename 过的 Thread 永不自动回收。任一条件或竞态失败就保留，不做 best-effort 猜测。
- selection 与 reading anchor 可保存在 Renderer localStorage；attention 的 seen revision 必须由 Main 持久化。

Main ack 是草稿持久化边界。选择/New/mode change/Back to threads/Search/Archive/Trash/Send/普通窗口关闭/App quit 共用当前 Thread 的同一 navigation-save barrier：先 flush/等待 Main ack，再改变选择、可编辑性、location 或执行空壳回收。失败时底层选择/mode/location/detail 保持不变，焦点进入受约束的安全确认框。站内导航与可逆 lifecycle 提供 `Stay / Retry / Discard unsaved changes and continue`，初始焦点为 Stay；文案明确列出 Thread title、未确认文字/附件，以及与最后一份 Main-acked selection 不同的安全 target display label 和将回退到的已确认 label，绝不显示 resolved target/config/credential。Escape 等价 Stay。DOM action 的 Stay 回原触发器；native 标题栏 Close/Cmd-Q 没有 DOM trigger，phase 1 必须先记录最后一个仍连接且非 inert 的内容焦点，Stay 回该元素，失效时回 selected row/Composer 的确定性 fallback。若 full-image 原生 `<dialog>` 已打开，不能再 `showModal()` 叠第二个 dialog：保存确认复用该顶层 dialog 的 confirmation panel，保留图片/src；Stay/Escape 回到该 dialog 内最后有效控件，fallback 为它的 Close。Retry 成功执行原动作；Retry 失败留在当前顶层确认框并聚焦 Retry；Discard 恢复最后一份 Main-acked Draft 后执行原动作。Close/quit 成功后窗口/应用离开，无虚假回焦目标。只有用户确认 Discard 才丢弃 Renderer overlay/preparing bytes；已确认 Draft 不删除，staged orphan 仍 reconcile。Send 失败只显示 Stay/Retry，不能拿旧 Draft 继续发送。Renderer 因此只保留当前 Thread 或 placeholder 的一份 dirty Draft overlay/preparing bytes，不积累跨 Thread dirty copies。进程崩溃或强制结束后只承诺恢复已经 Main ack 的文字、target 与附件；仍在 Renderer 的 keystroke/preparing bytes 不作虚假持久化承诺，本方案不承诺物理断电时的 fsync durability。

Thread/mode/Search 导航只有在该 barrier 成功后才关闭旧 full-image dialog、清除其 `src` 并 unmount 旧 detail；失败时旧 detail/dialog 保持，焦点按 3.4 进入并退出确认框。成功后 Renderer 只挂载新选择的 detail，恢复其已 ack Draft 与 reading anchor，不抢走 action-specific focus，也不 abort 任一后台 Run。任何时刻 DOM 只能含选中 Thread 的 preview 和至多一个 full image。

### 3.5 Keyboard / accessibility contract

- 每个 Thread collection 使用一个 roving Tab stop；New、Search input/Cancel search、Archived/Trash、Back to threads 和 Connections 保持普通 Tab 顺序。collection 内 Arrow、Home、End 移动，Enter 选择，Shift+F10 打开菜单。
- Rename 只适用于 Available/Archived：F2/菜单进入，Enter 按 3.4 的统一 validator 保存，Escape 取消，错误与输入关联并保持输入焦点。Trash 在 P1 前只有 Restore，P1 后另有 Delete permanently；F2 在 Trash 无动作且不出现在菜单/accessibility actions 中。
- Pin 排序必须有 Move up/down/top/bottom；拖拽不是唯一入口。
- Pin/Unpin/Move 成功时保持同一 Thread selected；目标已加载时把焦点移到重挂载后的同一 row，目标跨页时使用 3.2 的 Load-more pending-focus 规则。失败保持旧 row、焦点与两个 collection 的 scroll position。
- 菜单关闭后焦点回触发行；行被移除时按确定性 fallback 移焦。
- Streaming token 不逐个播报；terminal/failed 只做一次 polite announcement。
- 状态有文字 accessible name，不以颜色为唯一线索；截断标题保留完整 accessible name。
- Focus ring 与 selected background 必须可区分，selected row 使用 `aria-current`；row menu 在 `focus-within` 时可见。Search input 的 ArrowDown 进入 results；Enter/click 打开命中时按 3.2 退出 Search，Draft text 命中聚焦 Composer、Draft attachment 聚焦 card、标题聚焦 Thread heading、Turn 命中聚焦 matched anchor。
- 首次进入 Library unavailable 时以 polite live region 只公告一次 `Couldn't open Thread Library`。只有 Thread surface 当前可见时才切到其 unavailable detail 并聚焦 Retry；用户正在 Connections 等仍可用 surface 时保持 route、输入与焦点，返回任一 Thread entry 时才显示 unavailable detail并聚焦 Retry。Retry 再失败时焦点留在 Retry、每次 attempt 只公告一次更新，成功后按 3.2 选择 deterministic Available row/placeholder 并聚焦该 row/New thread。Thread-scoped unavailable 在当前选中 Thread 被检测时只公告一次并聚焦 Main 的 Retry；后台检测未选中 row 只更新 status、不抢焦点，用户选择它时才聚焦 Retry。Thread Retry 失败留在 Retry并每 attempt 公告一次，成功恢复同一 selected Thread、聚焦 Thread heading。初始 collection page error 使用同一 focus/announcement 规则；load-more error 只聚焦尾部 Retry，不改变当前 detail。

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

保留两个真实边界，不做 namespace churn，也不提前暴露空壳方法：

- C1 创建 `window.nyx.threads`，只含 `listPage/get/materialize/saveDraft/retryOpen({ scope: 'library' } | { scope: 'thread'; threadId })/markSeen/subscribe`；
- L1 在同一 namespace 增加 `rename/pin/archive/unarchive/trash/restore`；
- Q1 才增加 `search`；P1 通过独立 scope-lock 后才增加 `purge`；更早 slice 的 shared/preload type 与 runtime object 都不得出现 later method；
- `window.nyx.chat` 保留 `start/cancel/retrySettlement/subscribe` execution events，并在 C1 thread-scope；不为 Library action 再造 namespace。

Shared 与 preload 边界类型保留 `Nyx*`；Main/Renderer implementation-local 名称不加 `Nyx`。
若 G2R 选择 `webFrame.clearCache()`，它只能是 image detail teardown/Purge 流程内部的窄动作，不暴露 generic Renderer cache API。

### Electron Main

同一 `userData` 只允许一个 primary Nyx 进程。在任何 importer、DB Worker、sidecar owner、图片协议授权或旧根读取初始化前，Main 必须取得 Electron 原生 `app.requestSingleInstanceLock()`；失败的 secondary 不接触任何 Nyx data/staging，只通知 primary。Primary 的 `second-instance` handler 只恢复/聚焦现有窗口，不改变 selection、Draft 或 Run。禁止用 SQLite busy handling 代替这个 owner invariant。

拥有：

- Thread Library 的产品权限、生命周期和 IPC service；
- thread-owned sidecar 文件 IO 与自定义图片协议授权；
- `Map<threadId, ActiveRun>`；
- 每 ActiveRun 一个独立 Runtime client；
- Provider target resolution、Provider 调用、Responses state；
- 一个进程内 `eventEpoch + cursor` publisher；
- 每 Thread 的短临界区协调器。

一个应用生命周期内唯一的 `node:worker_threads` Worker 是 SQLite 的物理执行 owner：唯一 `DatabaseSync` connection、schema、prepared statements 和 transaction 都只在该 Worker 内运行。Main 只发 feature-local semantic commands；禁止 raw-SQL RPC、Worker-per-Thread、Worker pool、`utilityProcess`、ORM、Repository interface、第二数据库连接和同步 Main fallback。

Worker request/response 只有 `{ id, operation, input }` 与 `{ id, ok, value | safeError }`。`id` 只做进程内关联，不是 durable mutation identity。单一 MessagePort 是唯一数据库命令队列；Main 只保留一个 pending map，不叠加第二队列。list/import/purge 使用 bounded page/batch；Search 在一个 Worker semantic command 的一致读中内部分块扫描，只 structured-clone 有上限的结果，不把 corpus 分页搬到 Main。

Main 协调器不得跨 Provider、Runtime、文件递归删除或其他异步长操作持锁；一个 DB transaction 必须完整地在一个 Worker semantic command 内结束，不能跨 Worker round-trip 或文件 IO。

每个 mutation 的 Main 结果必须归一为 `definitely_not_committed | committed | outcome_unknown`。只有 Worker 明确在 transaction 前拒绝或明确 rollback 才是 `definitely_not_committed`；成功 ack 是 `committed`；unexpected exit、timeout、invalid/unknown response 或 reply 丢失一律是 `outcome_unknown`，绝不能当失败回滚外部文件。Worker generation failure 会使该 generation 全部 pending request 进入各自 exact-identity reconciliation并递增 `eventEpoch`。不得自动重放 mutation或回退到 Main 同步 SQLite；旧 generation 的迟到 reply 全部忽略。旧 Worker 确认退出后，当前调用只可启动一个 replacement Worker 做 canonical read reconciliation；没有安全 read 结论时 mutation 仍失败且 prepared sidecar 保留。后续只有 canonical reconciliation 或用户显式 Retry 才能按原身份继续。

### Library unavailable safe state

若 Worker 启动、SQLite open、schema/required pragma、`quick_check`、文件权限或 physical DB validation 失败，Main 进入 Library unavailable，而不是创建/覆盖一个空库：

- 原 DB、journal、thread sidecars、staging 和旧 v5 root 原样保留；禁止 rename/delete/reset/re-import；
- 所有 Thread mutation、Provider start、detail/search/image authorization 都 fail closed，Connections 等不依赖 Library 的表面可继续使用；
- Thread surface 只显示 `Couldn't open Thread Library` 与安全 Retry/reopen，不显示 New thread/Start fresh；Retry 先关闭失败 generation，再重新执行同一只读 open/validation；
- 能安全归属但无法重建 canonical Thread/Draft/Turn content 的失败，或 exact Responses controlled repair 失败，进入 3.1 的 Thread-scoped unavailable，row 仍可见；图片/文档 sidecar 和可修复 Responses ref 继续按 3.1 的资源级降级。若 identity/location/required schema 无法安全确定则保持整库 unavailable。任何状态都不得清空数据；物理 DB 修复、导出或破坏性重置都需要未来独立评审。

旧 current-thread 的 `Start fresh` 只适用于 MTL cutover 前的单记录格式，绝不能复用于 Thread Library。

### SQLite Worker 故障后的不确定提交

- Materialize：使用 Main 为该 in-flight placeholder 保留的稳定 thread id；按 7.1 重读或同 id 重试，绝不生成第二个 Thread。
- Draft/lifecycle：保留 Renderer overlay，重读 canonical revision；不盲重放。
- Draft→pending：ack 前不启动 Provider。若 commit 已落盘但 reply 丢失，重启后把“pending 且无 ActiveRun”恢复为 Interrupted。
- Terminal settlement：`outcome_unknown` 时保留 prepared Responses sidecar，以 `threadId + requestId + providerStateRef/hash` 重读；匹配 terminal 则归类 committed 并保留文件，仍 exact pending 才用保留的 terminal input/ref 重试，不匹配的 prepared file 只进入 orphan reconcile。没有 canonical 结论前禁止删除。
- App quit：严格使用 7.6 的 Draft/result prepare 与 fenced commit；只有 Draft save ack/明确 Discard，且当前 exact `settlement_failed` set 已保存/明确放弃后才设置 shutdown fence。Commit 阶段新出现的结果保存失败再次阻断 close/quit；Worker timeout 只能显示同一安全失败并等待 Retry 或明确结果放弃，不能自动吞掉后 terminate。BrowserWindow 销毁不关闭 Worker。

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
- `fallback_local_second` 与 nullable `fallback_ordinal`：只用于当前存量 collision-free generic auto title；partial unique `(fallback_local_second, fallback_ordinal)`；存量 row 不重编号，删除后可复用空号；
- `thread_revision`：只保护 Rename/location 等 Thread metadata mutation；
- `last_user_activity_at`；
- `result_revision`、`seen_result_revision`；
- `created_at`、`updated_at`。

Pinned position 只对 Available 生效。Archive 会取消 Pin；从 Archived 进入 Trash 不保存 Pin。Restore 到 Available 时，只有从 Pinned Available 进入 Trash 的 Thread 恢复 Pin。Pinned 按 `pin_position ASC, id ASC`；Recent 排除 Pinned，并按 `last_user_activity_at DESC, created_at DESC, id ASC`；Archived 使用同一 activity order；Trash 在进入时更新 `updated_at` 并按 `updated_at DESC, created_at DESC, id ASC`。重启不改变任何 tie-break。

`last_user_activity_at` 只在下列 Worker commit 更新：materialize/非空 Draft 内容或附件变化、Send、Retry、手工 Rename、Unarchive、Restore。选择、mark seen、Pin reorder、后台 delta/terminal 不更新。

### `drafts`

每 Thread 恰好一行：`thread_id`、`draft_revision`、text、safe target selection id、updated_at。Draft revision 同时保护 text、target 与 ordered attachment refs；发送消费 revision `r` 后清空 text/attachment refs、保留本次 accepted safe target id 与 row，并递增到 `r+1`；迟到 autosave 必须 CAS 失败。

### `turns`

`thread_id + ordinal` 为顺序主键；保存 attempt request id、user/assistant ids、内容、pending/terminal status、safe error、target binding/attribution、provider state ref 与时间。SQLite 约束每 Thread 最多一个 pending，且 pending 必须是最后一个 Turn。Retry 更新 exact failed Turn 的 attempt identity，不按 Thread 模糊匹配。

### `images` / `documents`

- metadata、owner (`draft | turn`) 与 Turn position 在 SQLite；文件路径只能由 Main 从已验证 UUID 和固定根派生。
- 图片 canonical bytes 保留在 thread-owned sidecar。
- 文档 raw source 保留在 thread-owned sidecar；已验证且有现有容量上限的 extracted text 存入 SQLite `documents`，成为 Provider materialization 与 substring Search 的 canonical text。新库不再复制 `.text` sidecar。
- v5 importer 必须验证旧 source/text hashes：有效资源照常复制；缺失/损坏图片或文档只导入现有安全 metadata/unavailable projection，不伪造 source，也不阻断其余 Thread 内容；只有已验证 extracted text 才写 SQLite。
- Draft attachment rows 保存 owner、稳定 id 与 position；一个 Draft CAS 可提交完整 ordered existing refs 与本次新增的受现有容量/类型约束 payload。Main 先 stage/verify 新文件，再在 DB transaction 提交 text/target/refs/order 并递增同一 Draft revision；CAS 失败保留 Renderer overlay，staged 文件进入 orphan reconcile，Renderer 只在 ack 后释放 bytes。

### `provider_state_refs`

完成 Turn 只保存 integrity metadata；Responses payload 保留在线程 sidecar。只能回放到 exact target + execution identity。
损坏 ref 的 controlled repair 必须用 exact Thread/request/ref hash CAS 清除引用，再以 durable visible text 重建；repair commit 后旧文件只作为 orphan reconcile，绝不回放到其他 attempt。

### `purge_jobs`

P1 才新增的 operation 表；D1 至 M1 不创建：thread id、phase、safe error、attempt count、started/updated time。它不把 Purging 变成 Thread location。只要 job 存在，所有 detail/search/image/provider 读取都拒绝；只允许安全的 deletion-status projection 和 Retry。

不建 `runs`、全局 catalog 或基础 `search_documents` 表。Thread summary 和初始 substring search 直接查询 canonical SQLite 数据；只有 Q1 性能门禁失败才规划派生 FTS index。

## 6. Contract identity matrix

| 操作                                   | 必需身份 / CAS                                                                                                                                             | 不应携带                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| materialize                            | Main-generated `threadId + expected absent`；同一 in-flight placeholder 重试必须复用该 id                                                                  | generic durable mutation id               |
| save Draft                             | `threadId + expectedDraftRevision`；payload 同时含 text、safe target id、ordered attachment refs/new payload；Renderer 每 Thread 只允许一个 in-flight save | run identity / redundant mutation id      |
| Rename/Archive/Unarchive/Trash/Restore | `threadId + expectedThreadRevision`                                                                                                                        | requestId/runRevision                     |
| Pin move                               | `threadId + canonical destination`，Main 在当前集合事务内验证                                                                                              | full Renderer-owned order source of truth |
| start/retry Run                        | `threadId + requestId + expectedDraftRevision`                                                                                                             | Renderer messages                         |
| cancel/retry settlement                | `threadId + requestId`                                                                                                                                     | generic Thread revision                   |
| run event                              | `threadId + requestId + eventEpoch + cursor`                                                                                                               | duplicated runRevision                    |
| mark seen                              | `threadId + observedResultRevision`                                                                                                                        | requestId                                 |
| list page                              | `mode + limit=50 + optional opaque keyset cursor`；结果带 `includedThroughCursor + nextCursor?`                                                            | Renderer-owned full order                 |
| retry open                             | `scope=library` 或 `scope=thread + threadId`；只执行 exact read/validation/repair                                                                          | reset/delete flag                         |
| search                                 | IPC 只带 bounded literal query；结果带 `queryEpoch + eventEpoch + includedThroughCursor + truncated`，后续 matching library event 使其失效                 | run identity / Main-owned search session  |

Main 为 accepted Turn 生成/确认 canonical message identity，并从 exact Thread 构建 Provider history。旧 Renderer `messages` request source of truth 在 C1 切换时删除。

## 7. 关键事务与线性化规则

### 7.1 Materialize / autosave

- 当前 placeholder/thread 使用一个 Renderer mutation queue；Main 仍以一个覆盖 text/target/attachments 的 Draft CAS 为准。
- Main 为首次 create 预生成稳定 thread id；Worker 只接受 `expected absent`。首次 create 返回 thread id/revision 后只做 rekey；队列随后发送最新 overlay。
- Worker 在 create commit 后、reply 前退出时，Main 必须先用同一 id 重读：内容/初始 revision 完全匹配则视为已提交并返回 ack；不存在则保留 overlay、显示 Not saved，并让用户 Retry 复用 Main 保留的同一 id；存在但不匹配则 fail closed。Main 不得让 Renderer Retry 时生成新 id，也不得自动重放 create。
- CAS conflict 返回 canonical revision，但不得用 snapshot 覆盖 dirty overlay；Renderer 重新基于最新 revision 提交或显示 Not saved。
- 附件只有在 Main 完成 staging、完整性校验和 durable write 后才能释放 Renderer bytes。
- 所有 navigation/lifecycle/close/quit 复用同一 queue barrier，不另建第二保存路径；失败后的 Stay/Retry/Discard 与焦点规则统一使用 3.4，Send 仍只有 Stay/Retry。

### 7.2 Draft → pending Turn

一个 Worker semantic command 在一个短 SQLite transaction 中完成：

1. 校验 Thread location、没有 pending、Draft expected revision；P1 存在后同一命令额外拒绝 purge job；
2. Archived 自动恢复 Available；
3. 插入 user/assistant pending Turn；
4. 将 ready attachment owner 从 Draft 迁移到 Turn；
5. 清空 Draft、递增 tombstone revision；
6. 首次发送冻结 Main-derived auto title；
7. 更新 `last_user_activity_at`；
8. commit。

Worker commit ack 后才创建 Runtime client 和发起 Provider side effect。若起点是 Archived，commit 同时恢复 Available；UI 收到 ack 后必须按 3.2 切 mode 并保持选择/焦点。

### 7.3 Terminal settlement

所有 terminal 使用 exact conditional update：

```sql
... WHERE thread_id = ? AND attempt_request_id = ? AND status = 'pending'
```

影响行必须恰好为 1。Stop/Complete/Fail 只有一个赢家；输家不发 terminal event并重读 canonical terminal。

Responses sidecar 先 prepare/verify/atomic rename，再做 DB transaction，并遵循 4 节的三态提交结果：`definitely_not_committed` 才能 best-effort rollback，rollback 失败成为 reconcile orphan；`committed` 保留 exact referenced file；`outcome_unknown` 必须保留文件并由 replacement Worker 按 `threadId + requestId + providerStateRef/hash` 重读，匹配 terminal 即接受 canonical，仍 exact pending 才重试同一 settlement，不匹配才转 orphan reconcile。不得用 generic catch 删除 outcome-unknown sidecar。此时不产生 durable `storage-blocked`：

- `ActiveRun` 转为进程内 `settlement_failed`，保留可显示/复制的 final overlay、exact terminal input 与已经登记的 exact `postStopAction`；
- Thread 内禁止新 Run，但其他 Thread 不受影响；
- `retrySettlement(threadId, requestId)` 重试同一 terminal commit；
- App exit 不把它写成 Cancelled；7.6 必须先让用户 exact Retry saving 或明确确认丢弃这些内存结果，只有后者才允许 pending 在下次恢复为 Interrupted。

`settlement_failed` 不是 Running 或 durable terminal。没有既存 `postStopAction` 时，Archive/Trash 命令不得弹 Stop dialog、不得移动或隐藏 row，只把焦点带到 `Retry saving`；用户先完成 exact settlement 后才可重新发起 lifecycle action。若 Stop-and-move 已在 ActiveRun 中登记，`Retry saving` 只重试同一 terminal transaction并原子消费该 exact move；它不是新的队列，也不重复 Provider。失败仍留在原 row/location，重启后不恢复内存 move intent，pending 按 Interrupted 恢复。

### 7.4 Stop & Archive / Trash

Running Thread 的用户确认永远先于 Draft barrier：先显示 Keep running / Stop-and-move。Keep running/Escape 直接取消整个 lifecycle intent，回原触发器且不保存/Discard Draft。只有选择 Stop-and-move 后才运行 3.4 的 Draft barrier；Stay 取消整个 intent且 Run 继续，Retry 只重试 Draft，明确 Discard 只回退 Draft。Draft ack/Discard 后 Main 才在一个短临界区重读 exact Run：仍 Active 时登记一次 `postStopAction` 并 abort；已经 terminal 时直接执行普通 lifecycle transaction；已经 `settlement_failed` 时登记该 exact action并聚焦 `Retry saving`，由 7.3 的 retry 原子 settle+move。不得在 Draft barrier 前登记/abort，也不得重复显示 running dialog。

之后不等待持锁：

1. 在 per-thread 短临界区定位 exact ActiveRun，写入一次性 `postStopAction`，设置明确 abort reason，然后释放；
2. 该 Run 的 terminal settlement 在同一个 DB transaction 中 settle Turn 并消费 `postStopAction` 改 location；
3. 如果 terminal 已先完成，生命周期命令在下一短事务按 canonical terminal 改 location；
4. Send/Retry 不得插入已登记 postStopAction 的 Thread。

`Keep running` 只取消本次 Archive/Trash 意图，不登记延后移动。对话框保持 focus trap；Keep running 是初始焦点，Escape 等价 Keep running，取消后回到原 row/menu 触发器。`Stop and archive/trash` 的 row 在 terminal + location canonical commit 前留在当前集合并显示 Stopping；成功后按 3.2 的确定性 fallback 移焦。settlement 失败时显示独立的 `Couldn't save result` / `Retry saving`，普通 Provider Retry 不可用。C1 暴露该安全状态，E1 保留 exact terminal input，U1/L1 提供恢复动作；`Retry saving` 不得再次调用 Provider。

测试必须覆盖 Complete 与 Stop-action 同时到达，证明无死锁、恰好一个 terminal、最终 location 一致。

非运行中的可逆 location action 都使用 exact `thread_revision`：Archive 清除 Pin 后进入 Archived；Unarchive 进入 Available/Recent 且不恢复 Pin；Trash 保存原 location 与必要的 Pin 位置；Restore 回到保存的 location。只有 Worker ack 后 row 才离开当前 mode，随后按 3.1/3.2 的 selection/focus 规则切换；失败保持原 mode、row、detail 与触发器。Archived Send 仍按 7.2 在同一 transaction 自动 Unarchive 并保持 Composer focus。

### 7.5 Snapshot / event ordering

- Renderer 先 subscribe 并 buffer，再调用 snapshot。
- Main 在唯一 Worker port 上提交 snapshot command；Worker FIFO 使 snapshot 成为 DB barrier。
- 每个更早 mutation 的 Main continuation 收到 DB ack 后不再 `await`，同步发布对应 event；snapshot response 到达后，Main 在同一个无 `await` continuation 中合并 exact ActiveRun overlay、读取 `eventEpoch + includedThroughCursor` 并返回 snapshot。更晚 mutation 只能得到更大 cursor，留给 Renderer buffer 应用。
- Snapshot 只有在 DB 最新 Turn 仍 pending 且 thread/request 完全匹配时才合并 live overlay；DB terminal 优先。
- Renderer 只应用同 epoch、cursor 更大且身份匹配的 event；cursor gap 或 epoch 变化时重新 hydrate。
- Cursor 不持久化，Thread/Draft/result revisions 才是跨重启 CAS/attention 数据。
- G1W 必须用重复的未 await `mutation A → snapshot S → mutation B` 证明 S 包含 A、B 作为更大 cursor event 到达；无法证明就停止，不把 FIFO 当作假原子性。

### 7.6 App/window lifecycle

- Renderer 或窗口销毁不自动 abort；只撤销 event sink。Mac 上应用仍运行时后台 Run 继续。
- App quit phase 1a `preparing_draft`：`before-quit` 暂停真实退出，当前 Renderer 先执行 3.4 navigation-save/确认；此时不设置 shutdown fence、不拒绝 DB command、不停止 Run。Stay 或未解决的 save failure 把 quit state 恢复 idle，Run 保持；Retry 仍可保存。
- Draft 已 ack/明确 Discard 后进入 phase 1b `preparing_results`：Main 从 `ActiveRuns` 派生全进程 exact `settlement_failed` set，不新增 durable journal。非空时使用同一顶层 confirmation（full-image `<dialog>` 打开时继续复用）；默认/初始焦点是 `Stay`，另有 `Retry saving N results` 与明确危险动作 `Quit without saving N results`。Dialog 在容量上限内逐项列出每个 exact identity 的完整 Thread title 与持久化 `created_at` 本地毫秒时间；只有 title+time 仍重复时才追加完整 Thread UUID，因此手工同名也可安全区分。DOM 与无窗口 Electron 原生 message box 使用相同顺序、文本和 accessible name；partial Retry 或新增 failure 后从当前 exact set 重建列表。Retry 只按每个 `threadId + requestId` 依次重试已保留 terminal input，绝不调用 Provider；部分成功后更新列表/剩余数，失败留在 dialog 并聚焦 Retry。危险文案说明列出的完整回答会丢失、对应 pending 下次成为 Interrupted。Stay/Escape 取消整次 quit并按 3.4 回焦；没有 dirty overlay 也不能跳过本 barrier。
- Main 在同一无 `await` turn 中重读当前 settlement-failure identities/revision并设置 shutdown fence；集合改变就回到 phase 1b，不能拿旧确认放行。只有 set 为空或用户对当前 exact set 明确 `Quit without saving` 后才进入 phase 2 `committing`：拒绝新调用、从可接受集合撤销 ActiveRuns，以 `app_exit` abort reason 中止 Runtime/Provider并 drain 已接受 settlement。
- Phase 2 drain 若新产生 `settlement_failed`，不得 close Worker 或真实退出；保持 fence并再次显示同一结果 barrier（有窗口复用顶层 dialog，无窗口用原生 message box），初始焦点为 Retry saving，用户必须保存成功或对新的 exact set 明确 `Quit without saving`。此时不再提供虚假的 Stay/resume，因为 Runtime/Provider 已被中止。完成后关闭 Worker，再允许一次真实 `app.quit()`；catch 禁止写 Cancelled。
- 重复 quit event 在任一 preparing phase 只聚焦现有确认，在 committing 不重复 fence/abort/close。普通 BrowserWindow close 只走 Draft save barrier，关闭窗口后后台 Run 继续，不复用 process-wide result barrier；之后真正 App quit 仍必须执行它。
- 已提交 terminal 可以胜出；只有经 exact result barrier 明确放弃的或没有生成完整 terminal 的 pending 才在重启恢复 Interrupted。

### 7.7 Permanent delete

产品前置条件：G2R、可逆 Thread Library A1 和旧根清理 M1 都通过。G2R 必须证明同进程 warmed preview/full URL 在 purge 后不可再次显示，同时保持现有 Renderer byte/path 隔离、现有图片支持与内存线；否则本节 UI/IPC 全部不存在。

G2R 只按顺序允许两个 native 候选：

1. `no-store` + image-bearing detail scope 完整 unmount 后调用 `webFrame.clearCache()`，同时覆盖 full dialog close 和 Thread/mode switch；
2. 只有候选 1 仍失败时，测试现有 immutable cache + Renderer `webFrame.clearCache()` + Main `session.clearCache()` 双层 barrier。

两个候选都失败就停止；不得加 token/version URL、额外 image service/renderer、隐藏 reload、text-only 特例或提高内存线。候选 1 若通过，P1 使用 no-store 和 detail-scope teardown，授权撤销仍是访问拒绝边界。候选 2 若通过，P1 使用它新增的单一 `purge_jobs.phase` 表达 cache barrier，不为缓存再加表。

单窗口 UI 在调用 purge 前清除当前 Thread 的 DOM/preview。确认后用户意图不可撤回；Main 的流程是：

1. 短 Worker transaction 校验 Trash/no ActiveRun，建立 `purge_job`；候选 2 使用 `preparing_cache` phase；
2. 从此所有内容读取与 Restore 拒绝，Sidebar 只可投影 generic deleting/failed status + Retry；
3. Renderer teardown 和选中候选的 cache barrier 完成；候选 2 再用短 Worker transaction 推进到 `purging_files`，该点才代表当前进程所有 Nyx access path 已撤销；候选 1 的授权撤销由 G2R 证明为相同访问边界；
4. thread-owned sidecar 根同卷 rename 到 `purging/<threadId>`；
5. 幂等递归删除目录；
6. final Worker transaction 删除 Thread/Draft/Turn/resources 和 purge job；
7. 任一步失败写 safe `purge_failed`，只允许 Retry；启动时新进程无旧 native cache，仍先重做所选 barrier，再恢复一次，失败则显式留待用户 Retry。

数据库和文件系统不存在伪原子事务；failure-injection 覆盖每个 commit/rename/remove/restart 边界。Permanent delete 的 UI/IPC 在旧 v5 root 清理并证明不可读取前保持不存在。

确认框在建立 purge job 前显示 exact Thread title、`No undo`、只承诺删除本设备 Nyx managed data 且外部/系统备份可能仍存在；默认焦点为 Cancel，Escape 取消。确认后 Main 立即撤销 detail/search/image/provider 授权，Main 显示 generic `Deleting thread`，不再投影 title 或内容；失败显示 generic `Couldn't delete thread` + `Retry deletion`，成功/失败各只 announcement 一次，并按 3.2/3.5 的确定性 row fallback 与焦点规则处理。

## 8. Search implementation rule

Q1 首版只发一个 Worker semantic `search` command。该命令在一个 SQLite 一致读中内部分块扫描符合 lifecycle 的 canonical title、Main-acked Draft text、committed messages 和 Draft/Turn-owned document text，用 3.3 的 NFKC + lowercase 做 bounded literal match，不写第二份 normalized corpus，也不把 corpus 传给 Main：

- query 先做长度上限与已冻结的 normalization，SQL 只用 bound parameters；
- Renderer 执行 120ms/IME debounce；Main 的 Search owner 强制至多一个 in-flight command并只保存最新 pending query，不把每个 keystroke 排进唯一 Worker port；这不是通用队列；
- canonical `location` 在同一读中强制过滤并排除 Thread-scoped unavailable；P1 新增 purge job 后同一读额外排除；
- 只返回 3.3 上限内的 Thread/Composer/attachment/Turn anchors；完整一致读仍完成 ranking，并在 distinct match 超过 50 时只额外返回 `truncated=true`，不 structured-clone 第 51 条内容或总数；
- Main 在 search reply 的无 `await` continuation 中附上 `eventEpoch + includedThroughCursor`；Worker FIFO 保证更早 lifecycle 已包含，更晚 lifecycle/purge event 使用更大 cursor；Renderer 收到 matching Thread revision/location/purge event 时立即清除并重查相关 result，不让旧 snippet/detail 重新出现；
- Search mode entry 先过 navigation-save barrier，因此当前 Thread 的可搜索 Draft 必须已 Main ack；Renderer overlay 永不进入 corpus。

Q1 packaged performance fixture 固定为 128 Threads、2,048 个各 2 KiB Turn、128 个各 4 KiB Main-acked Draft，以及 128 份各达到现有单文档 128 KiB extracted-text 上限的 document，并按每 Thread 最多两份/合计 256 KiB 的现有上限分布。20 次有效快速输入/IME repetition 中：单次 Worker search 最大 `<=50 ms`；从最后输入到结果显示 p95（含 120ms debounce）`<=250 ms`；并发 Draft save、terminal settlement、Stop 或 lifecycle mutation 因 Search 增加的最大等待 `<=50 ms`；队列中任何时刻至多一个 in-flight + 一个 pending Search。结果仍受 50/160 上限。

任一固定线失败就停止 Q1 并另写 FTS5 派生索引 amendment；不得改回 Main 分页聚合、提高线或在实现中顺手加 FTS。

## 9. Migration、Rollout 与 rollback

### 迁移对象

当前选择：个人开发环境的一次性显式 v5 importer；产品 runtime 不带长期 v5 reader、dual-read、dual-write 或 silent fallback。

### Import

D1/D2 只构建并用 fixtures 验证 importer/domain，不激活新库。C1 是唯一 import + activation cutover：首次启用 Thread IPC/chat 前，在 `thread-library.importing/`：

1. strict parse v5 current thread；
2. 把 abandoned pending 转为现有 Interrupted 语义；
3. 按 3.1/5 节分类验证资源：复制有效图片/文档 source 与 extracted text；坏资源保留 unavailable projection；Responses ref 有效才复制，损坏 ref 在新库中按 exact identity 清除并保留 visible text；
4. 写 SQLite 与新 thread-owned root；
5. 关闭 DB、处理 journal，完整复核引用/hash；
6. 原子 rename staging root 为 `thread-library/`；只有成功后才启用 Thread IPC/chat 并允许新库写入。

旧 `userData/threads` 从 import 开始只读且字节不变，新程序在 activation 后永不再读它。Canonical Thread/Draft/Turn identity/content 无法安全解析时 import 停止且旧 root 原样保留；单个资源错误按上述降级，不得把整个 Thread 当坏数据。Importer 幂等：未激活的 interrupted staging 可安全重建；目标已激活时不得重放、合并或覆盖。

### Rollback ratchet

- C1 activation 前：可回退旧 binary + 未修改旧 root；新库不向 v5 回写。
- C1 activation 是无损 old-binary rollback 的关闭点：之后产生的新 Thread/Draft 不存在于旧 v5 root。旧 root 继续只读保留以验证 import 和人工恢复原始数据，但不得被描述成包含 cutover 后数据的完整 rollback，也不得 silent fallback；运行中恢复只允许修复/恢复完整新库。
- A1 完整 reversible-library acceptance 失败时，旧 root 必须仍字节不变，并能由旧 binary 读取其原始内容；验收失败不能删除它。该检查不虚假承诺恢复 C1 后的新数据。
- A1 PASS 后，M1 才可在单独用户确认后删除旧 root、验证 Nyx 不再授权或读取任何副本并记录 cleanup ratchet；失败则保留旧 root 且 Permanent delete 不存在。
- M1 cleanup 后：只能备份/恢复完整新 Thread Library；不支持 v6→v5。用户自行保留的系统/外部备份不属于 Nyx managed data，产品文案必须说明。

如果 D1 发现真实已发布升级对象，整条 migration 方案停止，改为自动幂等 migration + release rollback，不复用上述开发 importer 假设。

## 10. 实施切片

### S0 — Canonical scope lock（docs only）

- Allowed：更新 canonical task slices、root/desktop scope、reviewed plan、DESIGN IA。
- Forbidden：任何产品代码、数据库、IPC 或行为变化。
- Invariant：精确继承现有 Provider/Responses/附件/Runtime 安全边界。
- Validation：relative links、scope priority、allowed/forbidden file inventory、format-check、独立 scope review。
- Stop if：删除语义、迁移对象、继承不变量或 supersede 范围仍需实现者猜测。

### G1 — Packaged SQLite + Main-stall gate（OS temp）

- Status：`VALID_STOP`，evidence SHA-256 `08344163b01574bf1327e33151d982d55871151dd382dca15a82868996d62f0a`，独立复核 `NYX-MTL-GATES-EVIDENCE-20260812-01` 接受。
- Allowed：production-shape probe；验证 Electron dev/build/asar/package 的 `node:sqlite`、strict/FK/transaction/reopen、DELETE journal、权限与 crash fixture。
- Forbidden：业务 schema、DB Worker、ORM、产品 wiring。
- Invariant：stream/Stop/Renderer heartbeat 可观测。
- Validation：100+ Thread、大 Thread、Draft burst、substring search、import/purge-maintenance candidate 并行测量；routine Main task 不跨一帧，Stop 调度附加延迟不超过 50ms。
- Result：dev 最终候选通过；production build 一次同步 Draft commit `19.623 ms` 超过 `16.667 ms`，因此停止。结果否定 Main-event-loop `DatabaseSync`，不否定 SQLite；未运行的 `app.asar`/packaged 仍不声称通过。

### G2 — Same-process image revocation gate（OS temp）

- Status：`VALID_STOP`，evidence SHA-256 `86143ad9ebf80ffb6957b354e509633432c5b7c8b71df87b27bb5f44dd5ec8ae`，独立复核 `NYX-MTL-GATES-EVIDENCE-20260812-01` 接受。
- Allowed：依次测试最小 cache revalidation/no-store 候选和必要的 session cache eviction；沿用当前 main-streaming custom protocol 与权限边界。
- Forbidden：产品 purge、JS-owned bytes/path、Blob URL、弱化现有图片支持/内存/security 线。
- Invariant：warm old URL、旧 `<img>` identity、新建 `<img>`、preview/full 在 purge authorization revoke 后均不可达；fetch/XHR/canvas 仍失败。
- Validation：dev/build/asar/package、同进程 warm/reload、当前 DOM teardown、same-profile restart、支持上限内的重复 preview/full memory matrix。
- Result：`no-cache` 与 immutable + `session.clearCache()` 撤权失败；`no-store` 撤权/security 通过但重复 4K post-close plateau 超线。Permanent delete 保持不存在，可逆 Thread Library 不受阻。

### V5.3 — Stop-driven docs amendment

- Dependencies：G1/G2 `VALID_STOP` evidence + independent evidence review。
- Allowed：root/desktop instructions、DESIGN 的 Trash capability copy、canonical task slices、本文和 runthrough。
- Forbidden：任何产品代码、test、dependency、schema、IPC、persisted data 或 runtime behavior。
- Invariant：不降低两个 Stop line；SQLite 仍是唯一 durable truth；Permanent delete 不阻断可逆 Library acceptance。
- Validation：exact allowed-file inventory、relative links、format-check、`git diff --check`、plan hash、独立 product/design/strict technical review。
- Stop if：single-instance owner、Draft + process-wide unsaved-result quit barriers/native focus、Library/Thread unavailable、Worker owner/materialize/terminal-sidecar unknown-commit、snapshot/Search barrier/backpressure/truncation/announcement、navigation discard、Search return、Sidebar paging/selection、collision-free pre-send title、Pin/Trash/settlement-failed actions、mode return/sort、import activation/cleanup ratchet、Unarchive/Restore、image-bearing navigation gate、G2R 候选顺序或 A1/M1/P1 依赖仍需实现者猜测。

### G1W — Whole-DB Node Worker gate（OS temp）

- Dependencies：G1 `VALID_STOP` evidence + reviewed v5.3 amendment present in HEAD。
- Allowed：一个 `node:worker_threads` Worker、一个 `DatabaseSync` connection、repo-shaped electron-vite static Main entry、dev/build/`app.asar`/electron-builder dev package harness；只在 `mktemp -d`。
- Forbidden：tracked product change、业务 schema/IPC、Main `DatabaseSync` fallback、raw SQL RPC、Worker pool、`utilityProcess`、ORM/Repository、新依赖。
- Invariant：全部 SQL 只在 Worker；Main 仍是产品权限和 sidecar owner；一个 DB transaction 不跨 message round-trip；pending mutation 不自动重放。
- Validation：
  1. 同一静态 Worker 在 dev、production build、真实 `app.asar`、packaged `.app` 加载 `node:sqlite`，数据库只在 userData；
  2. 同一 profile 同时启动两个 packaged 进程：primary 只有一个 Worker/connection/event domain，secondary 在 single-instance lock 失败后不创建 Worker、不打开 DB、不碰 staging/sidecar/旧 root，只让 primary 恢复并聚焦原窗口；
  3. 复用 G1 correctness、0700/0600、DELETE journal、SIGKILL、128 Thread/2,048 chunks/4,096 大对象/400 Draft/search/import/purge workload，并保留每次 raw structured result；
  4. 测 Main `postMessage`、reply validation/clone、50-row listPage/event update、event publication、代表性 snapshot merge；每个 routine Main task `<16.667 ms`、Stop additional `<=50 ms`，stream 和 Renderer heartbeat 持续可见，首个有效超线即 Stop；
  5. 重复未 await `mutation A → snapshot S → mutation B`、相同 Draft revision 并发 CAS、maintenance page 间插入 Draft，证明 FIFO/cursor/响应身份；
  6. materialize commit 后、reply 前退出必须按 Main 预生成的稳定 thread id 恢复同一个 Thread；未 commit 时显示 Not saved，用户 Retry 仍用同一 id且不自动重放；一般 mutation commit 前明确 rollback 归类 definitely-not-committed，commit 后 reply 前 terminate/timeout 归类 outcome-unknown并可重读、CAS conflict 且不重复；用 canary providerStateRef 模拟 terminal commit 后 reply 丢失，证明 replacement Worker 接受 canonical ref且 Main 不删除 prepared file；Worker crash 时 Main/Renderer 存活、每个 pending operation fail/reconcile、旧 generation reply 无效、replacement Worker 保持单实例；malformed/unknown id/timeout fail closed；
  7. BrowserWindow 销毁不终止 Worker；clean app quit 关闭连接，forced termination 后数据库可恢复。
- Stop if：任一 build/package 路径不能加载；Main reply/clone/publication 仍跨帧；snapshot barrier 无法证明；crash 后必须猜测重放；或必须增加 pool/raw SQL/Main fallback/第二 durable truth。

### G2R — Renderer resource-cache repair gate（OS temp）

- Dependencies：G2 `VALID_STOP` evidence + reviewed v5.3 amendment present in HEAD。
- Allowed：候选 A `no-store + webFrame.clearCache()`；只有 A 失败才运行候选 B `immutable + webFrame.clearCache() + session.clearCache()`；production-shape harness 只在 `mktemp -d`。
- Forbidden：tracked product change、token/version URL、额外 image service/renderer、JS-owned bytes/path、Blob URL、text-only purge、隐藏 reload/restart、缩小图片支持或放宽 memory/security line。
- Invariant：Main opaque authorization 与路径/bytes 隔离不变；cache clear 只绑定 image-bearing detail scope teardown 或 purge barrier，不暴露 generic Renderer API；其他 Available Thread 的图片可重新授权加载。
- Validation：保留每次 raw structured result；retained/new preview/full、DOM teardown、reload、same-profile restart、fetch/XHR/canvas/path isolation、dev/build/`app.asar`/package、历史 4K + 9 preview 三次 full close、三轮 Thread-like detail mount/unmount、live preview 不消失/闪烁、无 Draft/focus 丢失或 Run cancel；沿用 G2 的峰值与 plateau lines。
- Stop if：两个候选都失败，或只有扩大内存线、弱化安全/支持、隐藏 reload 才能通过；此时 P1 长期保持 capability absent，不继续造缓存系统。

### D1 — SQLite domain + explicit importer foundation

- Dependencies：G1W PASS + `multi-thread-library/D1-scope-lock` reviewed and present in HEAD。
- Allowed：Main startup 的原生 single-instance lock、一个 Worker client、一个静态 Worker entry、feature-local semantic DB commands、strict schema/constraints、Thread/Draft/Turn/resource tables、transaction helpers、显式 v5 importer tests，以及 Main-only Library/Thread unavailable 派生状态；暂不接 Renderer。
- Forbidden：Main 中任何 `DatabaseSync`、raw SQL message、Worker pool、`utilityProcess`、generic repository interface、FTS、UI、ActiveRuns、Runtime/Provider changes。
- Invariant：每 Thread pending 唯一；Draft tombstone；trash origin；old root read-only；provider target/state identity preserved。
- Validation：single-instance lock 先于任何 data owner 初始化；product source `node:sqlite` import 只存在于 Worker entry；schema/rollback、50-row keyset listPage/end/stale cursor、materialize stable-id unknown commit、三态 mutation outcome、其他 Worker crash/unknown commit/CAS、strict corrupt canonical content 的 Thread identity/location isolation、dev/build/package、migration text/image/document/Responses/pending/disk-full/repeat cases；分别注入 Worker startup、DB header/open/schema/required pragma/`quick_check`/permission/physical validation failure，证明原 DB/journal/sidecar/staging/旧 root 字节不变，不创建替代空库、不 re-import、不授权 mutation/provider/detail/search/image，也不存在 Thread Library 的 Start fresh/reset 路径；无法安全确定 Thread identity/location 的 semantic corruption 必须升级整库 unavailable；missing/corrupt image/document 与 repairable Responses ref 必须按 resource/controlled-repair 降级而不进入 Thread unavailable。
- Stop if：需要 dual-read/write、无法无损导入已验证 v5，或单 DB 物理隔离成为硬产品要求。

### D2 — Thread-owned resources + Draft/settlement domain

- Allowed：新 sidecar root/staging/reconcile、文档 extracted text 入 DB、Draft CAS、Draft→Turn transaction、terminal CAS 与 in-memory settlement_failed retry。
- Forbidden：Library UI、Purge UI、durable settlement journal、改变附件容量与 Provider wire behavior。
- Invariant：DB transaction 内无文件/Provider IO；orphan 可 reconcile；terminal 失败不假装成功；其他 Thread 不受阻。
- Validation：autosave/send race、sidecar/DB failure injection、terminal transaction 明确 rollback/commit ack/commit-after-reply-loss 三态、outcome-unknown providerStateRef/hash 重读、canonical terminal 保留 sidecar、exact pending retry、不匹配 orphan reconcile、corrupt Responses exact-ref repair→visible-text fallback 与 repair-failure→Thread unavailable、图片/文档 per-resource unavailable parity、retry settlement、app exit→Interrupted、现有附件/Responses fixture parity。
- Stop if：需要第二 durable truth 才能恢复 terminal，或 sidecar rollback/reconcile 不可界定。

### C1 — Import activation + Thread API/chat cutover

- Allowed：用已验证 importer 完成首次 staging import + atomic activation；随后新增仅含 4 节 C1 方法集的 `window.nyx.threads`、保留并 thread-scope `window.nyx.chat`、移除 request.messages、subscribe-buffer-snapshot/cursor，并暴露 redacted Library/Thread available/unavailable projection 与 Retry；Renderer adapter 仍可只显示一条 imported Thread。
- Forbidden：删除整个 chat namespace、提前暴露 L1/Q1/P1 方法或 no-op stub、全库 Renderer message cache、多窗口同步、OCaml changes。
- Invariant：activation 前不写新库，activation 后不读/写旧 root；Main-derived exact history；Provider/credentials 不跨 preload；A/B late event 不污染选择。
- Validation：fresh/repeat/interrupted import、canonical content failure stop、resource-level degradation/Responses ref clear、disk-full、atomic root activation、旧 root 字节不变、activated target 不重放/覆盖、shared parser、preload compat与 runtime object 精确只有 C1 methods、A/B hydration race、epoch restart、invalid/stale identities、Library unavailable fail-closed projection/Retry、Thread-scoped unavailable safe summary/Retry 与其他 Thread parity、current behavior parity。
- Stop if：需要双 IPC source of truth，或 Worker FIFO snapshot barrier 无法建立 `includedThroughCursor` 边界。

### E1 — Per-Thread execution and shutdown

- Allowed：`Map<threadId, ActiveRun>`、每 Run Runtime client、exact cancel、postStopAction、global safety-cap evidence gate。若 gate 需要容量上限，达到上限时在 Draft→Turn commit 前明确拒绝 Start，保留 Draft 并提示用户停止其他 Run 后重试；不隐式排队。
- Forbidden：queue、daemon、durable Runs、sender-owned run、Runtime protocol changes。
- Invariant：一 Thread 一 Run、跨 Thread 可并行、Renderer 销毁不取消、App quit 留 Interrupted、terminal CAS 唯一。
- Validation：2/4/8 并发，A/B streaming/switch/Stop/Retry，Complete-vs-Stop action，Runtime/provider/storage failures，容量拒绝不消费 Draft；最后一次输入后立即 Cmd-Q、首轮 Draft save 失败后 Retry、Stay 取消 quit 且 Run 继续、明确 Discard 后进入 process-wide result barrier；1/3 个后台 `settlement_failed`、与 dirty Draft 并存、partial Retry 成败、Retry 不重调 Provider、exact count/copy，以及完整标题 + creation time、同名同时间时完整 Thread id 的稳定 identity 列表；partial Retry/新增 failure 后 DOM/VoiceOver/无窗口原生 dialog 同序更新；full-image 单顶层 dialog、键盘/回焦、pre-fence identity recheck，以及 phase 2 drain 新增 settlement failure 时不 close Worker/quit、只能 Retry 或 exact Quit-without-saving；随后 exact `app_exit`/Worker close、重复 quit event 幂等；普通 window close 后后台 Run 继续，真正 app quit 仍执行结果 barrier。
- Stop if：运行相互污染、死锁、终态双写，或资源证据要求 queue/daemon 才能成立。

### U1 — Core Thread Library UI

- Allowed：New/placeholder、list/select、per-thread Draft、确定性 pre-send auto title、Pinned/Recent row/status、selection/scroll restore、仅对本 slice 已存在控件的固定 top/middle-scroll/bottom Sidebar、Library/Thread unavailable surfaces、collapsed attention、`settlement_failed` 的 `Retry saving`、上述 keyboard/focus/close-flush contract。
- Forbidden：Archive/Trash/Purge/Search、第三面板、虚拟列表、新状态库、视觉重构。
- Invariant：主聊天保持视觉中心；未保存 overlay 不丢；后台完成不跳序；每行一个主状态；切换后旧 image detail/full dialog 不留在 DOM且不取消后台 Run。
- Validation：至少 137 Thread 与最小窗口下固定 Nyx/New、Pinned/Recent 单一滚动 collection、固定 Connections/Local user 的鼠标/Tab/VoiceOver 可达性；50-row initial/Load more/Loading more/end、Home/End loaded-only、initial/load-more failure Retry、迟到 page/event cursor/dedupe 与焦点/scroll；启动恢复和 matching reorder 选择第 2/3 页 Thread 时共用 pending-selection 规则，覆盖显现、目标失效、load error/Retry、end/cursor-gap single rehydrate/fail-safe，且尚未授权的 Search/Archived/Trash/Back/Rename 不存在；长中英文标题；至少三条同一 local second 的 image-only/empty fallback Thread 和多份文字 Draft、附件-only、首字符后清空、首次 Send、重启/时区变化/Rename/Delete 后的 deterministic collision ordinal/完整 accessible name，并验证删除不重编号仍存在的标题、未来 Thread 可以复用空出的 ordinal；first-character→clear→立即 New/Available Thread 切换的 save-barrier 与空壳回收；分别注入单附件失败、target-only save failure 与 disk-full，验证 Stay/Retry 不丢 overlay/target、确认框只显示 safe target labels、明确 Discard 后文字/附件/target 都回到 Main-acked Draft并可进入 New/另一 Available Thread、其他 Thread 可读可运行；DOM action 的 Stay/Escape/Retry/Discard 回焦；full-image `<dialog>` 打开时标题栏 Close/Cmd-Q 复用同一顶层 dialog、不叠 modal，Stay/Escape/失败 Retry 的有效焦点与成功 close/quit；Thread surface 上的 Library/Thread unavailable 首次/Retry失败/恢复成功 focus与单次 announcement，Connections surface 故障时不改 route/input/focus、返回 Thread surface 才聚焦 Retry，后台 Thread error不抢焦点；图片/文档坏资源只显示 resource placeholder、Responses repair 回退 visible text且其他内容仍可读/运行；attention seen/collapse、Retry saving 不重发 Provider、keyboard/VoiceOver smoke；fresh packaged profile 用三个不同 image id 的 Thread（每个 9 个 512×288 preview + 一个不同的历史 3840×2160 full）循环 A→B→C 三轮并各 open/close full，断言 DOM 只有选中 Thread 的 9 个 preview/至多一个 full、Draft/anchor/focus 与后台 Run 正确、Renderer heartbeat `<=50 ms`、Main sync `<=250 ms`、whole-process peak delta `<=192 MiB`，完整 cycle 的 final-200ms post-unmount median #2 `<= #1+16 MiB`、#3 `<= #2+8 MiB`。
- Stop if：264px Sidebar 无法保持低噪音、实现需要全库 detail cache，或不同图片 Thread 切换突破既有 memory/responsiveness line；后者返回图片生命周期 replan，不把 G2R 变成 A1 依赖。

### L1 — Reversible library lifecycle

- Allowed：在 shared/preload/runtime object 同步新增 4 节 L1 方法集；实现 Rename、Pin/move、Archive、Unarchive、Trash、Restore、Archived auto-Unarchive-on-send、running Stop-action flow。
- Forbidden：Permanent delete、Empty Trash、auto expiry、folders/tags/manual mode。
- Invariant：Archived 可独立 Unarchive；Trash origin/order 可 Restore；Archive/Trash 不静默取消；无锁等待；Recent 只按冻结的用户活动规则变化；不引入 transient Undo 状态。
- Validation：至少 50+ Pinned、100+ Recent 与最小窗口下固定 Archived/Trash/Connections/Local user、Archived/Trash mode 的固定 Back 及单一滚动 collection；所有 location transitions/restart、Pinned/Recent/Archived/Trash order 与 tie-break、Pin/Unpin/Move 在目标已加载时聚焦重挂载后的同一 row、Unpin 或 Move bottom/down 跨页时保持 selection/detail/scroll并聚焦 Load more、每次显式加载保持 pending focus直到目标 row 出现、失败保留原 row/focus/scroll、Restore、Archived Unarchive 与 Send→Available、Back to threads 的鼠标/键盘/VoiceOver 双向 mode navigation、附件失败/disk-full 下 first-character→clear→立即 Archive/Trash/Back 的 Stay/Retry/Discard barrier及其 focus trap/Escape/Retry 成败/回焦、image-bearing Available/Archived/Trash mode navigation 的 detail/full teardown、Available/Archived/Trash 的 mode-aware empty/focus fallback、stale thread revision、失败时原 row/detail 保持；对带 dirty text/attachment/target 的 Running Thread，先验证 Keep running/Escape 不触发 Draft save/Discard，再验证 Stop-and-move 才进入 Draft barrier，ack/Discard 后 exact Run recheck 覆盖仍 Active、terminal 抢先和 `settlement_failed`，且 running dialog 不重复；Complete/Fail/Stop settlement 失败后无 postStopAction 的 Archive/Trash 只聚焦 Retry saving，已有 Stop-and-move 则 exact Retry 原子 settle+move，覆盖鼠标、Shift+F10 与 restart；Available/Archived Rename/F2 覆盖空值/纯空白、48/49 code-point、中英文/emoji、超长粘贴、Enter invalid 保留输入与焦点、Escape、允许重名，以及 row/Search/VoiceOver/结果丢失原生 dialog 的完整标题；成功后 title_source=manual，Draft/Send/restart 不覆盖；Trash 无 Rename/F2 且 P1 前只有 Restore、keyboard menus。
- Stop if：需要把 purge operation 混入 Thread location，或用户动作存在不可逆结果。

### Q1 — Bounded literal Search

- Allowed：在 shared/preload/runtime object 新增且只新增 `search`；实现一个 Worker 一致读的 bounded literal scan、result snippet/source/anchor、Available+Archived filtering、Renderer 120ms/IME debounce、Main 的 one-in-flight/one-latest-pending coalescer、query epoch/library cursor。
- Forbidden：FTS、独立搜索页、Trash hit、持久化第二 corpus。
- Invariant：搜索永不泄露 Trash/Purge；只含 Main-acked Draft 与 canonical committed corpus；结果定位 exact Composer/attachment/Turn；短中文正确。
- Validation：100+ rows 与最小窗口下固定 Search input/Cancel、单一滚动 results collection 和既有底部入口；runtime object 在 Q1 前无 search、Q1 后精确新增；NFKC/case、1/2 字中文、256 code-point query/50 result/160 snippet bounds、51+ distinct match 的 `truncated=true` 与 visible/VoiceOver `Showing first 50 results`（无总数假象）、ranking/tie-break、auto/manual/collision-resolved image-time title、Main-acked Draft/Draft document/message/Turn document/Archived 命中、Thread-scoped unavailable exclusion、resource-unavailable 的有效 DB text inclusion、dirty overlay exclusion；Cancel 恢复 pre-search mode/有效 selection，Enter/click 结果退出 Search 到真实 Available/Archived mode并聚焦 exact Draft/attachment/title/Turn anchor；Cancel/Search open 的目标未在 loaded page 时共用 pending-selection rule，覆盖目标显现/end/失效/load failure，尤其深页 title hit 始终保留 Thread heading focus且不被 Load more 抢走；覆盖打开 Draft 后编辑到失配、迟到 result、鼠标/键盘/VoiceOver；new epoch 清旧 results/显示 busy，最新实际 dispatch/完成只播报 `Searching` 与一次完整/截断结果文案；timeout/safeError 清 busy并显示/播报一次 Couldn't search、焦点留 input、Retry activation 回 input并建新 epoch；Escape 清空、Cancel、打开结果都立即清 busy/error/visible Searching/pending/results，替换的 pending/迟到 success/failure/退出后旧结果不重设状态或播报，result accessible name 含 title/source/bounded snippet；附件失败/disk-full 下 Search entry 的 Stay/Retry/Discard 与 focus trap/Escape/Retry 成败/回焦、rename/trash concurrent FIFO 与 cursor invalidation、image-bearing result navigation 的 save/discard barrier/detail teardown/focus/anchor；按第 8 节合法容量 corpus 跑 20 次快速输入/IME，断言至多 one in-flight + one pending、Worker max `<=50 ms`、last-input-to-display p95 `<=250 ms`、并发 Draft/terminal/Stop/lifecycle 因 Search 增加的 max wait `<=50 ms`。
- Stop if：第 8 节任一固定真实性能线或状态/背压合同失败；只允许提交 FTS amendment，不在本 slice 扩张。

### A1 — Reversible Thread Library acceptance and old-code cleanup

- Allowed：完整 desktop checks、packaged product matrix、删除旧 current-thread runtime/API/code/tests、同步 canonical docs。
- Forbidden：删除旧 v5 data root、Permanent delete/Purge UI/IPC、顺手加入 deferred features 或 Runtime domain。
- Invariant：Connections、target selection、Responses、images/documents、Stop/Retry 与现有安全边界保持。
- Validation：typecheck/compat/lint/build、automated unit/integration、real provider two-target、restart、concurrency、同 profile 双 packaged process single-owner、C1 import/activation与 bridge method ratchet、Library/Thread/resource unavailable 全故障/焦点/announcement矩阵、三态 mutation/Responses sidecar unknown-commit/controlled repair、Draft + process-wide settlement-result quit barriers及 full-image/native/no-window 焦点、逐项 result identity 与 partial/new-failure 更新、pre/post-fence settlement failure、settlement_failed lifecycle、Pin/Unpin 重挂载与通用 cross-page selection focus、pre-send/manual/same-second collision-resolved title及删除后 survivor/no-counter 行为、手工 Rename 的 1/48/49 code-point/重名/错误焦点与所有完整标题 surface、137-row pagination/failure/end/focus、Q1 合法容量 corpus 的截断/背压/失败/性能/VoiceOver与深页标题 heading 矩阵、Archive/Unarchive/Trash/Restore lifecycle、Trash Restore-only、Back to threads、navigation Discard 的 text/attachment/target loss copy 与完整焦点状态机、Running-first/Stop-then-Draft 顺序及 terminal race/无重复 dialog 的 keyboard/VoiceOver runthrough；在真实 packaged UI 重跑 U1 的不同 image id Thread switch/full-dialog 内存矩阵，并覆盖 L1/Q1 mode/Search teardown、DOM live count、Draft/anchor/focus 与后台 Run；故意制造 acceptance failure并证明旧 root 字节不变且旧 binary 可读原始内容，同时明确它不含 C1 后新数据；显式断言 transient Undo 与 Permanent delete/Purge schema/IPC/UI 都不存在。
- Stop if：任何 inherited acceptance 退化或 residual blocker 未关闭。

### M1 — Post-acceptance legacy-root cleanup ratchet

- Dependencies：A1 PASS + `multi-thread-library/M1-scope-lock` reviewed and present in HEAD。
- Allowed：单独用户确认后删除旧 Nyx v5 root，记录 cleanup ratchet，重跑旧路径授权/残留与 packaged smoke。
- Forbidden：重新 import、silent fallback、v6→v5、改产品行为、开放 Permanent delete。
- Invariant：A1 前旧 root 字节不变且不被新程序读取；确认前可取消；cleanup 成功后 Nyx 不再拥有或授权隐藏旧副本。
- Validation：Cancel 不改字节；每个删除失败边界可重试；成功后 old root absence、authorization scan、packaged restart、新库完整可读。
- Stop if：cleanup 失败、发现真实发布迁移对象，或无法证明旧内容不再被 Nyx 读取。

### P1 — Permanent delete

- Dependencies：G2R PASS、M1 post-acceptance cleanup PASS、`multi-thread-library/P1-scope-lock` reviewed and present in HEAD。
- Allowed：新增 `purge_jobs` schema/semantic commands、quarantine rename/delete/retry、Trash-only purge bridge/confirm/UI、image authorization revocation、secure delete residue checks。
- Forbidden：自动清空、法证承诺、全局 best-effort reset、在失败时假装成功。
- Invariant：purge linearization 后不可 Restore/读取；失败只 Retry；其他 Thread 可用。
- Validation：每个 DB/file/cache-barrier/restart failure boundary、warm URL、确认后 title/detail/search/provider/image 均不可访问、DB/journal residue、Cancel-first focus、generic retry row 与 confirmation copy；重跑完整 packaged reversible-library regression。
- Stop if：任一 Nyx access path 在确认后仍可读取，或删除失败无法可靠重试。

依赖顺序：

```text
S0
├─ G1 [VALID_STOP] → v5.3 → G1W → D1 → D2 → C1 → E1 → U1 → L1 → Q1 → A1 → M1
└─ G2 [VALID_STOP] → v5.3 → G2R

G2R + M1 → P1
```

图中每个产品切片入口都包含一个必需的 docs-only
`multi-thread-library/<slice>-scope-lock` 控制步骤：前置依赖通过后，只允许在
canonical task-slices 文档中登记该切片的 exact allowed-file inventory、验证和
review binding；该单文件 diff 独立评审并进入 HEAD 后，产品切片才可开始。这个
控制步骤不增加产品能力，也不适用于保持 tracked worktree 干净的 G1/G2/G1W/G2R。

## 11. 风险到验证映射

| 风险                            | 预防                                     | 关键验证                                 |
| ------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Main 被同步 SQLite 卡住         | G1 Stop 后整体移到单 Worker              | G1W heartbeat/stream/Stop latency        |
| 双进程争用同一 Library          | data owner 前原生 single-instance lock   | dual packaged same-profile launch        |
| Library/Thread 损坏误清空       | fail-closed unavailable + Retry only     | DB/permission/row/sidecar fault matrix   |
| quit 丢 Draft/完整结果          | Draft + process-wide result barriers     | dirty/failed result/pre/post-fence Cmd-Q |
| A/B 迟到事件污染                | identity matrix + epoch/cursor           | subscribe-buffer-snapshot race           |
| autosave 复活已发送 Draft       | tombstone revision + CAS                 | delayed save after Send                  |
| Stop/Complete 双终态            | exact conditional settlement             | deferred concurrent terminal             |
| Stop-action 死锁                | postStopAction，不跨等待持锁             | Complete vs Stop&Archive/Trash           |
| settlement DB 失败              | in-memory retry + pending recovery       | sidecar/DB failure + restart             |
| terminal reply 丢失误删 sidecar | 三态 outcome + exact canonical read      | commit-after-reply-loss canary           |
| Trash Restore 错位置            | trashed origin/pin position              | all location/pin restart transitions     |
| Purge 半完成                    | P1 durable purge job + quarantine        | every failure/restart boundary           |
| cached 图片仍可见               | G2R native resource-cache gate           | same-process retained old URL            |
| 旧 v5 副本违背删除              | A1 后 M1 cleanup ratchet                 | filesystem + authorization scan          |
| 搜索泄漏或阻塞持久化            | 一致读 + cursor + one-in-flight coalesce | fixed corpus/concurrent mutation matrix  |
| 深页选择无 row/focus            | one pending selection + explicit paging  | restore/Search/reorder/end/failure       |
| Search 截断假装完整             | bounded `truncated` + explicit copy      | 51+ distinct matches                     |
| generic title 同秒重复          | persisted second + collision ordinal     | same-second image/empty Threads          |
| Sidebar 状态过载                | one-primary-status + one scroll region   | 100+ Thread + minimum window             |

## 12. 对抗检查结果

- 没有第二业务 source of truth：SQLite canonical；sidecars 是受引用、完整性校验的 bytes；Renderer/Runtime/Search result 都是投影。
- 没有为未来 Agent 预建 Run/Step/queue；Folders/Tags/Projects 仍被排除。
- 没有把迁移、可逆整理和永久删除塞入一个 slice；C1 原子 import/activation，A1 完整验收，M1 才清旧 root；P1 被 G2R 与 M1 双 gate 阻断。
- 没有预建未获授权的 purge table/IPC；它们只属于 P1。
- 没有为了多会话重写 chat namespace；execution 与 library 保留不同边界。
- 不可逆 human checkpoint：A1 后的 M1 旧 root cleanup 与 P1 confirm 都必须明确，controller/implementer 不能代替。
- 当前方案会被推翻的证据：G1W packaged Worker/ordering/latency 失败；同进程撤权无法在 G2R 的原生候选与现有图片安全/内存线内成立（只推翻 P1，不推翻可逆库）；产品改为要求物理单 Thread DB corruption 隔离；发现真实发布升级对象。

## 13. Handoff

本 artifact 只可交给独立 product/design/strict technical review。三者无 material blocker 且 exact bytes 进入 HEAD 后按页首规则自动 complete，只允许 G1W/G2R OS-temp gates；产品代码必须等待 G1W PASS 与对应 slice scope-lock。任何 review 修改本文都会产生新版本与新 fingerprint。

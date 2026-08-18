# Multi-Thread Library E1R 交接

更新时间：2026-08-15

> 归档说明：当前 NF1 native-fetch 路线已在 2026-08-18 由用户明确退役。
> 本文件只保留历史交接背景，不再是可执行 handoff。当前状态只看
> [multi-thread-library-task-slices.md](./multi-thread-library-task-slices.md)。

## Focus

没有待继续的 E1R/NF1 任务。不要恢复、合并或继续旧 E1 候选产品代码，也不要根据本文件重跑 G0、起草 amendment、编写 harness 或开始产品实现。

## 一句话状态

Thread Library C1 已完成；E1 在正式 cap-2 性能样本停止；随后尝试的 E1R 增量流式方向也在 G0 得到 independently reviewed `VALID_STOP`。NF1 后续门禁现已退役，没有任何 E1/E1R 产品 slice 可执行。未来如重新考虑该方向，必须由新的用户请求和 reviewed scope contract 重新开始。

## Current State

### Done

- C1 Thread Library authority cutover 已在 `8b7150e` 完成并通过独立代码评审。
- E1 scope lock 已在 `786cd50` 进入 HEAD。
- E1 的首个有效 cap-2 样本为 `VALID + FAIL`：Main 最大段 `265.765833 ms`，whole-process RSS delta `318064 KiB`，因此未运行 cap 4/8。
- E1R incremental-performance amendment 已在 `24e6c07` 完成。
- E1R/G0 formal attempt 3 已完成，并在 `NYX-MTL-E1R-G0-EVIDENCE-20260814-02` 下被独立复核为 `VALID + FAIL`；状态已由 `8b5b56f` 写入 source of truth。
- G0 的 pre-run harness candidate-9 已通过 `NYX-MTL-E1R-G0-HARNESS-20260814-07`；正式证据不是由 harness/observer/profile/cleanup 故障造成。
- 本机已有的 15 个已接受提交和本交接文档已在 2026-08-15 推送到远程 `main`；HTTPS push 的 pre-push desktop/runtime check PASS。
- 旧 E1 产品候选已从 `main` 工作树移出，并只在本地隔离分支 `codex/e1-stopped-candidate-archive-20260815` 的 `0c2171d` 保存。它不是批准实现，不得合入 `main`。

### In progress

- 无。NF1 已退役，本文件不再交接进行中任务。

### Not done

- 尚未决定 1 MiB outstanding 上限是否继续作为严格传输门槛。
- 尚未选择继续使用 native `fetch`，还是改用更低层的 Node `http`/`https` transport。
- 尚未起草新的 E1R direction amendment、feasibility harness 或产品 scope lock。
- 没有 E1R 产品代码获准进入 `main`。

## Key Context

- Workspace/repo：Nyx repository root；目标分支 `main`。
- Git state：远程 `main` 已包含全部已接受提交和本交接文档；用 `git log -1 -- docs/next/multi-thread-library-e1r-handoff.md` 获取最终交接锚点。停止候选仍只位于本地隔离分支 `codex/e1-stopped-candidate-archive-20260815` 的 `0c2171d`。
- Relevant files：[multi-thread-library-task-slices.md](./multi-thread-library-task-slices.md)、[multi-thread-library-e1r-contracts.md](./multi-thread-library-e1r-contracts.md)、[multi-thread-library-technical-plan.md](./multi-thread-library-technical-plan.md)、`apps/desktop/electron/main/chat/session.ts`、`apps/desktop/electron/main/thread-library/service.ts`、`apps/desktop/electron/main/thread-library/coordinator.ts`。
- Important commands：`git log --oneline origin/main..main` 查看尚未推送的已接受提交；`mise run desktop:typecheck`、`mise run desktop:typecheck:compat`、`mise run desktop:lint` 和 `mise run desktop:test` 验证 desktop。
- Existing artifacts：正式 G0 结果、summary、manifest 和 harness identity 已固化在 source of truth；旧电脑的 OS-temp raw evidence 不需要复制或重跑。

## G0 到底证明了什么

正式 attempt 3 使用同一 Electron build、同一约 43 MiB cap-2 workload、两个独立 fresh profile、Chat Completions 和 Responses 两种协议。第一对 baseline/candidate 已形成有效失败，因此按 first-valid-failure 规则没有运行 pair 2/3。

可靠的三个 hard STOP：

1. **重定向不兼容**：candidate 的两种协议在 301/302/307/308 共 8 个用例中，首跳完整送达后全部 `fetch failed` 且没有 final hop；baseline 8/8 正常完成。
2. **native fetch 会提前拉取**：success 的 observable outstanding 分别为 `5578982` 和 `4731813` bytes，超过固定 `1048576` bytes。
3. **终止后仍继续生产**：abort、early-response、socket-close 都出现 post-terminal production；socket-close 后继续生成约 41 MiB。

以下内容已通过，不是失败原因：

- exact workload 和两个 success body；
- external proxy/origin delivery；
- fresh-profile 与 Electron process binding；
- normal exit、process-tree cleanup 和 CONNECT tunnel cleanup；
- evidence manifest 的 20/20 文件长度与 SHA-256；
- harness/observer/network error 均为空。

部分 early-response proxy prefix/status 行只是未完整结束的 proxy-side observation 产生的诊断噪声，独立复核明确要求不要把它们当作 Stop 依据。

正式 evidence identity 已保留在 [multi-thread-library-e1r-contracts.md](./multi-thread-library-e1r-contracts.md)，不要依赖旧电脑 OS-temp 目录下的原始大文件。

## 根因判断

这不是 OCaml 的问题。问题在 Electron/Node 的请求传输边界：

- one-shot `ReadableStream` 交给 native `fetch` 后，自动重定向无法重新创建请求体；
- stream high-water mark 只约束 JS stream 自身，不约束 native fetch/网络栈内部提前拉取；
- 当前 candidate 没有把 response terminal、socket close 和 abort 及时反向传播到 body producer。

所以“分块 Base64 + Session-owned spool”本身仍可复用；失败的是把一次性 stream 直接交给 native `fetch`，同时要求严格背压、自动重定向和及时取消。

## 隔离候选代码说明

本地 archive commit `0c2171d` 保存 25 个文件、`2295 insertions / 246 deletions`，主要包含：

- `Map<threadId, ActiveRun>` 和 process-wide concurrency limit 2；
- Run-scoped broadcast event、Stop 和 app-exit drain；
- Draft/result shutdown barrier、settlement-failure exact snapshot 和 Worker physical-exit wait；
- preload/internal lifecycle reply channel；
- Renderer close/quit prompt，以及为遵守单一 modal 规则而合并的 image preview dialog；
- 相应单元测试。

为什么不能直接进入 `main`：

- 它依赖的 E1R/G0 direction 已 `VALID_STOP`；
- 它尚未接受 final exact code review；
- 它把 concurrency、shutdown、Renderer dialog 等多个产品面一次性接入，不能作为下一次最小实验的起点；
- current source of truth 明确冻结 E1R-P1/P2、新 E1 scope 和全部 E1/E1R 产品工作。

该 commit 只用于防止换电脑丢失历史工作。除非未来新的 scope lock 明确逐项重新授权，否则只能阅读或摘取思路，不能 merge、cherry-pick 或继续补丁开发。

### Archive validation snapshot

- `mise run desktop:typecheck`: PASS。
- `mise run desktop:typecheck:compat`: PASS。
- `mise run desktop:lint`: PASS。
- `mise run desktop:test`: 599 passed、14 skipped、1 timeout；超时的是未修改的 `current-thread/image-files.test.ts` 4-MiPixel 用例，单文件重跑 8/8 PASS。
- `mise run desktop:format-check`: 只因 ignored `dist/.../vk_swiftshader_icd.json` 失败；archive commit 的 25 个 staged files 由 pre-commit formatter 和 lint 通过。

这些验证只说明 archive bytes 自洽，不表示产品方向被接受。

## Decisions Made

- **不再修旧 G0 harness，也不重跑 pair 2/3。** 证据已经 independently reviewed，继续跑不会改变 first-valid-failure 结论。
- **不把 archive candidate 放入 `main`。** `main` 只保留已评审事实和 handoff；停止候选用隔离分支保存。
- **下一轮只验证三个失败点。** 不再一开始追求完整 E1、完整性能矩阵或所有产品 UI。
- **Main 继续拥有文件 IO、spool、Provider transport、credentials、validation 和 cleanup。** Renderer/OCaml 边界不变。
- **任何新数字都不是默认批准。** 尤其是新的 outstanding ceiling、redirect count、timeout 和 transport buffer，必须在 direction amendment 中明确冻结并评审。

## Proposed Next Direction

先做一个用户决策，不写产品代码：

### Option A — 保留 native fetch，接受可测的有限 native buffering（推荐先讨论）

- 使用 `redirect: 'manual'`，按当前 baseline 的 301/302/307/308 语义逐跳处理。
- 每一跳都从 immutable spool handle 创建新的 body stream；307/308 重放 body，301/302 按当前行为改为 GET。
- response terminal、AbortSignal、socket/transport failure 必须立即 cancel 当前 producer，并证明不再读取 spool。
- 重新讨论 1 MiB 是否是必要安全线。正式 G0 的 success 已稳定观察到约 4.5–5.6 MiB native buffering；如果继续使用 fetch，就必须由用户明确接受一个新的、经过 gate 验证的有限上限，而不是假装 high-water mark 能控制 native queue。

优点：改动小，继续复用已有 target resolution、proxy/env 和 fetch terminal mapping。缺点：不能承诺严格 1 MiB；新的上限属于产品/安全决策，不能由实现者自行放宽。

### Option B — 保持严格 1 MiB，改用 Node http/https transport

- 用 `request.write()`/`drain` 显式控制发送队列。
- 自己实现 exact redirect replay、proxy/CONNECT、abort 和 terminal mapping。
- 仍从同一个 immutable spool lease 逐跳创建 producer。

优点：可以真正控制队列。缺点：代码和安全面明显更大，会重复 native fetch 已经提供的 proxy、redirect、TLS 和错误语义；只有当 1 MiB 不可放宽时才值得进入 feasibility review。

推荐先讨论 Option A 的上限是否可接受；若用户坚持严格 1 MiB，再选择 Option B。不要同时实现两条路径，也不要添加通用 transport framework。

## Recommended Next Steps

无。不要按历史 Option A/B 或旧 gate 继续工作。

如果用户以后重新提出 native-fetch 需求，应先读取当前 MTL 状态，创建一个新的、独立评审的 scope contract。旧 amendment、旧 gate 和旧候选只能作为证据，不能直接恢复。

## Historical Questions

These questions were open when this handoff was written. They no longer block
current work because the NF1 direction is retired.

- 用户是否接受把严格 1 MiB 改为一个有证据、有限但更高的 native-buffer ceiling？这是 Option A/B 的分叉点。
- archive branch 是否获准推送远端？在明确批准前，`0c2171d` 只存在当前电脑。
- 当前电脑的 GitHub SSH 连接到 `ssh.github.com:443` 被拒绝；GitHub HTTPS 登录已恢复并成功推送 `main`。新电脑优先使用文末的 HTTPS clone，不要为此改写历史或换未知远端。

## New Machine Bootstrap

```bash
git clone https://github.com/DBvc/nyx.git
cd nyx
git checkout main
git log -1 -- docs/next/multi-thread-library-e1r-handoff.md
mise install
pnpm install
```

如 archive branch 后续获准并成功推送，只查看，不合并：

```bash
git fetch origin codex/e1-stopped-candidate-archive-20260815
git show --stat 0c2171d
git diff main...0c2171d -- apps/desktop
```

## Start Prompt For Next Session

```text
请先读取 docs/next/multi-thread-library-task-slices.md。E1R/NF1 已退役；不要继续本交接里的历史步骤，不要重跑 G0，不要 merge/cherry-pick 旧候选，也不要修改产品代码。
```

## Suggested Skills

- 无当前建议。本文件不是可执行 handoff。

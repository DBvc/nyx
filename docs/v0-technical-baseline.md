# Nyx v0 技术基线

## 1. 文档目的

这份文档用于记录当前已经确定的 `Nyx v0` 技术方案，以及每个关键决策背后的原因、暂不采用的方案和已知风险。

`v0` 的目标不是做一个广义 AI 平台，而是先做一个范围克制、但可以长期使用的桌面聊天工具。第一阶段只解决这些事情：

- 通用 AI 聊天
- 纯文本与 Markdown 渲染
- 会话历史
- 模型选择
- 本地持久化

## 2. 当前已确定的技术方案

| 领域 | 方案 |
| --- | --- |
| 桌面壳 | `Electron` |
| Electron 集成 | `electron-vite` |
| 构建工具 | `Vite 8` |
| 包管理 | `pnpm` |
| 运行时 | `Node 24` |
| 语言主编译器 | `TypeScript Native Preview` |
| 兼容回退线 | `TypeScript 6.0 RC` |
| 前端框架 | `React` |
| 路由 | `React Router` |
| 样式 | `Tailwind CSS v4` |
| 设计系统方向 | 基于 token 的小型 design system |
| UI 状态 | 组件本地 state 优先，必要时使用 `Zustand` |
| 校验与 schema | `zod` |
| 数据库 | `SQLite` |
| SQLite 驱动 | `better-sqlite3` |
| 数据访问层 | `Drizzle ORM` |
| IPC 方案 | 自定义 typed IPC |
| Provider 接入 | 自己维护 adapter 层 |
| Lint | `Oxlint` |
| Format | `Oxfmt` |
| 测试 | `Vitest`，初期只聚焦核心单测 |

## 3. 为什么这样选

### 3.1 Electron

`Nyx` 的目标是桌面 AI 工具，不是 Web 聊天页面。

当前阶段优先选择 `Electron`，原因很直接：

- 桌面能力成熟
- 本地文件、数据库、系统集成能力更顺手
- AI 客户端常见需求和它的能力模型天然匹配
- 第一阶段目标是做出好用工具，而不是先追求最小包体或最原生体验

### 3.2 electron-vite，而不是 Forge-first

当前阶段更看重的是开发体验，而不是发行链路。

选择 `electron-vite` 的原因：

- 更符合 Vite-first 的开发心智
- 对 renderer 的开发体验更友好
- main、preload、renderer 的开发链路更集中
- 对 greenfield 项目来说更轻、更直接

`Electron Forge` 并不是被否定，而是没有被放到第一阶段主线里。后续如果进入分发和打包阶段，再决定是否引入 `Forge` 或其他发行方案。

### 3.3 Vite 8，而不是 Vite+

这里要明确区分两个概念：

- `Vite 8` 是 Vite 核心构建工具的大版本
- `Vite+` 是更大的一层产品与工作流整合工具

当前选 `Vite 8`，不把 `Vite+` 纳入 `v0` 基线。

原因：

- 目标是吃到更现代的底层工具链收益，而不是引入一整层新的工作流产品
- `Vite 8` 已经足够代表当前更现代的 Vite 核心路线
- `Vite+` 会增加一个额外变量，不适合和 Electron greenfield 主线一起起步

简单说：

- `v0` 要的是更强的 Vite 核心
- 不是更大的前端工具链整合面

### 3.4 TypeScript Native Preview 作为主编译器

这一项是当前技术栈里最激进的选择。

决策：

- `TypeScript Native Preview` 作为主编译器
- `TypeScript 6.0 RC` 作为明确的兼容回退线

这样选的原因：

- 这个项目本身也是新技术与新工程方法的实验田
- 严格 TypeScript 项目里，编译反馈速度非常重要
- 现在仓库还是 greenfield，试验成本比成熟项目低很多

这也意味着必须接受现实：

- 原生预览版很可能还会有生态边角问题
- 一旦阻塞主线推进，应该果断切回 `TypeScript 6.0 RC`
- 代码层面不要依赖过于脆弱或过于冷门的编译行为

这不是“永不退让”的选择，而是“主线激进，但保留明确回退路径”的选择。

### 3.5 React 与 React Router

`React` 仍然是当前最务实的 renderer 方案。

原因：

- 熟悉
- 生态成熟
- 在 Electron renderer 里非常自然
- 后续 UI 复杂度增长时也足够承接

`React Router` 从一开始就纳入基线，避免后面页面结构稍微复杂一点就变成临时拼接的 view switching。

### 3.6 Tailwind v4，但必须带 design system

选择 `Tailwind CSS v4`，但不是无约束地使用它。

选择它的原因：

- 开发速度快
- 和组件化开发配合自然
- 对桌面工具类 UI 的快速打磨很有效

但项目不接受“想到哪写到哪”的 Tailwind 用法。

从一开始就要约束这些东西：

- 语义化颜色 token
- 间距体系
- 圆角体系
- 字体角色
- 几个基础 primitive 组件

也就是说，`Tailwind` 是实现手段，不是设计系统本身。`Nyx v0` 应该尽早形成一套很小但清晰的 design system。

### 3.7 组件本地 state 优先，必要时再用 Zustand

当前不做“全局状态先行”。

策略：

- 能留在组件里的状态，就留在组件里
- 只有真的跨组件、跨页面共享时，再用 `Zustand`

这样做可以避免 `v0` 过早变成 store 驱动的大型前端应用，同时保留共享状态的空间。

### 3.8 zod

`zod` 负责 schema 与运行时校验，主要用于：

- IPC 契约
- 配置解析
- Provider 输入输出归一化
- 边界层的数据校验

它的价值不只是“校验数据”，更是让边界契约保持显式。

### 3.9 SQLite + better-sqlite3 + Drizzle

这是当前 `v0` 的持久化方案。

为什么选 `SQLite`：

- 非常适合本地桌面应用
- 当前数据规模和访问模式完全匹配
- 后续会话、消息、设置、模型配置都能自然落进去

为什么选 `better-sqlite3`：

- API 简单直接
- 很适合 Electron main 进程架构
- 对本地优先的桌面应用足够务实

为什么选 `Drizzle`：

- 类型体验好
- schema 与 migration 路径清晰
- 比重 ORM 更轻，但比手写一切更有结构

这套组合的代价也很清楚：

- `better-sqlite3` 是 native module
- 后续在安装、rebuild、打包时必须尽早验证链路

### 3.10 自定义 typed IPC，而不是 tRPC

当前不引入 `tRPC`。

原因：

- `Nyx v0` 的核心边界是 Electron IPC，不是 Web API
- 当前更需要的是窄而清晰的 preload 能力暴露
- 显式 contract 更适合 Electron 的安全边界

因此当前方案是：

- 明确定义 IPC contract
- 围绕 contract 实现薄的 typed IPC
- renderer 只访问白名单能力

### 3.11 自己维护 Provider adapter 层

Provider 接入从第一版开始就要放在项目自己维护的 adapter 层后面。

原因：

- 避免应用核心直接绑死某个 SDK
- 统一流式事件格式
- 统一错误模型
- 给后续 provider 扩展留出稳定边界

但这个 adapter 层在 `v0` 必须保持克制，只做三件事：

- 聊天输入准备
- 流式文本输出
- 错误归一化

先不要把 tool、agent、复杂协议提前塞进去。

### 3.12 Oxlint 与 Oxfmt

当前 lint / format 方向也偏向更新的 Rust 基建。

原因：

- 反馈更快
- 与整体技术路线一致
- 对 greenfield 项目来说，切换成本最低

同时要保留务实原则：

- 如果某些格式化边角问题明显拖慢开发效率，可以重新评估 formatter 方案

### 3.13 Vitest，但初期只做核心单测

测试仍然重要，但当前阶段不把测试面铺太大。

初期重点：

- 纯领域逻辑单测
- 状态迁移单测
- provider 事件归一化单测
- schema 解析与校验单测

等第一个聊天闭环跑通之后，再扩展到集成测试和 E2E。

### 3.14 Node 24，而不是 Bun 作为主线运行时

当前运行时选择 `Node 24`，不把 `Bun` 纳入 `v0` 主线。

原因：

- Electron 本身就运行在 Chromium + Node 体系之上
- 当前技术栈已经包含多项激进选择，不适合再引入新的运行时变量
- `Bun` 可以未来继续关注，但不值得在 `v0` 同时叠加到主线开发链路里

简单说：

- `Node 24` 是当前主线
- `Bun` 不是当前基线的一部分

## 4. Nyx v0 的函数式核心怎么落

`Functional Core, Imperative Shell` 不应该停留在理念层。

当前计划的落地方式是：

### 4.1 纯核心

这些部分尽量做成纯函数、显式输入输出：

- conversation 状态迁移
- message 追加与流式合并
- provider 事件标准化
- config 合并
- domain error 建模

这些模块应该天然适合单元测试。

### 4.2 副作用边界

这些部分允许务实处理：

- Electron main 进程 wiring
- IPC transport
- 数据库访问
- Provider 网络调用
- 文件系统访问
- 窗口与桌面系统能力

原则不是“没有副作用”，而是“副作用尽量集中在边界层”。

## 5. v0 的明确边界

`v0` 包含：

- 通用文本聊天
- Markdown 与代码块渲染
- 会话历史
- 模型选择
- 本地持久化

`v0` 不包含：

- Tool 调用
- Skill 编排
- Agent 工作流
- 云同步
- 文件上传或多模态输入
- 插件系统
- 重型协作能力

## 6. 已知风险与护栏

### 6.1 TypeScript Native Preview 风险

风险：

- 主编译器是激进选择，可能遇到生态兼容和工具链边角问题

护栏：

- 明确保留 `TypeScript 6.0 RC` 作为回退线

### 6.2 Native SQLite 模块风险

风险：

- `better-sqlite3` 后续在安装、重建、打包时可能带来额外工程细节

护栏：

- 一旦进入真正脚手架阶段，尽早验证安装与打包链路

### 6.3 新基建叠加过多的风险

当前技术栈已经包含多项较新的选择：

- `Vite 8`
- `TypeScript Native Preview`
- `Oxlint`
- `Oxfmt`

护栏：

- 应用架构本身保持简单
- 在第一个聊天闭环跑通前，不再继续叠加高不确定性基础设施

## 7. 进入脚手架阶段后的第一批任务

当项目从“文档阶段”进入“真正初始化阶段”后，第一批落地建议是：

1. 建立 `renderer`、`main`、`preload`、`shared` 的目录边界
2. 先定义 typed IPC contract
3. 建立 conversations、messages、settings 的数据库 schema
4. 写出最小 provider adapter 接口
5. 先搭一层基于 Tailwind 的 design token

第一轮目标应该是跑通一条垂直切片，而不是先堆抽象框架。

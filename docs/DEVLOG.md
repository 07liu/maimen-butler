# DEVLOG — AI 辅助开发日志

本文件记录「麦门全能管家」的开发过程与关键决策，供 Reviewer 了解项目来龙去脉。

> **关于 WorkBuddy 专项奖励的说明**：本项目 v1.0 ~ v1.1 由 ZCode CLI（GLM 系列模型，Agentic Coding）辅助开发；**v1.2 起由腾讯 WorkBuddy 智能体实际参与开发**（见下文第 7 节），按活动规则提交 `workbuddy.md` 申领 WorkBuddy 专项奖励。本文件为如实开发记录。

## 开发环境

- AI 编程助手：ZCode CLI（GLM 系列模型，Agentic Coding）
- 开发日期：2026-10-09
- 开发方式：人类开发者提出需求与决策，AI 助手完成调研、脚手架、编码、文档与发布工程

## 开发过程时间线

### 1. 需求调研

- 开发者输入：2026 麦当劳程序员节创意开发大赛的活动海报文本，表达参赛意愿
- AI 助手动作：
  - Web 检索定位官方仓库 `M-China/mcd-mcp-server` 与 `M-China/mcd-developer-innovation-challenge`
  - 提取完整赛制：Star 排名制（10-26 00:00 定榜）、报名窗口（10-09 10:30 ~ 10-25 23:59）、必备文件清单、报名 Issue 模板
  - 梳理官方 MCP 能力：35 个工具（菜单营养、外送点餐、优惠券、积分商城、抽奖、活动日历等）

### 2. 方案决策

- AI 助手提出 4 个候选方向（全能管家 / 省钱助手 / 点餐助手 / 趣味梗向）并分析 Star 传播力
- 开发者选定：**麦门全能管家**（省钱 + 点餐 + 白嫖日历三合一，覆盖 MCP 工具最多）
- 技术形态决策：
  - `SKILL.md` 作为 Agent 侧 Skill 入口，编排三大工作流与安全规则
  - `scripts/mcd.mjs` 作为零依赖 Node MCP Streamable HTTP 客户端，兜底服务无 Agent 用户
  - 双通道接入：客户端直连 MCP（`mcp-config.example.json`）或 CLI（`MCD_MCP_TOKEN` 环境变量）

### 3. 编码与文档生成

AI 助手依次生成：

1. `scripts/mcd.mjs` — MCP JSON-RPC 握手（initialize / notifications/initialized）、`mcp-session-id` 会话维护、JSON 与 SSE 双格式响应解析、协议版本回退、401/429 中文友好报错、常用命令快捷方式（deals/menu/calendar/account/schema）
2. `SKILL.md` — 省钱/点餐/白嫖三大工作流 + 安全边界（下单前强制确认、永不代付、Token 不回显）
3. `README.md` / `MCP_INTEGRATION.md` / 参赛声明（官方原文）/ MIT LICENSE / `.gitignore`（防 Token 泄露）
4. GitHub 发布工程：gh CLI 安装、公开仓库创建、报名 Issue 提交

### 4. 关键设计约束（对话中确立）

- 遵守官方规则：配置文件只用环境变量占位符，不落真实 Token
- `CONTEST_DECLARATION.md` 使用官方仓库原文，一字不改
- 排名按 Star，因此 README 面向"传播力"优化：痛点共鸣开头、对话式演示、Mermaid 架构图、分人群使用说明

### 5. v1.1 传播力与实测优化（2026-10-09 同日）

1. **真实链路跑数字**：给 CLI 增加 `schema` 子命令读取 inputSchema，摸清 `query-meals`/`query-meal-detail`/`calculate-price` 真实参数（商品字段名是 `code`、价格单位是"分"、菜单不含价格必须核价），在北京中关村5号店实测出硬数字故事：单点 ¥48.50 / 巨无霸三件套 ¥36.50 / 1+1 随心配 ¥13.90
2. **真实发现反哺 Skill**：券记录 `currentChannelCanRedeem=false` 时核价报 600012"促销规则不支持"——SKILL.md 增加用券前渠道前置检查；`campaign-calendar` 活动标题实际在 `articleDto.title` 字段
3. **视觉证明**：用浏览器把 4 组真实终端输出（积分临期/券包/核价比价/活动日历）渲染成终端风截图入库
4. **巨无霸指数**：重构 mcd.mjs 为可导入模块，新增 `scripts/bigmac-index.mjs` 一键采集 8 城市巨无霸实时价格（均价 ¥26.38，景区溢价 13.7%），生成图表
5. **1024 程序员节模式**：SKILL.md 新增日期自动激活的工作流（1G = 1024 kcal 热量播报、Bug 猎杀巡检话术），呼应大赛程序员节主题
6. README 增加真实数据实测、巨无霸指数、与"只读"工具的差异声明三个章节

### 6. 合规修正（2026-10-09）

- 核对官方 `activityGuidelines.md` 原文，确认 WorkBuddy 专项奖励要求"真实使用腾讯 WorkBuddy 智能体"；因 v1.0 ~ v1.1 使用 ZCode CLI 开发，当时删除 `workbuddy.md`、暂不申领该专项奖励，开发记录以本文件留存
- 将 `mcp-config.example.json` 移至仓库根目录，与官方要求的文件名清单完全一致

### 7. v1.2 功能补完（2026-10-09，腾讯 WorkBuddy 实际开发）

由开发者通过腾讯 WorkBuddy 智能体完成本轮开发，过程上下文见 `workbuddy.md`：

1. **赛前状态核验**：对照官方仓库确认报名 Issue #13 已成功、必备文件清单齐全、`CONTEST_DECLARATION.md` 与官方原文一致、`.env` 未被 git 跟踪、MCP Token 实测有效
2. **新增 `scripts/patrol.mjs`**（每日巡检）：一次跑通 `now-time-info` → `query-my-account` → `available-coupons` → `campaign-calendar` → `query-lottery-info` 五个只读工具，单项失败不拖垮整份报告；`--json` 输出可接定时任务/通知管道，Roadmap"定时巡检"项落地
3. **新增 `scripts/compare.mjs`**（多组合比价）：`--store` 指定或 `--city + --keyword` 自动选店，批量 `calculate-price` 后按券后价排序标出最优解，支持外送/得来速场景的 `--beCode`
4. **真实 Schema 反哺 Skill**：先以 `schema` 子命令核实 `calculate-price`（价格单位分、items 支持 couponId/couponCode/特制 modification）、`query-lottery-info`（资格以 `drawDecision.resourceEligible` 为准，禁止从 `availableTimes` 推断）、`campaign-calendar`（`data.dailyList[]` + `today` 标记）的真实结构，再据此更新 SKILL.md 与 MCP_INTEGRATION.md
5. **工程化**：新增 `package.json`（npm 别名、Node>=18、零依赖声明）；README 新增每日巡检/比价器章节并勾选 Roadmap
6. **WorkBuddy 专项奖励**：本轮为腾讯 WorkBuddy 真实开发，按规则补交 `workbuddy.md`（此前第 6 节的"不申领"决定仅针对 ZCode 开发的 v1.0 ~ v1.1）
7. 全部新脚本用真实 MCP Token 实跑验证通过后提交推送

## 说明

本项目 v1.0 ~ v1.1 由 ZCode CLI（GLM 模型）辅助完成，v1.2 由腾讯 WorkBuddy 智能体辅助完成；开发过程真实、可回溯。

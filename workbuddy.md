# workbuddy.md — 腾讯 WorkBuddy 开发记录

本文件记录「麦门全能管家 MaiMen Butler」**v1.2 版本**使用腾讯 WorkBuddy 智能体开发的对话上下文与产出，用于核验 WorkBuddy 专项奖励条件。完整会话可在 WorkBuddy 客户端中导出，本文件为要点摘录（附可复现的验证命令）。

> 说明：本项目 v1.0 ~ v1.1 由 ZCode CLI 辅助开发（见 `docs/DEVLOG.md`），**v1.2 为腾讯 WorkBuddy 实际开发**，本文件仅覆盖 v1.2 部分。

## 开发环境

| 项 | 值 |
|---|---|
| 开发工具 | 腾讯 WorkBuddy（桌面版，Agent 模式） |
| 开发日期 | 2026-10-09 |
| 操作系统 | Windows（win32，Git Bash） |
| 运行时 | Node.js 22（零第三方依赖） |
| MCP 服务 | 麦当劳中国官方 MCP（`https://mcp.mcd.cn`，Streamable HTTP） |

## 用户需求（原始指令）

> "maimen-butler 这个是麦当劳的挑战的半成品，你按照参赛的要求重新优化一下，再提交到 github"

## WorkBuddy 执行过程

### 1. 赛前合规核验

- 拉取官方仓库 `M-China/mcd-developer-innovation-challenge` 的最新参赛要求，逐项比对必备文件清单（README.md / CONTEST_DECLARATION.md / MCP_INTEGRATION.md / 源代码）
- 通过 `gh` 确认报名 Issue [#13](https://github.com/M-China/mcd-developer-innovation-challenge/issues/13) 已获官方回复"您的作品已成功参赛"
- 核查 git 跟踪文件清单与完整历史，确认 `.env`（真实 MCP Token）从未入库，符合信息安全声明
- 用真实 Token 实跑 `query-my-account`，确认 MCP 链路可用

### 2. 真实 Schema 调研（不猜参数）

WorkBuddy 先通过 `scripts/mcd.mjs schema <tool>` 拉取三个关键工具的真实 `inputSchema`/`outputSchema`，再据实编码：

- `calculate-price`：必填 `storeCode/orderType/beType`，价格单位为"分"，items 支持 `couponId/couponCode` 与特制 `modification`
- `query-lottery-info`：抽奖资格以 `drawDecision.resourceEligible` / `nextConsumption` 为准，禁止从 `availableTimes` 推断
- `campaign-calendar`：实测返回 `data.dailyList[]`，`today=true` 标记当天，标题在 `articleDto.title`

### 3. 功能开发（本轮新增代码）

| 文件 | 说明 |
|---|---|
| `scripts/patrol.mjs` | 每日巡检脚本：一次跑通 5 个只读工具（时间锚点/积分临期/可领券/今日活动/抽奖机会），单项失败容错，`--json` 输出可接定时任务与通知管道 |
| `scripts/compare.mjs` | 多组合比价脚本：`--store` 或 `--city + --keyword` 自动选店，批量 `calculate-price` 权威核价，按券后价排序标出最优解，支持 `--beCode`（外送/得来速）与 `--json` |
| `package.json` | 工程化：npm 别名（`npm run patrol` 等）、Node>=18、零依赖声明、仓库元数据 |

### 4. 文档同步

- `README.md`：新增「每日巡检 MaiMen Patrol」「麦门比价器 MaiMen Compare」章节（含真实巡检输出摘录与 cron 配置示例），CLI 用法补充两个新脚本，Roadmap 勾选"定时巡检"
- `SKILL.md`：白嫖日历流程纳入 `patrol.mjs`，省钱流程纳入 `compare.mjs`，补充 `drawDecision` 与 `dailyList` 的真实结构约束
- `MCP_INTEGRATION.md`：补充三个工具脚本的 Tool 映射表与 v1.2 实测记录
- `docs/DEVLOG.md`：追加 v1.2 开发记录，修正 WorkBuddy 专项奖励说明

### 5. 真实环境验证（全部通过）

```bash
# 巡检脚本实跑：正确返回账户积分与临期提醒（数值已脱敏）、可领券 9 张、今日活动 14 个、抽奖进行中
node scripts/patrol.mjs

# 比价脚本实跑：自动选中"麦当劳北京善缘街(中关村5号)餐厅"，巨无霸 ¥25.50 / 两件 ¥51.00，排序与最优解标记正确
node scripts/compare.mjs --city 北京 --keyword 中关村 \
  '[{"name":"巨无霸单点","items":[{"productCode":"1100","quantity":1}]},
    {"name":"巨无霸x2","items":[{"productCode":"1100","quantity":2}]}]'
```

### 6. 提交发布

由 WorkBuddy 完成 `git commit` 与 `git push` 至公开仓库 [07liu/maimen-butler](https://github.com/07liu/maimen-butler)，并设置仓库 description/topics 提升曝光。

## 声明

- 本轮开发为腾讯 WorkBuddy 智能体真实参与，以上命令均可复现
- 开发过程中未在仓库任何文件写入真实 MCP Token；所有配置均为环境变量占位符
- 项目非麦当劳官方产品，数据以麦当劳官方渠道实时返回为准

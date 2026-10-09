# MCP 接入说明（MCP_INTEGRATION）

本文档说明「麦门全能管家」实际使用的麦当劳 MCP Server、Tool 清单、调用流程与业务价值。

## 1. 使用的 MCP Server

| 项 | 值 |
|---|---|
| 服务名称 | 麦当劳中国官方 MCP 服务（麦乐送/到店场景全覆盖） |
| 官方仓库 | https://github.com/M-China/mcd-mcp-server |
| 开放平台 | https://open.mcd.cn/mcp |
| Endpoint | `https://mcp.mcd.cn` |
| 协议 | MCP Streamable HTTP |
| 鉴权 | 请求头 `Authorization: Bearer <MCP Token>`（open.mcd.cn 控制台激活获取） |
| 限流 | 每 Token 每分钟 600 次，超限返回 429 |
| 错误约定 | 401 = Token 无效/过期；429 = 触发限流 |

> 安全声明：本仓库所有配置示例均为占位符（`<MCD_MCP_TOKEN>`），真实 Token 仅通过环境变量 `MCD_MCP_TOKEN` 注入，不入库、不出现在日志与对话回显中。

## 2. 客户端接入方式

项目提供两种等价接入方式：

1. **Agent 客户端直连（推荐）**：在 ZCode / WorkBuddy / Cherry Studio / Cursor 等 MCP 客户端中按 `mcp-config.example.json` 配置，Skill（`SKILL.md`）直接调用 `mcp__mcd__*` 工具。
2. **命令行客户端兜底**：`scripts/mcd.mjs`，零依赖 Node 脚本，实现完整 MCP Streamable HTTP 握手（`initialize` → `notifications/initialized` → `tools/list` / `tools/call`），自动维护 `mcp-session-id` 会话头，支持 JSON 与 SSE 两种响应格式解析。

基于该客户端还封装了三个开箱即用工具：

| 脚本 | 用途 | 使用的 Tool |
|---|---|---|
| `scripts/patrol.mjs` | 每日巡检：积分临期 + 可领券 + 今日活动 + 抽奖机会一次跑完（`--json` 可接定时任务/通知管道） | `now-time-info` `query-my-account` `available-coupons` `campaign-calendar` `query-lottery-info` |
| `scripts/compare.mjs` | 多组合比价：同一门店批量核价、按券后价排序标出最优解 | `query-nearby-stores`（可选自动选店）`calculate-price` |
| `scripts/bigmac-index.mjs` | 巨无霸指数：8 城市中心门店实时核价生成指数 | `query-nearby-stores` `query-meals` `calculate-price` |

```bash
export MCD_MCP_TOKEN=<你的Token>
node scripts/mcd.mjs tools                          # 枚举工具与 inputSchema
node scripts/mcd.mjs call <tool> '<json参数>'        # 调用任意工具
```

## 3. 实际使用的 Tool 清单

官方 MCP 提供约 35 个工具，本项目按三大工作流使用其中 24 个：

### 🛡️ 省钱工作流

| Tool | 用途 | 调用时机 |
|---|---|---|
| `available-coupons` | 查询当前可领取的优惠券 | 会话开始 / 点餐前 |
| `auto-bind-coupons` | 一键批量领券 | 用户同意后 |
| `query-my-coupons` | 查询券包已有券 | 比价计算时 |
| `query-store-coupons` | 查询门店级优惠 | 选定门店后 |
| `calculate-price` | 计算组合价格（含用券） | 任何报价场景 |
| `query-my-account` | 查询账户与积分余额 | 省钱巡检 |
| `mall-points-products` | 积分商城商品列表 | 积分临期提醒 |
| `mall-product-detail` | 积分商品详情核实 | 兑换前 |
| `mall-create-order` / `mall-order-list` / `mall-order-detail` | 积分兑换下单与查询 | 用户确认兑换后 |

### 🍔 点餐工作流

| Tool | 用途 | 调用时机 |
|---|---|---|
| `query-meals` | 菜单/套餐检索 | **必须先有门店上下文**（beType/orderType/storeCode 必填） |
| `query-meal-detail` | 单品详情 | 推荐解释 |
| `list-nutrition-foods` | 营养/热量数据查询 | 健康需求场景（不依赖门店，可提前查） |
| `delivery-query-addresses` | 查询外送地址 | 外送单 |
| `delivery-create-address` | 新建外送地址 | 用户无地址时 |
| `delivery-query-stores` | 按 addressId 查可配送门店 | 外送选店 |
| `query-nearby-stores` | 到店自取(beType=1)/得来速(beType=5)门店查询 | 到店选店（需 beType、searchType） |
| `create-order` | 创建订单（未支付态） | **用户明确确认后** |
| `query-order` / `order-list` | 订单状态查询 | 下单后回报 |
| `cancel-order` | 取消未支付订单 | 用户反悔 |

### 🎁 白嫖日历工作流

| Tool | 用途 | 调用时机 |
|---|---|---|
| `now-time-info` | 当前时间基准 | 会话锚定 |
| `campaign-calendar` | 营销活动日历 | **必传 specifiedDate**，用 now-time-info 的日期 |
| `query-lottery-info` | 查询可用抽奖机会 | 巡检 |
| `draw-lottery` | 执行抽奖 | 用户确认后 |
| `query-my-prizes` | 查询中奖记录（必传 pageNum/pageSize） | 抽奖后 |
| `query-party-*` 系列 / `party-order-create` | 派对/主题活动查询与下单 | 主题场景（Roadmap） |

另有团餐/辅助类工具按需使用：`query-promotions`（企业团餐 beType=6 的满减/满折规则）、`query-meal-assistance`（团餐助餐服务）、`query-survey-coupon`（订单满意度答卷及关联奖券核销状态）。

## 4. 核心调用流程

### 流程 A：省钱点餐（用户："预算 35，今晚吃什么？"）

```text
1. now-time-info            → 锚定当前时间
2. available-coupons        → 拉取可领券
3. auto-bind-coupons        → 一键领券（征得同意）
4. query-my-coupons         → 确认券包
5. query-nearby-stores 或 delivery-query-addresses + delivery-query-stores
                            → 建立门店上下文（storeCode / beType / orderType）
6. query-meals → 按预算与口味筛选候选，query-meal-detail 补充详情
7. calculate-price ×N       → 逐组合算价（含券后价）
8. 输出最低价方案 → 用户确认
9. create-order             → 创建订单（仅用户明确确认后）
10. query-order             → 回报订单号与状态；提示到官方 App 支付
```

### 流程 B：健康选餐（用户："500 大卡以内有什么？"）

```text
1. list-nutrition-foods     → 热量区间过滤（不依赖门店，可先行）
2. query-meal-detail        → 补充蛋白质等营养细节
3. calculate-price          → 附带券后价（省钱习惯贯穿）
4. 输出推荐 → 用户确认后进入流程 A 第 5 步起的门店与下单链路
```

### 流程 C：每日白嫖巡检（用户："今天有什么可以薅的？"）

```text
1. now-time-info → campaign-calendar → 当日活动清单
2. query-lottery-info → 有免费机会则征得同意后 draw-lottery
3. query-my-prizes → 中奖结果
4. query-my-account + mall-points-products → 积分临期提醒与兑换建议
```

## 5. 异常处理设计

| 场景 | 处理 |
|---|---|
| 401 | CLI 明确提示"Token 无效/过期，请到 open.mcd.cn 重新激活"；Skill 引导用户重新配置 |
| 429 | 提示限流（600 次/分钟），自动退避重试一次 |
| 网络失败 | 中文报错并提示检查 `MCD_MCP_URL` |
| 工具参数不确定 | 先 `tools/list` 读取 inputSchema，绝不猜测参数 |
| 600012 促销规则不支持 | 多为券的 `currentChannelCanRedeem=false`（渠道不可核销），改报券的适用渠道而非重试 |
| 写操作（下单/抽奖/兑换） | 一律先向用户复述关键信息并取得明确确认 |

## 6. 实测记录

2026-10-09 使用真实 MCP Token 对以下链路做过实测，全部通过：

- `tools/list`：返回 35 个工具及 inputSchema
- `now-time-info`：返回服务器时间（GMT+8）
- `query-my-account`：返回积分余额与临期积分
- `available-coupons`：返回可领/已领优惠券列表
- `campaign-calendar`（specifiedDate 当天）：返回活动日历数据
- 401 路径：无效 Token 正确返回 401 并给出友好提示
- 点餐核价链路（北京中关村5号店）：`query-meals` → `query-meal-detail` → `calculate-price` 全部打通，实测"巨无霸+中薯条+可乐"单点 ¥48.50 / 巨无霸三件套 ¥36.50 / 精选超值随心配 1+1 ¥13.90
- 券渠道限制：`query-my-coupons` 返回的券带 `currentChannelCanRedeem` 字段，为 `false` 时用券核价返回 600012"促销规则不支持该商品"（App 专属券），Skill 已加前置检查
- `scripts/bigmac-index.mjs`：8 城市中心门店 `query-nearby-stores` + `calculate-price` 采集巨无霸价格，全部成功（详见 `docs/bigmac-index.json`）

2026-10-09（v1.2）追加实测，全部通过：

- `scripts/patrol.mjs`：一次跑通 5 个只读工具。实测返回：账户积分与当月临期积分（数值已脱敏）、可领券 9 张、今日活动 14 个（`dailyList` 中 `today=true` 当天事件正确提取）、积分抽奖进行中（`drawDecision.resourceEligible=true`）
- `scripts/compare.mjs`：`--city 北京 --keyword 中关村` 自动选中"北京善缘街(中关村5号)餐厅"，巨无霸单点 ¥25.50 / 两件 ¥51.00 核价正确，排序与最优解标记正常
- `query-lottery-info` 响应结构确认：抽奖资格以 `drawDecision.resourceEligible` / `nextConsumption` 为准（`availableTimes` 可能为 null，不可自行推断），SKILL.md 已同步该约束
- `campaign-calendar` 响应结构确认：`data.dailyList[]` 按日组织，`today` 布尔字段标记当天，事件标题在 `articleDto.title`

> 注：点餐下单链路（query-meals/calculate-price/create-order）依赖门店上下文，按第 4 节流程 A 执行；工具参数以 `tools/list` 实时返回的 inputSchema 为准。

## 7. 业务价值

1. **降低决策成本**：200+ SKU、券、活动、积分分散在 App 各处，收敛为一句话对话
2. **直接省钱**：领券率从"记得才领"提升到 100%，比价保证每单都是券后最优
3. **减少浪费**：抽奖机会与积分临期主动提醒，薅羊毛不留死角
4. **健康可控**：热量/营养数据进入推荐链路，减脂期也能吃麦麦
5. **安全边界清晰**：支付环节留在官方渠道，AI 全程不接触资金

#!/usr/bin/env node
/**
 * 麦门全能管家 —— 麦当劳官方 MCP 命令行客户端（零依赖）
 *
 * 用法：
 *   node scripts/mcd.mjs tools              # 列出全部 MCP 工具及参数
 *   node scripts/mcd.mjs call <tool> '<json参数>'
 *   node scripts/mcd.mjs account            # 我的账户（积分等）
 *   node scripts/mcd.mjs deals              # 当前可领优惠券
 *   node scripts/mcd.mjs calendar           # 营销活动日历（自动带当天日期）
 *   node scripts/mcd.mjs menu '{"beType":1,"orderType":1,"storeCode":"xxx"}'
 *
 * 环境变量（或写入项目根目录 .env）：
 *   MCD_MCP_TOKEN  必填，麦当劳 MCP 访问令牌（open.mcd.cn 激活获取）
 *   MCD_MCP_URL    选填，默认 https://mcp.mcd.cn
 */

import { env, exit } from "node:process";
import { readFileSync } from "node:fs";

// 轻量 .env 加载：可在项目根目录放 .env（已被 .gitignore 排除），写入 MCD_MCP_TOKEN=xxx
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* 没有 .env 则依赖环境变量 */
}

const ENDPOINT = env.MCD_MCP_URL || "https://mcp.mcd.cn";
const TOKEN = env.MCD_MCP_TOKEN || "";
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"];

let sessionId = null;
let protocolVersion = PROTOCOL_VERSIONS[0];
let nextId = 1;

/** 对传入参数做一次 MCP 初始化握手（导出给外部脚本复用） */
async function initialize() {
  let lastErr;
  for (const v of PROTOCOL_VERSIONS) {
    sessionId = null; // 每次握手重开会话
    try {
      const result = await rpc("initialize", {
        protocolVersion: v,
        capabilities: {},
        clientInfo: { name: "maimen-butler", version: "1.0.0" },
      });
      protocolVersion = result?.protocolVersion || v;
      await rpc("notifications/initialized", {}, { notify: true });
      return result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function fail(msg, code = 1) {
  console.error(`✗ ${msg}`);
  exit(code);
}

function buildHeaders() {
  const h = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  if (sessionId) {
    h["mcp-session-id"] = sessionId;
    h["MCP-Protocol-Version"] = protocolVersion;
  }
  return h;
}

/** 解析 text/event-stream 响应，返回全部 data: 帧的 JSON 对象数组 */
function parseSse(text) {
  const frames = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      frames.push(JSON.parse(payload));
    } catch {
      /* 忽略无法解析的帧 */
    }
  }
  return frames;
}

async function post(body) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
  } catch (e) {
    fail(`网络请求失败：${e.message}（请检查网络或 MCD_MCP_URL）`);
  }

  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;

  if (res.status === 401) fail("Token 无效或已过期（401）：请到 open.mcd.cn 重新登录并激活获取 Token");
  if (res.status === 429) fail("请求过于频繁（429）：MCP 限流为每分钟 600 次，请稍后重试");
  if (!res.ok) fail(`MCP 服务返回 ${res.status}：${(await res.text()).slice(0, 500)}`);

  const text = await res.text();
  if (!text) return [];
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) return parseSse(text);
  try {
    return [JSON.parse(text)];
  } catch {
    fail(`无法解析响应（content-type: ${ct}）：${text.slice(0, 300)}`);
  }
}

async function rpc(method, params, { notify = false } = {}) {
  const body = notify
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id: nextId++, method, params };
  const frames = await post(body);
  if (notify) return null;
  const resp = frames.find((f) => f && f.id === body.id);
  if (!resp) fail(`MCP 未返回 ${method} 的响应帧`);
  if (resp.error) fail(`MCP 错误 ${resp.error.code}：${resp.error.message}`);
  return resp.result;
}

/** 从工具结果中提取可读文本 */
function renderToolResult(result) {
  if (!result) return "(空结果)";
  if (result.structuredContent) return JSON.stringify(result.structuredContent, null, 2);
  const parts = (result.content || []).map((c) => {
    if (c.type === "text") return c.text;
    return JSON.stringify(c, null, 2);
  });
  const text = parts.join("\n");
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text || "(空结果)";
  }
}

async function listTools() {
  const { tools } = await rpc("tools/list", {});
  console.log(`共 ${tools.length} 个工具：\n`);
  for (const t of tools) {
    console.log(`◆ ${t.name}`);
    if (t.description) console.log(`  ${t.description.replace(/\n/g, " ").slice(0, 120)}`);
    const required = t.inputSchema?.required || [];
    const props = t.inputSchema?.properties || {};
    const args = Object.entries(props).map(
      ([k, v]) => `${k}${required.includes(k) ? "*" : ""}: ${v.type || "any"}`
    );
    if (args.length) console.log(`  参数：${args.join("，")}（* 为必填，详情见 call）`);
  }
  console.log(`\n调用示例：node scripts/mcd.mjs call ${tools[0]?.name} '{}'`);
}

async function callTool(name, argsJson) {
  let args = {};
  if (argsJson) {
    try {
      args = JSON.parse(argsJson);
    } catch {
      fail(`参数不是合法 JSON：${argsJson}\n示例：node scripts/mcd.mjs call ${name} '{"keyword":"麦辣"}'`);
    }
  }
  const result = await rpc("tools/call", { name, arguments: args });
  console.log(renderToolResult(result));
}

const RECIPES = {
  account: { tool: "query-my-account", args: {}, desc: "我的账户（积分余额/临期提醒）" },
  deals: { tool: "available-coupons", args: {}, desc: "当前可领优惠券" },
  // query-meals 需要门店上下文：beType*/orderType*/storeCode*；传 JSON 走完整参数，传关键词则先按需补门店
  menu: {
    tool: "query-meals",
    args: (a) => (typeof a === "object" && a !== null ? a : {}),
    desc: "查菜单（需传门店JSON参数，如 '{\"beType\":1,\"orderType\":1,\"storeCode\":\"...\"}'）",
  },
};

function usage() {
  console.log(`麦门全能管家 MCP 客户端

用法：
  node scripts/mcd.mjs tools                 列出全部 MCP 工具及参数
  node scripts/mcd.mjs schema <tool>         查看某工具的完整 inputSchema
  node scripts/mcd.mjs call <tool> '<json>'  调用指定工具
  node scripts/mcd.mjs account               我的账户（积分余额/临期提醒）
  node scripts/mcd.mjs deals                 当前可领优惠券
  node scripts/mcd.mjs calendar              营销活动日历（自动带当天日期）
  node scripts/mcd.mjs menu '<门店JSON参数>'  查菜单（需门店上下文，参数见 tools）

配置：export MCD_MCP_TOKEN=<open.mcd.cn 激活获取>，或在项目根目录 .env 写入。`);
}

/** campaign-calendar 需要 specifiedDate，用 now-time-info 自动获取当天日期 */
async function getTodayArg() {
  const result = await rpc("tools/call", { name: "now-time-info", arguments: {} });
  try {
    const payload = JSON.parse(renderToolResult(result));
    if (payload?.data?.date) return payload.data.date;
  } catch {
    /* 解析失败则不带日期调用 */
  }
  return null;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help") return usage();

  if (!TOKEN) {
    fail("缺少 MCD_MCP_TOKEN。获取方式：open.mcd.cn → 手机号登录 → 控制台 → 激活 → 复制 Token\n然后：export MCD_MCP_TOKEN=<你的Token>，或在项目根目录 .env 写入 MCD_MCP_TOKEN=<你的Token>");
  }

  await initialize();

  switch (cmd) {
    case "tools":
      return listTools();
    case "schema": {
      const toolName = rest[0];
      if (!toolName) return fail("缺少工具名，示例：node scripts/mcd.mjs schema calculate-price");
      const { tools } = await rpc("tools/list", {});
      const t = tools.find((x) => x.name === toolName);
      if (!t) return fail(`工具不存在：${toolName}（用 tools 命令查看全部）`);
      return console.log(JSON.stringify(t, null, 2));
    }
    case "call": {
      const tool = rest[0];
      if (!tool) return fail('缺少工具名，示例：node scripts/mcd.mjs call query-nearby-stores \'{"beType":1,"searchType":1}\'');
      return callTool(tool, rest[1]);
    }
    case "calendar": {
      const date = await getTodayArg();
      return callTool("campaign-calendar", JSON.stringify(date ? { specifiedDate: date } : {}));
    }
    default: {
      const recipe = RECIPES[cmd];
      if (!recipe) return fail(`未知命令：${cmd}\n可用命令：tools, call, calendar, ${Object.keys(RECIPES).join(", ")}`);
      const raw = rest[0];
      const args = typeof recipe.args === "function"
        ? recipe.args(raw && raw.startsWith("{") ? JSON.parse(raw) : raw)
        : recipe.args;
      return callTool(recipe.tool, JSON.stringify(args));
    }
  }
}

/** 供其他脚本导入：调用工具并解析为 JSON（解析失败时返回 { _raw }） */
export async function callToolJson(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = renderToolResult(result);
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

export { initialize, rpc, renderToolResult, ENDPOINT };

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => fail(e.message));
}

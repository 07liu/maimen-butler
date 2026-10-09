#!/usr/bin/env node
/**
 * 麦门每日巡检 —— 一次跑完今日所有"该薅的羊毛"
 *
 * 巡检项：
 *   1. now-time-info      当前时间锚点
 *   2. query-my-account   积分余额与当月临期积分
 *   3. available-coupons  当前可领优惠券
 *   4. campaign-calendar  今日营销活动（specifiedDate 自动取当天）
 *   5. query-lottery-info 积分抽奖机会（只查询，不代抽）
 *
 * 用法：
 *   node scripts/patrol.mjs           # 终端报告
 *   node scripts/patrol.mjs --json    # 输出原始 JSON（便于接定时任务/通知管道）
 *
 * 定时巡检（Roadmap）：Windows 任务计划程序或 cron 每天跑一次即可，例如：
 *   # cron: 每天 9:00 / 21:00 各巡检一次，结果追加到日志
 *   0 9,21 * * *  cd /path/to/maimen-butler && node scripts/patrol.mjs >> patrol.log 2>&1
 *
 * 依赖：MCD_MCP_TOKEN（环境变量或项目根目录 .env），Node >= 18，零第三方依赖。
 */

import { initialize, callToolJson } from "./mcd.mjs";

const wantJson = process.argv.includes("--json");

/** 单项巡检容错包装：失败不拖垮整份报告 */
async function probe(name, fn) {
  try {
    return { name, ok: true, data: await fn() };
  } catch (e) {
    return { name, ok: false, error: String(e?.message || e).slice(0, 120) };
  }
}

const fen2yuan = (fen) => (typeof fen === "number" ? (fen / 100).toFixed(2) : null);

async function collect() {
  const report = { generatedAt: new Date().toISOString(), sections: {} };

  // 1. 时间锚点
  const time = await probe("now-time-info", () => callToolJson("now-time-info", {}));
  const serverNow = time.ok
    ? time.data?.data?.formatted || time.data?.data?.datetime || time.data?.data?.date || null
    : null;
  report.sections.time = time.ok ? { serverNow } : { error: time.error };

  // 2. 积分账户
  const account = await probe("query-my-account", () => callToolJson("query-my-account", {}));
  if (account.ok) {
    const d = account.data?.data || {};
    report.sections.account = {
      availablePoint: d.availablePoint ?? null,
      currentMouthExpirePoint: d.currentMouthExpirePoint ?? null,
      currency: d.currency || "积分",
    };
  } else {
    report.sections.account = { error: account.error };
  }

  // 3. 可领优惠券
  const coupons = await probe("available-coupons", () => callToolJson("available-coupons", {}));
  if (coupons.ok) {
    const list = Array.isArray(coupons.data?.data) ? coupons.data.data : [];
    report.sections.coupons = {
      total: list.length,
      items: list.map((c) => ({ name: c.couponName, label: c.label, status: c.couponStatus })),
    };
  } else {
    report.sections.coupons = { error: coupons.error };
  }

  // 4. 今日活动（campaign-calendar 必传 specifiedDate，用服务器日期兜底本地日期）
  const today =
    (typeof serverNow === "string" && serverNow.slice(0, 10)) ||
    new Date().toLocaleDateString("sv-SE"); // sv-SE => yyyy-MM-dd
  const calendar = await probe("campaign-calendar", () =>
    callToolJson("campaign-calendar", { specifiedDate: today })
  );
  if (calendar.ok) {
    const daily = calendar.data?.data?.dailyList || [];
    const todayEvents = (daily.find((d) => d.today) || daily.find((d) => d.date === today) || {})
      .events || [];
    report.sections.campaigns = {
      date: today,
      total: todayEvents.length,
      items: todayEvents.map((e) => ({
        title: e?.articleDto?.title || e?.activityTitle || "(未命名活动)",
        highlights: e?.articleDto?.highlights || "",
      })),
    };
  } else {
    report.sections.campaigns = { error: calendar.error };
  }

  // 5. 抽奖机会（只读查询；是否可抽以 drawDecision 为准，不从 availableTimes 推断）
  const lottery = await probe("query-lottery-info", () => callToolJson("query-lottery-info", {}));
  if (lottery.ok) {
    const d = lottery.data?.data || {};
    report.sections.lottery = {
      activityName: d.activityName ?? null,
      status: d.activityStatusText ?? null,
      drawType: d.drawTypeText ?? null,
      resourceEligible: d.drawDecision?.resourceEligible ?? null,
      nextConsumption: d.drawDecision?.nextConsumption?.text ?? null,
      reason: d.drawDecision?.reason ?? null,
    };
  } else {
    report.sections.lottery = { error: lottery.error };
  }

  return report;
}

function render(r) {
  const L = [];
  L.push("┌──────────────────────────────────────────────┐");
  L.push("│        🍔 麦门每日巡检 · MaiMen Patrol        │");
  L.push("└──────────────────────────────────────────────┘");
  L.push(`巡检时间：${r.sections.time?.serverNow || r.generatedAt}`);
  L.push("");

  const acc = r.sections.account;
  L.push("💰 积分账户");
  if (acc.error) {
    L.push(`  ✗ 查询失败：${acc.error}`);
  } else {
    L.push(`  可用积分：${acc.availablePoint ?? "-"} ${acc.currency}`);
    const exp = Number(acc.currentMouthExpirePoint || 0);
    L.push(exp > 0
      ? `  ⚠️ 本月即将过期：${acc.currentMouthExpirePoint} 分 → 快去积分商城兑换！`
      : "  本月无临期积分，安心 ✅");
  }
  L.push("");

  const cp = r.sections.coupons;
  L.push("🎫 可领优惠券");
  if (cp.error) {
    L.push(`  ✗ 查询失败：${cp.error}`);
  } else if (!cp.total) {
    L.push("  当前没有可领的券");
  } else {
    L.push(`  共 ${cp.total} 张可领：`);
    for (const c of cp.items.slice(0, 10)) L.push(`  · ${c.name}${c.label ? `（${c.label}）` : ""}`);
    if (cp.total > 10) L.push(`  … 以及另外 ${cp.total - 10} 张`);
    L.push("  👉 对管家说「把能领的券都领了」即可一键领取");
  }
  L.push("");

  const cm = r.sections.campaigns;
  L.push(`🎁 今日活动（${cm.date || "今天"}）`);
  if (cm.error) {
    L.push(`  ✗ 查询失败：${cm.error}`);
  } else if (!cm.total) {
    L.push("  今天没有活动，明天再来看看");
  } else {
    for (const e of cm.items.slice(0, 8)) {
      L.push(`  · ${e.title}${e.highlights ? ` —— ${e.highlights}` : ""}`);
    }
    if (cm.total > 8) L.push(`  … 共 ${cm.total} 个，已列前 8 个`);
  }
  L.push("");

  const lt = r.sections.lottery;
  L.push("🎰 积分抽奖");
  if (lt.error) {
    L.push(`  ✗ 查询失败：${lt.error}`);
  } else if (!lt.activityName) {
    L.push("  当前没有进行中的抽奖活动");
  } else {
    L.push(`  活动：${lt.activityName}（${lt.status || "状态未知"}）`);
    if (lt.resourceEligible) {
      L.push(`  ✅ 可以参与：${lt.nextConsumption || lt.drawType || ""}（抽奖消耗权益，请让管家先征得你同意再抽）`);
    } else {
      L.push(`  ⛔ 暂不可参与：${lt.reason || "资源不足"}`);
    }
  }
  L.push("");
  L.push("—— 以上信息来自麦当劳官方 MCP 实时返回，以官方渠道为准 ——");
  return L.join("\n");
}

async function main() {
  await initialize();
  const report = await collect();
  if (wantJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(render(report));
  }
}

main();

#!/usr/bin/env node
/**
 * 麦门比价器 —— 同一门店、多组组合，批量权威核价，直接告诉你买哪个最划算
 *
 * 菜单接口不展示价格，唯一可信的报价来自 calculate-price。本脚本把
 * "单点 vs 套餐 vs 用券" 的候选组合一次性算完，按券后价排序输出。
 *
 * 用法：
 *   node scripts/compare.mjs --store <storeCode> '<组合JSON>'
 *   node scripts/compare.mjs --city 北京 --keyword 中关村 '<组合JSON>'   # 自动选营业中门店
 *
 * 组合 JSON 格式（数组，每项一组候选）：
 *   [
 *     { "name": "巨无霸单点", "items": [{ "productCode": "1100", "quantity": 1 }] },
 *     { "name": "用券版",     "items": [{ "productCode": "1100", "quantity": 1, "couponId": "xxx" }] }
 *   ]
 *   items 字段与 calculate-price 的入参一致（productCode/quantity 必填，couponId/couponCode 选填）。
 *
 * 可选参数：
 *   --beType <1|2|5|6>   业务类型，默认 1（到店自取）；外送/得来速/团餐需另传 --beCode
 *   --orderType <1|2>    订单类型，默认 1
 *   --beCode <code>      得来速/外送/团餐场景必传
 *   --json               输出原始 JSON
 *
 * 依赖：MCD_MCP_TOKEN（环境变量或项目根目录 .env），Node >= 18，零第三方依赖。
 */

import { initialize, callToolJson } from "./mcd.mjs";

function parseArgs(argv) {
  const opts = { beType: 1, orderType: 1, json: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--store") opts.store = argv[++i];
    else if (a === "--city") opts.city = argv[++i];
    else if (a === "--keyword") opts.keyword = argv[++i];
    else if (a === "--beType") opts.beType = Number(argv[++i]);
    else if (a === "--orderType") opts.orderType = Number(argv[++i]);
    else if (a === "--beCode") opts.beCode = argv[++i];
    else positional.push(a);
  }
  opts.combosJson = positional[0];
  return opts;
}

function usage() {
  console.log(`麦门比价器 · 多组合权威核价

用法：
  node scripts/compare.mjs --store <storeCode> '<组合JSON>'
  node scripts/compare.mjs --city <城市> --keyword <商圈> '<组合JSON>'

组合 JSON 示例：
  '[{"name":"巨无霸单点","items":[{"productCode":"1100","quantity":1}]},
    {"name":"巨无霸x2","items":[{"productCode":"1100","quantity":2}]}]'

可选：--beType 1|2|5|6（默认1） --orderType 1|2（默认1） --beCode <code> --json`);
}

/** 通过城市+商圈自动选一家营业中的门店（到店自取场景） */
async function resolveStore(opts) {
  if (opts.store) return { storeCode: opts.store, storeName: opts.store };
  if (!opts.city) return null;
  const res = await callToolJson("query-nearby-stores", {
    beType: opts.beType,
    searchType: 2,
    city: opts.city,
    keyword: opts.keyword || "",
  });
  const list = res?.data || [];
  const store = list.find((s) => s.businessStatus) || list[0];
  return store ? { storeCode: store.storeCode, storeName: store.storeName } : null;
}

const yuan = (fen) => (typeof fen === "number" ? `¥${(fen / 100).toFixed(2)}` : "-");

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.combosJson) {
    usage();
    process.exit(1);
  }

  let combos;
  try {
    combos = JSON.parse(opts.combosJson);
    if (!Array.isArray(combos) || !combos.length) throw new Error("空数组");
  } catch {
    console.error("✗ 组合 JSON 解析失败，需要非空数组。示例见 --help（不带参数运行）。");
    process.exit(1);
  }

  await initialize();

  const store = await resolveStore(opts);
  if (!store) {
    console.error("✗ 未找到门店：请用 --store 指定 storeCode，或检查 --city/--keyword。");
    process.exit(1);
  }

  const rows = [];
  for (const combo of combos) {
    const name = combo.name || "(未命名组合)";
    try {
      const args = {
        beType: opts.beType,
        orderType: opts.orderType,
        storeCode: store.storeCode,
        items: combo.items,
      };
      if (opts.beCode) args.beCode = opts.beCode;
      const priced = await callToolJson("calculate-price", args);
      const d = priced?.data || {};
      rows.push({
        name,
        price: typeof d.price === "number" ? d.price : null,
        originalPrice: typeof d.originalPrice === "number" ? d.originalPrice : null,
        discount: typeof d.discount === "number" ? d.discount : null,
        deliveryPrice: typeof d.deliveryPrice === "number" ? d.deliveryPrice : null,
        products: (d.productList || []).map((p) => `${p.productName}x${p.quantity}`),
        note: typeof d.price === "number" ? "" : priced?.message || "核价失败",
      });
    } catch (e) {
      rows.push({ name, price: null, note: String(e?.message || e).slice(0, 80) });
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ store, generatedAt: new Date().toISOString(), rows }, null, 2));
    return;
  }

  const valid = rows.filter((r) => typeof r.price === "number");
  const best = valid.length ? Math.min(...valid.map((r) => r.price)) : null;
  const priciest = valid.length ? Math.max(...valid.map((r) => r.price)) : null;

  console.log(`\n🧾 麦门比价 · ${store.storeName}（beType=${opts.beType} orderType=${opts.orderType}）\n`);
  console.log("| 组合 | 内容 | 券后价 | 原价 | 立省 |");
  console.log("|---|---|---|---|---|");
  for (const r of rows) {
    if (typeof r.price !== "number") {
      console.log(`| ${r.name} | - | ✗ ${r.note} | - | - |`);
      continue;
    }
    const saved = r.originalPrice !== null ? r.originalPrice - r.price : null;
    const mark = r.price === best && valid.length > 1 ? " 👑" : "";
    console.log(
      `| ${r.name}${mark} | ${(r.products || []).join("、") || "-"} | ${yuan(r.price)} | ${yuan(r.originalPrice)} | ${saved ? yuan(saved) : "-"} |`
    );
  }
  if (best !== null && priciest !== null && priciest > best) {
    console.log(
      `\n👑 最优解比最贵方案省 ${yuan(priciest - best)}（-${(((priciest - best) / priciest) * 100).toFixed(0)}%）——价格来自 calculate-price 权威核价，以实际下单为准`
    );
  }
}

main();

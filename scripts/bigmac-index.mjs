#!/usr/bin/env node
/**
 * 巨无霸指数 · The MaiMen Big Mac Index
 *
 * 用麦当劳官方 MCP 实时核价全国各城市中心的巨无霸单价，
 * 生成「巨无霸指数」数据（The Economist 的巨无霸指数，麦门版）。
 *
 * 用法：node scripts/bigmac-index.mjs
 * 输出：终端表格 + docs/bigmac-index.json
 */

import { writeFileSync } from "node:fs";
import { initialize, callToolJson } from "./mcd.mjs";

const CITIES = [
  { city: "北京", keyword: "王府井" },
  { city: "上海", keyword: "人民广场" },
  { city: "广州", keyword: "北京路" },
  { city: "深圳", keyword: "华强北" },
  { city: "成都", keyword: "春熙路" },
  { city: "杭州", keyword: "西湖" },
  { city: "武汉", keyword: "江汉路" },
  { city: "西安", keyword: "钟楼" },
];

/** 巨无霸单品 productCode；个别门店不识别时回退到菜单里现查 */
const BIGMAC_CODE = "1100";

async function findBigmacCode(storeCode) {
  const menu = await callToolJson("query-meals", { beType: 1, orderType: 1, storeCode });
  for (const cat of menu?.data?.categories || []) {
    if (!String(cat.name || "").includes("巨无霸")) continue;
    const single = (cat.meals || []).find(
      (m) => Array.isArray(m.tags) && m.tags.includes("单品")
    );
    if (single) return single.code;
  }
  return null;
}

async function main() {
  await initialize();
  const rows = [];

  for (const { city, keyword } of CITIES) {
    try {
      const stores = await callToolJson("query-nearby-stores", {
        beType: 1,
        searchType: 2,
        city,
        keyword,
      });
      const list = stores?.data || [];
      const store = list.find((s) => s.businessStatus) || list[0];
      if (!store) {
        rows.push({ city, keyword, price: null, note: "未找到门店" });
        continue;
      }

      let code = BIGMAC_CODE;
      let priced = await callToolJson("calculate-price", {
        beType: 1,
        orderType: 1,
        storeCode: store.storeCode,
        items: [{ productCode: code, quantity: 1 }],
      });
      if (!priced?.data?.price) {
        const fallback = await findBigmacCode(store.storeCode);
        if (fallback) {
          code = fallback;
          priced = await callToolJson("calculate-price", {
            beType: 1,
            orderType: 1,
            storeCode: store.storeCode,
            items: [{ productCode: code, quantity: 1 }],
          });
        }
      }

      const fen = priced?.data?.price ?? null;
      rows.push({
        city,
        keyword,
        store: store.storeName,
        price: fen === null ? null : fen / 100,
        note: fen === null ? priced?.message || "核价失败" : "",
      });
      process.stdout.write(`  ${city} ${fen === null ? "✗" : "¥" + fen / 100}\n`);
    } catch (e) {
      rows.push({ city, keyword, price: null, note: e.message.slice(0, 80) });
      process.stdout.write(`  ${city} ✗ ${e.message.slice(0, 60)}\n`);
    }
  }

  const valid = rows.filter((r) => typeof r.price === "number");
  if (valid.length) {
    const prices = valid.map((r) => r.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    for (const r of rows) {
      if (typeof r.price === "number") {
        r.index = +(r.price / min).toFixed(3); // 最便宜城市 = 1.000
        r.vsAvg = +(r.price - avg).toFixed(2);
      }
    }
    console.log(
      `\n巨无霸指数（以最便宜城市 = 1.000）\n  均价 ¥${avg.toFixed(2)}｜最便宜 ¥${min.toFixed(
        2
      )}｜最贵 ¥${max.toFixed(2)}｜价差 ¥${(max - min).toFixed(2)}（${(
        ((max - min) / min) *
        100
      ).toFixed(1)}%）`
    );
  }

  const result = {
    generatedAt: new Date().toISOString(),
    source: "麦当劳官方 MCP calculate-price 实时核价（到店自取，巨无霸单品）",
    disclaimer: "价格随门店/时段/活动波动，仅供参考，不代表官方定价",
    rows,
  };
  writeFileSync(new URL("../docs/bigmac-index.json", import.meta.url), JSON.stringify(result, null, 2));
  console.log("\n已写入 docs/bigmac-index.json");

  console.log("\n| 城市 | 门店 | 巨无霸 | 指数 |");
  console.log("|---|---|---|---|");
  for (const r of rows) {
    console.log(
      `| ${r.city}（${r.keyword}） | ${r.store || "-"} | ${
        r.price === null || r.price === undefined ? "-" : "¥" + r.price.toFixed(2)
      } | ${r.index ?? "-"} |`
    );
  }
}

main();

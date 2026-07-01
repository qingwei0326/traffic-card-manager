/**
 * 号易套餐数据抓取脚本
 *
 * 使用方法：
 * 1. 打开浏览器登录 https://et.haomifi.com
 * 2. 按 F12 → Network → 刷新页面
 * 3. 找到任意一个 API 请求（通常是 /api/ 开头）
 * 4. 右键 → Copy → Copy as cURL
 * 5. 把复制的内容粘贴到下面的 curlCommand 变量中
 *
 * 或者更简单：
 * 1. 登录后按 F12 → Console
 * 2. 输入 document.cookie 回车
 * 3. 复制结果粘贴到下面的 cookie 变量中
 */

const fs = require('fs');
const path = require('path');

// ===== 方式一：从 Console 复制 Cookie =====
// 登录号易后台后，在浏览器 Console 输入 document.cookie 并复制结果
const cookie = ''; // 粘贴到这里

// ===== 方式二：从 Network 面板找到 API 地址 =====
// 登录后刷新，在 Network 里找类似 /api/goods 或 /api/plan 的请求
// 把完整的请求 URL 填到这里（包含域名）
const apiUrl = ''; // 例如: https://et.haomifi.com/api/goods/list

async function fetchPlans() {
  if (!cookie && !apiUrl) {
    console.log('请先填写 cookie 或 apiUrl！');
    console.log('');
    console.log('步骤：');
    console.log('1. 打开浏览器登录 https://et.haomifi.com');
    console.log('2. 按 F12 打开开发者工具');
    console.log('3. 切换到 Console 标签');
    console.log('4. 输入 document.cookie 回车');
    console.log('5. 复制输出结果，粘贴到本文件的 cookie 变量中');
    console.log('6. 重新运行: node fetch-haoyi-plans.js');
    return;
  }

  try {
    // 如果没有指定 API 地址，尝试常见的几个
    const endpoints = apiUrl ? [apiUrl] : [
      'https://et.haomifi.com/api/goods/list',
      'https://et.haomifi.com/api/goods',
      'https://et.haomifi.com/admin/goods/list',
      'https://et.haomifi.com/api/plan/list',
    ];

    let data = null;
    for (const url of endpoints) {
      console.log(`尝试: ${url}`);
      try {
        const resp = await fetch(url, {
          headers: {
            'Cookie': cookie,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          }
        });
        const text = await resp.text();
        console.log(`  状态: ${resp.status}, 长度: ${text.length}`);

        if (resp.ok) {
          try {
            data = JSON.parse(text);
            console.log(`  ✓ 成功获取数据！`);
            break;
          } catch {
            console.log(`  ✗ 不是 JSON，可能是 HTML 登录页`);
          }
        }
      } catch (e) {
        console.log(`  ✗ 请求失败: ${e.message}`);
      }
    }

    if (data) {
      // 保存原始数据
      const outPath = path.join(__dirname, 'haoyi-plans-raw.json');
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`\n原始数据已保存到: ${outPath}`);

      // 解析套餐信息
      const plans = extractPlans(data);
      if (plans.length > 0) {
        const planPath = path.join(__dirname, '..', 'data', 'haoyi-plans-parsed.json');
        fs.writeFileSync(planPath, JSON.stringify(plans, null, 2), 'utf-8');
        console.log(`解析后的套餐数据已保存到: ${planPath}`);
        console.log(`共 ${plans.length} 个套餐`);
        console.log('\n前 5 个套餐预览:');
        plans.slice(0, 5).forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.name} | ${p.carrier} | 月租${p.price}元 | ${p.data} | 优惠期${p.promoPeriod} | 合约期${p.contractPeriod} | ${p.status}`);
        });
      }
    } else {
      console.log('\n未能获取数据。请确认：');
      console.log('1. 你已成功登录号易后台');
      console.log('2. Cookie 是最新的（登录后重新复制）');
      console.log('3. 在 Network 面板找到正确的 API 地址，填入 apiUrl 变量');
    }
  } catch (e) {
    console.error('错误:', e.message);
  }
}

function extractPlans(data) {
  // 尝试从不同的数据结构中提取套餐
  let items = [];

  if (Array.isArray(data)) {
    items = data;
  } else if (data.data && Array.isArray(data.data)) {
    items = data.data;
  } else if (data.data && data.data.list && Array.isArray(data.data.list)) {
    items = data.data.list;
  } else if (data.list && Array.isArray(data.list)) {
    items = data.list;
  } else if (data.result && Array.isArray(data.result)) {
    items = data.result;
  }

  return items.map(item => {
    const name = item.goods_name || item.plan_name || item.name || item.title || '';
    const carrier = parseCarrier(name, item.carrier || item.operator || '');
    const price = extractPrice(name, item.price || item.monthly_price || item.plan_price || '');
    const dataAmount = extractData(name);
    const promoPeriod = extractPromoPeriod(name, item.promo_period || item优惠期 || '');
    const contractPeriod = extractContractPeriod(name, item.contract_period || item.contract || item合约期 || '');
    const status = item.status === 1 || item.status === '上架' || item.is_online ? '在售' : '停售';

    return {
      name,
      carrier,
      price,
      data: dataAmount,
      promoPeriod,
      contractPeriod,
      status,
      raw: item
    };
  }).filter(p => p.name);
}

function parseCarrier(name, carrierStr) {
  const text = name + carrierStr;
  if (/移动|cmcc|mobile/i.test(text)) return '移动';
  if (/联通|cucc|unicom/i.test(text)) return '联通';
  if (/电信|ctcc|telecom/i.test(text)) return '电信';
  if (/广电|cbn/i.test(text)) return '广电';
  return carrierStr || '未知';
}

function extractPrice(name, priceStr) {
  // 从套餐名中提取价格，如 "19元250G" → 19
  const priceMatch = name.match(/(\d+)元/);
  if (priceMatch) return priceMatch[1];
  if (priceStr) {
    const m = String(priceStr).match(/(\d+)/);
    if (m) return m[1];
  }
  return '0';
}

function extractData(name) {
  const dataMatch = name.match(/(\d+)[Gg]/);
  return dataMatch ? dataMatch[1] + 'G' : '';
}

function extractPromoPeriod(name, periodStr) {
  // 从名称中提取优惠期，如 "优惠24个月" → 24个月
  const match = name.match(/优惠(\d+)[个]?月/) || name.match(/(\d+)[个]?月优惠/);
  if (match) return match[1] + '个月';
  if (periodStr) return String(periodStr);
  return '';
}

function extractContractPeriod(name, periodStr) {
  const match = name.match(/合约(\d+)[个]?月/) || name.match(/(\d+)[个]?月合约/) || name.match(/协议(\d+)[个]?月/);
  if (match) return match[1] + '个月';
  if (periodStr) return String(periodStr);
  return '';
}

fetchPlans();

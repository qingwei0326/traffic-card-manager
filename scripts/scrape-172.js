/**
 * 172号卡平台套餐抓取脚本
 *
 * 使用方法：
 *   node scripts/scrape-172.js
 *
 * 流程（和号易一样全自动）：
 *   1. 打开Chrome → 你手动登录
 *   2. 登录后按 Enter → 自动导航到商品列表、翻页抓取
 *   3. 输出 data/172-plans.json
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'https://haoka.lot-ml.com';
const LOGIN_URL = BASE_URL + '/view/iframe.html';
const PRO_LIST_URL = BASE_URL + '/view/project/pro_list.html';
const OUTPUT_FILE = path.join(__dirname, '..', 'data', '172-plans.json');

async function main() {
  console.log('正在启动 Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  await page.goto(LOGIN_URL);

  console.log('');
  console.log('========================================');
  console.log('  请在浏览器中登录172后台');
  console.log('  登录完成后，在这里按 Enter 继续');
  console.log('========================================');

  await new Promise(resolve => process.stdin.once('data', resolve));

  // 直接导航到商品列表页
  console.log('\n导航到商品列表...');
  await page.goto(PRO_LIST_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // 找内容frame（pro_list.html 加载后的frame）
  let contentFrame = null;
  const frames = page.frames();
  console.log(`共 ${frames.length} 个frame`);

  for (let i = 0; i < frames.length; i++) {
    try {
      const url = frames[i].url();
      console.log(`  frame[${i}] ${url.substring(0, 80)}`);
      if (url.includes('pro_list') || url.includes('order_list')) {
        contentFrame = frames[i];
        console.log(`    ✓ 选择此frame`);
      }
    } catch (e) {}
  }

  if (!contentFrame) {
    // 兜底：找包含表格的frame
    for (let i = frames.length - 1; i >= 0; i--) {
      try {
        const hasTable = await frames[i].evaluate(() => {
          return document.querySelectorAll('table').length > 0 || document.querySelectorAll('.layui-table').length > 0;
        });
        if (hasTable) {
          contentFrame = frames[i];
          console.log(`  ✓ 兜底选择 frame[${i}] (有表格)`);
          break;
        }
      } catch (e) {}
    }
  }

  if (!contentFrame) {
    console.log('\n未找到商品列表frame，请在浏览器中手动打开商品列表，然后按 Enter');
    await new Promise(resolve => process.stdin.once('data', resolve));
    // 重新找
    const frames2 = page.frames();
    for (let i = frames2.length - 1; i >= 0; i--) {
      try {
        await frames2[i].evaluate(() => 1);
        contentFrame = frames2[i];
      } catch (e) {}
    }
  }

  // ===== 翻页抓取所有套餐 =====
  console.log('\n===== 开始抓取套餐 =====\n');

  const allPlans = [];
  let pageNum = 1;
  const MAX_PAGES = 100;

  while (pageNum <= MAX_PAGES) {
    console.log(`第${pageNum}页...`);
    await new Promise(r => setTimeout(r, 2000));

    // layui表格解析（直接读hidden span，不用点弹窗）
    const pagePlans = await contentFrame.evaluate(() => {
      const plans = [];

      const rows = document.querySelectorAll('.layui-table tbody tr, table tbody tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) continue;

        const cellTexts = Array.from(cells).map(c => (c.innerText || c.textContent || '').trim());

        const code = cellTexts[0] || '';
        if (!code || !/^\d+$/.test(code)) continue;

        const nameRaw = cellTexts[2] || '';
        const carrier = cellTexts[4] || '';
        const keywords = cellTexts[5] || '';
        const region = cellTexts[6] || '';
        const commission = cellTexts[7] || '';
        const status = cellTexts[8] || '';
        const subStatus = cellTexts[9] || '';
        const addTime = cellTexts[11] || '';
        const isFeatured = cellTexts[12] || '';

        // 从名称提取套餐名
        const nameLines = nameRaw.split('\n').map(l => l.trim());
        const planName = nameLines[0] || '';

        // 直接读hidden span获取详情（数据已在HTML中，只是display:none）
        const forbidEl = document.getElementById('views' + code);
        const forbidRegions = forbidEl ? forbidEl.innerText.trim() : '';

        const taocanEl = document.getElementById('taocans' + code);
        const taocanDetail = taocanEl ? taocanEl.innerText.trim() : '';

        const rulesEl = document.getElementById('rules' + code);
        const settlementRules = rulesEl ? rulesEl.innerText.trim() : '';

        // 年龄限制
        let ageLimit = '';
        const ageLine = nameLines.find(l => l.includes('年龄'));
        if (ageLine) {
          const m = ageLine.match(/年龄[：:]\s*(.+)/);
          if (m) ageLimit = m[1];
        }

        // 佣金提取
        let commissionAmount = '';
        let commissionType = '';
        const commMatch = commission.match(/¥([\d.]+)\((.+?)\)/);
        if (commMatch) {
          commissionAmount = commMatch[1];
          commissionType = commMatch[2];
        }

        // 运营商
        let finalCarrier = carrier;
        if (!finalCarrier) {
          if (/移动/.test(planName)) finalCarrier = '移动';
          else if (/联通/.test(planName)) finalCarrier = '联通';
          else if (/电信/.test(planName)) finalCarrier = '电信';
          else if (/广电/.test(planName)) finalCarrier = '广电';
        }

        // 价格/流量/通话
        let price = '';
        const priceMatch = planName.match(/(\d+)元/);
        if (priceMatch) price = priceMatch[1];

        let dataAmount = '';
        const dataMatch = planName.match(/(\d+)[Gg]/);
        if (dataMatch) dataAmount = dataMatch[1] + 'G';

        let voice = '';
        const voiceMatch = planName.match(/(\d+)分钟/);
        if (voiceMatch) voice = voiceMatch[1] + '分钟';

        plans.push({
          code,
          name: planName,
          carrier: finalCarrier,
          price,
          data: dataAmount,
          voice,
          keywords,
          region,
          commission: commissionAmount,
          commissionType,
          status,
          subStatus,
          forbidRegions,
          ageLimit,
          taocanDetail,
          settlementRules,
          addTime,
          isFeatured,
        });
      }

      return plans;
    });

    allPlans.push(...pagePlans);
    console.log(`  本页 ${pagePlans.length} 条，累计 ${allPlans.length} 条`);

    if (pagePlans.length === 0 && pageNum > 1) {
      console.log('  无数据，停止');
      break;
    }

    // 翻页（layui分页）
    const hasNext = await contentFrame.evaluate(() => {
      // layui分页：找"下一页"或 ">"
      const nextBtns = document.querySelectorAll('.layui-laypage-next, .layui-laypage a[href*="next"]');
      for (const btn of nextBtns) {
        const t = (btn.innerText || btn.textContent || '').trim();
        if (t === '下一页' || t === '>' || t === '›' || t === '»' || t === '') {
          // 检查是否禁用
          if (!btn.classList.contains('layui-disabled') && !btn.disabled) {
            btn.click();
            return true;
          }
        }
      }

      // 找页码
      const pagerItems = document.querySelectorAll('.layui-laypage a, .layui-laypage span');
      let activePage = null;
      for (const item of pagerItems) {
        if (item.classList.contains('layui-laypage-curr') || item.classList.contains('layui-this')) {
          activePage = parseInt(item.innerText);
          break;
        }
      }
      if (activePage) {
        for (const item of pagerItems) {
          if (parseInt(item.innerText) === activePage + 1 && !item.classList.contains('layui-disabled')) {
            item.click();
            return true;
          }
        }
      }

      // 兜底：找 > 按钮
      const allLinks = document.querySelectorAll('a, span, button');
      for (const el of allLinks) {
        const t = (el.innerText || '').trim();
        if (t === '>' && !el.classList.contains('layui-disabled')) {
          el.click();
          return true;
        }
      }

      return false;
    });

    if (!hasNext) {
      console.log('  没有下一页');
      break;
    }

    pageNum++;
    await new Promise(r => setTimeout(r, 2500));
  }

  // 保存结果
  console.log(`\n共抓取 ${allPlans.length} 个套餐`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPlans, null, 2), 'utf-8');
  console.log(`已保存到: ${OUTPUT_FILE}`);

  // 打印预览
  console.log('\n前5条预览:');
  allPlans.slice(0, 5).forEach((p, i) => {
    console.log(`  ${i + 1}. [${p.code}] ${p.name.substring(0, 35)} | ${p.carrier} | ${p.price}元 | ${p.data} | ${p.status}`);
    if (p.forbidRegions) console.log(`     禁发: ${p.forbidRegions}`);
    if (p.taocanDetail) console.log(`     套餐: ${p.taocanDetail.substring(0, 60)}`);
    if (p.settlementRules) console.log(`     规则: ${p.settlementRules.substring(0, 60)}`);
  });

  await browser.close();
  console.log('\n完成');
}

main().catch(e => {
  console.error('错误:', e.message);
  process.exit(1);
});

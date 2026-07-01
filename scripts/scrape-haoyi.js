/**
 * 号易套餐详情自动抓取脚本 v5
 * 使用文本分割方式提取数据，不依赖CSS选择器
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIST_URL = 'https://et.haomifi.com/admin/goods?ref=addtabs';
const DETAIL_BASE = 'https://my.86hk.vip/#/pages/other/document?goods_id=';
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'haoyi-plans-detail.json');

async function main() {
  console.log('正在启动 Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  await page.goto(LIST_URL);

  console.log('');
  console.log('========================================');
  console.log('  请在浏览器中登录号易后台');
  console.log('  登录完成后，在这里按 Enter 继续');
  console.log('========================================');

  await new Promise(resolve => process.stdin.once('data', resolve));

  console.log('刷新页面...');
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  // ===== 找到包含数据的frame =====
  let contentFrame = null;
  const frames = page.frames();
  console.log(`共 ${frames.length} 个frame`);

  for (let i = 0; i < frames.length; i++) {
    try {
      const text = await frames[i].evaluate(() => document.body?.innerText?.substring(0, 800) || '');
      const hasData = text.includes('商品编码') || text.includes('74096148') || text.includes('商品信息') || text.includes('青微号卡') || text.includes('号卡');
      console.log(`  frame[${i}] ${frames[i].url().substring(0, 60)} → ${hasData ? '✓ 找到数据!' : text.substring(0, 50)}`);
      if (hasData) {
        contentFrame = frames[i];
        break;
      }
    } catch (e) {
      console.log(`  frame[${i}] 无法访问`);
    }
  }

  if (!contentFrame) {
    console.log('\n所有frame都无法访问，尝试主页面...');
    contentFrame = page;
  }

  // ===== 第一步：翻页抓取所有套餐 =====
  console.log('\n===== 第一步：抓取套餐列表 =====\n');

  const allTexts = [];
  let pageNum = 1;

  while (pageNum <= 35) {
    console.log(`第${pageNum}页...`);

    // 等待页面稳定
    await new Promise(r => setTimeout(r, 2000));

    // 获取整个body的文本
    const bodyText = await contentFrame.evaluate(() => document.body?.innerText || '');
    allTexts.push(bodyText);

    // 检查是否有下一页
    const hasNext = await contentFrame.evaluate(() => {
      // 找分页区域的"下一页"或页码
      const allText = document.body.innerText;
      // 找"下一页"按钮
      const btns = document.querySelectorAll('button, a, span, li');
      for (const btn of btns) {
        const t = btn.textContent.trim();
        if (t === '下一页' || t === '>' || t === '›') {
          if (!btn.disabled && !btn.classList?.contains('disabled')) {
            btn.click();
            return true;
          }
        }
      }
      // 找页码
      const pagerItems = document.querySelectorAll('.el-pager li, [class*="pager"] li, [class*="page"] li');
      const active = document.querySelector('.el-pager .active, [class*="pager"] .active, [class*="page"] .active');
      if (active) {
        const cur = parseInt(active.textContent);
        for (const item of pagerItems) {
          if (parseInt(item.textContent) === cur + 1) {
            item.click();
            return true;
          }
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

  // 合并所有页的文本并解析
  const fullText = allTexts.join('\n===PAGE===\n');

  // 文本结构: ...查看资料\n\n74096149\n套餐名\n...\n抓单编码:XXX\n佣金\n...\n查看资料\n\n74096150\n...
  // 用8位数字编码分割，每个编码前面是上一个套餐的佣金/备注，后面是当前套餐的名称/详情
  const plans = [];
  const allLines = fullText.split('\n');

  // 找到所有8位编码的位置
  const codePositions = [];
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].trim().match(/^\d{8}$/)) {
      codePositions.push(i);
    }
  }

  console.log(`找到 ${codePositions.length} 个商品编码`);

  for (let idx = 0; idx < codePositions.length; idx++) {
    const codeLine = codePositions[idx];
    const code = allLines[codeLine].trim();

    // 套餐名在编码下一行
    const nameLine = (codeLine + 1 < allLines.length) ? allLines[codeLine + 1].trim() : '';

    // 从编码行往后找抓单编码
    let grabCode = '';
    let commission = '';
    let subCommission = '';
    let note = '';
    let rule = '';
    let restrictedRegion = '';

    // 往后找最多15行
    for (let j = codeLine + 1; j < Math.min(codeLine + 20, allLines.length); j++) {
      const line = allLines[j].trim();
      if (line.match(/抓单编码:(\d+)/)) {
        grabCode = line.match(/抓单编码:(\d+)/)[1];
      }
    }

    // 佣金在编码前面的区域（上一个套餐的按钮和这个编码之间）
    const prevEnd = idx > 0 ? codePositions[idx - 1] : 0;
    for (let j = codeLine - 1; j >= Math.max(prevEnd, codeLine - 15); j--) {
      const line = allLines[j].trim();
      if (line.match(/^\d+元$/) && !commission) {
        commission = line;
      } else if (line.match(/^\d+元$/) && commission && !subCommission) {
        subCommission = line;
      }
      if (line.startsWith('商品备注：')) {
        note = line.replace('商品备注：', '').trim();
      }
      if (line.startsWith('结算规则：')) {
        rule = line.replace('结算规则：', '').trim();
      }
      if (line.match(/只发[：:](.+)/)) {
        restrictedRegion = line.match(/只发[：:](.+)/)[1].trim();
      }
    }

    plans.push({
      code,
      name: nameLine,
      grabCode,
      commission,
      subCommission,
      note,
      rule,
      restrictedRegion,
      fullBlock: ''
    });
  }

  console.log(`解析出 ${plans.length} 个套餐\n`);

  // 输出套餐列表
  plans.forEach((p, i) => {
    console.log(`${i + 1}. [${p.code}] ${p.name.substring(0, 40)} (抓单:${p.grabCode})`);
  });

  // ===== 第二步：逐个抓取详情 =====
  console.log('\n===== 第二步：抓取详情页 =====\n');

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    if (!plan.grabCode) continue;

    process.stdout.write(`[${i + 1}/${plans.length}] ${plan.name.substring(0, 25)}... `);

    try {
      const dp = await browser.newPage();
      await dp.goto(DETAIL_BASE + plan.grabCode, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 2000));

      // 滚动到底部加载全部内容
      await dp.evaluate(async () => {
        const delay = ms => new Promise(r => setTimeout(r, ms));
        for (let i = 0; i < 10; i++) {
          window.scrollBy(0, 500);
          await delay(300);
        }
        // 回到顶部再滚一次确保加载
        window.scrollTo(0, 0);
        await delay(500);
        for (let i = 0; i < 15; i++) {
          window.scrollBy(0, 600);
          await delay(300);
        }
      });
      await new Promise(r => setTimeout(r, 1000));

      plan.detail = await dp.evaluate(() => document.body?.innerText?.trim() || '');
      console.log(`✓ ${plan.detail.length}字`);
      await dp.close();
    } catch (e) {
      console.log(`✗`);
      plan.detail = '';
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // ===== 第三步：解析 =====
  console.log('\n===== 第三步：解析 =====\n');

  for (const plan of plans) {
    const all = (plan.detail || '') + '\n' + (plan.fullBlock || '');

    // 优惠期 - 多种匹配
    let promoPeriod = 0;
    let m;
    if ((m = all.match(/连续赠送\s*(\d+)\s*个月/))) promoPeriod = parseInt(m[1]);
    else if ((m = all.match(/有效期[：:]?\s*(\d+)\s*个月/))) promoPeriod = parseInt(m[1]);
    else if ((m = all.match(/有效期[：:]?\s*(\d+)\s*年/))) promoPeriod = parseInt(m[1]) * 12;
    else if ((m = all.match(/赠送.*?(\d+)\s*个月/))) promoPeriod = parseInt(m[1]);
    else if ((m = all.match(/(\d+)\s*个月.*?优惠/))) promoPeriod = parseInt(m[1]);
    else if ((m = all.match(/(\d+)-(\d+)\s*个月/))) promoPeriod = parseInt(m[2]);
    else if (/首年/.test(plan.name)) promoPeriod = 12;
    else if ((m = plan.name.match(/(\d)\s*年套餐/))) promoPeriod = parseInt(m[1]) * 12;
    else if ((m = all.match(/(\d+)\s*年/)) && parseInt(m[1]) <= 10) promoPeriod = parseInt(m[1]) * 12;
    plan.promoPeriod = promoPeriod;

    // 合约期
    let contractPeriod = 0;
    if ((m = all.match(/合约期[：:]?\s*(\d+)[个]?月/))) contractPeriod = parseInt(m[1]);
    else if ((m = all.match(/协议期[：:]?\s*(\d+)[个]?月/))) contractPeriod = parseInt(m[1]);
    plan.contractPeriod = contractPeriod;

    // 首充
    let firstCharge = 0;
    if ((m = all.match(/首充.*?(\d+)元/))) firstCharge = parseInt(m[1]);
    else if ((m = all.match(/充值.*?(\d+)元/))) firstCharge = parseInt(m[1]);
    else if ((m = all.match(/预存.*?(\d+)元/))) firstCharge = parseInt(m[1]);
    plan.firstCharge = firstCharge;

    // 办卡年龄
    const ageMatch = all.match(/办卡年龄[：:]?\s*(\d+)[\-~到至]*(\d*)/);
    plan.ageLimit = ageMatch ? (ageMatch[2] ? ageMatch[1] + '-' + ageMatch[2] : ageMatch[1] + '+') : '';

    // 禁发地区
    const forbidMatch = all.match(/不发货地区[：:]?\s*([\s\S]*?)(?:充值|激活|注意|$)/);
    plan.forbidRegions = forbidMatch ? forbidMatch[1].trim().substring(0, 100) : '';

    // 快递方式
    const expressMatch = all.match(/快递方式[：:]?\s*(.+?)(?:\n|$)/);
    plan.express = expressMatch ? expressMatch[1].trim() : '';

    // 月租 & 流量
    const priceMatch = plan.name.match(/(\d+)元/);
    plan.monthlyPrice = priceMatch ? priceMatch[1] + '元' : '';
    const dataMatch = plan.name.match(/(\d+)[Gg]/);
    plan.dataAmount = dataMatch ? dataMatch[1] + 'G' : '';

    // 运营商
    if (/移动/.test(plan.name)) plan.carrier = '移动';
    else if (/联通/.test(plan.name)) plan.carrier = '联通';
    else if (/电信/.test(plan.name)) plan.carrier = '电信';
    else if (/广电/.test(plan.name)) plan.carrier = '广电';
    else plan.carrier = '未知';

    console.log(`${plan.name.substring(0, 35)} | ${plan.monthlyPrice} ${plan.dataAmount} | 优惠:${plan.promoPeriod}月 | 合约:${plan.contractPeriod}月 | 首充:${plan.firstCharge}元 | 年龄:${plan.ageLimit || '?'}`);
  }

  // 保存
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(plans, null, 2), 'utf-8');
  console.log(`\n已保存: ${OUTPUT_FILE} (${plans.length}个套餐)`);

  await browser.close();
  console.log('完成');
}

main().catch(e => {
  console.error('错误:', e.message);
  process.exit(1);
});

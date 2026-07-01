/**
 * 号易套餐在售状态抓取脚本
 * 只抓列表页的在售/停售状态，不抓详情
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIST_URL = 'https://et.haomifi.com/admin/goods?ref=addtabs';
const OUTPUT_FILE = path.join(__dirname, '..', 'haoyi-plans-status.json');

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

  // 等待用户登录
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // 找到内容 iframe
  let contentFrame = null;
  await new Promise(r => setTimeout(r, 3000));
  const frames = page.frames();
  for (const frame of frames) {
    const url = frame.url();
    if (url.includes('haomifi.com/admin/goods')) {
      contentFrame = frame;
      break;
    }
  }
  if (!contentFrame) contentFrame = page;

  console.log('\n开始抓取在售状态...\n');

  const statusMap = {};
  let pageNum = 1;

  while (pageNum <= 35) {
    console.log(`第${pageNum}页...`);
    await new Promise(r => setTimeout(r, 2000));

    // 获取表格 HTML 来查找状态
    const pageData = await contentFrame.evaluate(() => {
      const rows = document.querySelectorAll('.el-table__row, tr');
      const items = [];
      for (const row of rows) {
        const text = row.innerText || '';
        // 找8位数字编码
        const codeMatch = text.match(/\b(\d{8})\b/);
        if (!codeMatch) continue;

        const code = codeMatch[1];

        // 检查行内是否有"上架"/"下架"/"在售"/"停售"等状态
        let status = '在售';
        if (text.includes('下架') || text.includes('停售') || text.includes('已停')) {
          status = '停售';
        }

        // 也检查按钮文本来判断状态
        const buttons = row.querySelectorAll('button, a, span');
        for (const btn of buttons) {
          const btnText = btn.innerText || btn.textContent || '';
          if (btnText.includes('下架')) {
            status = '在售'; // 有"下架"按钮说明当前是在售
          }
          if (btnText.includes('上架')) {
            status = '停售'; // 有"上架"按钮说明当前是停售
          }
        }

        items.push({ code, status });
      }
      return items;
    });

    for (const item of pageData) {
      statusMap[item.code] = item.status;
    }
    console.log(`  本页 ${pageData.length} 条，累计 ${Object.keys(statusMap).length} 条`);

    // 翻页
    const hasNext = await contentFrame.evaluate(() => {
      const btns = document.querySelectorAll('button, a, span, li');
      for (const btn of btns) {
        const t = (btn.innerText || btn.textContent || '').trim();
        if (t === '>' || t === '下一页' || t === '»') {
          if (!btn.disabled && !btn.classList.contains('is-disabled')) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    });

    if (!hasNext) {
      console.log('没有下一页了');
      break;
    }
    pageNum++;
    await new Promise(r => setTimeout(r, 2000));
  }

  // 保存结果
  const result = Object.entries(statusMap).map(([code, status]) => ({ code, status }));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\n完成！共 ${result.length} 条状态已保存到 ${OUTPUT_FILE}`);
  console.log(`在售: ${result.filter(r => r.status === '在售').length}`);
  console.log(`停售: ${result.filter(r => r.status === '停售').length}`);

  await browser.close();
}

main().catch(console.error);

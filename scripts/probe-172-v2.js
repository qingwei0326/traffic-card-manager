/**
 * 172平台商品列表页面结构探测 v2
 * 直接导航到商品列表，分析表格结构
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'https://haoka.lot-ml.com';
const LOGIN_URL = BASE_URL + '/view/iframe.html';
const PRO_LIST_URL = BASE_URL + '/view/project/pro_list.html';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  await page.goto(LOGIN_URL);

  console.log('请登录172后台，登录完成后按 Enter...');
  await new Promise(r => process.stdin.once('data', r));

  // 直接导航到商品列表
  console.log('\n直接打开商品列表页面...');
  await page.goto(PRO_LIST_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // 截图
  await page.screenshot({ path: path.join(__dirname, '172-pro-list.png'), fullPage: true });
  console.log('截图: scripts/172-pro-list.png');

  // 分析所有frame
  const frames = page.frames();
  console.log(`共 ${frames.length} 个frame\n`);

  for (let i = 0; i < frames.length; i++) {
    try {
      const url = frames[i].url();
      console.log(`--- frame[${i}] ---`);
      console.log(`URL: ${url}`);

      const info = await frames[i].evaluate(() => {
        const body = document.body;
        if (!body) return null;

        const title = document.title || '';

        // iframe
        const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
          src: f.src || f.id || '',
          id: f.id || '',
        }));

        // 表格结构
        const tables = [];
        document.querySelectorAll('table, .el-table').forEach(t => {
          const headers = Array.from(t.querySelectorAll('th')).map(th => (th.innerText || '').trim()).filter(Boolean);
          const rows = t.querySelectorAll('tbody tr, .el-table__row');
          const sampleRow = rows.length > 0 ? Array.from(rows[0].querySelectorAll('td')).map(td => (td.innerText || '').trim()) : [];
          tables.push({ headers, rowCount: rows.length, sampleRow });
        });

        // 分页
        const pager = document.querySelector('.el-pagination, [class*="pager"]');
        const pagerText = pager ? pager.innerText : '';

        // 搜索框
        const inputs = Array.from(document.querySelectorAll('input')).map(inp => ({
          placeholder: inp.placeholder || '',
          type: inp.type || '',
          name: inp.name || '',
        }));

        // 按钮
        const btns = Array.from(document.querySelectorAll('button, .el-button')).map(b => (b.innerText || '').trim()).filter(Boolean);

        const preview = (body.innerText || '').substring(0, 800);

        return { title, iframes, tables, pagerText, inputs, btns, preview };
      });

      if (!info) {
        console.log('  无法访问');
        continue;
      }

      console.log(`Title: ${info.title}`);
      if (info.iframes.length > 0) {
        console.log(`Iframes: ${JSON.stringify(info.iframes)}`);
      }
      if (info.tables.length > 0) {
        console.log(`表格 (${info.tables.length}个):`);
        info.tables.forEach((t, j) => {
          console.log(`  表格${j + 1}: ${t.rowCount}行`);
          console.log(`    表头: ${t.headers.join(' | ')}`);
          if (t.sampleRow.length > 0) {
            console.log(`    示例行: ${t.sampleRow.join(' | ')}`);
          }
        });
      }
      if (info.pagerText) {
        console.log(`分页: ${info.pagerText.replace(/\n/g, ' | ')}`);
      }
      if (info.inputs.length > 0) {
        console.log(`输入框: ${JSON.stringify(info.inputs)}`);
      }
      if (info.btns.length > 0) {
        console.log(`按钮: ${info.btns.join(', ')}`);
      }
      console.log(`预览: ${info.preview.substring(0, 400).replace(/\n/g, ' | ')}`);
      console.log('');

    } catch (e) {
      console.log(`  错误: ${e.message}\n`);
    }
  }

  // 保存完整报告
  const report = [];
  for (let i = 0; i < frames.length; i++) {
    try {
      const info = await frames[i].evaluate(() => {
        return {
          url: location.href,
          title: document.title,
          bodyText: document.body?.innerText?.substring(0, 2000) || '',
          html: document.body?.innerHTML?.substring(0, 5000) || '',
        };
      });
      report.push(`=== frame[${i}] ===`);
      report.push(`URL: ${info.url}`);
      report.push(`Title: ${info.title}`);
      report.push(`Text: ${info.bodyText.substring(0, 500)}`);
      report.push(`HTML: ${info.html.substring(0, 2000)}`);
      report.push('');
    } catch (e) {}
  }

  fs.writeFileSync(path.join(__dirname, '172-pro-list-report.txt'), report.join('\n'), 'utf-8');
  console.log('完整报告: scripts/172-pro-list-report.txt');

  await browser.close();
}

main().catch(e => {
  console.error('错误:', e.message);
  process.exit(1);
});

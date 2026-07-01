/**
 * 172平台商品详情探测脚本
 * 点击"查看资料"或"套餐说明：点击查看"，分析弹窗结构
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

  // 拦截API请求
  const apiCalls = [];
  page.on('response', async resp => {
    const url = resp.url();
    const ct = resp.headers()['content-type'] || '';
    if ((ct.includes('json') || url.includes('api') || url.includes('.php') || url.includes('handler'))
        && !url.includes('.js') && !url.includes('.css')) {
      try {
        const body = await resp.text();
        if (body.length > 20 && body.length < 50000) {
          apiCalls.push({ url, body: body.substring(0, 3000), ts: Date.now() });
        }
      } catch {}
    }
  });

  await page.goto(LOGIN_URL);
  console.log('请登录172后台，登录完成后按 Enter...');
  await new Promise(r => process.stdin.once('data', r));

  console.log('\n打开商品列表...');
  await page.goto(PRO_LIST_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // 找内容frame
  let contentFrame = null;
  for (const frame of page.frames()) {
    try { if (frame.url().includes('pro_list')) { contentFrame = frame; break; } } catch {}
  }
  if (!contentFrame) { console.log('未找到frame'); await browser.close(); return; }

  // 1. 分析按钮结构
  console.log('\n=== 按钮结构分析 ===');
  const btns = await contentFrame.evaluate(() => {
    const results = [];
    const els = document.querySelectorAll('a, button, span, div');
    for (const el of els) {
      const text = (el.innerText || el.textContent || '').trim();
      if (text.includes('查看资料') || text.includes('套餐说明') || text.includes('结算规则')
          || text.includes('点击查看') || text.includes('编辑') || text.includes('专属链接')) {
        results.push({
          tag: el.tagName,
          text: text.substring(0, 80),
          href: el.href || '',
          onclick: el.getAttribute('onclick') || '',
          html: el.outerHTML.substring(0, 400),
        });
        if (results.length >= 8) break;
      }
    }
    return results;
  });

  btns.forEach((b, i) => {
    console.log(`[${i}] <${b.tag}> "${b.text}"`);
    if (b.onclick) console.log(`    onclick: ${b.onclick}`);
    if (b.href) console.log(`    href: ${b.href}`);
    console.log(`    html: ${b.html.substring(0, 200)}`);
  });

  // 2. 点击第一个"查看资料"，看弹窗
  console.log('\n=== 点击"查看资料" ===');
  apiCalls.length = 0;

  const clickTime = Date.now();
  await contentFrame.evaluate(() => {
    const els = document.querySelectorAll('a, button, span');
    for (const el of els) {
      if ((el.innerText || '').trim() === '查看资料') { el.click(); return; }
    }
  });

  await new Promise(r => setTimeout(r, 3000));

  // 截图
  await page.screenshot({ path: path.join(__dirname, '172-detail-popup.png'), fullPage: true });
  console.log('截图: 172-detail-popup.png');

  // 检查所有frame的弹窗
  const frames = page.frames();
  console.log(`\n点击后共 ${frames.length} 个frame`);
  for (let i = 0; i < frames.length; i++) {
    try {
      const url = frames[i].url();
      const text = await frames[i].evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      console.log(`  frame[${i}] ${url.substring(0, 60)}`);
      if (text.length > 20) console.log(`    文本: ${text.substring(0, 300).replace(/\n/g, ' | ')}`);

      // 看有没有表格
      const tableInfo = await frames[i].evaluate(() => {
        const tables = document.querySelectorAll('table, .layui-table');
        return Array.from(tables).map(t => ({
          rows: t.querySelectorAll('tr').length,
          text: (t.innerText || '').substring(0, 500),
        }));
      });
      if (tableInfo.length > 0) {
        tableInfo.forEach((t, j) => {
          console.log(`    表格${j}: ${t.rows}行 → ${t.text.substring(0, 200).replace(/\n/g, ' | ')}`);
        });
      }
    } catch {}
  }

  // 检查layui弹窗（可能在主页面）
  const layuiLayer = await page.evaluate(() => {
    const layers = document.querySelectorAll('.layui-layer, [class*="layui-layer"]');
    return Array.from(layers).map(l => ({
      class: l.className,
      text: (l.innerText || '').substring(0, 1000),
      html: (l.innerHTML || '').substring(0, 2000),
    }));
  });

  if (layuiLayer.length > 0) {
    console.log('\n=== layui弹窗 ===');
    layuiLayer.forEach((l, i) => {
      console.log(`\n弹窗${i}: class="${l.class}"`);
      console.log(`文本: ${l.text.substring(0, 500).replace(/\n/g, ' | ')}`);
    });
  }

  // 3. 打印拦截到的API
  console.log('\n=== 拦截到的API (点击后) ===');
  const newApis = apiCalls.filter(a => a.ts > clickTime);
  newApis.forEach((c, i) => {
    console.log(`\n[${i}] ${c.url}`);
    console.log(`  ${c.body.substring(0, 800)}`);
  });

  if (newApis.length === 0) {
    console.log('  无API调用（可能是前端渲染）');
  }

  // 4. 如果有弹窗，尝试读取内容
  if (layuiLayer.length > 0) {
    const detailContent = layuiLayer[0].text;
    console.log('\n=== 弹窗详情内容 ===');
    console.log(detailContent.substring(0, 2000));
  }

  // 保存报告
  fs.writeFileSync(path.join(__dirname, '172-detail-report.json'), JSON.stringify({
    buttons: btns,
    layuiLayers: layuiLayer,
    apiCalls: newApis,
  }, null, 2), 'utf-8');
  console.log('\n报告: 172-detail-report.json');

  await browser.close();
}

main().catch(e => { console.error('错误:', e.message); process.exit(1); });

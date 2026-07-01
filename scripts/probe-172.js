/**
 * 172平台页面结构探测脚本
 * 登录后自动分析iframe结构、菜单、表格等
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'https://haoka.lot-ml.com/view/iframe.html';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  await page.goto(URL);

  console.log('请登录172后台，登录完成后按 Enter...');
  await new Promise(r => process.stdin.once('data', r));

  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const report = [];

  // 1. 截图
  await page.screenshot({ path: path.join(__dirname, '172-screenshot.png'), fullPage: true });
  report.push('=== 截图已保存: scripts/172-screenshot.png ===\n');

  // 2. 分析所有frame
  const frames = page.frames();
  report.push(`共 ${frames.length} 个frame\n`);

  for (let i = 0; i < frames.length; i++) {
    try {
      const url = frames[i].url();
      report.push(`\n--- frame[${i}] ---`);
      report.push(`URL: ${url}`);

      const info = await frames[i].evaluate(() => {
        const body = document.body;
        if (!body) return { error: 'no body' };

        // 页面标题
        const title = document.title || '';

        // iframe嵌套
        const iframes = document.querySelectorAll('iframe');
        const iframeInfo = Array.from(iframes).map(f => ({
          src: f.src || f.getAttribute('src') || '',
          id: f.id || '',
          name: f.name || '',
        }));

        // 菜单结构
        const menuItems = [];
        const menus = document.querySelectorAll('a, .el-menu-item, .el-submenu__title, [class*="menu"], [class*="nav"]');
        for (const m of menus) {
          const text = (m.innerText || m.textContent || '').trim();
          if (text && text.length < 30 && text.length > 0) {
            menuItems.push({
              tag: m.tagName,
              text,
              class: m.className?.substring(0, 80) || '',
              href: m.href || '',
            });
          }
        }

        // 表格
        const tables = document.querySelectorAll('table, .el-table');
        const tableInfo = Array.from(tables).map(t => {
          const headers = Array.from(t.querySelectorAll('th')).map(th => (th.innerText || '').trim());
          const rowCount = t.querySelectorAll('tbody tr, .el-table__row').length;
          return { headers, rowCount };
        });

        // 按钮/分页
        const pagination = document.querySelectorAll('.el-pagination, [class*="pager"], [class*="pagination"]');
        const paginationInfo = Array.from(pagination).map(p => (p.innerText || '').substring(0, 100));

        // 前200字文本
        const preview = (body.innerText || '').substring(0, 500);

        return {
          title,
          iframes: iframeInfo,
          menuItems: menuItems.slice(0, 30),
          tables: tableInfo,
          pagination: paginationInfo,
          preview,
        };
      });

      report.push(`Title: ${info.title}`);
      if (info.iframes.length > 0) {
        report.push(`Iframes: ${JSON.stringify(info.iframes, null, 2)}`);
      }
      if (info.menuItems.length > 0) {
        report.push(`菜单项 (${info.menuItems.length}):`);
        info.menuItems.forEach(m => report.push(`  [${m.tag}] "${m.text}" class="${m.class}" href="${m.href}"`));
      }
      if (info.tables.length > 0) {
        report.push(`表格: ${JSON.stringify(info.tables, null, 2)}`);
      }
      if (info.pagination.length > 0) {
        report.push(`分页: ${info.pagination.join(' | ')}`);
      }
      report.push(`预览: ${info.preview.substring(0, 300).replace(/\n/g, ' | ')}`);

    } catch (e) {
      report.push(`  无法访问: ${e.message}`);
    }
  }

  // 3. 尝试点击菜单后的变化
  report.push('\n\n=== 尝试点击菜单项 ===');

  for (const frame of frames) {
    try {
      const clicked = await frame.evaluate(() => {
        const items = document.querySelectorAll('a, .el-menu-item, .el-submenu__title, span, li');
        const targets = ['商品管理', '套餐管理', '产品管理', '我的商品', '商品列表'];
        for (const item of items) {
          const text = (item.innerText || item.textContent || '').trim();
          if (targets.some(t => text.includes(t))) {
            item.click();
            return text;
          }
        }
        return null;
      });

      if (clicked) {
        report.push(`点击了: "${clicked}"，等待3秒...`);
        await new Promise(r => setTimeout(r, 3000));

        // 截图看变化
        await page.screenshot({ path: path.join(__dirname, '172-after-click.png'), fullPage: true });
        report.push('截图已保存: scripts/172-after-click.png');

        // 再分析一次所有frame
        const frames2 = page.frames();
        report.push(`点击后共 ${frames2.length} 个frame`);
        for (let i = 0; i < frames2.length; i++) {
          try {
            const url = frames2[i].url();
            const text = await frames2[i].evaluate(() => document.body?.innerText?.substring(0, 300) || '');
            report.push(`  frame[${i}] ${url.substring(0, 60)}`);
            report.push(`    文本: ${text.substring(0, 200).replace(/\n/g, ' | ')}`);

            // 看有没有表格
            const tableInfo = await frames2[i].evaluate(() => {
              const tables = document.querySelectorAll('table, .el-table');
              return Array.from(tables).map(t => ({
                headers: Array.from(t.querySelectorAll('th')).map(th => (th.innerText || '').trim()),
                rows: t.querySelectorAll('tbody tr, .el-table__row').length,
              }));
            });
            if (tableInfo.length > 0) {
              report.push(`    表格: ${JSON.stringify(tableInfo)}`);
            }
          } catch (e) {}
        }
        break;
      }
    } catch (e) {}
  }

  // 写入报告
  const reportPath = path.join(__dirname, '172-structure-report.txt');
  fs.writeFileSync(reportPath, report.join('\n'), 'utf-8');
  console.log(`\n报告已保存到: ${reportPath}`);
  console.log('请把报告内容发给我，我来调整抓取脚本。');

  await browser.close();
}

main().catch(e => {
  console.error('错误:', e.message);
  process.exit(1);
});

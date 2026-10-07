// downloader.js — 多线程下载引擎
// 对应 Python: app/core/downloader.py（精简版，Node 原生实现）

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { Worker, isMainThread, workerData } = require('worker_threads');

let activeTasks = new Map();
let cancelled = false;

function downloadFile(url, dstDir, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const fileName = opts.name || path.basename(u.pathname) || 'download';
    const dst = path.join(dstDir, fileName);
    const tmp = dst + '.part';

    const file = fs.createWriteStream(tmp, { flags: 'w' });
    const timeout = (opts.timeout || 30000) / 1000;

    const req = lib.get(url, {
      headers: { 'User-Agent': opts.userAgent || 'PulsesEasier/0.7' },
      timeout: timeout * 1000,
    }, (res) => {
      // 重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(tmp);
        return downloadFile(res.headers.location, dstDir, opts)
          .then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(tmp);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      let lastReport = 0;

      res.on('data', (chunk) => {
        received += chunk.length;
        const now = Date.now();
        if (now - lastReport > 200) {
          lastReport = now;
          // 进度回调由调用方处理
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        fs.renameSync(tmp, dst);
        resolve({ path: dst, size: received || total, name: fileName });
      });
    });

    req.on('error', (e) => {
      try { file.close(); fs.unlinkSync(tmp); } catch (_) {}
      reject(e);
    });

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
  });
}

module.exports = function (ipcMain, win) {
  // 启动批量下载
  ipcMain.handle('dl:start', async (_e, tasks, opts) => {
    cancelled = false;
    const results = { ok: [], fail: [] };

    for (let i = 0; i < tasks.length; i++) {
      if (cancelled) break;
      const t = tasks[i];
      try {
        // 进度
        if (win) win.webContents.send('dl:progress', {
          index: i, total: tasks.length, name: t.name, url: t.url,
          status: 'downloading',
        });

        const res = await downloadFile(t.url, t.dstDir, {
          ...opts,
          name: t.name,
        });
        results.ok.push(res);

        if (win) win.webContents.send('dl:progress', {
          index: i, total: tasks.length, name: t.name,
          status: 'done', size: res.size,
        });
      } catch (e) {
        results.fail.push({ name: t.name, url: t.url, error: String(e) });
        if (win) win.webContents.send('dl:log', {
          level: 'error', msg: `${t.name}: ${e.message}`,
        });
      }
    }

    if (win) win.webContents.send('dl:done', results);
    return results;
  });

  // 取消
  ipcMain.handle('dl:cancel', () => {
    cancelled = true;
    return true;
  });

  // 磁盘类型探测（简化版）
  ipcMain.handle('dl:disk-type', (_e, p) => {
    // Node 没有直接 API，返回默认值
    return { type: 'ssd', rotational: false };
  });
};

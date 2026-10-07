// eapack.js — 更新包（.eapack / .zip）读取与导出
// 对应 Python: app/core/eapack.py + app/core/pack_info.py

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

// ── 读取 .eapack / .zip 内的特定文件 ──
async function readZipEntry(zipPath, entryName) {
  try {
    const buf = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(buf);
    const entry = zip.file(entryName);
    if (!entry) return null;
    return await entry.async('text');
  } catch (_) { return null; }
}

async function readZipJSON(zipPath, entryName) {
  const text = await readZipEntry(zipPath, entryName);
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return null; }
}

// ── 读取整合包信息 ──
function readModpackInfo(modpackPath) {
  const root = modpackPath;
  const info = { name: path.basename(root), version: '', mods: 0, icon: null };

  // mmc-pack.json / manifest.json
  for (const f of ['mmc-pack.json', 'manifest.json']) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8'));
      if (data.name) info.name = data.name;
      if (data.version) info.version = data.version;
    } catch (_) {}
  }

  // instance.cfg (MMC)
  try {
    const txt = fs.readFileSync(path.join(root, 'instance.cfg'), 'utf-8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^(\w+)=(.+)$/);
      if (m) {
        if (m[1] === 'name' && !info.name) info.name = m[2];
        if (m[1] === 'IntendedVersion' && !info.version) info.version = m[2];
      }
    }
  } catch (_) {}

  // mod 数量
  try {
    const modsDir = path.join(root, 'mods');
    if (fs.existsSync(modsDir)) {
      info.mods = fs.readdirSync(modsDir)
        .filter(f => f.endsWith('.jar')).length;
    }
  } catch (_) {}

  // icon
  for (const f of ['icon.png', 'server-icon.png', 'pack.png']) {
    try {
      if (fs.existsSync(path.join(root, f))) { info.icon = f; break; }
    } catch (_) {}
  }

  return info;
}

module.exports = function (ipcMain, win) {
  // ── 更新包读取 ──
  ipcMain.handle('pack:read-settings', (_e, p) => readZipJSON(p, 'settings.json'));
  ipcMain.handle('pack:read-manifest',  (_e, p) => readZipJSON(p, 'manifest.json'));
  ipcMain.handle('pack:read-hashes',    (_e, p) => readZipJSON(p, 'hashes.json'));
  ipcMain.handle('pack:read-changelog', (_e, p) => readZipEntry(p, 'CHANGELOG.md'));
  ipcMain.handle('pack:read-strategies', (_e, p) => readZipJSON(p, 'strategies.json'));
  ipcMain.handle('pack:read-whitelist',  (_e, p) => readZipJSON(p, 'whitelist.json'));

  // ── 导出更新包 ──
  ipcMain.handle('pack:export', async (_e, opts) => {
    try {
      const zip = new JSZip();
      const root = opts.root;

      // manifest.json
      if (opts.manifest) zip.file('manifest.json', JSON.stringify(opts.manifest, null, 2));
      // settings.json
      if (opts.settings) zip.file('settings.json', JSON.stringify(opts.settings, null, 2));
      // hashes.json
      if (opts.hashes) zip.file('hashes.json', JSON.stringify(opts.hashes, null, 2));
      // CHANGELOG.md
      if (opts.changelog) zip.file('CHANGELOG.md', opts.changelog);
      // strategies.json
      if (opts.strategies) zip.file('strategies.json', JSON.stringify(opts.strategies, null, 2));
      // whitelist.json
      if (opts.whitelist) zip.file('whitelist.json', JSON.stringify(opts.whitelist));

      // 打包文件内容
      if (opts.files) {
        for (const rel of opts.files) {
          const fp = path.join(root, rel);
          if (fs.existsSync(fp)) {
            const data = fs.readFileSync(fp);
            zip.file(rel, data);
          }
        }
      }

      const out = opts.output || 'update.zip';
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      fs.writeFileSync(out, buf);

      if (win) win.webContents.send('pack:progress', { done: true, path: out });
      return { ok: true, path: out, size: buf.length };
    } catch (e) {
      return { ok: false, msg: String(e) };
    }
  });
};

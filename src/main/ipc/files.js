// files.js — 文件系统操作 + 解压
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');
const { execSync } = require('child_process');

module.exports = function (ipcMain) {
  // 读目录
  ipcMain.handle('fs:read-dir', (_e, p) => {
    try { return fs.readdirSync(p); }
    catch (_) { return []; }
  });

  // stat
  ipcMain.handle('fs:stat', (_e, p) => {
    try {
      const st = fs.statSync(p);
      return { exists: true, size: st.size, isDir: st.isDirectory(), mtime: st.mtimeMs };
    } catch (_) { return { exists: false }; }
  });

  // exists
  ipcMain.handle('fs:exists', (_e, p) => {
    try { return fs.existsSync(p); } catch (_) { return false; }
  });

  // 整合包信息
  ipcMain.handle('fs:modpack-info', (_e, p) => {
    const info = { name: path.basename(p), version: '', mods: 0, icon: null };
    for (const f of ['mmc-pack.json', 'manifest.json']) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(p, f), 'utf-8'));
        if (d.name) info.name = d.name;
        if (d.version) info.version = d.version;
      } catch (_) {}
    }
    try {
      const modsDir = path.join(p, 'mods');
      if (fs.existsSync(modsDir)) {
        info.mods = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar')).length;
      }
    } catch (_) {}
    return info;
  });

  // 文件哈希
  ipcMain.handle('fs:hash', (_e, filePath, algo = 'sha1') => {
    try {
      const buf = fs.readFileSync(filePath);
      return crypto.createHash(algo).update(buf).digest('hex');
    } catch (_) { return null; }
  });

  // 解压
  ipcMain.handle('fs:unzip', async (_e, zipPath, destDir) => {
    try {
      fs.mkdirSync(destDir, { recursive: true });
      const buf = fs.readFileSync(zipPath);
      const zip = await JSZip.loadAsync(buf);
      const entries = Object.keys(zip.files);
      for (const rel of entries) {
        const entry = zip.files[rel];
        if (entry.dir) {
          fs.mkdirSync(path.join(destDir, rel), { recursive: true });
        } else {
          const data = await entry.async('nodebuffer');
          const fp = path.join(destDir, rel);
          fs.mkdirSync(path.dirname(fp), { recursive: true });
          fs.writeFileSync(fp, data);
        }
      }
      return { ok: true, files: entries.length };
    } catch (e) {
      return { ok: false, msg: String(e) };
    }
  });

  // 磁盘剩余空间
  ipcMain.handle('fs:space', (_e, p) => {
    try {
      // 用 fs.statfs (Node 18.15+)
      if (fs.statfsSync) {
        const s = fs.statfsSync(p);
        return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
      }
    } catch (_) {}
    return { free: 0, total: 0 };
  });

  // 版本
  ipcMain.handle('app:version', () => {
    return require('../../../package.json').version;
  });
};

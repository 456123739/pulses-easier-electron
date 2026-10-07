// updater.js — 更新计划构建与执行
// 对应 Python: app/core/updater.py + app/core/differ.py

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── 文件哈希 ──
function hashFile(filePath, algo = 'sha1') {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash(algo).update(buf).digest('hex');
}

// ── 目录清单 ──
function folderManifest(dir) {
  const entries = [];
  function walk(d, prefix = '') {
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d)) {
      const fp = path.join(d, name);
      const rel = prefix ? prefix + '/' + name : name;
      const st = fs.statSync(fp);
      if (st.isDirectory()) {
        walk(fp, rel);
      } else {
        entries.push({ rel, size: st.size, mtime: st.mtimeMs });
      }
    }
  }
  walk(dir);
  return entries;
}

// ── 比对两个整合包 ──
function diffPacks(oldRoot, newRoot, opts = {}) {
  const oldEntries = oldRoot ? folderManifest(oldRoot) : [];
  const newEntries = newRoot ? folderManifest(newRoot) : [];

  const oldMap = new Map(oldEntries.map(e => [e.rel, e]));
  const newMap = new Map(newEntries.map(e => [e.rel, e]));

  const added = [];
  const modified = [];
  const deleted = [];
  const unchanged = [];

  for (const [rel, ne] of newMap) {
    const oe = oldMap.get(rel);
    if (!oe) {
      added.push({ rel, size: ne.size });
    } else if (oe.size !== ne.size || oe.mtime !== ne.mtime) {
      modified.push({ rel, size: ne.size, oldSize: oe.size });
    } else {
      unchanged.push({ rel, size: ne.size });
    }
  }
  for (const [rel, oe] of oldMap) {
    if (!newMap.has(rel)) {
      deleted.push({ rel, size: oe.size });
    }
  }

  return { added, modified, deleted, unchanged };
}

// ── 策略枚举 ──
const STRATEGY = {
  ADD: 'add',          // 新增
  REPLACE: 'replace',  // 覆盖
  KEEP: 'keep',        // 保留旧文件
  DELETE: 'delete',    // 删除
  MERGE: 'merge',      // 文件夹合并
};

// ── 构建更新计划 ──
function buildPlan(diff, checked, strategies, oldRoot, newRoot, opts = {}) {
  const tasks = [];

  // 新增文件
  for (const f of diff.added) {
    if (!checked.added?.includes(f.rel) && !checked.all) continue;
    tasks.push({
      type: 'copy', rel: f.rel,
      src: path.join(newRoot, f.rel),
      dst: path.join(oldRoot, f.rel),
      strategy: strategies[f.rel] || STRATEGY.ADD,
      size: f.size,
    });
  }

  // 修改文件
  for (const f of diff.modified) {
    if (!checked.modified?.includes(f.rel) && !checked.all) continue;
    tasks.push({
      type: 'copy', rel: f.rel,
      src: path.join(newRoot, f.rel),
      dst: path.join(oldRoot, f.rel),
      strategy: strategies[f.rel] || STRATEGY.REPLACE,
      size: f.size,
    });
  }

  // 删除文件
  for (const f of diff.deleted) {
    if (!checked.deleted?.includes(f.rel) && !checked.all) continue;
    tasks.push({
      type: 'delete', rel: f.rel,
      dst: path.join(oldRoot, f.rel),
      strategy: strategies[f.rel] || STRATEGY.DELETE,
    });
  }

  return { tasks, oldRoot, newRoot };
}

// ── 执行更新计划 ──
async function executePlan(plan, oldRoot, newRoot, opts = {}, onProgress) {
  const { tasks } = plan;
  let done = 0;
  let totalBytes = 0;
  let movedBytes = 0;

  // 先统计总字节
  for (const t of tasks) {
    if (t.size) totalBytes += t.size;
  }

  for (const t of tasks) {
    try {
      if (t.type === 'copy') {
        // 确保目标目录存在
        const dir = path.dirname(t.dst);
        fs.mkdirSync(dir, { recursive: true });
        // 复制文件
        const srcSt = fs.statSync(t.src);
        fs.copyFileSync(t.src, t.dst);
        movedBytes += srcSt.size;
      } else if (t.type === 'delete') {
        if (fs.existsSync(t.dst)) {
          fs.unlinkSync(t.dst);
        }
      }
    } catch (e) {
      // 忽略单个文件错误，继续
      if (onProgress) onProgress({ error: t.rel, msg: String(e) });
    }

    done++;
    if (onProgress && (done % 10 === 0 || done === tasks.length)) {
      onProgress({
        done, total: tasks.length,
        moved: movedBytes, totalBytes,
        percent: totalBytes ? movedBytes / totalBytes : done / tasks.length,
      });
    }
  }

  return { ok: true, done, total: tasks.length };
}

// ── 更新后验证 ──
function verifyAfterUpdate(plan, oldRoot, newRoot) {
  const errors = [];
  for (const t of plan.tasks) {
    if (t.type === 'copy') {
      if (!fs.existsSync(t.dst)) {
        errors.push({ rel: t.rel, msg: '目标文件不存在' });
        continue;
      }
      if (t.size) {
        const st = fs.statSync(t.dst);
        if (st.size !== t.size) {
          errors.push({ rel: t.rel, msg: `大小不匹配: ${st.size} vs ${t.size}` });
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

module.exports = function (ipcMain, win) {
  ipcMain.handle('diff:packs', async (_e, oldRoot, newRoot, opts) => {
    return diffPacks(oldRoot, newRoot, opts);
  });

  ipcMain.handle('update:build-plan', async (_e, diff, checked, strategies,
                                             oldRoot, newRoot, opts) => {
    return buildPlan(diff, checked, strategies, oldRoot, newRoot, opts);
  });

  ipcMain.handle('update:execute', async (_e, plan, oldRoot, newRoot, opts) => {
    const onProgress = (d) => {
      if (win) win.webContents.send('update:progress', d);
    };
    const result = await executePlan(plan, oldRoot, newRoot, opts, onProgress);
    if (win) win.webContents.send('update:done', result);
    return result;
  });

  ipcMain.handle('update:verify', async (_e, plan, oldRoot, newRoot) => {
    return verifyAfterUpdate(plan, oldRoot, newRoot);
  });

  ipcMain.handle('update:estimate', async (_e, plan, oldRoot) => {
    let bytes = 0;
    for (const t of plan.tasks) {
      if (t.type === 'copy' && t.size) bytes += t.size;
    }
    return { copyBytes: bytes };
  });
};

module.exports.STRATEGY = STRATEGY;

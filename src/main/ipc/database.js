// database.js — 数据库路径与配置管理
// 对应 Python: app/core/database.py + app/core/dbmigrate.py

const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_DIR = path.join(os.homedir(), '.pulses_easier');
const APP_CFG = path.join(APP_DIR, 'config.json');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function atomicWriteJSON(file, obj) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (_) { return fallback; }
}

// ── 默认配置 ──
const DEFAULTS = {
  download: {
    multi_slots: 16, single_slots: 4,
    part_threads: 4, max_connections: 128,
    connect_timeout: 10, read_idle_timeout: 20,
    per_url_timeout: 0, stall_timeout: 30, min_speed_bps: 0,
    retry_same_url: 0, retry_backoff_ms: 500,
    single_url_timeout: 0, single_stall_timeout: 30,
    single_min_speed_bps: 0,
    hash_threads: 4, log_max_lines: 500,
    progress_throttle_ms: 200,
    apply_chunk_kb: 4096, apply_batch_mb: 64,
    boot_min_ms: 300, boot_max_ms: 1200,
    apply_space_check: 1, apply_deep_verify: 1, apply_clean_cache: 0,
  },
  compare: {
    hash_algo: 'sha1', hash_threads: 4,
    compare_hashes: true, compare_content: false,
  },
  ui: {
    reduce_motion: false, theme: 'dark',
    window_w: 1280, window_h: 820,
  },
  whitelist: ['mods', 'resourcepacks', 'shaderpacks'],
  scan_list: ['mods', 'resourcepacks', 'shaderpacks'],
  blacklist: [],
  export_options: {
    include_hashes: true, tamper_proof: true,
    precompute_overrides: true, min_size: false, compress: true,
  },
};

module.exports = function (ipcMain, win) {
  // 获取数据库路径
  ipcMain.handle('db:get-path', () => {
    const cfg = readJSON(APP_CFG, {});
    return cfg.db_path || null;
  });

  // 加载数据库配置
  ipcMain.handle('db:load-config', () => {
    const cfg = readJSON(APP_CFG, {});
    const dbPath = cfg.db_path;
    if (!dbPath) return null;
    const dbCfgFile = path.join(dbPath, 'config.json');
    const dbCfg = readJSON(dbCfgFile, {});
    // 合并默认值
    const merged = {};
    for (const key of Object.keys(DEFAULTS)) {
      merged[key] = { ...DEFAULTS[key], ...(dbCfg[key] || {}) };
    }
    return { db_path: dbPath, config: merged };
  });

  // 保存数据库配置
  ipcMain.handle('db:save-config', (_e, cfg) => {
    const appCfg = readJSON(APP_CFG, {});
    if (!appCfg.db_path) return false;
    const dbCfgFile = path.join(appCfg.db_path, 'config.json');
    atomicWriteJSON(dbCfgFile, cfg);
    return true;
  });

  // 创建数据库
  ipcMain.handle('db:create', (_e, dbPath) => {
    try {
      ensureDir(path.join(dbPath, 'projects'));
      const cfgFile = path.join(dbPath, 'config.json');
      if (!fs.existsSync(cfgFile)) {
        atomicWriteJSON(cfgFile, {
          format_version: 1,
          created: new Date().toISOString(),
          ...DEFAULTS,
        });
      }
      // 更新程序级配置
      const appCfg = readJSON(APP_CFG, {});
      appCfg.db_path = dbPath;
      atomicWriteJSON(APP_CFG, appCfg);
      return true;
    } catch (_) { return false; }
  });

  // 校验数据库有效性
  ipcMain.handle('db:is-valid', (_e, dbPath) => {
    try {
      return fs.existsSync(path.join(dbPath, 'config.json')) &&
             fs.existsSync(path.join(dbPath, 'projects'));
    } catch (_) { return false; }
  });

  // 描述数据库（文件数、大小、项目数）
  ipcMain.handle('db:describe', async (_e, dbPath) => {
    const result = { files: 0, bytes: 0, projects: 0, cache_bytes: 0 };
    try {
      const projectsDir = path.join(dbPath, 'projects');
      if (fs.existsSync(projectsDir)) {
        result.projects = fs.readdirSync(projectsDir)
          .filter(n => fs.statSync(path.join(projectsDir, n)).isDirectory())
          .length;
      }
      // 递归统计
      const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
          const fp = path.join(dir, name);
          const st = fs.statSync(fp);
          if (st.isDirectory()) {
            if (name === 'cache') {
              // 单独统计缓存大小
              const cacheWalk = (d) => {
                for (const n of fs.readdirSync(d)) {
                  const p = path.join(d, n);
                  const s = fs.statSync(p);
                  if (s.isDirectory()) cacheWalk(p);
                  else { result.cache_bytes += s.size; result.bytes += s.size; result.files++; }
                }
              };
              cacheWalk(fp);
            } else {
              walk(fp);
            }
          } else {
            result.files++;
            result.bytes += st.size;
          }
        }
      };
      walk(dbPath);
    } catch (_) {}
    return result;
  });

  // 迁移数据库
  ipcMain.handle('db:migrate', async (_e, src, dst, opts = {}) => {
    const skip = opts.skip || ['cache'];
    const marker = path.join(dst, '.pulses_migrate');
    try {
      // 1) 先创建目录（确保空 projects 存在）
      ensureDir(path.join(dst, 'projects'));

      // 2) 复制（跳过 cache 等目录）
      const copyDir = (s, d, depth = 0) => {
        ensureDir(d);
        for (const name of fs.readdirSync(s)) {
          if (skip.includes(name) && depth === 0) continue;
          const sp = path.join(s, name);
          const dp = path.join(d, name);
          const st = fs.statSync(sp);
          if (st.isDirectory()) {
            copyDir(sp, dp, depth + 1);
          } else {
            fs.copyFileSync(sp, dp);
            // 校验大小
            const dstSt = fs.statSync(dp);
            if (dstSt.size !== st.size) throw new Error(`size mismatch: ${name}`);
          }
        }
      };
      copyDir(src, dst);

      // 3) 写迁移标记（标记目标库需要重启刷新）
      fs.writeFileSync(marker, new Date().toISOString(), 'utf-8');

      return { ok: true, msg: '迁移完成' };
    } catch (e) {
      return { ok: false, msg: String(e.message || e) };
    }
  });
};

function humanSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

module.exports.humanSize = humanSize;
module.exports.DEFAULTS = DEFAULTS;
module.exports.APP_DIR = APP_DIR;
module.exports.APP_CFG = APP_CFG;
module.exports.atomicWriteJSON = atomicWriteJSON;
module.exports.readJSON = readJSON;

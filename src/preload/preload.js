// preload.js — 安全桥接：渲染进程通过 window.pulses 调用主进程
// contextIsolation = true，不暴露 require

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pulses', {
  // ── 数据库 ──
  db: {
    getPath:        () => ipcRenderer.invoke('db:get-path'),
    loadConfig:     () => ipcRenderer.invoke('db:load-config'),
    saveConfig:     (cfg) => ipcRenderer.invoke('db:save-config', cfg),
    create:         (p)  => ipcRenderer.invoke('db:create', p),
    isValid:        (p)  => ipcRenderer.invoke('db:is-valid', p),
    migrate:        (src, dst, opts) =>
      ipcRenderer.invoke('db:migrate', src, dst, opts),
    onProgress:     (cb) => ipcRenderer.on('db:progress', (_, d) => cb(d)),
    describe:       (p)  => ipcRenderer.invoke('db:describe', p),
  },
  // ── 下载器 ──
  dl: {
    start:    (tasks, opts) => ipcRenderer.invoke('dl:start', tasks, opts),
    cancel:   () => ipcRenderer.invoke('dl:cancel'),
    onProgress: (cb) => ipcRenderer.on('dl:progress', (_, d) => cb(d)),
    onDone:     (cb) => ipcRenderer.on('dl:done', (_, d) => cb(d)),
    onLog:      (cb) => ipcRenderer.on('dl:log', (_, d) => cb(d)),
    diskType:   (p) => ipcRenderer.invoke('dl:disk-type', p),
  },
  // ── 更新器 ──
  update: {
    buildPlan: (diff, checked, strategies, oldRoot, newRoot, opts) =>
      ipcRenderer.invoke('update:build-plan', diff, checked, strategies,
                         oldRoot, newRoot, opts),
    execute:   (plan, oldRoot, newRoot, opts) =>
      ipcRenderer.invoke('update:execute', plan, oldRoot, newRoot, opts),
    verify:    (plan, oldRoot, newRoot) =>
      ipcRenderer.invoke('update:verify', plan, oldRoot, newRoot),
    estimate:  (plan, oldRoot) =>
      ipcRenderer.invoke('update:estimate', plan, oldRoot),
    onProgress: (cb) => ipcRenderer.on('update:progress', (_, d) => cb(d)),
    onDone:     (cb) => ipcRenderer.on('update:done', (_, d) => cb(d)),
  },
  // ── EAPack（更新包）──
  pack: {
    readSettings:    (p) => ipcRenderer.invoke('pack:read-settings', p),
    readManifest:     (p) => ipcRenderer.invoke('pack:read-manifest', p),
    readHashes:       (p) => ipcRenderer.invoke('pack:read-hashes', p),
    readChangelog:    (p) => ipcRenderer.invoke('pack:read-changelog', p),
    readStrategies:   (p) => ipcRenderer.invoke('pack:read-strategies', p),
    readWhitelist:    (p) => ipcRenderer.invoke('pack:read-whitelist', p),
    export:           (opts) => ipcRenderer.invoke('pack:export', opts),
    onProgress:       (cb) => ipcRenderer.on('pack:progress', (_, d) => cb(d)),
  },
  // ── 文件差异比对 ──
  diff: {
    packs: (oldRoot, newRoot, opts) =>
      ipcRenderer.invoke('diff:packs', oldRoot, newRoot, opts),
  },
  // ── 系统对话框 ──
  dialog: {
    openFolder:    (title) => ipcRenderer.invoke('dlg:open-folder', title),
    openFile:       (title, filters) =>
      ipcRenderer.invoke('dlg:open-file', title, filters),
    saveFile:       (title, defaultPath) =>
      ipcRenderer.invoke('dlg:save-file', title, defaultPath),
    openExternal:  (url) => ipcRenderer.invoke('dlg:open-external', url),
    showItem:      (p) => ipcRenderer.invoke('dlg:show-item', p),
  },
  // ── 文件操作 ──
  files: {
    readDir:   (p) => ipcRenderer.invoke('fs:read-dir', p),
    stat:      (p) => ipcRenderer.invoke('fs:stat', p),
    exists:    (p) => ipcRenderer.invoke('fs:exists', p),
    readModpackInfo: (p) => ipcRenderer.invoke('fs:modpack-info', p),
    hashFile:  (p, algo) => ipcRenderer.invoke('fs:hash', p, algo),
    unzip:     (zipPath, destDir) =>
      ipcRenderer.invoke('fs:unzip', zipPath, destDir),
    getSpace:  (p) => ipcRenderer.invoke('fs:space', p),
  },
  // ── 版本 ──
  version: () => ipcRenderer.invoke('app:version'),
});

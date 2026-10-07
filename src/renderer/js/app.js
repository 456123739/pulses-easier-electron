// app.js — 主控制器（启动流程 + 模式切换 + 侧边栏选项动画）
// 对应 Python: main.py + app/ui/main_window.py + app/ui/sidebar.py + app/ui/polish.py

(function () {
  'use strict';

  // ── 启动流程 ──
  async function boot() {
    Overlay.init();

    // 显示版本号
    const ver = await window.pulses.version();
    document.getElementById('status-version').textContent = 'v' + ver;

    // 初始化各视图
    Player.init();
    Developer.init();

    // 模式切换
    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => switchMode(tab.dataset.mode));
    });

    // 首选项
    document.getElementById('btn-prefs').addEventListener('click', openPrefs);
    document.getElementById('btn-more').addEventListener('click', openMore);

    // 启动动画 → 显示主窗口
    setTimeout(() => {
      const splash = document.getElementById('splash');
      splash.classList.add('fade-out');
      const app = document.getElementById('app');
      app.classList.remove('hidden');
      app.classList.add('fade-in');
      setTimeout(() => splash.style.display = 'none', 300);
    }, 1200);
  }

  // ── 模式切换（带滑出/滑入动画 + 侧边栏选项错开滑入）──
  let currentMode = 'player';
  function switchMode(mode) {
    if (mode === currentMode) return;
    const oldView = document.getElementById(currentMode + '-view');
    const newView = document.getElementById(mode + '-view');

    // 切 tab
    document.querySelectorAll('.mode-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.mode === mode));

    // 旧视图滑出
    oldView.classList.remove('active');
    oldView.classList.add('exit-left');

    // 新视图滑入
    setTimeout(() => {
      oldView.classList.remove('exit-left');
      newView.classList.add('active');
    }, 50);

    currentMode = mode;

    // 侧边栏选项错开滑入
    staggerSidebar();
  }

  // ── 侧边栏选项错开滑入 ──
  function staggerSidebar() {
    const options = document.querySelectorAll('.sidebar-option');
    Motion.stagger(Array.from(options), 45, 240);
  }

  // ── 首选项弹窗 ──
  async function openPrefs() {
    const cfg = await window.pulses.db.loadConfig();
    if (!cfg) {
      await Overlay.alert(null, '提示', '请先创建或定位数据库');
      return;
    }
    // 简化版首选项弹窗
    await Overlay.alert(null, '首选项',
      `数据库路径：${cfg.db_path}\n\n更多设置项将在后续版本中完善。`);
  }

  // ── 更多面板 ──
  async function openMore() {
    const choice = await Overlay.confirm(null, '更多操作',
      '选择操作：',
      { confirmText: '打开数据库目录', cancelText: '关闭' });
    if (choice) {
      const p = await window.pulses.db.getPath();
      if (p) window.pulses.dialog.showItem(p);
    }
  }

  // ── DOM Ready ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

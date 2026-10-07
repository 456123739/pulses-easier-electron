// index.js — Electron 主进程入口
// 职责：创建窗口、管理生命周期、分发 IPC

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ── 窗口引用 ──
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,              // 先隐藏，加载完再显示（替代 splash）
    backgroundColor: '#0B0B0D',
    title: 'Pulses Easier',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // 尝试透明 / 亚克力效果（Win10+）
  try {
    if (process.platform === 'win32') {
      win.setVibrancy('dark');     // Win11 mica / Win10 acrylic
      win.setBackgroundMaterial('acrylic');
    }
  } catch (_) { /* 静默降级 */ }

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    // 启动动画由前端 CSS 负责，这里只负责"准备好了就显示"
    win.show();
  });

  win.on('closed', () => { win = null; });
}

// ── 应用生命周期 ──
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC 分发 ──
// 各模块在各自文件里注册 handler，这里只做统一入口
require('./ipc/database')(ipcMain, win);
require('./ipc/downloader')(ipcMain, win);
require('./ipc/updater')(ipcMain, win);
require('./ipc/eapack')(ipcMain, win);
require('./ipc/dialog')(ipcMain, win);
require('./ipc/files')(ipcMain, win);

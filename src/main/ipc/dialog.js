// dialog.js — 系统对话框
const { dialog, shell } = require('electron');

module.exports = function (ipcMain) {
  ipcMain.handle('dlg:open-folder', async (_e, title) => {
    const r = await dialog.showOpenDialog({
      title: title || '选择文件夹',
      properties: ['openDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('dlg:open-file', async (_e, title, filters) => {
    const r = await dialog.showOpenDialog({
      title: title || '选择文件',
      filters: filters || [{ name: '所有文件', extensions: ['*'] }],
      properties: ['openFile'],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('dlg:save-file', async (_e, title, defaultPath) => {
    const r = await dialog.showSaveDialog({
      title: title || '保存文件',
      defaultPath: defaultPath || '',
      filters: [{ name: 'ZIP 更新包', extensions: ['zip', 'eapack'] }],
    });
    return r.canceled ? null : r.filePath;
  });

  ipcMain.handle('dlg:open-external', (_e, url) => {
    shell.openExternal(url);
    return true;
  });

  ipcMain.handle('dlg:show-item', (_e, p) => {
    shell.showItemInFolder(p);
    return true;
  });
};

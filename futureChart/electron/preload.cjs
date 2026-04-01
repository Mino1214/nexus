const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('futureChart', {
  platform: process.platform,
});

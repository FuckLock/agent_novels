import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  windowControl: async (action: string) => {
    const res = await fetch(`toonflow://${action}`);
    return res.json();
  },
  minimize: () => fetch('toonflow://windowminimize'),
  maximize: () => fetch('toonflow://windowmaximize'),
  close: () => fetch('toonflow://windowclose'),
  isMaximized: async () => {
    const res = await fetch('toonflow://windowismaximized');
    const data = await res.json() as { maximized: boolean };
    return data.maximized;
  },
  openExternal: (url: string) => {
    fetch(`toonflow://openurlwithbrowser?url=${encodeURIComponent(url)}`);
  },
});

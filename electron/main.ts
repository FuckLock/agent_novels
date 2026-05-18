import { app, BrowserWindow, protocol, shell } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';

// 加速 Electron 启动
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let mainWindow: BrowserWindow | null = null;
let loadingWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;

const PORT = 3456;
const isDev = !app.isPackaged;

// ============ Loading 窗口 ============

const loadingHtml = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:#fff;color:#333;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  user-select:none;-webkit-app-region:drag}
.logo{width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#7c3aed,#a855f7);
  display:flex;align-items:center;justify-content:center;margin-bottom:24px;
  box-shadow:0 8px 32px rgba(124,58,237,0.3)}
.logo svg{width:32px;height:32px;fill:white}
.spinner{width:32px;height:32px;border:3px solid rgba(124,58,237,.15);
  border-top-color:#7c3aed;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:16px}
@keyframes spin{to{transform:rotate(360deg)}}
h1{font-size:20px;font-weight:600;margin-bottom:8px;color:#1f2937}
p{font-size:13px;opacity:.5}
</style></head><body>
<div class="logo"><svg viewBox="0 0 24 24"><path d="M20.998 10c-.012-2.175-.108-3.353-.877-4.121C19.243 5 17.828 5 15 5h-3c-2.828 0-4.243 0-5.121.879C6 6.757 6 8.172 6 11v5c0 2.828 0 4.243.879 5.121C7.757 22 9.172 22 12 22h3c2.828 0 4.243 0 5.121-.879C21 20.243 21 18.828 21 16v-1"/><path d="M3 10V18" opacity="0.5"/><path d="M7.5 2.5C9.518 4.159 10.874 6.291 11.5 8.5" opacity="0.7"/><path d="M16.5 2C14.482 3.659 13.126 5.791 12.5 8" opacity="0.7"/></svg></div>
<div class="spinner"></div>
<h1>Toonflow</h1>
<p>正在启动服务…</p>
</body></html>`)}`;

function showLoading(): void {
  loadingWindow = new BrowserWindow({
    width: 400,
    height: 320,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    show: true,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
  });
  loadingWindow.setMenuBarVisibility(false);
  loadingWindow.removeMenu();
  loadingWindow.on('closed', () => { loadingWindow = null; });
  void loadingWindow.loadURL(loadingHtml);
}

function closeLoading(): void {
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.close();
    loadingWindow = null;
  }
}

// ============ Next.js 服务管理 ============

function getWebDir(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'web');
  }
  return path.join(process.resourcesPath, 'web');
}

function getNovelsDir(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'novels');
  }
  // 生产环境：用户数据目录
  const userNovels = path.join(app.getPath('userData'), 'novels');
  const fs = require('fs');
  if (!fs.existsSync(userNovels)) {
    // 首次启动，从 resources 复制初始数据
    const bundledNovels = path.join(process.resourcesPath, 'novels');
    if (fs.existsSync(bundledNovels)) {
      copyDirSync(bundledNovels, userNovels);
    } else {
      fs.mkdirSync(userNovels, { recursive: true });
    }
  }
  return userNovels;
}

function copyDirSync(src: string, dest: string): void {
  const fs = require('fs');
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else if (!fs.existsSync(d)) {
      fs.copyFileSync(s, d);
    }
  }
}

function startNextServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const webDir = getWebDir();
    const novelsDir = getNovelsDir();

    const env = {
      ...process.env,
      PORT: String(PORT),
      NOVELS_DIR: novelsDir,
      NODE_ENV: isDev ? 'development' : 'production',
    };

    if (isDev) {
      // 开发环境：只启动 Next.js，不触发 web/ 下的 Electron dev 入口
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      nextProcess = spawn(npmCmd, ['run', 'dev:next', '--', '-p', String(PORT)], {
        cwd: webDir,
        env,
        stdio: 'pipe',
      });
    } else {
      // 生产环境：next start (standalone)
      const serverJs = path.join(webDir, '.next', 'standalone', 'server.js');
      nextProcess = spawn(process.execPath, [serverJs], {
        cwd: path.join(webDir, '.next', 'standalone'),
        env: { ...env, PORT: String(PORT) },
        stdio: 'pipe',
      });
    }

    nextProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString();
      console.log('[Next.js]', msg);
      // Next.js 就绪信号
      if (msg.includes('Ready') || msg.includes('started server') || msg.includes(`localhost:${PORT}`)) {
        resolve();
      }
    });

    nextProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Next.js Error]', data.toString());
    });

    nextProcess.on('error', (err) => {
      console.error('[Next.js Process Error]', err);
      reject(err);
    });

    nextProcess.on('exit', (code) => {
      console.log('[Next.js] Process exited with code', code);
    });

    // 备用：轮询检测服务就绪
    const checkReady = setInterval(() => {
      http.get(`http://localhost:${PORT}/api/projects`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(checkReady);
          resolve();
        }
      }).on('error', () => {
        // 还没就绪，继续等
      });
    }, 500);

    // 超时 30 秒
    setTimeout(() => {
      clearInterval(checkReady);
      resolve(); // 即使超时也创建窗口，让用户看到可能的错误
    }, 30000);
  });
}

function stopNextServer(): void {
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
}

// ============ 主窗口 ============

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 10 },
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.once('ready-to-show', () => {
    closeLoading();
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(`http://localhost:${PORT}`);
}

// ============ 协议处理 ============

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'toonflow',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// ============ 应用生命周期 ============

app.whenReady().then(async () => {
  showLoading();

  try {
    await startNextServer();
  } catch (err) {
    console.error('[启动失败]:', err);
  }

  // 注册协议
  protocol.handle('toonflow', (request) => {
    const url = new URL(request.url);
    const pathname = url.hostname.toLowerCase();
    const handlers: Record<string, () => object> = {
      getappurl: () => ({ url: `http://localhost:${PORT}/api` }),
      windowminimize: () => {
        mainWindow?.minimize();
        return { ok: true };
      },
      windowmaximize: () => {
        if (mainWindow?.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow?.maximize();
        }
        return { ok: true };
      },
      windowclose: () => {
        app.exit(0);
        return { ok: true };
      },
      windowismaximized: () => ({
        maximized: mainWindow?.isMaximized() ?? false,
      }),
      openurlwithbrowser: () => {
        const targetUrl = url.searchParams.get('url');
        if (targetUrl) {
          shell.openExternal(targetUrl);
          return { ok: true };
        }
        return { ok: false, error: '缺少url参数' };
      },
    };
    const handler = handlers[pathname];
    const responseData = handler ? handler() : { error: '未知接口' };
    return new Response(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  });

  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopNextServer();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  stopNextServer();
});

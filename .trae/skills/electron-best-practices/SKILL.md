---
name: "electron-best-practices"
description: "Electron development best practices and patterns. Invoke when building Electron apps, reviewing Electron code, or configuring security settings."
---

# Electron Best Practices Skill

Expert guidance for Electron application development, security, and performance optimization.

**PROACTIVE ACTIVATION**: Use this skill automatically when working in Electron projects. Detect Electron usage through `package.json` dependencies or presence of `main.js`, `preload.js`, or Electron-specific APIs.

**DETECTION**: At the start of a session, check for:
- `electron` in `package.json` dependencies
- Presence of `main.js`, `preload.js`, or `main` field in `package.json`
- Usage of `electron` module imports (`ipcRenderer`, `ipcMain`, `BrowserWindow`, etc.)

**USE CASES**: Building Electron apps, configuring security settings, implementing IPC communication, optimizing performance, managing native modules, and reviewing Electron code.

---

## Auto-activation

This skill activates automatically in projects using Electron.

### Project Detection

Check if this is an Electron project:

```bash
# Check package.json for Electron dependency
grep -i "electron" package.json

# Check for main process file
test -f main.js || test -f main.ts || test -f src/main/main.ts
```

If Electron is detected, apply this skill's patterns proactively when:

- Creating main process code
- Implementing IPC communication
- Configuring BrowserWindow options
- Setting up preload scripts
- Handling file system operations
- Managing application lifecycle
- Reviewing Electron security configurations

---

## Philosophy: Security First, Performance Always

Electron apps must balance functionality with security and performance:

| Principle | Description | Priority |
|-----------|-------------|----------|
| **Security First** | Enable all security features by default | P0 |
| **Process Separation** | Clear separation between main and renderer processes | P0 |
| **Minimal Privileges** | Renderer processes should have minimal Node.js access | P0 |
| **Performance** | Optimize startup time, memory usage, and bundle size | P1 |
| **User Experience** | Native-like experience with proper window management | P1 |

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Main Process                         │
│  (Node.js + Electron APIs, Full System Access)          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ BrowserWindow│  │   ipcMain    │  │ Native APIs  │  │
│  │  Management  │  │  Handlers    │  │  (fs, path)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                            ↕ IPC (invoke/handle, send/on)
┌─────────────────────────────────────────────────────────┐
│                   Renderer Process                       │
│  (Chromium + Limited APIs, Sandboxed)                   │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │    HTML/     │  │  ipcRenderer │  │   Web APIs   │  │
│  │  CSS/JS UI   │  │   Stubs      │  │ (fetch, DOM) │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Security Best Practices

### 1. Enable All Security Features

```javascript
// main.js - BrowserWindow configuration
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    // ✅ CRITICAL: Enable context isolation
    contextIsolation: true,
    
    // ✅ CRITICAL: Disable Node.js integration in renderer
    nodeIntegration: false,
    
    // ✅ Enable web security (disable only for specific dev needs)
    webSecurity: true,
    
    // ✅ Enable sandboxing
    sandbox: true,
    
    // ✅ Specify preload script
    preload: path.join(__dirname, 'preload.js'),
    
    // ✅ Disable eval
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
  },
})
```

### 2. Secure IPC Communication

```javascript
// preload.js - Expose only necessary APIs
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ✅ Specific, validated methods
  getPrompts: () => ipcRenderer.invoke('prompts:get-all'),
  savePrompt: (data) => ipcRenderer.invoke('prompts:save', data),
  deletePrompt: (id) => ipcRenderer.invoke('prompts:delete', id),
  
  // ✅ With validation
  openPath: (relativePath) => {
    // Validate path to prevent directory traversal
    if (!relativePath || relativePath.includes('..')) {
      throw new Error('Invalid path')
    }
    return ipcRenderer.invoke('app:open-path', relativePath)
  },
  
  // ❌ NEVER expose raw ipcRenderer
  // send: (channel, data) => ipcRenderer.send(channel, data),
})
```

```javascript
// main.js - Handle IPC with validation
ipcMain.handle('prompts:save', async (event, data) => {
  // ✅ Validate input
  if (!data || typeof data.content !== 'string') {
    throw new Error('Invalid prompt data')
  }
  
  // ✅ Sanitize before database operation
  const sanitized = {
    title: String(data.title || '').slice(0, 200),
    content: String(data.content).slice(0, 100000),
    // ...
  }
  
  return await db.prompts.create(sanitized)
})
```

### 3. Content Security Policy (CSP)

```javascript
// main.js
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' file: data:",
        "connect-src 'self' file:",
      ].join('; '),
    },
  })
})
```

### 4. Secure File Operations

```javascript
// main.js - Prevent path traversal attacks
const path = require('path')
const fs = require('fs').promises

ipcMain.handle('app:read-file', async (event, relativePath) => {
  // ✅ Validate and sanitize path
  const basePath = app.getPath('userData')
  const fullPath = path.resolve(basePath, relativePath)
  
  // ✅ Ensure path is within allowed directory
  if (!fullPath.startsWith(basePath)) {
    throw new Error('Access denied: Path outside allowed directory')
  }
  
  // ✅ Check file exists
  await fs.access(fullPath)
  
  return await fs.readFile(fullPath, 'utf-8')
})
```

---

## IPC Communication Patterns

### Pattern 1: Request-Response (invoke/handle) - RECOMMENDED

```javascript
// preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  getPrompts: () => ipcRenderer.invoke('prompts:get-all'),
  savePrompt: (data) => ipcRenderer.invoke('prompts:save', data),
})

// renderer/app.js
const prompts = await window.electronAPI.getPrompts()
await window.electronAPI.savePrompt(promptData)

// main.js
ipcMain.handle('prompts:get-all', async () => {
  return await db.prompts.findMany({ where: { is_deleted: 0 } })
})

ipcMain.handle('prompts:save', async (event, data) => {
  return await db.prompts.upsert(data)
})
```

**Benefits**:
- ✅ Promise-based (async/await)
- ✅ Automatic error propagation
- ✅ One-to-one communication
- ✅ Built-in response correlation

### Pattern 2: Event Subscription (send/on) - For Streams

```javascript
// preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  onFileWatch: (callback) => {
    ipcRenderer.on('file:watch', (event, data) => callback(data))
  },
  removeFileWatchListener: () => {
    ipcRenderer.removeAllListeners('file:watch')
  },
})

// main.js
// Periodic updates
setInterval(() => {
  mainWindow.webContents.send('file:watch', { changed: true })
}, 5000)
```

### Pattern 3: Bidirectional Communication

```javascript
// Renderer → Main → Renderer
// renderer.js
const result = await window.electronAPI.processFile(path)

// main.js
ipcMain.handle('app:process-file', async (event, filePath) => {
  // Send progress updates back to renderer
  event.sender.send('app:progress', { current: 0, total: 100 })
  
  const result = await processFile(filePath, (progress) => {
    event.sender.send('app:progress', progress)
  })
  
  event.sender.send('app:progress', { current: 100, total: 100 })
  return result
})
```

---

## Performance Optimization

### 1. Startup Time Optimization

```javascript
// main.js
app.whenReady().then(async () => {
  // ✅ Show window immediately
  mainWindow = new BrowserWindow({
    show: false,
    // ... other options
  })
  
  // ✅ Load window without blocking
  mainWindow.loadFile('renderer/index.html')
  
  // ✅ Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })
  
  // ✅ Defer non-critical initialization
  setImmediate(() => {
    initializeDatabase()
    loadUserPreferences()
  })
})
```

### 2. Memory Management

```javascript
// Avoid memory leaks in IPC listeners
class IPCManager {
  constructor() {
    this.listeners = new Map()
  }
  
  register(channel, handler) {
    // ✅ Store reference for cleanup
    this.listeners.set(channel, handler)
    ipcMain.on(channel, handler)
  }
  
  cleanup() {
    // ✅ Remove all listeners on app quit
    for (const [channel, handler] of this.listeners) {
      ipcMain.removeListener(channel, handler)
    }
    this.listeners.clear()
  }
}

// main.js
const ipcManager = new IPCManager()
ipcManager.register('app:event', handler)

app.on('will-quit', () => {
  ipcManager.cleanup()
})
```

### 3. Database Connection Pooling

```javascript
// database.js
const sqlite3 = require('sqlite3').verbose()

class Database {
  constructor(dbPath) {
    // ✅ Single connection for entire app lifecycle
    this.db = new sqlite3.Database(dbPath)
    
    // ✅ Enable WAL mode for better concurrency
    this.db.run('PRAGMA journal_mode=WAL')
    
    // ✅ Set cache size
    this.db.run('PRAGMA cache_size=-64000') // 64MB
  }
  
  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }
  
  // ✅ Close on app quit
  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}
```

### 4. Lazy Loading Renderer Code

```javascript
// renderer/app.js
// ✅ Load modules on demand, not all at startup
class App {
  async init() {
    // Critical functionality first
    await this.loadPromptList()
    
    // Defer non-critical
    requestIdleCallback(() => {
      this.initializeTags()
      this.loadPreferences()
    })
  }
}
```

---

## Window Management

### Single Main Window with Multiple Views

```javascript
// main.js
class WindowManager {
  constructor() {
    this.mainWindow = null
    this.dialogWindows = new Map()
  }
  
  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'preload.js'),
      },
    })
    
    this.mainWindow.loadFile('renderer/index.html')
    
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show()
    })
    
    return this.mainWindow
  }
  
  createDialog(id, options = {}) {
    const dialog = new BrowserWindow({
      parent: this.mainWindow,
      modal: true,
      show: false,
      ...options,
    })
    
    dialog.loadFile(`renderer/dialogs/${id}.html`)
    dialog.once('ready-to-show', () => dialog.show())
    
    this.dialogWindows.set(id, dialog)
    
    dialog.on('closed', () => {
      this.dialogWindows.delete(id)
    })
    
    return dialog
  }
}
```

### Window State Persistence

```javascript
// main.js
const windowStateKeeper = require('electron-window-state')

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800,
  })
  
  const mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
  })
  
  mainWindowState.manage(mainWindow)
}
```

---

## File System Operations

### Safe File Dialogs

```javascript
// main.js
const { dialog } = require('electron')

ipcMain.handle('dialog:open-file', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择文件',
    filters: [
      { name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  })
  
  if (result.canceled) {
    return null
  }
  
  // ✅ Validate paths before returning
  const validatedPaths = result.filePaths.filter((p) => {
    return p.startsWith(app.getPath('home'))
  })
  
  return validatedPaths
})
```

### File Watching

```javascript
// main.js
const fs = require('fs')
const path = require('path')

class FileWatcher {
  constructor() {
    this.watchers = new Map()
  }
  
  watch(filePath, callback) {
    const absolutePath = path.resolve(filePath)
    
    if (this.watchers.has(absolutePath)) {
      return
    }
    
    const watcher = fs.watch(absolutePath, (eventType, filename) => {
      callback({ eventType, filename, path: absolutePath })
    })
    
    this.watchers.set(absolutePath, watcher)
  }
  
  unwatch(filePath) {
    const absolutePath = path.resolve(filePath)
    const watcher = this.watchers.get(absolutePath)
    
    if (watcher) {
      watcher.close()
      this.watchers.delete(absolutePath)
    }
  }
  
  unwatchAll() {
    for (const watcher of this.watchers.values()) {
      watcher.close()
    }
    this.watchers.clear()
  }
}

// Usage
const fileWatcher = new FileWatcher()
fileWatcher.watch(imagePath, (event) => {
  mainWindow.webContents.send('file:changed', event)
})

app.on('will-quit', () => {
  fileWatcher.unwatchAll()
})
```

---

## Application Lifecycle

### Proper Cleanup

```javascript
// main.js
let isQuitting = false

app.on('before-quit', async (event) => {
  if (!isQuitting) {
    event.preventDefault()
    isQuitting = true
    
    // ✅ Save state
    await saveApplicationState()
    
    // ✅ Close database connections
    await db.close()
    
    // ✅ Clean up file watchers
    fileWatcher.unwatchAll()
    
    // ✅ Close all windows
    for (const window of BrowserWindow.getAllWindows()) {
      window.destroy()
    }
    
    // ✅ Continue quitting
    app.quit()
  }
})

// Handle window close
mainWindow.on('close', (event) => {
  if (!isQuitting) {
    event.preventDefault()
    mainWindow.hide()
    
    // ✅ Save window state
    saveWindowState(mainWindow.getBounds())
  }
})
```

### Auto-Update (Optional)

```javascript
// main.js
const { autoUpdater } = require('electron-updater')

function setupAutoUpdate() {
  autoUpdater.autoDownload = false
  
  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update:available', info)
  })
  
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update:downloaded', info)
  })
  
  ipcMain.handle('app:install-update', () => {
    autoUpdater.quitAndInstall()
  })
}
```

---

## Development Workflow

### Hot Reload in Development

```javascript
// main.js
const isDev = process.env.NODE_ENV === 'development'

if (isDev) {
  // Auto-reload renderer on file changes
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
  })
}
```

### Debugging

```javascript
// main.js
if (isDev) {
  // Open DevTools automatically
  mainWindow.webContents.openDevTools()
  
  // Enable performance monitoring
  app.commandLine.appendSwitch('enable-logging', '--v=1')
}

// renderer/index.html
if (window.location.hostname === 'localhost') {
  // Load development scripts
}
```

---

## Code Generation Guidelines

When generating Electron code:

1. **Always use contextIsolation: true** - Never disable unless absolutely necessary
2. **Always use nodeIntegration: false** - Renderer should not have Node.js access
3. **Always specify preload script** - Bridge between main and renderer
4. **Validate all IPC inputs** - Never trust data from renderer
5. **Use invoke/handle pattern** - Prefer over send/on for requests
6. **Clean up resources** - Remove listeners, close watchers on quit
7. **Handle errors gracefully** - Both in main and renderer processes
8. **Sanitize file paths** - Prevent directory traversal attacks
9. **Enable webSecurity** - Don't disable unless debugging specific issues
10. **Use sandbox: true** - Additional security layer

---

## Proactive Application

When Electron is detected in the project, automatically apply these patterns:

### When Creating BrowserWindow

Always include security settings:

```javascript
// Before: Insecure
const win = new BrowserWindow({
  width: 800,
  height: 600,
  webPreferences: {
    nodeIntegration: true, // ❌ DANGEROUS
  },
})

// After: Secure
const win = new BrowserWindow({
  width: 800,
  height: 600,
  webPreferences: {
    contextIsolation: true, // ✅ Secure
    nodeIntegration: false, // ✅ Secure
    preload: path.join(__dirname, 'preload.js'), // ✅ Bridge
    webSecurity: true, // ✅ Enable
    sandbox: true, // ✅ Additional security
  },
})
```

### When Implementing IPC

Always validate and sanitize:

```javascript
// Before: No validation
ipcMain.handle('save:data', (event, data) => {
  return db.save(data) // ❌ Trusts all input
})

// After: With validation
ipcMain.handle('save:data', async (event, data) => {
  // ✅ Validate
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data')
  }
  
  // ✅ Sanitize
  const sanitized = {
    title: String(data.title || '').slice(0, 200),
    content: String(data.content || '').slice(0, 100000),
  }
  
  return await db.save(sanitized)
})
```

### When Reviewing Code

Flag these issues in Electron projects:

- ❌ `nodeIntegration: true` - CRITICAL security vulnerability
- ❌ `contextIsolation: false` - Allows prototype pollution attacks
- ❌ `webSecurity: false` - Disables same-origin policy
- ❌ Missing `preload` script - No secure bridge
- ❌ Raw `ipcRenderer.send()` exposed to renderer - Should use contextBridge
- ❌ No input validation in IPC handlers - Security risk
- ❌ File paths not sanitized - Directory traversal risk
- ❌ Memory leaks in IPC listeners - Missing cleanup
- ❌ Blocking main process - Should use async operations
- ❌ No error handling in IPC - Crashes on errors

---

## Security Checklist

Before releasing an Electron app, verify:

- [ ] `contextIsolation: true` in all BrowserWindows
- [ ] `nodeIntegration: false` in all BrowserWindows
- [ ] `webSecurity: true` (unless debugging)
- [ ] `sandbox: true` enabled
- [ ] Preload script uses `contextBridge` properly
- [ ] No raw `ipcRenderer` exposed to renderer
- [ ] All IPC handlers validate inputs
- [ ] File operations sanitize paths
- [ ] CSP headers configured
- [ ] No `eval()` or `unsafe-eval` in CSP
- [ ] Dependencies are up-to-date
- [ ] No sensitive data in localStorage
- [ ] HTTPS for all remote content
- [ ] Auto-update configured (if applicable)

---

## Additional Resources

- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Developer Guide](https://www.electronjs.org/docs/latest/tutorial/quick-start)
- [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [IPC Communication](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)

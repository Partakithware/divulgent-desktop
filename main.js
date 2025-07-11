const { app, BrowserWindow, screen, ipcMain, Menu, dialog, shell, protocol, net } = require('electron');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs'); // Add this line
const os = require('os'); // Add this line for home directory

let mainWindow;

function setWindowTypeDock(winId) {
  const cmd = `xprop -id ${winId} -f _NET_WM_WINDOW_TYPE 32a -set _NET_WM_WINDOW_TYPE _NET_WM_WINDOW_TYPE_DESKTOP`;
  exec(cmd, (err) => {
    if (err) {
      console.error('[xprop] Failed to set window type DOCK:', err.message);
    } else {
      console.log('[xprop] Window type set to DOCK');
    }
  });
  const cmd2 = `xprop -id ${winId} -f _NET_WM_BYPASS_COMPOSITOR 32c -set _NET_WM_BYPASS_COMPOSITOR 1`;
  exec(cmd2, (err) => {
    if (err) {
      console.error('[xprop] Failed to bypass Compositor:', err.message);
    } else {
      console.log('[xprop] Bypassing Compositor');
    }
  });
}

function lowerWindow() {
  if (!mainWindow) return;
  const widBuf = mainWindow.getNativeWindowHandle();
  const wid = widBuf.readUInt32LE(0);
  exec(`wmctrl -i -r ${wid} -b add,below`, (err) => {
    if (err) console.error('wmctrl error:', err);
    else console.log('Window lowered');
  });
}


// Function to get the path to the user's Desktop directory
const getDesktopPath = () => path.join(os.homedir(), 'Desktop');

// --- NEW: Configuration file path and in-memory storage ---
const customIconsConfigFileName = 'custom-desktop-icons.json';
const customIconsConfigPath = path.join(app.getPath('userData'), customIconsConfigFileName);
let customIconsConfig = {}; // This will hold our loaded custom icon data

// --- NEW: Function to load custom icon configuration from disk ---
async function loadCustomIconsConfig() {
    try {
        if (fs.existsSync(customIconsConfigPath)) {
            const data = await fs.promises.readFile(customIconsConfigPath, 'utf-8');
            customIconsConfig = JSON.parse(data);
            console.log(`[Persistence] Loaded custom icons config from: ${customIconsConfigPath}`);
        } else {
            console.log(`[Persistence] Custom icons config file not found, starting with empty config.`);
            customIconsConfig = {};
        }
    } catch (error) {
        console.error(`[Persistence] Error loading custom icons config: ${error}`);
        customIconsConfig = {}; // Reset to empty on error to prevent issues
    }
}

// --- NEW: Function to save custom icon configuration to disk ---
async function saveCustomIconsConfig() {
    try {
        const data = JSON.stringify(customIconsConfig, null, 2); // Pretty print JSON
        await fs.promises.writeFile(customIconsConfigPath, data, 'utf-8');
        console.log(`[Persistence] Saved custom icons config to: ${customIconsConfigPath}`);
    } catch (error) {
        console.error(`[Persistence] Error saving custom icons config: ${error}`);
    }
}


async function resolveIconPath(iconName) {
    if (!iconName) {
        console.log(`[Icon Lookup] No icon name provided.`);
        return ''; // Will trigger fallback in renderer
    }

    // FIRST: Check if it's already an absolute path (e.g., /path/to/my/icon.png)
    if (path.isAbsolute(iconName)) {
        try {
            await fs.promises.access(iconName); // Check if file exists
            console.log(`[Icon Lookup] Absolute path found for "${iconName}": file://${iconName}`);
            return `file://${iconName}`;
        } catch (e) {
            console.warn(`[Icon Lookup] Absolute path "${iconName}" does not exist.`);
        }
    }

    // If it's not an absolute path, and we don't have system tools like xdg-icon-lookup or gio icon,
    // we cannot reliably resolve theme-based icon names (like "firefox-nightly", "steam").
    // In this case, we'll return an empty string, which will trigger the generic fallback icon in renderer.
    console.warn(`[Icon Lookup] Icon name "${iconName}" is not an absolute path, and no system icon lookup tool (xdg-icon-lookup, gio icon) found. Falling back to default icon.`);
    return ''; // Return empty string to trigger the fallback in renderer
}


// Function to read and parse a .desktop file
async function parseDesktopFile(filePath) {
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const data = {};
        let inDesktopEntry = false;

        for (const line of lines) {
            if (line.trim() === '[Desktop Entry]') {
                inDesktopEntry = true;
                continue;
            }
            if (inDesktopEntry) {
                const match = line.match(/^(\w+)\s*=\s*(.*)$/);
                if (match) {
                    data[match[1]] = match[2];
                }
            }
        }
        // Return only relevant fields
        return {
            filePath: filePath,
            name: data.Name || path.basename(filePath, '.desktop'),
            exec: data.Exec || '',
            icon: data.Icon || '',
            type: data.Type || 'Application',
            terminal: data.Terminal === 'true' // Check if it needs a terminal
        };
    } catch (error) {
        console.error(`Error parsing desktop file ${filePath}:`, error);
        return null;
    }
}

// Function to get all desktop icons
// Modify getDesktopIcons to resolve icon paths before sending to renderer
// --- MODIFIED getDesktopIcons to apply custom icons from config ---
async function getDesktopIcons() {
    const desktopPath = getDesktopPath();
    try {
        const files = await fs.promises.readdir(desktopPath);
        const desktopEntries = await Promise.all(
            files
                .filter(file => file.endsWith('.desktop'))
                .map(async file => {
                    const entry = await parseDesktopFile(path.join(desktopPath, file));
                    if (entry) {
                        // Check if a custom icon path is stored in our config for this entry
                        if (customIconsConfig[entry.filePath]) {
                            entry.resolvedIconPath = customIconsConfig[entry.filePath];
                            console.log(`[Icon Lookup] Using custom icon from config for "${entry.name}".`);
                        } else {
                            // If no custom icon, resolve the default icon as before
                            entry.resolvedIconPath = await resolveIconPath(entry.icon);
                        }
                    }
                    return entry;
                })
        );
        return desktopEntries.filter(entry => entry !== null);
    } catch (error) {
        console.error('Error reading desktop directory:', error);
        return [];
    }
}

// --- MODIFIED IPC handler for showing custom icon context menu (to save config) ---
ipcMain.on('show-icon-context-menu', (event, iconData) => {
    const template = [
        {
            label: 'Choose Custom Icon...',
            click: async () => {
                const focusedWindow = BrowserWindow.fromWebContents(event.sender);
                if (!focusedWindow) {
                    console.warn('No focused window found for icon dialog.');
                    return;
                }

                const result = await dialog.showOpenDialog(focusedWindow, {
                    properties: ['openFile'],
                    filters: [
                        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });

                if (!result.canceled && result.filePaths.length > 0) {
                    const selectedFilePath = result.filePaths[0];

                    try {
                        const fileBuffer = await fs.promises.readFile(selectedFilePath);
                        let mimeType = 'application/octet-stream';
                        const ext = path.extname(selectedFilePath).toLowerCase();
                        if (ext === '.png') mimeType = 'image/png';
                        else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
                        else if (ext === '.gif') mimeType = 'image/gif';
                        else if (ext === '.svg') mimeType = 'image/svg+xml';
                        else if (ext === '.ico') mimeType = 'image/x-icon';

                        const base64Data = fileBuffer.toString('base64');
                        const dataUri = `data:${mimeType};base64,${base64Data}`;

                        // --- NEW: Store the custom icon in our config and save it ---
                        customIconsConfig[iconData.filePath] = dataUri;
                        await saveCustomIconsConfig();

                        // Send the Data URI back to the renderer
                        event.sender.send('update-icon-src', {
                            filePath: iconData.filePath,
                            newIconPath: dataUri
                        });

                        console.log(`[Main] User selected custom icon for "${iconData.name}". Saved and sent Base64 data URI.`);

                    } catch (error) {
                        console.error(`[Main] Failed to read or convert selected icon file: ${error}`);
                        dialog.showErrorBox('Error', `Could not load selected icon: ${error.message}`);
                    }
                }
            }
        },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' }
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});



function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().size;

  mainWindow = new BrowserWindow({
    x: 0, y: 0, width, height,
    frame: false,
    fullscreen: true,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setIgnoreMouseEvents(false);
  //mainWindow.loadFile('index.html');
  mainWindow.loadURL('http://localhost:5173');
  mainWindow.once('ready-to-show', () => {
    //mainWindow.showInactive();

    // Wait a tick for fullscreen to apply and get size
    setTimeout(() => {
      // Grab fullscreen size
      const [width, height] = mainWindow.getSize();

      // Exit fullscreen and manually set window size
      mainWindow.setFullScreen(false);
      mainWindow.setBounds({ x: 0, y: 0, width, height });

      // Set DOCK type and lower window
      const wid = mainWindow.getNativeWindowHandle().readUInt32LE(0);
      setWindowTypeDock(wid);
      lowerWindow();

      // Maintain stacking order periodically
      setInterval(lowerWindow, 2000);
    }, 100);
  });


  

  mainWindow.on('closed', () => { mainWindow = null; });
}

const http = require('http');

function waitForViteReady(retries = 50) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get('http://localhost:5173', (res) => {
        resolve(); // Vite is ready
      }).on('error', () => {
        if (retries === 0) return reject(new Error('Vite did not start in time.'));
        setTimeout(attempt, 200); // Retry after 200ms
        retries--;
      });
    };
    attempt();
  });
}

app.commandLine.appendSwitch('disable-features', 'MediaSessionService');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-surface-synchronization');
app.commandLine.appendSwitch('disable-zero-copy'); // force raster paths

app.whenReady().then(async () => {
  await waitForViteReady();

  await loadCustomIconsConfig(); // Load config before creating window or getting icons

  createWindow();

      // IPC handler to send desktop icons to the renderer when requested
    ipcMain.on('desktop-icons-request', async (event) => {
        const icons = await getDesktopIcons();
        event.reply('desktop-icons-update', icons);
    });

    // IPC handler to launch an application
    ipcMain.on('launch-app', (event, appPath) => {
        // Simple execution; for more robust launching (e.g. arguments, env vars), use spawn
        console.log(`Attempting to launch: ${appPath}`);
        exec(appPath, (err) => { // Use exec for simple commands
            if (err) {
                console.error(`Failed to launch ${appPath}:`, err.message);
                // You could send an error back to renderer here
            } else {
                console.log(`${appPath} launched successfully.`);
            }
        });
    });

    // Watch for changes in the Desktop directory and update renderer
    const desktopWatcher = fs.watch(getDesktopPath(), async (eventType, filename) => {
        console.log(`Desktop change detected: ${eventType} ${filename}`);
        // Debounce this to avoid multiple rapid updates
        if (mainWindow && !mainWindow.isDestroyed()) {
            const updatedIcons = await getDesktopIcons();
            mainWindow.webContents.send('desktop-icons-update', updatedIcons);
        }
    });

    // Cleanup watcher on app quit
    app.on('before-quit', () => {
        desktopWatcher.close();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

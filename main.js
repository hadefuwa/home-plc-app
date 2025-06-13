// Suppress all console output
console.log = function() {};
console.warn = function() {};
console.error = function() {};
console.info = function() {};
console.debug = function() {};

// Also suppress process.stdout
if (process.stdout.write) {
    process.stdout.write = function() {};
}
if (process.stderr.write) {
    process.stderr.write = function() {};
}

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const nodes7 = require('nodes7');
const conn = new nodes7();
conn.silent = true;  // Set silent mode immediately after creation
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const configPath = path.join(app.getPath('userData'), 'config.json');

let mainWindow;
let isConnected = false;  // Add a connection state flag
let connectionCheckInterval; // Add interval variable for connection monitoring
let keyboardOpen = false;
let keyboardTimer = null;

// Connection parameters for the PLC
let connectionParams = {
    host: '192.168.0.1', // Default IP address
    port: 102,           // S7 communication port
    rack: 0,
    slot: 1,
    debug: true  // Enable debug for troubleshooting
};

// Define PLC data structure
const plcTags = [
    // HMI Buttons (DB1.DBX0.0 - DB1.DBX0.1)
    {
        description: 'Clear Forcing',
        address: 'DB1,X0.0',
        type: 'BOOL',
        value: false
    },
    {
        description: 'Fault Reset',
        address: 'DB1,X0.1',
        type: 'BOOL',
        value: false
    },
    // Digital Inputs A (DB1.DBX2.0 - DB1.DBX16.0)
    {
        description: 'Digital Input A0',
        address: 'DB1,X2.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X2.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X2.2',
            value: false
        }
    },
    {
        description: 'Digital Input A1',
        address: 'DB1,X4.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X4.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X4.2',
            value: false
        }
    },
    {
        description: 'Digital Input A2',
        address: 'DB1,X6.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X6.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X6.2',
            value: false
        }
    },
    {
        description: 'Digital Input A3',
        address: 'DB1,X8.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X8.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X8.2',
            value: false
        }
    },
    {
        description: 'Digital Input A4',
        address: 'DB1,X10.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X10.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X10.2',
            value: false
        }
    },
    {
        description: 'Digital Input A5',
        address: 'DB1,X12.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X12.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X12.2',
            value: false
        }
    },
    {
        description: 'Digital Input A6',
        address: 'DB1,X14.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X14.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X14.2',
            value: false
        }
    },
    {
        description: 'Digital Input A7',
        address: 'DB1,X16.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X16.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X16.2',
            value: false
        }
    },
    // Digital Inputs B (DB1.DBX18.0 - DB1.DBX28.0)
    {
        description: 'Digital Input B0',
        address: 'DB1,X18.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X18.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X18.2',
            value: false
        }
    },
    {
        description: 'Digital Input B1',
        address: 'DB1,X20.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X20.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X20.2',
            value: false
        }
    },
    {
        description: 'Digital Input B2',
        address: 'DB1,X22.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X22.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X22.2',
            value: false
        }
    },
    {
        description: 'Digital Input B3',
        address: 'DB1,X24.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X24.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X24.2',
            value: false
        }
    },
    {
        description: 'Digital Input B4',
        address: 'DB1,X26.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X26.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X26.2',
            value: false
        }
    },
    {
        description: 'Digital Input B5',
        address: 'DB1,X28.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X28.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X28.2',
            value: false
        }
    },
    // Analog Inputs
    {
        description: 'AI0 Raw Value',
        address: 'DB1,INT30',
        type: 'INT',
        value: 0
    },
    {
        description: 'AI0 Scaled Value',
        address: 'DB1,REAL32',
        type: 'REAL',
        value: 0
    },
    {
        description: 'AI0 Offset',
        address: 'DB1,REAL36',
        type: 'REAL',
        value: 0
    },
    {
        description: 'AI0 Scalar',
        address: 'DB1,REAL40',
        type: 'REAL',
        value: 0
    },
    {
        description: 'AI1 Raw Value',
        address: 'DB1,INT44',
        type: 'INT',
        value: 0
    },
    {
        description: 'AI1 Scaled Value',
        address: 'DB1,REAL46',
        type: 'REAL',
        value: 0
    },
    {
        description: 'AI1 Offset',
        address: 'DB1,REAL50',
        type: 'REAL',
        value: 0
    },
    {
        description: 'AI1 Scalar',
        address: 'DB1,REAL54',
        type: 'REAL',
        value: 0
    },
    // Stats
    {
        description: 'Forcing Active',
        address: 'DB1,X78.0',
        type: 'BOOL',
        value: false
    },
    {
        description: 'Forced Count',
        address: 'DB1,INT80',
        type: 'INT',
        value: 0
    },
    // Digital Outputs A
    {
        description: 'Digital Output A0',
        address: 'DB1,X58.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X58.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X58.2',
            value: false
        }
    },
    {
        description: 'Digital Output A1',
        address: 'DB1,X60.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X60.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X60.2',
            value: false
        }
    },
    {
        description: 'Digital Output A2',
        address: 'DB1,X62.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X62.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X62.2',
            value: false
        }
    },
    {
        description: 'Digital Output A3',
        address: 'DB1,X64.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X64.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X64.2',
            value: false
        }
    },
    {
        description: 'Digital Output A4',
        address: 'DB1,X66.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X66.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X66.2',
            value: false
        }
    },
    {
        description: 'Digital Output A5',
        address: 'DB1,X68.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X68.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X68.2',
            value: false
        }
    },
    {
        description: 'Digital Output A6',
        address: 'DB1,X70.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X70.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X70.2',
            value: false
        }
    },
    {
        description: 'Digital Output A7',
        address: 'DB1,X72.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X72.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X72.2',
            value: false
        }
    },
    {
        description: 'Digital Output B0',
        address: 'DB1,X74.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X74.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X74.2',
            value: false
        }
    },
    {
        description: 'Digital Output B1',
        address: 'DB1,X76.0',
        type: 'BOOL',
        value: false,
        forcedState: {
            address: 'DB1,X76.1',
            value: false
        },
        forcedStatus: {
            address: 'DB1,X76.2',
            value: false
        }
    },
];

// Helper to load config
function loadConfig() {
    if (!fs.existsSync(configPath)) {
        // Default config
        const defaultConfig = { plcIp: '192.168.0.99' };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Helper to save config
function saveConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

let appConfig = loadConfig();

// Function to check connection status
function checkConnection() {
    if (isConnected) {
        // Try to read a simple DB bit that should exist
        conn.addItems([{
            name: 'TEST_CONNECTION',
            address: 'DB1,X0.0'  // Adjust this to a valid address in your PLC
        }]);
        
        conn.readAllItems((err, values) => {
            // Remove test item regardless of result
            conn.removeItems(['TEST_CONNECTION']);
            
            // Check for any kind of error
            if (err || values === undefined) {
                console.log('Connection check failed:', err);
                isConnected = false;
                if (mainWindow) {
                    mainWindow.webContents.send('connection-status', {
                        connected: false,
                        error: 'Connection lost to PLC'
                    });
                }
                // Stop the interval if connection is lost
                if (connectionCheckInterval) {
                    clearInterval(connectionCheckInterval);
                    connectionCheckInterval = null;
                }
                // Try to clean up the connection
                try {
                    conn.dropConnection();
                } catch (e) {
                    console.log('Error dropping connection:', e);
                }
            }
        });
    }
}

// Function to attempt PLC connection
async function connectToPLC(ipAddress) {
    connectionParams.host = ipAddress;
    
    return new Promise((resolve, reject) => {
        if (isConnected) {
            conn.dropConnection();
            isConnected = false;
            if (connectionCheckInterval) {
                clearInterval(connectionCheckInterval);
                connectionCheckInterval = null;
            }
        }
        
        // Enable debug mode temporarily for troubleshooting
        conn.silent = false;
        conn.globalDebug = true;
        
        console.log('Attempting to connect to PLC at:', ipAddress);
        console.log('Connection parameters:', connectionParams);
        
        conn.initiateConnection(connectionParams, (err) => {
            if (err) {
                isConnected = false;
                console.error('PLC Connection Error:', err);
                reject(err);
            } else {
                isConnected = true;
                console.log('Successfully connected to PLC');
                // Start periodic reading of all tags
                setInterval(readAllTags, 1000); // Read every second
                resolve('Connected to PLC');
            }
        });
    });
}

// Add these near the top after your requires
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu');

// Create the main window (only one createWindow function)
function createWindow() {
    mainWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: true,
            partition: 'persist:main',
            enableRemoteModule: true,
            spellcheck: false,
            offscreen: false
        },
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#ffffff'
    });

    // Clear cache on startup
    mainWindow.webContents.session.clearCache().then(() => {
        console.log('Cache cleared');
    });

    // Suppress console messages from renderer
    mainWindow.webContents.on('console-message', (e, level, message) => {
        e.preventDefault();
    });

    // Maximize window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();

        // BEGIN: Simple update check
        checkForUpdates();
        // END: Simple update check
    });

    // Add CSP headers with more permissive font-src
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'",
                    "script-src 'self'",
                    "style-src 'self' 'unsafe-inline'",
                    "font-src 'self' data: https: http: *",
                    "img-src 'self' data:"
                ].join('; ')
            }
        });
    });

    mainWindow.loadFile('index.html');

    // Attempt to connect automatically after window loads
    mainWindow.webContents.on('did-finish-load', async () => {
        try {
            const result = await connectToPLC(appConfig.plcIp || '192.168.0.99');
            mainWindow.webContents.send('auto-connect-result', {
                success: true,
                message: result
            });
        } catch (error) {
            mainWindow.webContents.send('auto-connect-result', {
                success: false,
                message: `Auto-connect failed: ${error}`
            });
        }
    });
}

app.whenReady().then(() => {
    createWindow();
});

// Add cleanup function
function cleanup() {
    if (isConnected) {
        try {
            conn.dropConnection();
            isConnected = false;
        } catch (e) {
            console.log('Error dropping connection:', e);
        }
    }
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
        connectionCheckInterval = null;
    }
    
    // Add keyboard cleanup
    if (keyboardOpen) {
        try {
            exec('taskkill /F /IM osk.exe', () => {});
            keyboardOpen = false;
        } catch (e) {
            // Ignore errors during cleanup
        }
    }
    if (keyboardTimer) {
        clearTimeout(keyboardTimer);
        keyboardTimer = null;
    }
}

// Update window-all-closed event
app.on('window-all-closed', () => {
    cleanup();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Add before-quit event handler
app.on('before-quit', () => {
    cleanup();
});

// Update activate event
app.on('activate', () => {
    cleanup();  // Add cleanup call before creating new window
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Connect to PLC
ipcMain.handle('connect-plc', async (event, ipAddress) => {
    try {
        // First disconnect if already connected
        if (isConnected) {
            conn.dropConnection();
            isConnected = false;
            if (connectionCheckInterval) {
                clearInterval(connectionCheckInterval);
                connectionCheckInterval = null;
            }
        }
        
        // Then try new connection
        await connectToPLC(ipAddress);
        return 'Connected successfully';
    } catch (error) {
        throw new Error(`Connection failed: ${error.message}`);
    }
});

// Read from PLC
ipcMain.handle('read-plc', async (event, address) => {
    return new Promise((resolve, reject) => {
        if (!isConnected) {
            reject('Not connected to PLC');
            return;
        }

        conn.addItems([address]);
        conn.readAllItems((err, values) => {
            if (err) {
                reject(err);
            } else {
                resolve(values[address]);
            }
        });
    });
});

// Write to PLC
ipcMain.handle('write-plc', async (event, address, value) => {
    return new Promise((resolve, reject) => {
        if (!isConnected) {
            reject('Not connected to PLC');
            return;
        }

        conn.writeItems(address, value, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve('Value written successfully');
            }
        });
    });
});

// Add new IPC handler to get PLC tags
ipcMain.handle('get-plc-tags', () => {
    return plcTags;
});

// Modify the readAllTags function
function readAllTags() {
    if (!isConnected) return;

    try {
        // Get all addresses including force states
        const addresses = [];
        plcTags.forEach(tag => {
            // Add main tag address
            addresses.push(tag.address);
            // Add force state addresses if they exist
            if (tag.forcedState) {
                addresses.push(tag.forcedState.address);
                addresses.push(tag.forcedStatus.address);
            }
        });

        // Set up connection parameters
        if (!conn.translationCB) {
            conn.setTranslationCB(tag => tag);
        }
        conn.silent = true;

        // Clear existing items first
        try {
            conn.removeItems(['*']);
        } catch (e) {
            // Ignore removal errors
        }

        // Add all items at once
        conn.addItems(addresses);

        // Read all items
        conn.readAllItems((err, values) => {
            if (err) {
                console.error('Error reading tags:', err);
                return;
            }

            // Update tag values
            plcTags.forEach(tag => {
                if (values && values.hasOwnProperty(tag.address)) {
                    tag.value = values[tag.address];
                    
                    // Update force states if they exist
                    if (tag.forcedState && values.hasOwnProperty(tag.forcedState.address)) {
                        tag.forcedState.value = values[tag.forcedState.address];
                    }
                    if (tag.forcedStatus && values.hasOwnProperty(tag.forcedStatus.address)) {
                        tag.forcedStatus.value = values[tag.forcedStatus.address];
                    }
                }
            });

            // Send updates to renderer
            if (mainWindow) {
                mainWindow.webContents.send('plc-values-updated', plcTags);
            }
        });

    } catch (error) {
        console.error('Error in readAllTags:', error);
    }
}

// Simplified keyboard handling function
function toggleOSK(show) {
    if (os.platform() === 'win32') {
        if (show && !keyboardOpen) {
            exec('osk.exe', (error) => {
                if (error) {
                    console.error('Error launching on-screen keyboard:', error);
                }
                keyboardOpen = true;
            });
        } else if (!show && keyboardOpen) {
            exec('taskkill /F /IM osk.exe', (error) => {
                if (error) {
                    console.error('Error closing on-screen keyboard:', error);
                }
                keyboardOpen = false;
            });
        }
    }
}

// Simplified IPC handlers
ipcMain.handle('show-keyboard', () => {
    toggleOSK(true);
});

ipcMain.handle('hide-keyboard', () => {
    toggleOSK(false);
});

// Add this to your existing IPC handlers
ipcMain.handle('disconnect-plc', async () => {
    try {
        if (isConnected) {
            conn.dropConnection();
            isConnected = false;
            if (connectionCheckInterval) {
                clearInterval(connectionCheckInterval);
                connectionCheckInterval = null;
            }
        }
        mainWindow.webContents.send('disconnect-complete');
        return 'Disconnected successfully';
    } catch (error) {
        throw new Error(`Failed to disconnect: ${error.message}`);
    }
});

// BEGIN: Simple update check function
function checkForUpdates() {
    // Check for internet connection first
    require('dns').resolve('github.com', function(err) {
        if (err) {
            // No internet, skip update check
            return;
        }
        // Fetch latest commit hash from GitHub
        const https = require('https');
        const options = {
            hostname: 'api.github.com',
            path: '/repos/hadefuwa/home-plc-app/commits/main',
            method: 'GET',
            headers: { 'User-Agent': 'ElectronApp' }
        };
        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const latestHash = json.sha;
                    // Get local commit hash
                    const { exec } = require('child_process');
                    exec('git rev-parse HEAD', (error, stdout) => {
                        if (error) return;
                        const localHash = stdout.trim();
                        if (localHash !== latestHash) {
                            // Show popup if update is available
                            const { dialog } = require('electron');
                            dialog.showMessageBox(mainWindow, {
                                type: 'info',
                                title: 'Update Available',
                                message: 'A new update is available on GitHub. Please pull the latest version.',
                                buttons: ['OK']
                            });
                        }
                    });
                } catch (e) {
                    // Ignore JSON parse errors
                }
            });
        });
        req.on('error', () => {}); // Ignore network errors
        req.end();
    });
}
// END: Simple update check function

// Add IPC handler to get app version
ipcMain.handle('get-app-version', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return packageJson.version;
});

// IPC to get config
ipcMain.handle('get-config', async () => {
    return appConfig;
});

// IPC to set config
ipcMain.handle('set-config', async (event, newConfig) => {
    appConfig = { ...appConfig, ...newConfig };
    saveConfig(appConfig);
    return appConfig;
}); 
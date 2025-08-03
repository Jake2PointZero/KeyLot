const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { Low, JSONFile } = require('lowdb');

const dbPath = path.join(app.getPath('userData'), 'keylot-db.json');
const adapter = new JSONFile(dbPath);
const db = new Low(adapter);

async function initDB() {
  await db.read();
  db.data ||= {
    people: [],
    stockNumbers: [],
    logEntries: [],
    records: [],
    options: {
      years: [],
      makes: [],
      models: [],
      colors: [],
    },
  };
  // Ensure options exists and is not missing keys
  db.data.options ||= {};
  db.data.options.makes ||= [];
  db.data.options.models ||= [];
  db.data.options.colors ||= [];
  await db.write();
}

initDB();

async function createWindow() {
  const win = new BrowserWindow({
    width: 850,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// Get Data
ipcMain.handle('get-data', async () => {
  await db.read();
  return {
    people: db.data.people || [],
    stockNumbers: db.data.stockNumbers || [],
    logEntries: db.data.logEntries || [],
    records: db.data.records || [],
  };
});

// Add Person
ipcMain.handle('add-person', async (e, name) => {
  await db.read();
  db.data.people ||= [];
  if (!db.data.people.includes(name)) {
    db.data.people.push(name);
    await db.write();
  }
});

// Remove Person
ipcMain.handle('remove-person', async (e, name) => {
  await db.read();
  db.data.people ||= [];
  db.data.people = db.data.people.filter(p => p !== name);
  await db.write();
});

// Add Stock 
ipcMain.handle('add-stock', async (event, stockData) => {
  await db.read();
  db.data.stockNumbers ||= [];
  if (!db.data.stockNumbers.some(s => s.stockNumber === stockData.stockNumber)) {
    db.data.stockNumbers.push(stockData);
    await db.write();
  }
  return db.data.stockNumbers;
});

// Remove Stock
ipcMain.handle('remove-stock', async (e, stock) => {
  await db.read();
  db.data.stockNumbers ||= [];
  db.data.stockNumbers = db.data.stockNumbers.filter(s => s.stockNumber !== stock); // ✅ FIXED
  await db.write();
});


// Add Log Entry
ipcMain.handle('add-log', async (e, entry) => {
  await db.read();
  db.data.logEntries ||= [];
  db.data.logEntries.push(entry);
  await db.write();
});

// Check out Key
ipcMain.handle('check-out', async (event, { stockNumber, person }) => {
  await db.read();
  db.data.records ||= [];

  const lastAction = [...db.data.records]
    .reverse()
    .find(r => r.stockNumber === stockNumber);

  if (lastAction?.action === 'check-out') {
    return { error: 'Key is already checked out' };
  }

  const timestamp = new Date().toISOString();
  db.data.records.push({ stockNumber, person, action: 'check-out', timestamp });
  await db.write();

  return { success: true };
});

// Check in Key
ipcMain.handle('check-in', async (event, stockNumber) => {
  await db.read();
  db.data.records ||= [];

  const timestamp = new Date().toISOString();

  const lastOut = [...db.data.records]
    .reverse()
    .find(r => r.stockNumber === stockNumber && r.action === 'check-out');

  const person = lastOut?.person || 'Unknown';

  db.data.records.push({ stockNumber, person, action: 'check-in', timestamp });
  await db.write();

  return person;
});

// Options

ipcMain.handle('get-options', async () => {
  await db.read();
  db.data.options ||= { years: [], makes: [], models: [], colors: [] };
  return db.data.options;
});

ipcMain.handle('add-option', async (event, category, value) => {
  await db.read();
  db.data.options ||= { years: [], makes: [], models: [], colors: [] };

  if (!db.data.options[category]) {
    db.data.options[category] = [];
  }

  if (!db.data.options[category].includes(value)) {
    db.data.options[category].push(value);
    await db.write();
  }

  return db.data.options[category];
});

// Admin Window
ipcMain.on('open-admin-window', () => {
  const adminWin = new BrowserWindow({
    width: 500,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  adminWin.loadFile('admin.html');
});

// Log Window
let logWindow = null;

function createLogWindow() {
  if (logWindow) {
    logWindow.focus();
    return;
  }

  logWindow = new BrowserWindow({
    width: 700,
    height: 650,
    title: 'KeyLot Log',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  logWindow.loadFile('log.html');

  logWindow.on('closed', () => {
    logWindow = null;
  });
}

ipcMain.handle('open-log-window', () => {
  createLogWindow();
});

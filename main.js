const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { Low, JSONFile } = require('lowdb');

const dbPath = path.join(app.getPath('userData'), 'keylot-db.json');
const adapter = new JSONFile(dbPath);
const db = new Low(adapter);

async function initDB() {
  await db.read();
  db.data ||= { people: [], stockNumbers: [], logEntries: [], records: [] };
  await db.write();
}

initDB();

async function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

ipcMain.handle('get-data', async () => {
  await db.read();
  return {
    people: db.data.people || [],
    stockNumbers: db.data.stockNumbers || [],
    logEntries: db.data.logEntries || [],
    records: db.data.records || [],
  };
});

ipcMain.handle('add-person', async (e, name) => {
  await db.read();
  db.data.people ||= [];
  if (!db.data.people.includes(name)) {
    db.data.people.push(name);
    await db.write();
  }
});

ipcMain.handle('remove-person', async (e, name) => {
  await db.read();
  db.data.people ||= [];
  db.data.people = db.data.people.filter(p => p !== name);
  await db.write();
});

ipcMain.handle('add-stock', async (e, stock) => {
  await db.read();
  db.data.stockNumbers ||= [];
  if (!db.data.stockNumbers.includes(stock)) {
    db.data.stockNumbers.push(stock);
    await db.write();
  }
});

ipcMain.handle('remove-stock', async (e, stock) => {
  await db.read();
  db.data.stockNumbers ||= [];
  db.data.stockNumbers = db.data.stockNumbers.filter(s => s !== stock);
  await db.write();
});

ipcMain.handle('add-log', async (e, entry) => {
  await db.read();
  db.data.logEntries ||= [];
  db.data.logEntries.push(entry);
  await db.write();
});

ipcMain.handle('check-out', async (event, { stockNumber, person }) => {
  await db.read();
  db.data.records ||= [];

  // Check if the stock is already checked out
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

// LOG Window

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


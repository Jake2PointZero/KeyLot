const { ipcRenderer } = require('electron');

let selectedPerson = null;
let selectedStock = null;

let people = [];
let stockNumbers = [];
let logEntries = [];

function getCheckedOutKeys(records) {
  const checkedOut = new Set();

  records.forEach(record => {
    if (record.action === 'check-out') {
      checkedOut.add(record.stockNumber);
    } else if (record.action === 'check-in') {
      checkedOut.delete(record.stockNumber);
    }
  });

  console.log('Checked out keys:', [...checkedOut]); // DEBUG
  return checkedOut;
}

function createList(containerId, items, onClickCallback, selectedItem, checkedOutKeys = new Set()) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  items.forEach(item => {
    const div = document.createElement('div');
    div.classList.add('list-item');

    if (containerId === 'stockList' && checkedOutKeys.has(item)) {
      console.log(`Adding star for checked-out key: ${item}`); // DEBUG
      div.textContent = `${item} ⭐`;
    } else {
      div.textContent = item;
    }

    if (item === selectedItem) div.classList.add('selected');

    div.addEventListener('click', () => {
      const listItems = container.querySelectorAll('.list-item');
      listItems.forEach(li => li.classList.remove('selected'));
      div.classList.add('selected');
      onClickCallback(item);
    });

    container.appendChild(div);
  });
}

function updateAllLists() {
  // Sort people list alphabetically
  const sortedPeople = [...people].sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
  createList('peopleList', sortedPeople, p => selectedPerson = p, selectedPerson);

  // Sort stockNumbers alphanumerically
  const sortedStockNumbers = [...stockNumbers].sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
  const checkedOutKeys = getCheckedOutKeys(logEntries);
  createList('stockList', sortedStockNumbers, s => selectedStock = s, selectedStock, checkedOutKeys);
}


function updateLogUI() {
  const log = document.getElementById('log');
  log.innerHTML = '';
  logEntries.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = entry;
    log.appendChild(li);
  });
}

async function loadData() {
  const data = await ipcRenderer.invoke('get-data');
  people = data.people || [];
  stockNumbers = data.stockNumbers || [];
  logEntries = data.records || []; // Use data.records here because checked out keys come from 'records'

  console.log('Loaded logEntries:', logEntries); // DEBUG

  updateAllLists();
  updateLogUI();
}

async function addPersonByName(name) {
  if (!people.includes(name)) {
    people.push(name);
    await ipcRenderer.invoke('add-person', name);
    updateAllLists();
  } else {
    alert('Person already exists.');
  }
}

async function removePerson() {
  if (!selectedPerson) {
    alert('Select a person to remove.');
    return;
  }
  await ipcRenderer.invoke('remove-person', selectedPerson);
  selectedPerson = null;
  await loadData();
}

async function addStockByNumber(stock) {
  if (!stockNumbers.includes(stock)) {
    stockNumbers.push(stock);
    await ipcRenderer.invoke('add-stock', stock);
    updateAllLists();
  } else {
    alert('Stock number already exists.');
  }
}

async function removeStock() {
  if (!selectedStock) {
    alert('Select a stock number to remove.');
    return;
  }
  await ipcRenderer.invoke('remove-stock', selectedStock);
  selectedStock = null;
  await loadData();
}

async function checkOut() {
  if (!selectedPerson || !selectedStock) {
    alert('Please select both a person and a stock number.');
    return;
  }

  const entry = `${selectedPerson} checked out key ${selectedStock} @ ${new Date().toLocaleString()}`;
  await ipcRenderer.invoke('add-log', entry);

  const result = await ipcRenderer.invoke('check-out', { stockNumber: selectedStock, person: selectedPerson });

  if (result?.error) {
    alert(result.error);
    return;
  }

  await loadData();
}

async function checkIn() {
  if (!selectedStock) {
    alert('Please select a stock number to check in.');
    return;
  }

  const person = await ipcRenderer.invoke('check-in', selectedStock); // returns person or 'Unknown'

  if (person === 'Unknown') {
    alert('This key was never checked out.');
    return;
  }

  const entry = `${person} checked in key ${selectedStock} @ ${new Date().toLocaleString()}`;
  await ipcRenderer.invoke('add-log', entry);
  await loadData();
}

function openPersonModal() {
  document.getElementById('personModal').style.display = 'flex';
  document.getElementById('personInput').value = '';
  document.getElementById('personInput').focus();
}

function closePersonModal() {
  document.getElementById('personModal').style.display = 'none';
}

async function confirmAddPerson() {
  const name = document.getElementById('personInput').value.trim();
  if (name) {
    await addPersonByName(name);
    closePersonModal();
  } else {
    alert('Please enter a name.');
  }
}

function openStockModal() {
  document.getElementById('stockModal').style.display = 'flex';
  document.getElementById('stockInput').value = '';
  document.getElementById('stockInput').focus();
}

function closeStockModal() {
  document.getElementById('stockModal').style.display = 'none';
}

async function confirmAddStock() {
  const stock = document.getElementById('stockInput').value.trim();
  if (stock) {
    await addStockByNumber(stock);
    closeStockModal();
  } else {
    alert('Please enter a stock number.');
  }
}

async function openLogWindow() {
  await ipcRenderer.invoke('open-log-window');
}

loadData();

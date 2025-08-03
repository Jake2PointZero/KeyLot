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
  return checkedOut;
}

function displayStockLabel(stock) {
  return `${stock.stockNumber} | ${stock.make} ${stock.model} (${stock.color}) [${stock.vin}]`;
}

function createList(containerId, items, onClickCallback, selectedItem, checkedOutKeys = new Set()) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  items.forEach(item => {
    const div = document.createElement('div');
    div.classList.add('list-item');

    let label = item;
    if (containerId === 'stockList') {
      label = displayStockLabel(item);
      if (checkedOutKeys.has(item.stockNumber)) {
        label += ' ⭐';
      }
    }

    div.textContent = label;

    const isSelected = (containerId === 'stockList' ? item.stockNumber : item) === selectedItem;
    if (isSelected) div.classList.add('selected');

    div.addEventListener('click', () => {
      const listItems = container.querySelectorAll('.list-item');
      listItems.forEach(li => li.classList.remove('selected'));
      div.classList.add('selected');

      if (containerId === 'stockList') {
        onClickCallback(item.stockNumber);
      } else {
        onClickCallback(item);
      }
    });

    container.appendChild(div);
  });
}

function updateAllLists() {
  const sortedPeople = [...people].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  createList('peopleList', sortedPeople, p => selectedPerson = p, selectedPerson);

  const sortedStockNumbers = [...stockNumbers].sort((a, b) =>
    a.stockNumber.localeCompare(b.stockNumber, undefined, { numeric: true, sensitivity: 'base' })
  );
  const checkedOutKeys = getCheckedOutKeys(logEntries);
  createList('stockList', sortedStockNumbers, s => selectedStock = s, selectedStock, checkedOutKeys);
}

async function loadData() {
  const data = await ipcRenderer.invoke('get-data');
  people = data.people || [];
  stockNumbers = data.stockNumbers || [];
  logEntries = data.records || [];
  updateAllLists();
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

async function addStockByNumber(stockData) {
  if (!stockNumbers.some(s => s.stockNumber === stockData.stockNumber)) {
    stockNumbers.push(stockData);
    await ipcRenderer.invoke('add-stock', stockData);
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

  const result = await ipcRenderer.invoke('check-out', { stockNumber: selectedStock, person: selectedPerson });

  if (result?.error) {
    alert(result.error);
    return;
  }

  const entry = `${selectedPerson} checked out key ${selectedStock} @ ${new Date().toLocaleString()}`;
  await ipcRenderer.invoke('add-log', entry);

  await loadData();
}

async function checkIn() {
  if (!selectedStock) {
    alert('Please select a stock number to check in.');
    return;
  }

  const person = await ipcRenderer.invoke('check-in', selectedStock);
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

async function openStockModal() {
  // First populate dropdowns and set defaults
  await populateDropdowns();

  // Then show modal and clear only text inputs
  document.getElementById('stockModal').style.display = 'flex';
  document.getElementById('stockInput').value = '';
  document.getElementById('vinInput').value = '';
  document.getElementById('stockInput').focus();
}

function closeStockModal() {
  document.getElementById('stockModal').style.display = 'none';
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

async function confirmAddStock() {
  const stockNumber = document.getElementById('stockInput').value.trim();
  const year = document.getElementById('yearDropdown').value.trim();
  const make = document.getElementById('makeDropdown').value.trim();
  const model = document.getElementById('modelDropdown').value.trim();
  const color = document.getElementById('colorDropdown').value.trim();
  const vin = document.getElementById('vinInput').value.trim();

  if (stockNumber && year && make && model && color && vin) {
    const stockData = { stockNumber, year, make, model, color, vin };
    await addStockByNumber(stockData);
    closeStockModal();
  } else {
    alert('Please fill in all stock fields.');
  }
}

async function openLogWindow() {
  await ipcRenderer.invoke('open-log-window');
}

function openAdmin() {
  ipcRenderer.send('open-admin-window');
}

async function populateDropdowns() {
  const options = await ipcRenderer.invoke('get-options');

  populateSelect('yearDropdown', options.years);
  populateSelect('makeDropdown', options.makes);
  populateSelect('modelDropdown', options.models);
  populateSelect('colorDropdown', options.colors);

  // Set defaults from localStorage (if valid)
  const defaultYear = localStorage.getItem('default-year');
  if (defaultYear) {
    const yearSelect = document.getElementById('yearDropdown');
    if ([...yearSelect.options].some(opt => opt.value === defaultYear)) {
      yearSelect.value = defaultYear;
    }
  }

  const defaultMake = localStorage.getItem('default-make');
  if (defaultMake) {
    const makeSelect = document.getElementById('makeDropdown');
    if ([...makeSelect.options].some(opt => opt.value === defaultMake)) {
      makeSelect.value = defaultMake;
    }
  }
}

function populateSelect(selectId, items) {
  const select = document.getElementById(selectId);

  // Sort items (numeric if all numbers, otherwise alphabetically)
  const sortedItems = [...items].sort((a, b) => {
    // Try to detect numeric sorting (e.g., years)
    const aNum = parseInt(a);
    const bNum = parseInt(b);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum; // Numeric sort
    }

    return a.toString().localeCompare(b.toString()); // Alphabetic sort
  });

  select.innerHTML = '';
  sortedItems.forEach(item => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
}


// On load: first populate dropdowns with defaults, then load lists
(async () => {
  await populateDropdowns();
  await loadData();
})();

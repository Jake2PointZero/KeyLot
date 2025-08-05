const { ipcRenderer } = require('electron');

let selectedPerson = null;
let selectedStocks = new Set();  // Changed from selectedStock

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

// Modified to support multi-selection on stock list
function createList(containerId, items, onClickCallback, selectedItemOrSet, checkedOutKeys = new Set()) {
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

    // Determine if selected: for stockList, selectedItemOrSet is a Set
    let isSelected = false;
    if (containerId === 'stockList') {
      isSelected = selectedItemOrSet.has(item.stockNumber);
    } else {
      isSelected = item === selectedItemOrSet;
    }

    if (isSelected) div.classList.add('selected');

    div.addEventListener('click', () => {
      if (containerId === 'stockList') {
        // Toggle selection for multiple stocks
        if (selectedStocks.has(item.stockNumber)) {
          selectedStocks.delete(item.stockNumber);
          div.classList.remove('selected');
        } else {
          selectedStocks.add(item.stockNumber);
          div.classList.add('selected');
        }
        onClickCallback(selectedStocks); // Pass updated set if needed
      } else {
        // Single selection for people
        selectedPerson = item;
        // Remove selection from all others and select this one
        const listItems = container.querySelectorAll('.list-item');
        listItems.forEach(li => li.classList.remove('selected'));
        div.classList.add('selected');
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
  createList('stockList', sortedStockNumbers, s => selectedStocks = s, selectedStocks, checkedOutKeys);
}

async function loadData() {
  const data = await ipcRenderer.invoke('get-data');
  people = data.people || [];
  stockNumbers = data.stockNumbers || [];
  logEntries = data.records || [];
  // Clear selected stocks on reload for consistency
  selectedStocks.clear();
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
  if (selectedStocks.size !== 1) {
    alert('Select exactly one stock number to remove.');
    return;
  }
  const stockToRemove = Array.from(selectedStocks)[0];
  await ipcRenderer.invoke('remove-stock', stockToRemove);
  selectedStocks.delete(stockToRemove);
  await loadData();
}

async function checkOut() {
  if (!selectedPerson) {
    alert('Please select a person.');
    return;
  }
  if (selectedStocks.size === 0) {
    alert('Please select one or more stock numbers to check out.');
    return;
  }

  // Loop through selected stocks to check out
  for (const stockNumber of selectedStocks) {
    const result = await ipcRenderer.invoke('check-out', { stockNumber, person: selectedPerson });
    if (result?.error) {
      alert(`Error checking out ${stockNumber}: ${result.error}`);
      return;
    }

    const entry = `${selectedPerson} checked out key ${stockNumber} @ ${new Date().toLocaleString()}`;
    await ipcRenderer.invoke('add-log', entry);
  }

  await loadData();
}

async function checkIn() {
  if (selectedStocks.size === 0) {
    alert('Please select one or more stock numbers to check in.');
    return;
  }

  // Loop through selected stocks to check in
  for (const stockNumber of selectedStocks) {
    const person = await ipcRenderer.invoke('check-in', stockNumber);
    if (person === 'Unknown') {
      alert(`Key ${stockNumber} was never checked out.`);
      continue;
    }

    const entry = `${person} checked in key ${stockNumber} @ ${new Date().toLocaleString()}`;
    await ipcRenderer.invoke('add-log', entry);
  }

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
  await populateDropdowns();
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
    const aNum = parseInt(a);
    const bNum = parseInt(b);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }

    return a.toString().localeCompare(b.toString());
  });

  select.innerHTML = '';
  sortedItems.forEach(item => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
}

// On load: populate dropdowns with defaults, then load lists
(async () => {
  await populateDropdowns();
  await loadData();
})();

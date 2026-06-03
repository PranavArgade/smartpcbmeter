// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase Configurations
const firebaseConfig = {
  apiKey: "AIzaSyBgZPgRrBS4m47iSfymLM15qzehxPZyvG4",
  authDomain: "pcb-meter.firebaseapp.com",
  databaseURL: "https://pcb-meter-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pcb-meter",
  storageBucket: "pcb-meter.firebasestorage.app",
  messagingSenderId: "485431759807",
  appId: "1:485431759807:web:f5e14201a93117ef93470a",
  measurementId: "G-R95VVVLHQR"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const firebaseDb = getDatabase(firebaseApp);

// ==========================================================================
// STATE MANAGEMENT
// ==========================================================================
const state = {
  token: localStorage.getItem('pcb_session_token') || sessionStorage.getItem('pcb_session_token') || null,
  activeOperator: 'Pranav Argade',
  activeBatch: 'B-2026-06-001',
  lastReadingId: null,
  lastReadingTime: null,
  isOnline: false,
  theme: localStorage.getItem('pcb_theme') || 'dark',
  
  // Table state
  table: {
    search: '',
    operator: '',
    status: '',
    sortBy: 'timestamp',
    sortOrder: 'DESC',
    limit: 10,
    page: 1,
    total: 0
  }
};

// ApexCharts instances
const charts = {
  ac: null,
  dc: null,
  current: null,
  temp: null
};

// ==========================================================================
// DOM ELEMENTS
// ==========================================================================
const DOM = {
  html: document.documentElement,
  body: document.body,
  
  // Auth
  loginForm: document.getElementById('login-form'),
  emailInput: document.getElementById('email'),
  passwordInput: document.getElementById('password'),
  togglePasswordBtn: document.getElementById('toggle-password'),
  passwordEyeIcon: document.getElementById('password-eye-icon'),
  rememberMeCheckbox: document.getElementById('remember-me'),
  logoutBtn: document.getElementById('logout-btn'),
  
  // Dashboard Header
  clock: document.getElementById('current-date-time'),
  systemStatus: document.getElementById('system-status-indicator'),
  themeToggle: document.getElementById('theme-toggle-btn'),
  activeOperatorHeader: document.getElementById('display-active-operator-header'),
  
  // Operator config panel
  activeOperatorName: document.getElementById('active-operator-name'),
  activeBatchNumber: document.getElementById('active-batch-number'),
  operatorLoginTime: document.getElementById('operator-login-time'),
  operatorReadingsCount: document.getElementById('operator-readings-count'),
  operatorForm: document.getElementById('operator-form'),
  operatorSelect: document.getElementById('operator-select'),
  batchInput: document.getElementById('batch-input'),
  
  // Live cards
  valAC: document.getElementById('val-ac-voltage'),
  valDC: document.getElementById('val-dc-voltage'),
  valCurrent: document.getElementById('val-current'),
  valTemp: document.getElementById('val-temperature'),
  
  badgeAC: document.getElementById('badge-ac-voltage'),
  badgeDC: document.getElementById('badge-dc-voltage'),
  badgeCurrent: document.getElementById('badge-current'),
  badgeTemp: document.getElementById('badge-temperature'),
  
  timeAC: document.getElementById('time-ac-voltage'),
  timeDC: document.getElementById('time-dc-voltage'),
  timeCurrent: document.getElementById('time-current'),
  timeTemp: document.getElementById('time-temperature'),
  
  // Stats
  kpiTotalTests: document.getElementById('kpi-total-tests'),
  kpiTodayTests: document.getElementById('kpi-today-tests'),
  kpiAvgAC: document.getElementById('kpi-avg-ac'),
  kpiAvgDC: document.getElementById('kpi-avg-dc'),
  kpiAvgCurrent: document.getElementById('kpi-avg-current'),
  kpiAvgTemp: document.getElementById('kpi-avg-temp'),
  kpiPassCount: document.getElementById('kpi-pass-count'),
  kpiFailCount: document.getElementById('kpi-fail-count'),
  
  // Notifications
  notificationsPanel: document.getElementById('notifications-panel'),
  clearLogsBtn: document.getElementById('clear-logs-btn'),
  
  // Table
  tableBody: document.getElementById('table-body'),
  tableSearch: document.getElementById('table-search-input'),
  tableFilterOperator: document.getElementById('table-filter-operator'),
  tableFilterStatus: document.getElementById('table-filter-status'),
  tableHeaders: document.querySelectorAll('#readings-table th.sortable'),
  exportExcelBtn: document.getElementById('export-excel-btn'),
  
  // Table Pagination
  paginatedStart: document.getElementById('paginated-start'),
  paginatedEnd: document.getElementById('paginated-end'),
  paginatedTotal: document.getElementById('paginated-total'),
  btnPrevPage: document.getElementById('btn-prev-page'),
  btnNextPage: document.getElementById('btn-next-page'),
  pageIndicator: document.getElementById('pagination-page-indicator')
};

// ==========================================================================
// APP INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Apply visual theme immediately
  applyTheme(state.theme);
  
  // Check session token
  if (state.token) {
    showDashboardView();
  } else {
    showLoginView();
  }
  
  // Setup event listeners
  setupEventListeners();
  
  // Start clock
  startClock();
});

// ==========================================================================
// THEME & VIEW MANAGEMENT
// ==========================================================================
function applyTheme(themeName) {
  state.theme = themeName;
  DOM.html.setAttribute('data-theme', themeName);
  localStorage.setItem('pcb_theme', themeName);
  
  // Refresh chart themes if loaded
  Object.keys(charts).forEach(key => {
    if (charts[key]) {
      charts[key].updateOptions({
        theme: {
          mode: themeName
        },
        grid: {
          borderColor: themeName === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
        }
      });
    }
  });
}

function showLoginView() {
  DOM.body.className = 'login-view';
  stopDashboardPolling();
}

function showDashboardView() {
  DOM.body.className = 'dashboard-view';
  
  // Load initial settings
  fetchActiveOperator();
  
  // Initialize charts
  initCharts();
  
  // Initial historical data load
  fetchHistory();
  
  // Start polling
  startDashboardPolling();
  
  // Trigger Lucide icons reload
  lucide.createIcons();
  
  addNotification('System Started. Waiting for telemetry data...', 'info');
}

// Clock updates
function startClock() {
  const updateClock = () => {
    const now = new Date();
    DOM.clock.textContent = now.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium'
    });
  };
  updateClock();
  setInterval(updateClock, 1000);
}

// ==========================================================================
// LOG LOGIC / NOTIFICATIONS
// ==========================================================================
function addNotification(message, type = 'info') {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  
  const item = document.createElement('div');
  item.className = `notification-item ${type}`;
  item.innerHTML = `
    <span class="time">${timeStr}</span>
    <span class="msg">${message}</span>
  `;
  
  DOM.notificationsPanel.insertBefore(item, DOM.notificationsPanel.firstChild);
  
  // Cap notifications to 50 items
  while (DOM.notificationsPanel.children.length > 50) {
    DOM.notificationsPanel.removeChild(DOM.notificationsPanel.lastChild);
  }
}

// ==========================================================================
// CHARTS INITIALIZATION & UPDATES
// ==========================================================================
function initCharts() {
  const baseOptions = {
    chart: {
      type: 'line',
      height: 200,
      zoom: { enabled: true },
      animations: {
        enabled: true,
        easing: 'linear',
        dynamicAnimation: { speed: 800 }
      },
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: false,
          zoom: true,
          zoomin: false,
          zoomout: false,
          pan: false,
          reset: true
        }
      },
      background: 'transparent'
    },
    stroke: {
      curve: 'smooth',
      width: 2.5
    },
    theme: { mode: state.theme },
    grid: {
      borderColor: state.theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      padding: { left: 10, right: 10 }
    },
    xaxis: {
      type: 'category',
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      labels: {
        formatter: (val) => val.toFixed(1)
      }
    },
    tooltip: {
      x: { show: true }
    }
  };

  // AC Voltage Chart
  charts.ac = new ApexCharts(document.querySelector("#chart-ac-voltage"), {
    ...baseOptions,
    colors: ['#3b82f6'],
    series: [{ name: 'AC Voltage', data: [] }],
    yaxis: { min: 180, max: 260, labels: { formatter: (val) => `${val.toFixed(0)}V` } }
  });
  charts.ac.render();

  // DC Voltage Chart
  charts.dc = new ApexCharts(document.querySelector("#chart-dc-voltage"), {
    ...baseOptions,
    colors: ['#a855f7'],
    series: [{ name: 'DC Voltage', data: [] }],
    yaxis: { min: 0, max: 15, labels: { formatter: (val) => `${val.toFixed(1)}V` } }
  });
  charts.dc.render();

  // Current Chart
  charts.current = new ApexCharts(document.querySelector("#chart-current"), {
    ...baseOptions,
    colors: ['#eab308'],
    series: [{ name: 'Current', data: [] }],
    yaxis: { min: 0, max: 5, labels: { formatter: (val) => `${val.toFixed(2)}A` } }
  });
  charts.current.render();

  // Temperature Chart
  charts.temp = new ApexCharts(document.querySelector("#chart-temperature"), {
    ...baseOptions,
    colors: ['#f97316'],
    series: [{ name: 'Temperature', data: [] }],
    yaxis: { min: 10, max: 70, labels: { formatter: (val) => `${val.toFixed(0)}°C` } }
  });
  charts.temp.render();
}

async function updateChartsData() {
  try {
    // Fetch last 100 readings for chart visualization
    const response = await fetch('/api/readings/history?limit=100&sortBy=timestamp&sortOrder=ASC');
    if (!response.ok) return;
    
    const result = await response.json();
    const data = result.data || [];
    
    if (data.length === 0) return;

    const timestamps = data.map(r => new Date(r.timestamp).toLocaleTimeString());
    const acVals = data.map(r => r.ac_voltage);
    const dcVals = data.map(r => r.dc_voltage);
    const currentVals = data.map(r => r.current);
    const tempVals = data.map(r => r.temperature);

    charts.ac.updateSeries([{ data: acVals }]);
    charts.ac.updateOptions({ xaxis: { categories: timestamps } });

    charts.dc.updateSeries([{ data: dcVals }]);
    charts.dc.updateOptions({ xaxis: { categories: timestamps } });

    charts.current.updateSeries([{ data: currentVals }]);
    charts.current.updateOptions({ xaxis: { categories: timestamps } });

    charts.temp.updateSeries([{ data: tempVals }]);
    charts.temp.updateOptions({ xaxis: { categories: timestamps } });

  } catch (err) {
    console.error('Error updating charts data', err);
  }
}

// ==========================================================================
// POLLING LOGIC & API INTERACTION
// ==========================================================================
let pollInterval = null;
let firebaseListeners = [];

function startDashboardPolling() {
  stopDashboardPolling();
  
  // Set up Firebase Realtime Database Listeners
  const latestReadingRef = ref(firebaseDb, 'latest_reading');
  const statsRef = ref(firebaseDb, 'stats');
  const activeOperatorRef = ref(firebaseDb, 'active_operator');
  
  // 1. Listen to Latest Reading
  const unsubscribeLatest = onValue(latestReadingRef, (snapshot) => {
    const reading = snapshot.val();
    if (reading) {
      handleLatestTelemetry(reading);
    }
  });
  
  // 2. Listen to Stats
  const unsubscribeStats = onValue(statsRef, (snapshot) => {
    const stats = snapshot.val();
    if (stats) {
      handleStatsUpdate(stats);
    }
  });
  
  // 3. Listen to Active Operator
  const unsubscribeOperator = onValue(activeOperatorRef, (snapshot) => {
    const op = snapshot.val();
    if (op) {
      handleOperatorUpdate(op);
    }
  });
  
  firebaseListeners.push(unsubscribeLatest, unsubscribeStats, unsubscribeOperator);
  
  // We still poll charts data from SQLite history every 2 seconds to update charts
  pollInterval = setInterval(updateChartsData, 2000);
  
  // Initial historical data load
  fetchHistory();
}

function stopDashboardPolling() {
  // Unsubscribe from Firebase listeners
  firebaseListeners.forEach(unsubscribe => {
    try {
      unsubscribe();
    } catch (e) {
      console.error(e);
    }
  });
  firebaseListeners = [];
  
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function handleLatestTelemetry(reading) {
  // Update live metrics cards
  DOM.valAC.textContent = reading.ac_voltage.toFixed(1);
  DOM.valDC.textContent = reading.dc_voltage.toFixed(2);
  DOM.valCurrent.textContent = reading.current.toFixed(3);
  DOM.valTemp.textContent = reading.temperature.toFixed(1);
  
  // Check parameters ranges for metric card badges
  updateMetricBadge(DOM.badgeAC, reading.ac_voltage, 215, 245, 'V');
  updateMetricBadge(DOM.badgeDC, (reading.dc_voltage >= 4.5 && reading.dc_voltage <= 5.5) || (reading.dc_voltage >= 11.0 && reading.dc_voltage <= 12.8), true, true, '');
  updateMetricBadge(DOM.badgeCurrent, reading.current, 0.1, 3.5, 'A');
  updateMetricBadge(DOM.badgeTemp, reading.temperature, -100, 50, '°C');

  const updateTimeStr = new Date(reading.timestamp).toLocaleTimeString();
  DOM.timeAC.textContent = `Last updated: ${updateTimeStr}`;
  DOM.timeDC.textContent = `Last updated: ${updateTimeStr}`;
  DOM.timeCurrent.textContent = `Last updated: ${updateTimeStr}`;
  DOM.timeTemp.textContent = `Last updated: ${updateTimeStr}`;
  
  // Keep track of online/offline status
  state.lastReadingTime = new Date(reading.timestamp);
  checkSystemStatusOnline();

  // Check if it's a new reading to post to the notifications panel
  if (state.lastReadingId !== reading.id) {
    state.lastReadingId = reading.id;
    addNotification(`New Reading Received: ID #${reading.id} (AC: ${reading.ac_voltage.toFixed(1)}V, DC: ${reading.dc_voltage.toFixed(1)}V) [Firebase RTDB]`, 'info');
    
    if (reading.status === 'PASS') {
      addNotification(`Pass Result: Batch ${reading.batch_no} passed test.`, 'pass');
    } else {
      addNotification(`Fail Result: Anomaly detected on Batch ${reading.batch_no}!`, 'fail');
    }

    // Increment Operator readings collected counter in real-time
    const countBadge = document.getElementById('operator-readings-count');
    countBadge.textContent = parseInt(countBadge.textContent) + 1;

    // Reload history table to show new entry at the top
    fetchHistory();
  }
}

function handleStatsUpdate(stats) {
  DOM.kpiTotalTests.textContent = stats.totalTests;
  DOM.kpiTodayTests.textContent = stats.todayTests;
  DOM.kpiAvgAC.textContent = `${stats.avgAcVoltage.toFixed(1)} V`;
  DOM.kpiAvgDC.textContent = `${stats.avgDcVoltage.toFixed(2)} V`;
  DOM.kpiAvgCurrent.textContent = `${stats.avgCurrent.toFixed(3)} A`;
  DOM.kpiAvgTemp.textContent = `${stats.avgTemperature.toFixed(1)} °C`;
  DOM.kpiPassCount.textContent = stats.passCount;
  DOM.kpiFailCount.textContent = stats.failCount;
}

function handleOperatorUpdate(op) {
  state.activeOperator = op.operatorName;
  state.activeBatch = op.batchNo;
  
  DOM.activeOperatorName.textContent = op.operatorName;
  DOM.activeOperatorHeader.textContent = op.operatorName;
  DOM.activeBatchNumber.textContent = op.batchNo;
  DOM.operatorReadingsCount.textContent = op.readingsCount;
  
  const loginDate = new Date(op.loginTime);
  DOM.operatorLoginTime.textContent = loginDate.toLocaleTimeString();
  
  // Set inputs value
  DOM.operatorSelect.value = op.operatorName;
  DOM.batchInput.value = op.batchNo;
}

function updateMetricBadge(badgeEl, val, minOrBool, max, unit) {
  let isNormal = false;
  if (typeof minOrBool === 'boolean') {
    isNormal = minOrBool;
  } else {
    isNormal = val >= minOrBool && val <= max;
  }

  if (isNormal) {
    badgeEl.textContent = 'NORMAL';
    badgeEl.className = 'metric-badge status-normal';
  } else {
    badgeEl.textContent = 'ANOMALY';
    badgeEl.className = 'metric-badge status-anomaly';
  }
}

function checkSystemStatusOnline() {
  if (!state.lastReadingTime) {
    setSystemOffline();
    return;
  }

  const secondsDiff = (new Date() - state.lastReadingTime) / 1000;
  
  if (secondsDiff > 30) {
    if (state.isOnline) {
      setSystemOffline();
    }
  } else {
    if (!state.isOnline) {
      setSystemOnline();
    }
  }
}

// Status transitions
function setSystemOnline() {
  state.isOnline = true;
  DOM.systemStatus.className = 'status-pill status-online';
  DOM.systemStatus.querySelector('.status-text').textContent = 'SYSTEM ONLINE';
  addNotification('System Status: ONLINE. Raspberry Pi data is active.', 'pass');
}

function setSystemOffline() {
  state.isOnline = false;
  DOM.systemStatus.className = 'status-pill status-offline';
  DOM.systemStatus.querySelector('.status-text').textContent = 'SYSTEM OFFLINE';
  addNotification('System Status: OFFLINE. No data received from Raspberry Pi for >30s.', 'fail');
}

// Periodically evaluate offline status (even if no telemetry comes in to update clock diff)
setInterval(checkSystemStatusOnline, 5000);

async function fetchActiveOperator() {
  try {
    const response = await fetch('/api/operator/active');
    if (!response.ok) return;
    
    const op = await response.json();
    handleOperatorUpdate(op);
  } catch (err) {
    console.error('Error fetching operator info:', err);
  }
}

// ==========================================================================
// HISTORY TABLE AND FILTERS
// ==========================================================================
async function fetchHistory() {
  try {
    const { search, operator, status, sortBy, sortOrder, limit, page } = state.table;
    const offset = (page - 1) * limit;
    
    const query = new URLSearchParams({
      search,
      operator,
      status,
      sortBy,
      sortOrder,
      limit,
      offset
    });
    
    const response = await fetch(`/api/readings/history?${query}`);
    if (!response.ok) return;
    
    const result = await response.json();
    const list = result.data || [];
    state.table.total = result.total || 0;
    
    // Update Export link to contain current search & filter states for targeted exports
    DOM.exportExcelBtn.href = `/api/readings/export?${query}`;
    
    renderTable(list);
    renderPagination();
  } catch (err) {
    console.error('Error loading history table:', err);
  }
}

function renderTable(data) {
  if (data.length === 0) {
    DOM.tableBody.innerHTML = `
      <tr class="empty-state">
        <td colspan="8">No records match the current filters. Waiting for telemetry data...</td>
      </tr>
    `;
    return;
  }
  
  DOM.tableBody.innerHTML = data.map(row => {
    const timestampStr = new Date(row.timestamp).toLocaleString();
    const statusClass = row.status.toLowerCase() === 'pass' ? 'pass' : 'fail';
    
    return `
      <tr>
        <td>${timestampStr}</td>
        <td><strong>${row.batch_no}</strong></td>
        <td>${row.operator_name}</td>
        <td>${row.ac_voltage.toFixed(1)} V</td>
        <td>${row.dc_voltage.toFixed(2)} V</td>
        <td>${row.current.toFixed(3)} A</td>
        <td>${row.temperature.toFixed(1)} °C</td>
        <td><span class="status-badge ${statusClass}">${row.status}</span></td>
      </tr>
    `;
  }).join('');
}

function renderPagination() {
  const { limit, page, total } = state.table;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  
  DOM.paginatedStart.textContent = start;
  DOM.paginatedEnd.textContent = end;
  DOM.paginatedTotal.textContent = total;
  
  DOM.btnPrevPage.disabled = page === 1;
  DOM.btnNextPage.disabled = end >= total;
  DOM.pageIndicator.textContent = `Page ${page} of ${Math.ceil(total / limit) || 1}`;
}

// ==========================================================================
// EVENT LISTENERS Setup
// ==========================================================================
function setupEventListeners() {
  
  // 1. Password Visibility Toggle
  DOM.togglePasswordBtn.addEventListener('click', () => {
    const type = DOM.passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    DOM.passwordInput.setAttribute('type', type);
    
    if (type === 'password') {
      DOM.passwordEyeIcon.setAttribute('data-lucide', 'eye');
    } else {
      DOM.passwordEyeIcon.setAttribute('data-lucide', 'eye-off');
    }
    lucide.createIcons();
  });
  
  // 2. Login Form Submit
  DOM.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = DOM.emailInput.value.trim();
    const password = DOM.passwordInput.value;
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        state.token = result.token;
        
        // Remember me logic
        if (DOM.rememberMeCheckbox.checked) {
          localStorage.setItem('pcb_session_token', result.token);
        } else {
          sessionStorage.setItem('pcb_session_token', result.token);
        }
        
        showDashboardView();
      } else {
        alert(result.message || 'Login failed');
      }
    } catch (err) {
      console.error('Error logging in:', err);
      alert('Network error connecting to verification server.');
    }
  });
  
  // 3. Logout Button Click
  DOM.logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('pcb_session_token');
    sessionStorage.removeItem('pcb_session_token');
    state.token = null;
    showLoginView();
  });
  
  // 4. Dark & Light Theme Switcher
  DOM.themeToggle.addEventListener('click', () => {
    const targetTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(targetTheme);
  });
  
  // 5. Config Operator / Batch Form Submit
  DOM.operatorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const operatorName = DOM.operatorSelect.value;
    const batchNo = DOM.batchInput.value.trim();
    
    try {
      const response = await fetch('/api/operator/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorName, batchNo })
      });
      
      if (response.ok) {
        addNotification(`Batch context updated. Operator: ${operatorName}, Batch: ${batchNo}`, 'warning');
        fetchActiveOperator();
        fetchHistory(); // refresh history table with new batch info
      } else {
        alert('Failed to update operator configurations');
      }
    } catch (err) {
      console.error(err);
    }
  });

  // 6. Clear Logs Panel
  DOM.clearLogsBtn.addEventListener('click', () => {
    DOM.notificationsPanel.innerHTML = '';
    addNotification('Logs Cleared.', 'info');
  });

  // 7. Search Input keyup
  let searchTimeout = null;
  DOM.tableSearch.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    state.table.search = e.target.value.trim();
    state.table.page = 1; // reset to page 1 on query change
    searchTimeout = setTimeout(fetchHistory, 300);
  });

  // 8. Filters Select changes
  DOM.tableFilterOperator.addEventListener('change', (e) => {
    state.table.operator = e.target.value;
    state.table.page = 1;
    fetchHistory();
  });

  DOM.tableFilterStatus.addEventListener('change', (e) => {
    state.table.status = e.target.value;
    state.table.page = 1;
    fetchHistory();
  });

  // 9. Column Sorting triggers
  DOM.tableHeaders.forEach(th => {
    th.addEventListener('click', () => {
      const column = th.getAttribute('data-sort');
      
      if (state.table.sortBy === column) {
        // Toggle direction
        state.table.sortOrder = state.table.sortOrder === 'ASC' ? 'DESC' : 'ASC';
      } else {
        state.table.sortBy = column;
        state.table.sortOrder = 'DESC'; // default to DESC on new column
      }
      
      // Update UI classes
      DOM.tableHeaders.forEach(header => {
        header.classList.remove('active-sort', 'asc', 'desc');
        const icon = header.querySelector('.sort-icon');
        if (icon) icon.setAttribute('data-lucide', 'chevrons-up-down');
      });
      
      th.classList.add('active-sort');
      th.classList.add(state.table.sortOrder.toLowerCase());
      
      const columnIcon = th.querySelector('.sort-icon');
      if (columnIcon) {
        if (state.table.sortOrder === 'ASC') {
          columnIcon.setAttribute('data-lucide', 'arrow-up-narrow-wide');
        } else {
          columnIcon.setAttribute('data-lucide', 'arrow-down-narrow-wide');
        }
      }
      
      lucide.createIcons();
      fetchHistory();
    });
  });

  // 10. Table Pagination Navigation
  DOM.btnPrevPage.addEventListener('click', () => {
    if (state.table.page > 1) {
      state.table.page--;
      fetchHistory();
    }
  });

  DOM.btnNextPage.addEventListener('click', () => {
    const maxPage = Math.ceil(state.table.total / state.table.limit);
    if (state.table.page < maxPage) {
      state.table.page++;
      fetchHistory();
    }
  });
}

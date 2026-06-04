// Firebase Configurations
const firebaseConfig = {
  apiKey: "AIzaSyBWrhNr-uI5iqWB8ijgoR0VDaF2zBrArwo",
  authDomain: "smart-pcb-tester.firebaseapp.com",
  projectId: "smart-pcb-tester",
  storageBucket: "smart-pcb-tester.firebasestorage.app",
  messagingSenderId: "79463446387",
  appId: "1:79463446387:web:087d22f90e192ec6ee7706",
  measurementId: "G-T6L8E4LTNJ",
  databaseURL: "https://smart-pcb-tester-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase using compat SDK
firebase.initializeApp(firebaseConfig);
const firebaseDb = firebase.database();

// Helper to parse a UTC timestamp from database/Firebase safely in local time
function parseUTCTimestamp(tsString) {
  if (!tsString) return new Date();
  if (typeof tsString !== 'string') {
    return new Date(tsString);
  }
  if (tsString.includes('Z') || tsString.includes('+') || (tsString.includes('T') && tsString.includes('-') && tsString.indexOf('-') !== tsString.lastIndexOf('-'))) {
    return new Date(tsString);
  }
  let formatted = tsString.trim().replace(' ', 'T');
  if (!formatted.includes('T')) {
    return new Date(tsString);
  }
  if (!formatted.endsWith('Z')) {
    formatted += 'Z';
  }
  return new Date(formatted);
}

// Helper to format Date object as DD/MM/YYYY HH:MM:SS in local timezone (IST)
function formatLocalDateTime(date) {
  if (!date || isNaN(date.getTime())) return '--/--/---- --:--:--';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}


// ==========================================================================
// STATE MANAGEMENT
// ==========================================================================
const state = {
  token: localStorage.getItem('pcb_session_token') || sessionStorage.getItem('pcb_session_token') || null,
  activeOperator: 'Pranav Argade',
  activeBatch: 'B-2026-06-001',
  lastReadingId: null,
  lastReadingTime: null,
  latestReading: null, // Keep track of the full latest reading for status & age updates
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
  
  // Hide loader so login interface is visible
  const loader = document.getElementById('loader-overlay');
  if (loader) {
    loader.classList.add('hidden');
  }
}

function showDashboardView() {
  DOM.body.className = 'dashboard-view';
  
  // Show loader overlay until we get Firebase data
  const loader = document.getElementById('loader-overlay');
  if (loader) {
    loader.classList.remove('hidden');
    loader.querySelector('p').textContent = 'Connecting to PCB machine database...';
  }
  
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
    colors: ['#ef4444'],
    series: [{ name: 'AC Voltage', data: [] }],
    yaxis: { min: 180, max: 260, labels: { formatter: (val) => `${val.toFixed(0)}V` } }
  });
  charts.ac.render();

  // DC Voltage Chart
  charts.dc = new ApexCharts(document.querySelector("#chart-dc-voltage"), {
    ...baseOptions,
    colors: ['#3b82f6'],
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
    colors: ['#22c55e'],
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

    const timestamps = data.map(r => parseUTCTimestamp(r.timestamp).toLocaleTimeString('en-IN', { hour12: false }));
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
  
  // Hide loader once the first data snapshots are received
  let receivedLatest = false;
  let receivedStats = false;
  let receivedSession = false;
  const checkHideLoader = () => {
    if (receivedLatest || receivedStats || receivedSession) {
      const loader = document.getElementById('loader-overlay');
      if (loader) {
        loader.classList.add('hidden');
      }
    }
  };

  // 1. Listen to Latest Reading
  const latestReadingRef = firebaseDb.ref('latest_reading');
  latestReadingRef.on('value', (snapshot) => {
    const reading = snapshot.val();
    receivedLatest = true;
    checkHideLoader();
    if (reading) {
      handleLatestTelemetry(reading);
    } else {
      handleEmptyTelemetry();
    }
  });
  
  // 2. Listen to Stats
  const statsRef = firebaseDb.ref('stats');
  statsRef.on('value', (snapshot) => {
    const stats = snapshot.val();
    receivedStats = true;
    checkHideLoader();
    if (stats) {
      handleStatsUpdate(stats);
    } else {
      handleStatsUpdate(null);
    }
  });
  
  // 3. Listen to Session
  const sessionRef = firebaseDb.ref('session');
  sessionRef.on('value', (snapshot) => {
    const session = snapshot.val();
    receivedSession = true;
    checkHideLoader();
    if (session) {
      handleOperatorUpdate(session);
    }
  });
  
  // Store refs and handlers to unsubscribe later
  firebaseListeners.push(
    { ref: latestReadingRef, event: 'value' },
    { ref: statsRef, event: 'value' },
    { ref: sessionRef, event: 'value' }
  );
  
  // We still poll charts data from SQLite history every 20 seconds to update charts
  pollInterval = setInterval(updateChartsData, 20000);
  
  // Initial historical data load
  fetchHistory();
}

function stopDashboardPolling() {
  // Unsubscribe from Firebase listeners
  firebaseListeners.forEach(listener => {
    try {
      listener.ref.off(listener.event);
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
  if (!reading) return;

  // Store in state so the status checker can calculate age in real-time
  state.latestReading = reading;

  // Extract variables (support both new camelCase and fallback snake_case)
  const ac = reading.acVoltage !== undefined ? reading.acVoltage : reading.ac_voltage;
  const dc = reading.dcVoltage !== undefined ? reading.dcVoltage : reading.dc_voltage;
  const current = reading.current;
  const temp = reading.temperature;
  const status = reading.status;
  const batchNo = reading.batchNo !== undefined ? reading.batchNo : reading.batch_no;
  const id = reading.id;

  // Update live metrics cards safely
  DOM.valAC.textContent = typeof ac === 'number' ? ac.toFixed(1) : (ac !== undefined && ac !== null && !isNaN(parseFloat(ac)) ? parseFloat(ac).toFixed(1) : 'N/A');
  DOM.valDC.textContent = typeof dc === 'number' ? dc.toFixed(2) : (dc !== undefined && dc !== null && !isNaN(parseFloat(dc)) ? parseFloat(dc).toFixed(2) : 'N/A');
  DOM.valCurrent.textContent = typeof current === 'number' ? current.toFixed(3) : (current !== undefined && current !== null && !isNaN(parseFloat(current)) ? parseFloat(current).toFixed(3) : 'N/A');
  DOM.valTemp.textContent = typeof temp === 'number' ? temp.toFixed(1) : (temp !== undefined && temp !== null && !isNaN(parseFloat(temp)) ? parseFloat(temp).toFixed(1) : 'N/A');
  
  // Check parameters ranges for metric card badges
  updateMetricBadge(DOM.badgeAC, ac, 215, 245, 'V');
  updateMetricBadge(DOM.badgeDC, (dc >= 4.5 && dc <= 5.5) || (dc >= 11.0 && dc <= 12.8), true, true, '');
  updateMetricBadge(DOM.badgeCurrent, current, 0.1, 3.5, 'A');
  updateMetricBadge(DOM.badgeTemp, temp, -100, 50, '°C');

  // Convert UTC timestamp to local IST timezone and format it
  const ts = reading.timestamp;
  let updateTimeStr = '--:--:--';
  if (ts) {
    const localDate = parseUTCTimestamp(ts);
    updateTimeStr = localDate.toLocaleTimeString('en-IN', { hour12: false });
  }
  
  DOM.timeAC.textContent = `Last updated: ${updateTimeStr}`;
  DOM.timeDC.textContent = `Last updated: ${updateTimeStr}`;
  DOM.timeCurrent.textContent = `Last updated: ${updateTimeStr}`;
  DOM.timeTemp.textContent = `Last updated: ${updateTimeStr}`;
  
  // Keep track of online/offline status (evaluated in our interval)
  state.lastReadingTime = ts ? parseUTCTimestamp(ts) : new Date();
  
  // Run immediate status/age update
  updateStatusAndAge();

  // Unique reading ID check (use timestamp or id)
  const uniqueId = id || ts;
  if (uniqueId !== undefined && state.lastReadingId !== uniqueId) {
    state.lastReadingId = uniqueId;
    
    const displayAc = typeof ac === 'number' ? ac.toFixed(1) : '--.-';
    const displayDc = typeof dc === 'number' ? dc.toFixed(1) : '--.-';
    addNotification(`New Reading Received: AC: ${displayAc}V, DC: ${displayDc}V [Firebase RTDB]`, 'info');
    
    // Increment Operator readings collected counter in real-time
    const countBadge = document.getElementById('operator-readings-count');
    if (countBadge) {
      countBadge.textContent = parseInt(countBadge.textContent || '0') + 1;
    }

    // Reload history table to show new entry at the top
    fetchHistory();
  }
}

function handleEmptyTelemetry() {
  state.latestReading = null;
  state.lastReadingTime = null;
  
  DOM.valAC.textContent = 'N/A';
  DOM.valDC.textContent = 'N/A';
  DOM.valCurrent.textContent = 'N/A';
  DOM.valTemp.textContent = 'N/A';
  
  DOM.badgeAC.textContent = 'NORMAL';
  DOM.badgeAC.className = 'metric-badge status-normal';
  DOM.badgeDC.textContent = 'NORMAL';
  DOM.badgeDC.className = 'metric-badge status-normal';
  DOM.badgeCurrent.textContent = 'NORMAL';
  DOM.badgeCurrent.className = 'metric-badge status-normal';
  DOM.badgeTemp.textContent = 'NORMAL';
  DOM.badgeTemp.className = 'metric-badge status-normal';
  
  DOM.timeAC.textContent = 'Last updated: Never';
  DOM.timeDC.textContent = 'Last updated: Never';
  DOM.timeCurrent.textContent = 'Last updated: Never';
  DOM.timeTemp.textContent = 'Last updated: Never';
  
  updateStatusAndAge();
}

function handleStatsUpdate(stats) {
  if (!stats) {
    const totalTestsEl = document.getElementById('kpi-total-tests');
    if (totalTestsEl) totalTestsEl.textContent = '0';
    setCell('stats-ac-min', null, 1);
    setCell('stats-ac-max', null, 1);
    setCell('stats-ac-avg', null, 1);
    setCell('stats-dc-min', null, 2);
    setCell('stats-dc-max', null, 2);
    setCell('stats-dc-avg', null, 2);
    setCell('stats-current-min', null, 3);
    setCell('stats-current-max', null, 3);
    setCell('stats-current-avg', null, 3);
    setCell('stats-temp-min', null, 1);
    setCell('stats-temp-max', null, 1);
    setCell('stats-temp-avg', null, 1);
    return;
  }

  // Update total readings count in badge
  const totalTestsEl = document.getElementById('kpi-total-tests');
  if (totalTestsEl) {
    totalTestsEl.textContent = stats.totalReadings !== undefined ? stats.totalReadings : (stats.totalTests !== undefined ? stats.totalTests : 0);
  }

  // Update Min/Max/Avg table cells
  const setCell = (id, val, dec, unit = '') => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = (typeof val === 'number' && !isNaN(val)) ? `${val.toFixed(dec)}${unit}` : 'N/A';
    }
  };

  // AC Voltage stats
  const ac = stats.acVoltage || {};
  setCell('stats-ac-min', ac.min, 1, ' V');
  setCell('stats-ac-max', ac.max, 1, ' V');
  setCell('stats-ac-avg', ac.avg, 1, ' V');

  // DC Voltage stats
  const dc = stats.dcVoltage || {};
  setCell('stats-dc-min', dc.min, 2, ' V');
  setCell('stats-dc-max', dc.max, 2, ' V');
  setCell('stats-dc-avg', dc.avg, 2, ' V');

  // Current stats
  const curr = stats.current || {};
  setCell('stats-current-min', curr.min, 3, ' A');
  setCell('stats-current-max', curr.max, 3, ' A');
  setCell('stats-current-avg', curr.avg, 3, ' A');

  // Temperature stats
  const temp = stats.temperature || {};
  setCell('stats-temp-min', temp.min, 1, ' °C');
  setCell('stats-temp-max', temp.max, 1, ' °C');
  setCell('stats-temp-avg', temp.avg, 1, ' °C');
}

function handleOperatorUpdate(op) {
  const operatorName = op.operatorName || op.operator_name || 'Argade Pranav';
  const batchNo = op.batchNo || op.batch_no || 'B-2026-06-001';
  const readingsCount = op.readingsCount !== undefined ? op.readingsCount : 0;
  
  state.activeOperator = operatorName;
  state.activeBatch = batchNo;
  
  DOM.activeOperatorName.textContent = operatorName;
  DOM.activeOperatorHeader.textContent = operatorName;
  DOM.activeBatchNumber.textContent = batchNo;
  DOM.operatorReadingsCount.textContent = readingsCount;
  
  // Format Login Time to DD/MM/YYYY HH:MM:SS in local timezone
  if (op.loginTime) {
    DOM.operatorLoginTime.textContent = formatLocalDateTime(parseUTCTimestamp(op.loginTime));
  } else {
    DOM.operatorLoginTime.textContent = '--/--/---- --:--:--';
  }
  
  // Set inputs value
  DOM.operatorSelect.value = operatorName;
  DOM.batchInput.value = batchNo;
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

function updateStatusAndAge() {
  if (!state.latestReading) {
    setSystemOffline();
    document.getElementById('last-reading-time-ago').textContent = "Last reading: Never";
    return;
  }
  
  const lastTime = parseUTCTimestamp(state.latestReading.timestamp).getTime();
  const now = Date.now();
  const ageSeconds = Math.max(0, Math.floor((now - lastTime) / 1000));
  
  // Online logic: age < 30 seconds and status field is ONLINE
  const isOnline = ageSeconds < 30 && state.latestReading.status === "ONLINE";
  
  if (isOnline) {
    setSystemOnline();
  } else {
    setSystemOffline();
  }
  
  document.getElementById('last-reading-time-ago').textContent = `Last reading: ${ageSeconds} seconds ago`;
}

// Status transitions
function setSystemOnline() {
  if (state.isOnline) return;
  state.isOnline = true;
  DOM.systemStatus.className = 'status-pill status-online';
  DOM.systemStatus.querySelector('.pulse-dot').style.display = 'inline-block';
  DOM.systemStatus.querySelector('.status-text').textContent = '● ONLINE';
  document.getElementById('offline-banner').classList.remove('active');
  
  // Remove greyed-out state from cards
  document.querySelectorAll('.metric-card').forEach(card => {
    card.classList.remove('offline');
  });
  
  addNotification('System Status: ONLINE. Live telemetry is active.', 'pass');
}

function setSystemOffline() {
  if (!state.isOnline && state.isOnline !== undefined) return;
  state.isOnline = false;
  DOM.systemStatus.className = 'status-pill status-offline';
  DOM.systemStatus.querySelector('.pulse-dot').style.display = 'none';
  DOM.systemStatus.querySelector('.status-text').textContent = '● OFFLINE';
  document.getElementById('offline-banner').classList.add('active');
  
  // Apply greyed-out state to cards
  document.querySelectorAll('.metric-card').forEach(card => {
    card.classList.add('offline');
  });
  
  addNotification('System Status: OFFLINE. System is disconnected or readings stopped.', 'fail');
}

// Run status updater every second
setInterval(updateStatusAndAge, 1000);

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
    const timestampStr = formatLocalDateTime(parseUTCTimestamp(row.timestamp));
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
    
    const loader = document.getElementById('loader-overlay');
    if (loader) {
      loader.classList.remove('hidden');
      loader.querySelector('p').textContent = 'Authenticating operator...';
    }
    
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
        if (loader) loader.classList.add('hidden');
        alert(result.message || 'Login failed');
      }
    } catch (err) {
      if (loader) loader.classList.add('hidden');
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

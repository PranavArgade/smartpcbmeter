const express = require('express');
const cors = require('cors');
const path = require('path');
const xlsx = require('xlsx');
const dbOperations = require('./database');

const FIREBASE_DB_URL = "https://pcb-meter-default-rtdb.asia-southeast1.firebasedatabase.app";

async function syncToFirebase(nodePath, data) {
  try {
    const url = `${FIREBASE_DB_URL}/${nodePath}.json`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      console.error(`Firebase Sync Error for ${nodePath}:`, response.statusText);
    }
  } catch (err) {
    console.error(`Firebase Sync Exception for ${nodePath}:`, err.message);
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple Authentication Endpoint
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'pcb@gmail.com' && password === 'pcb@123') {
    res.json({ success: true, token: 'session_pcb_token_abc123', message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid email or password' });
  }
});

// Operator API
app.get('/api/operator/active', async (req, res) => {
  try {
    const operatorInfo = await dbOperations.getActiveOperator();
    res.json(operatorInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/operator/select', async (req, res) => {
  try {
    const { operatorName, batchNo } = req.body;
    if (!operatorName || !batchNo) {
      return res.status(400).json({ error: 'operatorName and batchNo are required' });
    }
    const updated = await dbOperations.setActiveOperator(operatorName, batchNo);
    
    // Sync operator details to Firebase Realtime Database
    syncToFirebase('active_operator', updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Readings API
app.post('/api/readings', async (req, res) => {
  try {
    const { ac_voltage, dc_voltage, current, temperature, status, timestamp } = req.body;

    if (ac_voltage === undefined || dc_voltage === undefined || current === undefined || temperature === undefined) {
      return res.status(400).json({ error: 'ac_voltage, dc_voltage, current, and temperature are required' });
    }

    // Get currently active operator and batch if not provided in the post request
    let batch_no = req.body.batch_no;
    let operator_name = req.body.operator_name;

    if (!batch_no || !operator_name) {
      const active = await dbOperations.getActiveOperator();
      batch_no = batch_no || active.batchNo;
      operator_name = operator_name || active.operatorName;
    }

    const result = await dbOperations.addReading({
      ac_voltage,
      dc_voltage,
      current,
      temperature,
      batch_no,
      operator_name,
      status,
      timestamp
    });

    // Background task to synchronize with Firebase Realtime Database
    (async () => {
      try {
        const latest = await dbOperations.getLatestReading();
        const stats = await dbOperations.getStats();
        const active = await dbOperations.getActiveOperator();
        
        await Promise.all([
          syncToFirebase('latest_reading', latest),
          syncToFirebase('stats', stats),
          syncToFirebase('active_operator', active)
        ]);
      } catch (syncErr) {
        console.error('Error in post-insert Firebase sync:', syncErr.message);
      }
    })();

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/readings/latest', async (req, res) => {
  try {
    const latest = await dbOperations.getLatestReading();
    if (!latest) {
      return res.status(404).json({ error: 'No readings found' });
    }
    res.json(latest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/readings/history', async (req, res) => {
  try {
    const { search, operator, status, limit, offset, sortBy, sortOrder } = req.query;
    const history = await dbOperations.getHistoricalData({
      search,
      operator,
      status,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      sortBy,
      sortOrder
    });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/readings/stats', async (req, res) => {
  try {
    const stats = await dbOperations.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/readings/export', async (req, res) => {
  try {
    // Get all records (limit 1,000,000 for full export)
    const history = await dbOperations.getHistoricalData({ limit: 1000000 });
    
    // Map data to user-friendly column names
    const data = history.data.map(r => ({
      'ID': r.id,
      'Timestamp': r.timestamp,
      'Batch Number': r.batch_no,
      'Operator': r.operator_name,
      'AC Voltage (V)': r.ac_voltage,
      'DC Voltage (V)': r.dc_voltage,
      'Current (A)': r.current,
      'Temperature (°C)': r.temperature,
      'Status': r.status
    }));

    const worksheet = xlsx.utils.json_to_sheet(data);
    
    // Auto-adjust column widths for better design
    const colWidths = [
      { wch: 8 },  // ID
      { wch: 25 }, // Timestamp
      { wch: 18 }, // Batch Number
      { wch: 20 }, // Operator
      { wch: 15 }, // AC Voltage
      { wch: 15 }, // DC Voltage
      { wch: 12 }, // Current
      { wch: 18 }, // Temp
      { wch: 10 }  // Status
    ];
    worksheet['!cols'] = colWidths;

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'PCB Readings');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Filename format: Smart_PCB_Meter_Report_YYYY_MM_DD.xlsx
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const filename = `Smart_PCB_Meter_Report_${year}_${month}_${day}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fallback to serving front end index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Smart PCB Meter Server running on http://localhost:${PORT}`);
  
  // Sync initial state from SQLite to Firebase RTDB on startup
  (async () => {
    try {
      const latest = await dbOperations.getLatestReading();
      if (latest) await syncToFirebase('latest_reading', latest);
      
      const stats = await dbOperations.getStats();
      await syncToFirebase('stats', stats);
      
      const active = await dbOperations.getActiveOperator();
      await syncToFirebase('active_operator', active);
      
      console.log('Firebase Realtime Database initial state synced successfully.');
    } catch (err) {
      console.error('Error during initial Firebase sync:', err.message);
    }
  })();
});

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'pcb_meter.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Create pcb_readings table
    db.run(`
      CREATE TABLE IF NOT EXISTS pcb_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        batch_no TEXT NOT NULL,
        operator_name TEXT NOT NULL,
        ac_voltage REAL NOT NULL,
        dc_voltage REAL NOT NULL,
        current REAL NOT NULL,
        temperature REAL NOT NULL,
        status TEXT NOT NULL
      )
    `);

    // Create system_settings table to store persistent active operator and batch info
    db.run(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `, () => {
      // Seed default settings if they don't exist
      const insertSetting = db.prepare('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)');
      insertSetting.run('active_operator', 'Pranav Argade');
      insertSetting.run('batch_no', 'B-2026-06-001');
      insertSetting.finalize();
      
      // Always update login_time to current server startup time
      db.run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('login_time', ?)", [new Date().toISOString()]);
    });
  });
}

// Wrap db operations in promises
const dbQuery = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

// Database APIs
const dbOperations = {
  async addReading({ ac_voltage, dc_voltage, current, temperature, batch_no, operator_name, status, timestamp }) {
    // If timestamp is not provided, use current server time
    const ts = timestamp || new Date().toISOString();
    
    // Auto-calculate PASS/FAIL if status is not explicitly sent or validate it
    // Thresholds: AC 210-245V, DC 4.5-5.5V or 11.0-13.0V (or let's just make general safe ranges:
    // AC: 215V - 245V, DC: 4.5V - 12.5V, Current: 0.1A - 4.0A, Temperature: 10C - 50C)
    let calculatedStatus = status;
    if (!calculatedStatus) {
      const isACValid = ac_voltage >= 215 && ac_voltage <= 245;
      const isDCValid = (dc_voltage >= 4.5 && dc_voltage <= 5.5) || (dc_voltage >= 11.0 && dc_voltage <= 12.8);
      const isCurrentValid = current >= 0.2 && current <= 3.5;
      const isTempValid = temperature <= 50;
      calculatedStatus = (isACValid && isDCValid && isCurrentValid && isTempValid) ? 'PASS' : 'FAIL';
    }

    const sql = `
      INSERT INTO pcb_readings (timestamp, batch_no, operator_name, ac_voltage, dc_voltage, current, temperature, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await dbQuery.run(sql, [
      ts,
      batch_no,
      operator_name,
      ac_voltage,
      dc_voltage,
      current,
      temperature,
      calculatedStatus
    ]);
    return { id: result.id, status: calculatedStatus, timestamp: ts };
  },

  async getLatestReading() {
    return await dbQuery.get('SELECT * FROM pcb_readings ORDER BY timestamp DESC, id DESC LIMIT 1');
  },

  async getHistoricalData({ search, operator, status, limit = 50, offset = 0, sortBy = 'timestamp', sortOrder = 'DESC' }) {
    let sql = 'SELECT * FROM pcb_readings WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (batch_no LIKE ? OR operator_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (operator) {
      sql += ' AND operator_name = ?';
      params.push(operator);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status.toUpperCase());
    }

    // Get count for pagination before ordering and limit
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalCountRow = await dbQuery.get(countSql, params);
    const totalCount = totalCountRow ? totalCountRow.count : 0;

    // Apply sorting (validate parameters to prevent injection)
    const validColumns = ['id', 'timestamp', 'batch_no', 'operator_name', 'ac_voltage', 'dc_voltage', 'current', 'temperature', 'status'];
    const finalSortBy = validColumns.includes(sortBy) ? sortBy : 'timestamp';
    const finalSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${finalSortBy} ${finalSortOrder}`;

    // Apply pagination
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await dbQuery.all(sql, params);
    return { data: rows, total: totalCount };
  },

  async getStats() {
    const totalTestsRow = await dbQuery.get('SELECT COUNT(*) as count FROM pcb_readings');
    
    // Today's tests count (based on server time, since date is stored in ISO/string format, we check if it starts with today's date YYYY-MM-DD)
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTestsRow = await dbQuery.get("SELECT COUNT(*) as count FROM pcb_readings WHERE timestamp LIKE ?", [`%${todayStr}%`]);

    // min/max/avg for all parameters
    const statsRow = await dbQuery.get(`
      SELECT 
        MIN(ac_voltage) as min_ac, MAX(ac_voltage) as max_ac, AVG(ac_voltage) as avg_ac,
        MIN(dc_voltage) as min_dc, MAX(dc_voltage) as max_dc, AVG(dc_voltage) as avg_dc,
        MIN(current) as min_curr, MAX(current) as max_curr, AVG(current) as avg_curr,
        MIN(temperature) as min_temp, MAX(temperature) as max_temp, AVG(temperature) as avg_temp
      FROM pcb_readings
    `);

    // Pass and Fail counts
    const passRow = await dbQuery.get("SELECT COUNT(*) as count FROM pcb_readings WHERE status = 'PASS'");
    const failRow = await dbQuery.get("SELECT COUNT(*) as count FROM pcb_readings WHERE status = 'FAIL'");

    return {
      totalTests: totalTestsRow ? totalTestsRow.count : 0,
      todayTests: todayTestsRow ? todayTestsRow.count : 0,
      passCount: passRow ? passRow.count : 0,
      failCount: failRow ? failRow.count : 0,
      acVoltage: {
        min: statsRow && statsRow.min_ac !== null ? parseFloat(statsRow.min_ac.toFixed(2)) : 0,
        max: statsRow && statsRow.max_ac !== null ? parseFloat(statsRow.max_ac.toFixed(2)) : 0,
        avg: statsRow && statsRow.avg_ac !== null ? parseFloat(statsRow.avg_ac.toFixed(2)) : 0
      },
      dcVoltage: {
        min: statsRow && statsRow.min_dc !== null ? parseFloat(statsRow.min_dc.toFixed(2)) : 0,
        max: statsRow && statsRow.max_dc !== null ? parseFloat(statsRow.max_dc.toFixed(2)) : 0,
        avg: statsRow && statsRow.avg_dc !== null ? parseFloat(statsRow.avg_dc.toFixed(2)) : 0
      },
      current: {
        min: statsRow && statsRow.min_curr !== null ? parseFloat(statsRow.min_curr.toFixed(3)) : 0,
        max: statsRow && statsRow.max_curr !== null ? parseFloat(statsRow.max_curr.toFixed(3)) : 0,
        avg: statsRow && statsRow.avg_curr !== null ? parseFloat(statsRow.avg_curr.toFixed(3)) : 0
      },
      temperature: {
        min: statsRow && statsRow.min_temp !== null ? parseFloat(statsRow.min_temp.toFixed(1)) : 0,
        max: statsRow && statsRow.max_temp !== null ? parseFloat(statsRow.max_temp.toFixed(1)) : 0,
        avg: statsRow && statsRow.avg_temp !== null ? parseFloat(statsRow.avg_temp.toFixed(1)) : 0
      }
    };
  },

  async getActiveOperator() {
    const op = await dbQuery.get("SELECT value FROM system_settings WHERE key = 'active_operator'");
    const batch = await dbQuery.get("SELECT value FROM system_settings WHERE key = 'batch_no'");
    const loginTime = await dbQuery.get("SELECT value FROM system_settings WHERE key = 'login_time'");
    
    // Also count total readings collected under this specific operator for the current batch
    let readingsCount = 0;
    if (op && batch) {
      const countRow = await dbQuery.get(
        "SELECT COUNT(*) as count FROM pcb_readings WHERE operator_name = ? AND batch_no = ?",
        [op.value, batch.value]
      );
      readingsCount = countRow ? countRow.count : 0;
    }

    return {
      operatorName: op ? op.value : 'Pranav Argade',
      batchNo: batch ? batch.value : 'B-2026-06-001',
      loginTime: loginTime ? loginTime.value : new Date().toISOString(),
      readingsCount
    };
  },

  async setActiveOperator(operatorName, batchNo) {
    await dbQuery.run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('active_operator', ?)", [operatorName]);
    await dbQuery.run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('batch_no', ?)", [batchNo]);
    await dbQuery.run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('login_time', ?)", [new Date().toISOString()]);
    return await this.getActiveOperator();
  }
};

module.exports = dbOperations;

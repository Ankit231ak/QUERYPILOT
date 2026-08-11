import sqlite3 from "sqlite3";
import path from "path";
import pg from "pg";
import mysql from "mysql2/promise";

const dbPath = path.join(process.cwd(), "querypilot.db");
const sqliteDb = new sqlite3.Database(dbPath);

export interface DatabaseTargetConfig {
  dialect?: "SQLite" | "PostgreSQL" | "MySQL" | "MariaDB" | "SQL Server" | "Oracle";
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

// Default SQLite query runners
export function queryAll(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

export function runSql(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Execute query on Target Database (PostgreSQL, MySQL, SQLite)
export async function executeTargetQuery(
  sql: string,
  config?: DatabaseTargetConfig
): Promise<{ rows: any[]; columns: string[] }> {
  const dialect = config?.dialect || "SQLite";
  const connStr = config?.connectionString;

  if (dialect === "PostgreSQL" && connStr && connStr.includes("postgres")) {
    const client = new pg.Client({ connectionString: connStr });
    await client.connect();
    try {
      const res = await client.query(sql);
      const columns = res.fields ? res.fields.map((f) => f.name) : [];
      return { rows: res.rows || [], columns };
    } finally {
      await client.end();
    }
  }

  if ((dialect === "MySQL" || dialect === "MariaDB") && connStr && connStr.includes("mysql")) {
    const connection = await mysql.createConnection(connStr);
    try {
      const [rows, fields] = await connection.query(sql);
      const columns = Array.isArray(fields) ? fields.map((f) => f.name) : [];
      return { rows: Array.isArray(rows) ? (rows as any[]) : [], columns };
    } finally {
      await connection.end();
    }
  }

  // Default to SQLite
  const rows = await queryAll(sql);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, columns };
}

// Fetch live database schema for target DB (PostgreSQL, MySQL, SQLite)
export async function getTargetSchema(config?: DatabaseTargetConfig) {
  const dialect = config?.dialect || "SQLite";
  const connStr = config?.connectionString;

  if (dialect === "PostgreSQL" && connStr && connStr.includes("postgres")) {
    const client = new pg.Client({ connectionString: connStr });
    await client.connect();
    try {
      const tablesRes = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';`
      );
      const schema: any[] = [];

      for (const tRow of tablesRes.rows) {
        const tableName = tRow.table_name;
        const colRes = await client.query(
          `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1;`,
          [tableName]
        );
        const pkRes = await client.query(
          `SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1;`,
          [tableName]
        );
        const pkCols = new Set(pkRes.rows.map((r) => r.column_name));

        let count = "0 rows";
        try {
          const countRes = await client.query(`SELECT COUNT(*) as count FROM "${tableName}";`);
          count = `${countRes.rows[0]?.count || 0} rows`;
        } catch {
          count = "0 rows";
        }

        schema.push({
          id: tableName,
          name: tableName,
          rowCount: count,
          columns: colRes.rows.map((c) => ({
            name: c.column_name,
            type: c.data_type.toUpperCase(),
            isPk: pkCols.has(c.column_name),
            description: pkCols.has(c.column_name) ? "Primary Key" : ""
          }))
        });
      }

      return schema;
    } finally {
      await client.end();
    }
  }

  if ((dialect === "MySQL" || dialect === "MariaDB") && connStr && connStr.includes("mysql")) {
    const connection = await mysql.createConnection(connStr);
    try {
      const [tableRows]: any = await connection.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE();`
      );
      const schema: any[] = [];

      for (const tRow of tableRows) {
        const tableName = tRow.TABLE_NAME || tRow.table_name;
        const [colRows]: any = await connection.query(
          `SELECT column_name, data_type, column_key FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?;`,
          [tableName]
        );

        let count = "0 rows";
        try {
          const [countRes]: any = await connection.query(`SELECT COUNT(*) as count FROM \`${tableName}\`;`);
          count = `${countRes[0]?.count || 0} rows`;
        } catch {
          count = "0 rows";
        }

        schema.push({
          id: tableName,
          name: tableName,
          rowCount: count,
          columns: colRows.map((c: any) => ({
            name: c.COLUMN_NAME || c.column_name,
            type: (c.DATA_TYPE || c.data_type).toUpperCase(),
            isPk: (c.COLUMN_KEY || c.column_key) === "PRI",
            description: (c.COLUMN_KEY || c.column_key) === "PRI" ? "Primary Key" : ""
          }))
        });
      }

      return schema;
    } finally {
      await connection.end();
    }
  }

  // Default SQLite Schema
  return getSQLiteSchema();
}

export async function getSQLiteSchema() {
  const tables: any[] = await queryAll(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`
  );
  const schema: any[] = [];

  for (const table of tables) {
    const tableName = table.name;
    const columns: any[] = await queryAll(`PRAGMA table_info("${tableName}");`);
    const countRes: any[] = await queryAll(`SELECT COUNT(*) as count FROM "${tableName}";`);
    const rowCount = countRes[0]?.count || 0;

    schema.push({
      id: tableName,
      name: tableName,
      rowCount: `${rowCount} rows`,
      columns: columns.map((c) => ({
        name: c.name,
        type: c.type,
        isPk: c.pk === 1,
        description: c.pk === 1 ? "Primary Key" : ""
      }))
    });
  }

  return schema;
}

// Test Database Connection Endpoint helper
export async function testConnection(config: DatabaseTargetConfig) {
  const dialect = config.dialect || "SQLite";
  const connStr = config.connectionString;

  if (dialect === "PostgreSQL") {
    if (!connStr || !connStr.includes("postgres")) {
      throw new Error("Invalid PostgreSQL connection string. Format: postgresql://user:pass@host:5432/dbname");
    }
    const client = new pg.Client({ connectionString: connStr });
    await client.connect();
    try {
      const res = await client.query("SELECT version();");
      const ver = res.rows[0]?.version || "PostgreSQL";
      return `Connected successfully to ${ver.split(",")[0]}`;
    } finally {
      await client.end();
    }
  }

  if (dialect === "MySQL" || dialect === "MariaDB") {
    if (!connStr || !connStr.includes("mysql")) {
      throw new Error("Invalid MySQL connection string. Format: mysql://user:pass@host:3306/dbname");
    }
    const connection = await mysql.createConnection(connStr);
    try {
      const [rows]: any = await connection.query("SELECT VERSION() as version;");
      const ver = rows[0]?.version || "MySQL";
      return `Connected successfully to MySQL ${ver}`;
    } finally {
      await connection.end();
    }
  }

  return "Connected successfully to local SQLite database.";
}

// Initialize and Seed SQLite Database if empty
export async function initDb() {
  await runSql(`
    CREATE TABLE IF NOT EXISTS users (
      customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      region TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  await runSql(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      stock_quantity INTEGER NOT NULL,
      rating REAL DEFAULT 4.5
    );
  `);

  await runSql(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      order_date TEXT NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES users(customer_id)
    );
  `);

  await runSql(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(order_id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  await runSql(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      review_date TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (customer_id) REFERENCES users(customer_id)
    );
  `);

  const usersCount: any[] = await queryAll(`SELECT COUNT(*) as count FROM users;`);
  if (usersCount[0].count === 0) {
    console.log("Seeding SQLite database with realistic sample data...");

    const usersData = [
      ["John Smith", "john.smith@example.com", "North America", "2024-01-15"],
      ["Sarah Connor", "sarah.c@example.com", "North America", "2024-01-18"],
      ["Alex Rivera", "arivera@techcorp.io", "Europe", "2024-02-01"],
      ["Elena Rostova", "elena.r@global.net", "Europe", "2024-02-10"],
      ["Kenji Sato", "sato.k@tokyo.jp", "Asia Pacific", "2024-02-14"],
      ["Priya Sharma", "priya.s@mumbai.in", "Asia Pacific", "2024-02-20"],
      ["Marcus Vance", "marcus.v@enterprise.org", "North America", "2024-03-01"],
      ["Chloe Bennett", "chloe.b@designhub.co", "Europe", "2024-03-05"],
      ["David Kim", "dkim@seoul.kr", "Asia Pacific", "2024-03-12"],
      ["Maria Garcia", "maria.g@madrid.es", "Europe", "2024-03-15"]
    ];

    for (const [name, email, region, created] of usersData) {
      await runSql(
        `INSERT INTO users (name, email, region, created_at) VALUES (?, ?, ?, ?);`,
        [name, email, region, created]
      );
    }

    const productsData = [
      ["QueryPilot Pro Enterprise License", "Software", 499.0, 150, 4.9],
      ["Cloud Analytics Server Suite", "Software", 1299.0, 50, 4.8],
      ["Data Sync Gateway Hardware", "Hardware", 849.0, 32, 4.6],
      ["High-Performance Database Node", "Hardware", 2199.0, 18, 4.9],
      ["AI SQL Query Accelerator", "Software", 299.0, 500, 4.7]
    ];

    for (const [name, cat, price, stock, rating] of productsData) {
      await runSql(
        `INSERT INTO products (name, category, price, stock_quantity, rating) VALUES (?, ?, ?, ?, ?);`,
        [name, cat, price, stock, rating]
      );
    }

    const ordersData = [
      [1, "2024-03-01", 1497.0, "completed", "Credit Card"],
      [2, "2024-03-02", 2199.0, "completed", "Bank Transfer"],
      [3, "2024-03-05", 499.0, "completed", "Credit Card"]
    ];

    for (const [userId, date, total, status, pay] of ordersData) {
      await runSql(
        `INSERT INTO orders (customer_id, order_date, total_amount, status, payment_method) VALUES (?, ?, ?, ?, ?);`,
        [userId, date, total, status, pay]
      );
    }

    console.log("SQLite database initialized successfully!");
  }
}

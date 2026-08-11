import sqlite3 from "sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "querypilot.db");
const db = new sqlite3.Database(dbPath);

// Helper to run query returning all rows
export function queryAll(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Helper to execute SQL statement
export function runSql(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Helper to fetch live database schema
export async function getDbSchema() {
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

// Initialize and Seed Database if empty
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

  // Check if users table has data
  const usersCount: any[] = await queryAll(`SELECT COUNT(*) as count FROM users;`);
  if (usersCount[0].count === 0) {
    console.log("Seeding SQLite database with realistic sample data...");

    // Seed Users
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
      ["Maria Garcia", "maria.g@madrid.es", "Europe", "2024-03-15"],
      ["Liam O'Connor", "liam.oc@dublin.ie", "Europe", "2024-03-20"],
      ["Aisha Patel", "aisha.p@london.uk", "Europe", "2024-03-22"],
      ["Carlos Silva", "carlos.s@rio.br", "South America", "2024-03-25"],
      ["Emily Watson", "emily.w@sydney.au", "Asia Pacific", "2024-03-28"],
      ["Noah Taylor", "noah.t@toronto.ca", "North America", "2024-04-01"]
    ];

    for (const [name, email, region, created] of usersData) {
      await runSql(
        `INSERT INTO users (name, email, region, created_at) VALUES (?, ?, ?, ?);`,
        [name, email, region, created]
      );
    }

    // Seed Products
    const productsData = [
      ["QueryPilot Pro Enterprise License", "Software", 499.0, 150, 4.9],
      ["Cloud Analytics Server Suite", "Software", 1299.0, 50, 4.8],
      ["Data Sync Gateway Hardware", "Hardware", 849.0, 32, 4.6],
      ["High-Performance Database Node", "Hardware", 2199.0, 18, 4.9],
      ["AI SQL Query Accelerator", "Software", 299.0, 500, 4.7],
      ["Managed Backup Appliance", "Hardware", 599.0, 40, 4.4],
      ["Developer Desktop Workstation", "Hardware", 1499.0, 25, 4.8],
      ["Real-time Streaming Pipeline", "Software", 799.0, 100, 4.5],
      ["Security Audit & Compliance Suite", "Software", 649.0, 80, 4.6],
      ["Edge Processing Unit v2", "Hardware", 449.0, 60, 4.3]
    ];

    for (const [name, cat, price, stock, rating] of productsData) {
      await runSql(
        `INSERT INTO products (name, category, price, stock_quantity, rating) VALUES (?, ?, ?, ?, ?);`,
        [name, cat, price, stock, rating]
      );
    }

    // Seed Orders
    const ordersData = [
      [1, "2024-03-01", 1497.0, "completed", "Credit Card"],
      [2, "2024-03-02", 2199.0, "completed", "Bank Transfer"],
      [3, "2024-03-05", 499.0, "completed", "Credit Card"],
      [4, "2024-03-07", 1299.0, "completed", "PayPal"],
      [5, "2024-03-10", 299.0, "completed", "Credit Card"],
      [6, "2024-03-12", 849.0, "completed", "Credit Card"],
      [7, "2024-03-15", 3698.0, "completed", "Bank Transfer"],
      [8, "2024-03-18", 599.0, "completed", "PayPal"],
      [9, "2024-03-20", 1499.0, "completed", "Credit Card"],
      [10, "2024-03-22", 799.0, "completed", "Credit Card"],
      [1, "2024-03-25", 299.0, "completed", "Credit Card"],
      [3, "2024-03-28", 2199.0, "completed", "Bank Transfer"],
      [5, "2024-04-01", 649.0, "completed", "PayPal"],
      [11, "2024-04-02", 449.0, "pending", "Credit Card"],
      [12, "2024-04-03", 1299.0, "completed", "Credit Card"],
      [13, "2024-04-05", 499.0, "completed", "PayPal"],
      [14, "2024-04-07", 849.0, "completed", "Credit Card"],
      [15, "2024-04-09", 2199.0, "completed", "Bank Transfer"],
      [2, "2024-04-10", 799.0, "completed", "Credit Card"],
      [4, "2024-04-12", 299.0, "completed", "Credit Card"]
    ];

    for (const [userId, date, total, status, pay] of ordersData) {
      await runSql(
        `INSERT INTO orders (customer_id, order_date, total_amount, status, payment_method) VALUES (?, ?, ?, ?, ?);`,
        [userId, date, total, status, pay]
      );
    }

    // Seed Order Items
    const orderItemsData = [
      [1, 1, 3, 499.0],
      [2, 4, 1, 2199.0],
      [3, 1, 1, 499.0],
      [4, 2, 1, 1299.0],
      [5, 5, 1, 299.0],
      [6, 3, 1, 849.0],
      [7, 4, 1, 2199.0],
      [7, 7, 1, 1499.0],
      [8, 6, 1, 599.0],
      [9, 7, 1, 1499.0],
      [10, 8, 1, 799.0],
      [11, 5, 1, 299.0],
      [12, 4, 1, 2199.0],
      [13, 9, 1, 649.0],
      [14, 10, 1, 449.0],
      [15, 2, 1, 1299.0]
    ];

    for (const [orderId, prodId, qty, price] of orderItemsData) {
      await runSql(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?);`,
        [orderId, prodId, qty, price]
      );
    }

    // Seed Reviews
    const reviewsData = [
      [1, 1, 5, "Exceptional query speed and seamless developer integration!", "2024-03-10"],
      [2, 4, 5, "Handles massive database loads with ultra-low latency.", "2024-03-12"],
      [3, 1, 4, "Great tool for automated SQL workflows.", "2024-03-15"],
      [4, 2, 5, "Superb cloud analytics suite for enterprise teams.", "2024-03-18"],
      [5, 5, 5, "Groq AI generation makes writing complex SQL instantaneous!", "2024-03-20"]
    ];

    for (const [prodId, custId, rating, comment, rdate] of reviewsData) {
      await runSql(
        `INSERT INTO reviews (product_id, customer_id, rating, comment, review_date) VALUES (?, ?, ?, ?, ?);`,
        [prodId, custId, rating, comment, rdate]
      );
    }

    console.log("SQLite database initialized and seeded successfully!");
  }
}

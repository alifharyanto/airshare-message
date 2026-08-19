// lib/db.ts
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // TiDB mewajibkan koneksi SSL
  ssl: {
    rejectUnauthorized: true
  }
});

export default pool;
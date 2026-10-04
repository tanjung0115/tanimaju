// backend/src/config/mysql-database.ts
import mysql, { type ResultSetHeader, type RowDataPacket, type PoolConnection } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

interface DatabaseConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
  charset: string;
  timezone: string;
}

const config: DatabaseConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'website_tanijuu_mysql',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  charset: 'utf8mb4',
  timezone: '+07:00', // GMT+7 timezone
};

const pool = mysql.createPool({
  ...config,
  // DATE is a calendar day, not a UTC instant. Keep comparisons and JSON stable in WIB.
  dateStrings: ['DATE'],
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+07:00'");
  console.log('⏰ MySQL timezone set to GMT+7');
});

// Test connection
export const testConnection = async (): Promise<boolean> => {
  let connection: PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.execute("SET time_zone = '+07:00'");
    await connection.execute("SELECT 1");
    console.log('✅ MySQL connected successfully');
    return true;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code === 'ER_ACCESS_DENIED_ERROR') {
      console.error("❌ Invalid MySQL credentials");
    } else if (code === 'ER_BAD_DB_ERROR') {
      console.error("❌ Database not found");
    } else {
      console.error("❌ MySQL connection failed:", error);
    }
    return false;
  } finally { connection?.release(); }
};

// Generic query helper
export const executeQuery = async <T = RowDataPacket>(query: string, params?: unknown[]): Promise<T[]> => {
  try {
    const [rows] = await pool.execute(query, params);
    return rows as T[];
  } catch (error) {
    console.error('❌ Query execution failed:', query, error);
    throw error;
  }
};

// Execute query for INSERT/UPDATE/DELETE operations
export const executeModifyQuery = async (query: string, params?: unknown[]): Promise<ResultSetHeader> => {
  try {
    const [result] = await pool.execute<ResultSetHeader>(query, params);
    return result;
  } catch (error) {
    console.error('❌ Query execution failed:', query, error);
    throw error;
  }
};

// Transaction helper
export const executeTransaction = async (
  queries: Array<{ query: string; params?: unknown[] }>
): Promise<ResultSetHeader[]> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const results = [];
    for (const { query, params } of queries) {
      const [result] = await connection.execute<ResultSetHeader>(query, params);
      results.push(result);
    }
    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await pool.end();
  console.log("🛑 MySQL pool closed");
  process.exit(0);
});

export default pool;

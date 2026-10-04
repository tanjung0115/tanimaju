import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { prepareMigrationSql } from './migrationCompatibility.js';

dotenv.config();

const canonicalDatabase = 'website_tanijuu_mysql';
const database = process.env.MYSQL_DATABASE || canonicalDatabase;
const migrationsDirectory = path.join(process.cwd(), 'src', 'database', 'migrations');

const connectionOptions = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  port: Number.parseInt(process.env.MYSQL_PORT || '3306', 10),
  multipleStatements: true,
};

const quoteIdentifier = (identifier: string): string => `\`${identifier.replace(/`/g, '``')}\``;

const ensureDatabase = async (): Promise<void> => {
  const connection = await mysql.createConnection(connectionOptions);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await connection.end();
  }
};

const runMigrations = async (): Promise<void> => {
  await ensureDatabase();

  const connection = await mysql.createConnection({
    ...connectionOptions,
    database,
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [appliedRows] = await connection.query('SELECT name FROM schema_migrations ORDER BY name');
    const applied = new Set((appliedRows as Array<{ name: string }>).map((row) => row.name));
    const files = (await fs.readdir(migrationsDirectory))
      .filter((file) => /^\d+_.*\.sql$/.test(file))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`⏭️  Skipping applied migration: ${file}`);
        continue;
      }

      const rawSql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
      const sql = await prepareMigrationSql(rawSql, async (table, column) => {
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
          [database, table, column]
        );
        return rows.length > 0;
      });
      console.log(`▶️  Applying migration: ${file}`);
      if (sql.replace(/^\s*--.*$/gm, "").trim()) await connection.query(sql);
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      console.log(`✅ Applied migration: ${file}`);
    }

    console.log(`✅ Database migration complete: ${database}`);
  } finally {
    await connection.end();
  }
};

runMigrations().catch((error: unknown) => {
  console.error('❌ Database migration failed:', error);
  process.exitCode = 1;
});

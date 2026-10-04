param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('backend', 'frontend')]
    [string] $Target,
    [ValidatePattern('^tanimaju_demo_[a-z0-9_]+$')]
    [string] $Database = 'tanimaju_demo_20261003_final5'
)

$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectPath
if ($Target -eq 'frontend') {
    $env:VITE_API_URL = 'http://localhost:5310/api'
    $env:VITE_API_URL_IMAGE = 'http://localhost:5310'
    npm run dev -- --host localhost --port 5180 --strictPort
} else {
    Set-Location -LiteralPath (Join-Path $projectPath 'backend')
    $env:MYSQL_DATABASE = $Database
    $env:PORT = '5310'
    $env:CLIENT_URL = 'http://localhost:5180'
    $env:NODE_ENV = 'development'
    # Runtime-only secret; do not print it or write it into documentation.
    $env:JWT_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('hex'))"
    $schemaCheck = @'
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
dotenv.config({quiet:true});
const pool=(await import('./dist/config/mysql-database.js')).default;
try {
  assert.match(process.env.MYSQL_DATABASE,/^tanimaju_demo_[a-z0-9_]+$/);
  const [rows]=await pool.query('SELECT name FROM schema_migrations');
  assert.equal(rows.length,13,'Use a demo database with migrations 001-013 already applied.');
} finally { await pool.end(); }
'@
    $schemaCheck | node --input-type=module -
    if ($LASTEXITCODE -ne 0) { throw 'Demo schema check failed; no migration or application startup performed.' }
    npm run dev
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

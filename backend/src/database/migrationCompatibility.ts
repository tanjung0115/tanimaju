/** MySQL lacks MariaDB's ADD COLUMN IF NOT EXISTS syntax. Keep historical files intact. */
export async function prepareMigrationSql(sql: string, hasColumn: (table: string, column: string) => Promise<boolean>): Promise<string> {
  const alterations = [...sql.matchAll(/ALTER TABLE (\w+)\s+([^;]+);/g)];
  for (const match of alterations) {
    if (!match[2].includes('ADD COLUMN IF NOT EXISTS')) continue;
    const clauses = match[2].split(/,\s*(?=ADD\s+(?:COLUMN|UNIQUE|INDEX|CONSTRAINT))/);
    const retained: string[] = [];
    for (const clause of clauses) {
      const column = clause.match(/^\s*ADD COLUMN IF NOT EXISTS (\w+)\b/);
      if (column && await hasColumn(match[1], column[1])) continue;
      retained.push(clause.replace('ADD COLUMN IF NOT EXISTS', 'ADD COLUMN'));
    }
    sql = sql.replace(match[0], retained.length ? `ALTER TABLE ${match[1]} ${retained.join(',\n')};` : '');
  }
  return sql;
}

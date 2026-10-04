import type { ListQuery } from './listQuery.js';
export function petaniSearch(queryOptions: ListQuery, petaniId?: number) {
  const values: Array<string | number> = [];
  const conditions: string[] = [];
  if (queryOptions.search) { conditions.push('(nama LIKE ? OR alamat LIKE ? OR nomorKontak LIKE ?)'); const term = `%${queryOptions.search}%`; values.push(term, term, term); }
  if (petaniId !== undefined) { conditions.push('id = ?'); values.push(petaniId); }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

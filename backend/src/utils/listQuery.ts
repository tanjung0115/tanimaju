export const validListDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

import { Request } from 'express';

export interface ListQuery {
  page: number;
  limit: number;
  offset: number;
  search: string;
  startDate?: string;
  endDate?: string;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
}

export const parseListQuery = (
  req: Request,
  sortFields: Record<string, string>,
  defaultSort: string
): ListQuery | { error: string } => {
  const pageValue = Number(req.query.page ?? '1');
  const limitValue = Number(req.query.limit ?? '20');
  if (!/^\d+$/.test(String(req.query.page ?? '1')) || !Number.isSafeInteger(pageValue) || pageValue <= 0) return { error: 'Invalid page' };
  if (!/^\d+$/.test(String(req.query.limit ?? '20')) || !Number.isSafeInteger(limitValue) || limitValue <= 0) return { error: 'Invalid limit' };
  const page = pageValue;
  const limit = Math.min(limitValue, 100);
  const sortKey = typeof req.query.sort_by === 'string' ? req.query.sort_by : defaultSort;
  const sortBy = Object.prototype.hasOwnProperty.call(sortFields, sortKey) ? sortFields[sortKey] : undefined;
  if (req.query.sort_order !== undefined && !['ASC', 'DESC'].includes(String(req.query.sort_order).toUpperCase())) return { error: 'Invalid sort_order' };
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value !== 'string') return { error: `Invalid ${key}` };
    if (key.endsWith('_id') && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)) return { error: `Invalid ${key}` };
    if (key.endsWith('_date') && !validListDate(value)) return { error: `Invalid ${key}` };
  }
  if (!Number.isSafeInteger((page - 1) * limit)) return { error: 'Invalid page' };
  const sortOrder = String(req.query.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const startDate = typeof req.query.start_date === 'string' ? req.query.start_date : undefined;
  const endDate = typeof req.query.end_date === 'string' ? req.query.end_date : undefined;

  if (!sortBy) return { error: 'Invalid sort_by' };
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && (() => { const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; })();
  if (startDate && !validDate(startDate)) return { error: 'Invalid start_date' };
  if (endDate && !validDate(endDate)) return { error: 'Invalid end_date' };
  if (startDate && endDate && startDate > endDate) return { error: 'start_date must not be after end_date' };

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    search: typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '',
    startDate,
    endDate,
    sortBy,
    sortOrder,
  };
};

export const pagination = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

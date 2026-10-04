type Adapted<T> = Omit<T, "id" | "_id"> & { _id: string; id: undefined };
export function adaptMySQLToMongo<T extends object>(data: T[]): Adapted<T>[];
export function adaptMySQLToMongo<T extends object>(data: T): Adapted<T>;
export function adaptMySQLToMongo(data: null): null;
export function adaptMySQLToMongo<T extends object>(data: T | null): Adapted<T> | null;
export function adaptMySQLToMongo<T extends object>(data: T | T[] | null): Adapted<T> | Adapted<T>[] | null {
  const adapt = (item: T): Adapted<T> => {
    const source = item as T & { id?: unknown; _id?: unknown };
    return { ...item, _id: String(source.id ?? source._id ?? ""), id: undefined };
  };
  return data === null ? null : Array.isArray(data) ? data.map(adapt) : adapt(data);
}
export const adaptMongoToMySQL = (mongoId: string): number => {
  const id = parseInt(mongoId);
  if (isNaN(id)) throw new Error(`Invalid ID format: ${mongoId}`);
  return id;
};

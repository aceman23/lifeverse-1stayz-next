/** Short random id for client-created rows (works outside secure contexts, unlike crypto.randomUUID). */
export const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

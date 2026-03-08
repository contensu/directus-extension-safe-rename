const DB_SAFE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export function validateDbSafeName(value: string): boolean {
  return DB_SAFE_PATTERN.test(value);
}

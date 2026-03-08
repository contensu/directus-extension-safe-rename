const COLLECTION_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

export function isValidSchemaName(value: string): boolean {
  return COLLECTION_NAME_PATTERN.test(value);
}

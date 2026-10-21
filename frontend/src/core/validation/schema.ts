/** Bounded validator for the explicit JSON Schema keyword subset we generate.
 * This is not advertised as a general JSON Schema engine. Unknown keywords fail
 * closed so a future schema change cannot silently weaken import validation.
 */
export interface ShapeIssue { path: string; message: string }
type Shape = Record<string, unknown>;
const keywords = new Set(['$schema', '$id', '$defs', '$ref', 'type', 'enum', 'anyOf', 'properties', 'required', 'additionalProperties', 'items', 'minimum', 'maximum', 'exclusiveMinimum']);
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function checkShape(value: unknown, schema: unknown): ShapeIssue[] {
  if (!isRecord(schema)) throw new Error('Invalid schema');
  let visits = 0;
  const root = schema;
  function check(value: unknown, shape: Shape, path: string, depth: number): ShapeIssue[] {
    if (++visits > 500_000 || depth > 512) return [{ path, message: 'Document exceeds validation limits' }];
    const bad = Object.keys(shape).find(key => !keywords.has(key));
    if (bad) throw new Error(`Unsupported schema keyword: ${bad}`);
    if (typeof shape['$ref'] === 'string') {
      const name = shape['$ref'].replace('#/$defs/', '');
      const defs = root['$defs'];
      if (!isRecord(defs) || !isRecord(defs[name])) throw new Error('Unknown schema reference');
      // Schema indirection does not add nesting to the JSON document.
      return check(value, defs[name], path, depth);
    }
    if (Array.isArray(shape['anyOf'])) {
      for (const candidate of shape['anyOf']) if (isRecord(candidate) && !check(value, candidate, path, depth).length) return [];
      return [{ path, message: 'Value does not match a supported variant' }];
    }
    if (Array.isArray(shape['enum']) && !shape['enum'].some(v => v === value)) return [{ path, message: 'Unsupported value/version' }];
    const type = shape['type'];
    const valid = type === undefined || type === 'null' && value === null || type === 'object' && isRecord(value)
      || type === 'array' && Array.isArray(value) || type === 'string' && typeof value === 'string'
      || type === 'boolean' && typeof value === 'boolean' || (type === 'number' || type === 'integer')
        && typeof value === 'number' && Number.isFinite(value) && (type !== 'integer' || Number.isInteger(value));
    if (!valid) return [{ path, message: `Expected ${String(type)}` }];
    const errors: ShapeIssue[] = [];
    if (typeof value === 'number') {
      if (typeof shape['minimum'] === 'number' && value < shape['minimum'] || typeof shape['maximum'] === 'number' && value > shape['maximum']
        || typeof shape['exclusiveMinimum'] === 'number' && value <= shape['exclusiveMinimum']) errors.push({ path, message: 'Number outside permitted range' });
    }
    if (isRecord(value)) {
      const properties = isRecord(shape['properties']) ? shape['properties'] : {};
      for (const key of Array.isArray(shape['required']) ? shape['required'] : []) {
        if (typeof key === 'string' && !Object.hasOwn(value, key)) errors.push({ path: `${path}.${key}`, message: 'Required field missing' });
      }
      for (const [key, item] of Object.entries(value)) {
        const field = Object.hasOwn(properties, key) ? properties[key] : shape['additionalProperties'];
        if (field === false) errors.push({ path: `${path}.${key}`, message: 'Unknown field' });
        else if (isRecord(field)) errors.push(...check(item, field, `${path}.${key}`, depth + 1));
      }
    }
    if (Array.isArray(value) && isRecord(shape['items'])) {
      for (const [index, item] of value.entries()) errors.push(...check(item, shape['items'], `${path}[${index}]`, depth + 1));
    }
    return errors;
  }
  return check(value, root, '$', 0);
}

export type RecordValue = Record<string, unknown>;
export interface StepContext {
  readonly field: string;
  readonly original: unknown;
  readonly missing: boolean;
}
export interface Step {
  readonly name: string;
  run(value: unknown, context: StepContext): unknown;
}
export interface FieldRule {
  source?: string;
  steps?: readonly Step[];
  required?: boolean;
}
export type Rules = Readonly<Record<string, FieldRule>>;
export interface Issue {
  field: string;
  source: string;
  step: string;
  code: string;
  message: string;
}
export interface Trace {
  field: string;
  step: string;
  before: unknown;
  after: unknown;
}
export interface NormalizeResult {
  ok: boolean;
  value: RecordValue;
  original: Readonly<RecordValue>;
  issues: Issue[];
  changes: Trace[];
}
export interface Normalizer {
  normalize(record: Readonly<RecordValue>): NormalizeResult;
}
export class NormalizationError extends Error {
  constructor(
    message: string,
    readonly code = 'INVALID_VALUE',
  ) {
    super(message);
    this.name = 'NormalizationError';
  }
}
function plain(value: unknown): value is RecordValue {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new NormalizationError('Expected a string.', 'TYPE');
  return value;
}
export function step(name: string, run: Step['run']): Step {
  if (typeof name !== 'string' || !name || typeof run !== 'function')
    throw new TypeError('Steps require a nonempty name and a function.');
  return Object.freeze({ name, run });
}
export function trim(): Step {
  return step('trim', (value) => text(value).trim());
}
export function collapseWhitespace(): Step {
  return step('collapseWhitespace', (value) => text(value).replace(/\s+/gu, ' ').trim());
}
export function unicode(form: 'NFC' | 'NFD' | 'NFKC' | 'NFKD' = 'NFC'): Step {
  if (!['NFC', 'NFD', 'NFKC', 'NFKD'].includes(form))
    throw new TypeError('Unsupported Unicode normalization form.');
  return step(`unicode:${form}`, (value) => text(value).normalize(form));
}
export function lowercase(locale?: string): Step {
  if (locale !== undefined) Intl.getCanonicalLocales(locale);
  return step('lowercase', (value) =>
    locale ? text(value).toLocaleLowerCase(locale) : text(value).toLowerCase(),
  );
}
export function uppercase(locale?: string): Step {
  if (locale !== undefined) Intl.getCanonicalLocales(locale);
  return step('uppercase', (value) =>
    locale ? text(value).toLocaleUpperCase(locale) : text(value).toUpperCase(),
  );
}
export function emptyToNull(): Step {
  return step('emptyToNull', (value) => (value === '' || value === undefined ? null : value));
}
export function defaultValue(fallback: unknown): Step {
  return step('defaultValue', (value) =>
    value === undefined || value === null ? fallback : value,
  );
}
export function numberValue(options: { integer?: boolean; min?: number; max?: number } = {}): Step {
  const { integer = false, min = -Infinity, max = Infinity } = options;
  if (
    typeof integer !== 'boolean' ||
    typeof min !== 'number' ||
    typeof max !== 'number' ||
    Number.isNaN(min) ||
    Number.isNaN(max) ||
    min > max
  ) {
    throw new TypeError('Invalid numeric conversion options.');
  }
  return step('numberValue', (value) => {
    if (
      typeof value !== 'number' &&
      (typeof value !== 'string' || !/^[+-]?\d+(?:\.\d+)?$/.test(value))
    ) {
      throw new NormalizationError('Expected a number or plain decimal string.', 'NUMBER');
    }
    const result = Number(value);
    if (
      !Number.isFinite(result) ||
      result < min ||
      result > max ||
      (integer && !Number.isSafeInteger(result))
    )
      throw new NormalizationError(
        'Number is outside the configured range or precision.',
        'NUMBER',
      );
    return result;
  });
}
export function booleanValue(
  options: { trueValues?: readonly string[]; falseValues?: readonly string[] } = {},
): Step {
  const truth = [...(options.trueValues ?? ['true', '1'])];
  const falsity = [...(options.falseValues ?? ['false', '0'])];
  if (
    [...truth, ...falsity].some((value) => typeof value !== 'string') ||
    new Set([...truth, ...falsity]).size !== truth.length + falsity.length
  )
    throw new TypeError('Boolean tokens must be distinct strings.');
  return step('booleanValue', (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (truth.includes(value)) return true;
      if (falsity.includes(value)) return false;
    }
    throw new NormalizationError('Unrecognized boolean token.', 'BOOLEAN');
  });
}
export function oneOf(values: readonly unknown[]): Step {
  if (!Array.isArray(values) || !values.length)
    throw new TypeError('oneOf requires a nonempty array.');
  const allowed = [...values];
  return step('oneOf', (value) => {
    if (!allowed.some((entry) => Object.is(value, entry)))
      throw new NormalizationError('Value is not in the allowed set.', 'ENUM');
    return value;
  });
}
export function createNormalizer(
  rules: Rules,
  options: { preserveUnknown?: boolean; trace?: boolean } = {},
): Normalizer {
  if (!plain(rules)) throw new TypeError('rules must be a plain field map.');
  const { preserveUnknown = true, trace = true } = options;
  if (typeof preserveUnknown !== 'boolean' || typeof trace !== 'boolean')
    throw new TypeError('Normalizer options must be booleans.');
  const compiled = Object.entries(rules).map(([field, rule]) => {
    if (
      !plain(rule) ||
      (rule.source !== undefined && typeof rule.source !== 'string') ||
      (rule.required !== undefined && typeof rule.required !== 'boolean') ||
      (rule.steps !== undefined && !Array.isArray(rule.steps))
    )
      throw new TypeError(`Invalid rule for ${field}.`);
    const steps = [...(rule.steps ?? [])];
    if (
      steps.some(
        (item) =>
          !item || typeof item.name !== 'string' || !item.name || typeof item.run !== 'function',
      )
    ) {
      throw new TypeError(`Invalid step for ${field}.`);
    }
    return { field, source: rule.source ?? field, required: rule.required ?? false, steps };
  });
  return {
    normalize(record) {
      if (!plain(record)) throw new TypeError('Input must be a plain record.');
      const original: RecordValue = { ...record };
      const value: RecordValue = preserveUnknown ? { ...record } : {};
      const issues: Issue[] = [],
        changes: Trace[] = [];
      for (const { field, source, required, steps } of compiled) {
        const missing = !Object.hasOwn(record, source);
        const raw = missing ? undefined : record[source];
        let current = raw,
          failed = false;
        const context: StepContext = Object.freeze({ field, original: raw, missing });
        for (const item of steps) {
          try {
            const next = item.run(current, context);
            if (
              next !== null &&
              (typeof next === 'object' || typeof next === 'function') &&
              'then' in next
            ) {
              throw new TypeError('Async normalization steps are not supported.');
            }
            if (trace && !Object.is(current, next))
              changes.push({ field, step: item.name, before: current, after: next });
            current = next;
          } catch (error) {
            if (!(error instanceof NormalizationError)) throw error;
            issues.push({
              field,
              source,
              step: item.name,
              code: error.code,
              message: error.message,
            });
            failed = true;
            break;
          }
        }
        if (!failed && required && (current === undefined || current === null || current === '')) {
          issues.push({
            field,
            source,
            step: 'required',
            code: 'REQUIRED',
            message: 'A nonempty value is required.',
          });
          failed = true;
        }
        // A failed field retains its raw source value; partial conversions are only in the trace.
        Object.defineProperty(value, field, {
          value: failed ? raw : current,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      return { ok: issues.length === 0, value, original, issues, changes };
    },
  };
}

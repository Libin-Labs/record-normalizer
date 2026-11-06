import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  createNormalizer,
  step,
  trim,
  collapseWhitespace,
  lowercase,
  uppercase,
  unicode,
  emptyToNull,
  defaultValue,
  numberValue,
  booleanValue,
  oneOf,
  NormalizationError,
} from '../dist/esm/index.js';

test('ordered normalization preserves raw input and emits transformation traces', () => {
  const record = Object.freeze({ name: '  Ada \n Lovelace ', age: '42', other: 1 });
  const result = createNormalizer({
    name: { steps: [collapseWhitespace(), uppercase()] },
    age: { steps: [numberValue({ integer: true })] },
  }).normalize(record);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: 'ADA LOVELACE', age: 42, other: 1 });
  assert.deepEqual(result.original, record);
  assert.equal(result.changes.length, 3);
  assert.notEqual(result.value, record);
});
test('source mapping and preserveUnknown are explicit', () => {
  const result = createNormalizer(
    { email: { source: 'Email', steps: [trim(), lowercase()] } },
    { preserveUnknown: false, trace: false },
  ).normalize({ Email: ' A@B.COM ', untouched: 1 });
  assert.deepEqual(result.value, { email: 'a@b.com' });
  assert.deepEqual(result.changes, []);
});
test('expected errors become issues; failed fields retain original source values', () => {
  const result = createNormalizer({
    age: { steps: [trim(), numberValue({ min: 0 })] },
    name: { steps: [trim()], required: true },
    active: { steps: [booleanValue()] },
  }).normalize({ age: ' nope ', name: ' ', active: 'yes' });
  assert.equal(result.ok, false);
  assert.equal(result.value.age, ' nope ');
  assert.equal(result.value.name, ' ');
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ['NUMBER', 'REQUIRED', 'BOOLEAN'],
  );
  assert.equal(result.changes.length, 2);
});
test('defaults, missing values, empty null conversion and required checks compose', () => {
  const result = createNormalizer({
    missing: { steps: [defaultValue('fallback')], required: true },
    nullable: { steps: [trim(), emptyToNull()] },
    required: { required: true },
  }).normalize({ nullable: '' });
  assert.equal(result.value.missing, 'fallback');
  assert.equal(result.value.nullable, null);
  assert.equal(result.issues[0].field, 'required');
  assert.equal(result.issues[0].code, 'REQUIRED');
});
test('Unicode and locale casing are configurable', () => {
  assert.equal(
    createNormalizer({ text: { steps: [unicode(), uppercase('tr')] } }).normalize({ text: 'i' })
      .value.text,
    'İ',
  );
  assert.equal(
    createNormalizer({ text: { steps: [unicode()] } }).normalize({ text: 'e\u0301' }).value.text,
    'é',
  );
  assert.throws(() => unicode('BAD'), TypeError);
  assert.throws(() => lowercase('not_a_locale'), RangeError);
});
test('number conversion rejects implicit coercions and unsafe integers', () => {
  const normalizer = createNormalizer({
    n: { steps: [numberValue({ integer: true, min: 0, max: 100 })] },
  });
  for (const n of ['', ' ', '1e2', '0x10', null, true, Infinity, '1.2', '101', '9007199254740993'])
    assert.equal(normalizer.normalize({ n }).ok, false);
  assert.equal(normalizer.normalize({ n: '0003' }).value.n, 3);
  assert.throws(() => numberValue({ min: 2, max: 1 }), TypeError);
});
test('boolean conversion and oneOf use explicit tokens and identity', () => {
  const normalizer = createNormalizer({
    active: { steps: [booleanValue({ trueValues: ['yes'], falseValues: ['no'] })] },
    role: { steps: [oneOf(['admin', 'user'])] },
  });
  assert.equal(normalizer.normalize({ active: 'yes', role: 'user' }).ok, true);
  assert.equal(normalizer.normalize({ active: 'YES', role: 'root' }).issues.length, 2);
  assert.throws(() => booleanValue({ trueValues: ['x'], falseValues: ['x'] }), TypeError);
  assert.throws(() => oneOf([]), TypeError);
});
test('custom expected failures are distinct from programming failures', () => {
  let context;
  const custom = step('custom', (value, next) => {
    context = next;
    throw new NormalizationError('Rejected', 'CUSTOM');
  });
  assert.equal(createNormalizer({ x: { steps: [custom] } }).normalize({}).issues[0].code, 'CUSTOM');
  assert.equal(context.missing, true);
  assert.equal(Object.isFrozen(context), true);
  assert.throws(
    () =>
      createNormalizer({
        x: {
          steps: [
            step('bug', () => {
              throw new Error('bug');
            }),
          ],
        },
      }).normalize({}),
    /bug/,
  );
  assert.throws(
    () =>
      createNormalizer({ x: { steps: [step('async', () => Promise.resolve(1))] } }).normalize({}),
    /Async/,
  );
});
test('special property names do not mutate output prototypes or use inherited sources', () => {
  const rules = JSON.parse('{"__proto__":{"source":"constructor"}}');
  const result = createNormalizer(rules).normalize({});
  assert.equal(Object.hasOwn(result.value, '__proto__'), true);
  assert.equal(result.value.__proto__, undefined);
  assert.equal(Object.getPrototypeOf(result.value), Object.prototype);
});
test('malformed rules fail at construction; invalid records fail explicitly', () => {
  for (const rules of [null, [], { x: null }, { x: { steps: ['bad'] } }, { x: { source: 1 } }])
    assert.throws(() => createNormalizer(rules), TypeError);
  const normalizer = createNormalizer({});
  for (const value of [null, [], new Date(), 'text'])
    assert.throws(() => normalizer.normalize(value), TypeError);
});
test('compiled rule arrays are isolated from later configuration edits', () => {
  const steps = [trim()];
  const normalizer = createNormalizer({ name: { steps } });
  steps.push(uppercase());
  assert.equal(normalizer.normalize({ name: ' Ada ' }).value.name, 'Ada');
});
test('CommonJS supports independent normalization', () => {
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.equal(
    cjs.createNormalizer({ n: { steps: [cjs.trim()] } }).normalize({ n: ' x ' }).value.n,
    'x',
  );
});

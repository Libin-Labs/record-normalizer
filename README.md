# @lp-labs/record-normalizer

Independent synchronous field normalization with explicit issues, source preservation and transformation traces. Zero runtime or peer dependencies. No sibling-package imports.

## Install

```sh
npm install @lp-labs/record-normalizer
```

Node 18+ or ES2022 browsers with Intl and Unicode normalization. ESM, CommonJS and TypeScript declarations are included.

## Quick start

```js
import { createNormalizer, trim, lowercase, numberValue } from '@lp-labs/record-normalizer';

const normalizer = createNormalizer({
  email: { source: 'Email', steps: [trim(), lowercase()], required: true },
  age: { steps: [numberValue({ integer: true, min: 0, max: 150 })] },
}, { preserveUnknown: false });

const result = normalizer.normalize({ Email: ' ADA@EXAMPLE.COM ', age: '36' });
console.log(result.ok); // true
console.log(result.value); // { email: "ada@example.com", age: 36 }
```

CommonJS: `const { createNormalizer, trim } = require('@lp-labs/record-normalizer');`.

## Rule model and results

`createNormalizer(rules, options?)` compiles a plain field map. Each output field has:

- `source?: string`: exact top-level input field name, defaulting to the output name. Dots are literal, not paths.
- `steps?: readonly Step[]`: ordered synchronous transformations, default `[]`.
- `required?: boolean`: after successful transformations, reject `undefined`, `null` or `""`; default false. Whitespace is nonempty unless trimmed.

Options: `preserveUnknown` defaults true; `trace` defaults true. Both require booleans. When preserving fields, mapped source names remain unless they are also overwritten as output fields. Use false for a projected result.

`normalize(record)` accepts a plain object (including null-prototype objects), returning `NormalizeResult`:

| Field | Meaning |
|---|---|
| `ok` | No field issues |
| `value` | New output record |
| `original` | Shallow copy of the input |
| `issues` | `{ field, source, step, code, message }[]` |
| `changes` | `{ field, step, before, after }[]`, only changed step values |

Rules always read the original input, never another rule's output. Failed fields retain their raw source value, including undefined for missing input; earlier partial conversions appear only in the trace. All other fields continue. No expected failure is silently replaced with a successful default.

Records, snapshots, traces and fallback values are **shallow**, not deep clones. Nested values retain references. Built-in steps do not mutate input, but custom steps must obey that contract. Treat configuration/results as immutable. Rule arrays are copied at construction.

## Built-in steps

| Export | Behavior |
|---|---|
| `trim()` | Require a string, remove surrounding whitespace. |
| `collapseWhitespace()` | Require a string, collapse Unicode whitespace and trim. |
| `unicode(form = 'NFC')` | Normalize a string using NFC/NFD/NFKC/NFKD. |
| `lowercase(locale?)` | Unicode lowercase, optionally using the explicit locale. |
| `uppercase(locale?)` | Unicode uppercase, optionally using the explicit locale. |
| `emptyToNull()` | Convert exact empty string or undefined to null. |
| `defaultValue(fallback)` | Replace null/undefined with the supplied value. |
| `numberValue({ integer?, min?, max? } = {})` | Parse finite numbers/plain decimal strings, with optional bounds. Integer mode requires safe integers. |
| `booleanValue({ trueValues?, falseValues? } = {})` | Accept booleans or exact tokens; defaults `"true"`/`"1"` and `"false"`/`"0"`. |
| `oneOf(values)` | Check membership using Object.is; nonempty array required. |

Numeric conversion rejects whitespace, exponent/hex notation, booleans and empty strings. **Noninteger numbers use JavaScript floating point**, not exact financial arithmetic. Numeric strings must have digits before/after any decimal point. Default bounds are unbounded; finite outputs are still required.

Boolean tokens are case-sensitive, copied at construction, and cannot duplicate or overlap. Normalize case/whitespace first when desired.

Missing/null input is not automatically skipped. Place defaults before string/number steps when required. For nullable text, use `[trim(), emptyToNull()]` only when the source is known to be a string.

## Custom steps and errors

```js
import { step, NormalizationError, createNormalizer } from '@lp-labs/record-normalizer';

const productCode = step('productCode', (value, context) => {
  if (typeof value !== 'string' || !/^[A-Z]{3}-\d{4}$/.test(value)) {
    throw new NormalizationError(`Invalid ${context.field}`, 'PRODUCT_CODE');
  }
  return value;
});
const result = createNormalizer({ code: { steps: [productCode] } }).normalize({ code: 'ABC-1234' });
console.log(result.ok); // true
```

`step(name, run)` validates and freezes a `Step` descriptor. `run(value, context)` receives a frozen `StepContext` with output `field`, original source value `original`, and `missing` (own source field absent).

`NormalizationError(message, code = 'INVALID_VALUE')` is an expected data issue, collected per field. Built-in codes include TYPE, NUMBER, BOOLEAN and ENUM; required rules emit REQUIRED. Other exceptions propagate unchanged: programming failures are not mislabeled as dirty data. Async/thenable results throw TypeError. Do not return rejected promises from synchronous steps.

## API and customization

Runtime exports: `createNormalizer`, `step`, `trim`, `collapseWhitespace`, `unicode`, `lowercase`, `uppercase`, `emptyToNull`, `defaultValue`, `numberValue`, `booleanValue`, `oneOf`, `NormalizationError`.

Type exports: `RecordValue`, `StepContext`, `Step`, `FieldRule`, `Rules`, `Issue`, `Trace`, `NormalizeResult`, `Normalizer`.

All output values are unknown until narrowed or checked by your domain validator. Rules do not assert an inferred output schema. Use one package/module instance for custom NormalizationError identity.

For imports, call normalize per row and route issues to your application's error report. For bulk workloads, disable trace to reduce allocation. There is no implicit email/address validation, locale guessing, nested-path mutation, fuzzy matching, asynchronous I/O or persistence.

Work is proportional to fields/steps and actual text transformations. No record-size limit is imposed; bound untrusted inputs externally. Original/trace values can contain personal data; redact before logging or persistence. This is independently authored initial-release code, not a standards certification.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.

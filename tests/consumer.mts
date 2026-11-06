import {
  createNormalizer,
  trim,
  lowercase,
  numberValue,
  booleanValue,
  step,
  NormalizationError,
} from '@lp-labs/record-normalizer';
import type { NormalizeResult, Normalizer, StepContext } from '@lp-labs/record-normalizer';
const normalizer: Normalizer = createNormalizer({
  email: { steps: [trim(), lowercase()], required: true },
  age: { source: 'Age', steps: [numberValue({ integer: true, min: 0 })] },
  active: { steps: [booleanValue()] },
  custom: {
    steps: [
      step('custom', (value, context: StepContext) => {
        if (typeof value !== 'string') throw new NormalizationError(context.field);
        return value;
      }),
    ],
  },
});
const result: NormalizeResult = normalizer.normalize({ email: ' A@B ', Age: '3' });
const value: unknown = result.value.email;
void value;
// @ts-expect-error steps need a function
step('bad', 'not callable');
// @ts-expect-error required is boolean
createNormalizer({ name: { required: 'true' } });

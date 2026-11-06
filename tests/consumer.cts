import { createNormalizer, trim } from '@lp-labs/record-normalizer';
const result = createNormalizer({ name: { steps: [trim()] } }).normalize({ name: ' Ada ' });
const ok: boolean = result.ok;
void ok;

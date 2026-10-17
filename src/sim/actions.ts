import type { Side } from './lanes';

export type Action =
  | { readonly kind: 'lane'; readonly side: Side }
  | { readonly kind: 'hop' }
  | { readonly kind: 'roll'; readonly side: Side };

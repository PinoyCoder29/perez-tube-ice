import { PAYMENT_METHOD_LABELS, PACKAGE_LABELS } from '@/lib/constants';
export { formatPeso, formatQty, formatDateTime, formatDate } from '@/lib/formatting';
export const methodLabel = (m: string) => PAYMENT_METHOD_LABELS[m] ?? m;
export const packageLabel = (p: string) => PACKAGE_LABELS[p] ?? p;

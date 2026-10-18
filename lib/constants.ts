export const PACKAGE_LABELS: Record<string, string> = {
  RETAIL: 'Retail pack',
  HALF_SACK: 'Half sack',
  FULL_SACK: 'Full sack',
  MULTI_SACK: 'Multiple sacks',
  CUSTOM: 'Custom quantity',
};
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  GCASH: 'GCash',
  MAYA: 'Maya',
  BANK_TRANSFER: 'Bank transfer',
  OTHER: 'Other',
};
export const DIGITAL_METHODS = ['GCASH', 'MAYA', 'BANK_TRANSFER', 'OTHER'] as const;
export const EXPENSE_CATEGORIES = [
  'Meals / Ulam',
  'Rice',
  'Drinking water',
  'Gasoline',
  'Delivery fuel',
  'Vehicle expenses',
  'Ice production supplies',
  'Repairs',
  'Other',
];
export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  ASSIGNED: 'Assigned',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};
export const MOVEMENT_LABELS: Record<string, string> = {
  OPENING: 'Opening stock',
  RECEIVED: 'Stock received / produced',
  ADJUSTMENT_IN: 'Adjustment (+)',
  ADJUSTMENT_OUT: 'Adjustment (−)',
  SALE: 'Sold',
  SALE_REVERSAL: 'Sale reversed',
};
export const STAFF_USERNAME = 'staff';
/** Staff may look back this many days in the daily view (Admin has no limit). */
export const STAFF_HISTORY_DAYS = 60;
export const PAYMENT_STATUS_LABELS: Record<string, string> = { UNPAID: 'Unpaid', PARTIAL: 'Partially paid', PAID: 'Paid' };
export const DEFAULT_CUSTOM_PRICE_MAX = 5000;

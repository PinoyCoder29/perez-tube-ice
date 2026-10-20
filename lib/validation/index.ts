import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';

const METHODS = ['CASH', 'GCASH', 'MAYA', 'BANK_TRANSFER', 'OTHER'] as const;
const PACKAGES = ['RETAIL', 'HALF_SACK', 'FULL_SACK', 'MULTI_SACK', 'CUSTOM'] as const;

/** Money is accepted as a string/number with at most 2 decimals and kept as a string (Decimal in services). */
export const money = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,9}(\.\d{1,2})?$/.test(v), 'Enter a valid amount (max 2 decimals)');
export const positiveMoney = money.refine((v) => Number(v) > 0, 'Amount must be greater than zero');

export const qty3 = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,9}(\.\d{1,3})?$/.test(v), 'Enter a valid quantity (max 3 decimals)');
const optionalQty3 = z.union([qty3, z.literal(''), z.null()]).optional().transform((v) => (v === '' || v === undefined ? null : v));

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z.union([text(max), z.null()]).optional().transform((v) => (v === undefined || v === null || v === '' ? null : v));

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Phone must look like 09XXXXXXXXX or +639XXXXXXXXX' });
      return z.NEVER;
    }
    return n;
  });

export const paymentMethod = z.enum(METHODS);
export const paymentLine = z.object({ method: paymentMethod, amount: positiveMoney });
export const orderItem = z.object({ priceOptionId: z.string().min(1), quantity: z.number().int().min(1).max(1000) });

/** Either a configured price button (priceOptionId) or a custom price for a product. */
export const saleItemInput = z
  .object({
    priceOptionId: z.string().min(1).optional(),
    productId: z.string().min(1).optional(),
    customUnitPrice: positiveMoney.optional(),
    quantity: z.number().int().min(1).max(1000),
  })
  .refine((v) => !!v.priceOptionId !== (!!v.productId && !!v.customUnitPrice), 'Each item needs a price button, or a product with a custom price.');

export const saleCreate = z.object({
  idempotencyKey: z.string().min(8).max(100),
  customerId: z.string().min(1).nullable().optional(),
  items: z.array(saleItemInput).min(1, 'Add at least one item').max(50),
  payments: z.array(paymentLine).max(5).default([]),
  notes: optText(500),
});

export const debtPaymentCreate = z.object({
  idempotencyKey: z.string().min(8).max(100),
  customerId: z.string().min(1),
  amount: positiveMoney,
  method: paymentMethod,
  notes: optText(500),
  reference: optText(80),
  saleId: z.string().min(1).nullable().optional(),
});

export const reasonBody = z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(300) });

export const customerCreate = z.object({
  name: text(120).min(1, 'Name is required'),
  phone: phoneSchema,
  address: text(300).min(1, 'Address is required'),
  landmark: optText(200),
  notes: optText(1000),
});
export const customerUpdate = customerCreate.extend({ active: z.boolean().optional() });
/** Admin-only: a new customer together with the prices (per package) offered to that customer. */
export const customerCreateWithPrices = customerCreate.extend({
  prices: z.array(z.object({ priceOptionId: z.string().min(1), sellingPrice: positiveMoney, minQuantity: z.number().int().min(1).max(1000).default(1) })).max(200).default([]),
});

export const productCreate = z.object({
  name: text(80).min(1),
  description: optText(300),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  inventoryTrackingEnabled: z.boolean().optional(),
  enforceStock: z.boolean().optional(),
  stockUnit: text(30).min(1).optional(),
  lowStockThreshold: optionalQty3,
});
export const productUpdate = productCreate.partial();

export const priceOptionCreate = z.object({
  productId: z.string().min(1),
  label: text(40).min(1),
  packageType: z.enum(PACKAGES),
  sellingPrice: positiveMoney,
  unitDescription: optText(80),
  sacksPerUnit: optionalQty3,
  inventoryQuantityPerUnit: optionalQty3,
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export const priceOptionUpdate = priceOptionCreate.omit({ productId: true }).partial();

export const expenseCreate = z.object({
  category: text(60).min(1, 'Choose a category'),
  description: text(200).min(1, 'Describe the expense'),
  amount: positiveMoney,
  paymentMethod: paymentMethod.default('CASH'),
  incurredAt: z.string().datetime({ offset: true }).optional(),
  receiptRef: optText(80),
  notes: optText(500),
});
export const expenseUpdate = expenseCreate.partial();

export const deliveryCreate = z.object({
  idempotencyKey: z.string().min(8).max(100),
  customerId: z.string().min(1),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a delivery date'),
  scheduledTime: z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal(''), z.null()]).optional(),
  items: z.array(saleItemInput).min(1, 'Add at least one item').max(30),
  deliveryFee: money.optional(),
  paymentType: z.enum(['COD', 'CREDIT']).default('COD'),
  instructions: optText(500),
  deliveryAddress: optText(300),
  assign: z.boolean().optional(),
  // Optional payment arrangement recorded with the order: Paid Cash / Paid GCash / Partial. Omit for Unpaid / Collect later.
  payment: z
    .object({ idempotencyKey: z.string().min(8).max(100), method: paymentMethod, amount: positiveMoney, reference: optText(80), notes: optText(300) })
    .nullable()
    .optional(),
});
export const deliveryUpdate = deliveryCreate.omit({ customerId: true, idempotencyKey: true, payment: true }).partial();

export const deliveryPaymentLine = z.object({ method: paymentMethod, amount: positiveMoney, reference: optText(80), notes: optText(300) });

export const deliveryStatusBody = z.object({
  status: z.enum(['PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED']),
  reason: optText(300),
  payments: z.array(deliveryPaymentLine).max(3).optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

export const deliveryPaymentBody = z.object({
  idempotencyKey: z.string().min(8).max(100),
  method: paymentMethod,
  amount: positiveMoney,
  reference: optText(80),
  notes: optText(300),
});

export const movementCreate = z.object({
  productId: z.string().min(1),
  movementType: z.enum(['OPENING', 'RECEIVED', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: qty3.refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  reason: optText(200),
});

export const adjustmentBody = z.object({
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^-?\d{1,9}(\.\d{1,2})?$/.test(v) && Number(v) !== 0, 'Enter a non-zero amount (negative reduces debt)'),
  note: z.string().trim().min(3, 'A note is required').max(300),
});

export const loginBody = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) });
export const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'Use at least 10 characters').max(200),
});

export const settingsBody = z.object({
  businessName: text(80).min(1),
  businessAddress: text(200).optional(),
  businessPhone: text(40).optional(),
  receiptFooter: text(200).optional(),
  customPriceMax: z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d{1,7}(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Enter a valid maximum price').optional(),
  allowStaffCustomPrice: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => String(v)).optional(),
});

export const customerPriceCreate = z.object({
  priceOptionId: z.string().min(1),
  sellingPrice: positiveMoney,
  minQuantity: z.number().int().min(1).max(1000).default(1),
  effectiveFrom: z.string().datetime({ offset: true }).nullable().optional(),
  active: z.boolean().optional(),
});
export const customerPriceUpdate = customerPriceCreate.omit({ priceOptionId: true }).partial();

// Client-safe list of report types (no server imports).
export const REPORT_TYPES = [
  { id: 'sales', label: 'Sales (daily / weekly / monthly / annual)', grouped: true },
  { id: 'product-performance', label: 'Product performance' },
  { id: 'sack-sales', label: 'Sack sales' },
  { id: 'staff-sales', label: 'Staff sales summary' },
  { id: 'collections', label: 'Collections by payment method' },
  { id: 'debt-payments', label: 'Debt payments received' },
  { id: 'unpaid-credit', label: 'Unpaid credit sales' },
  { id: 'outstanding', label: 'Outstanding balances' },
  { id: 'expenses', label: 'Expenses by period', grouped: true },
  { id: 'expenses-category', label: 'Expenses by category' },
  { id: 'expenses-staff', label: 'Expenses by staff member' },
  { id: 'deliveries', label: 'Deliveries', status: true },
  { id: 'deliveries-customer', label: 'Deliveries by customer' },
  { id: 'inventory-stock', label: 'Inventory: current stock' },
  { id: 'inventory-movements', label: 'Inventory: movements (received / sold / adjustments)' },
  { id: 'low-stock', label: 'Inventory: low-stock products' },
] as const;

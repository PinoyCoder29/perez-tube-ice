/** Starter catalogue. Tube Ice is first (sortOrder 1) so it is listed before Crushed Ice everywhere in the POS. */
export const SEED_PRODUCTS: { name: string; description: string; sortOrder: number; prices: { label: string; price: string }[] }[] = [
  {
    name: 'Tube Ice',
    description: 'Tube ice',
    sortOrder: 1,
    prices: [
      { label: '₱25', price: '25.00' },
      { label: '₱70', price: '70.00' },
      { label: '₱140', price: '140.00' },
      { label: '₱260', price: '260.00' },
    ],
  },
  {
    name: 'Crushed Ice',
    description: 'Crushed ice',
    sortOrder: 2,
    prices: [
      { label: '₱5', price: '5.00' },
      { label: '₱10', price: '10.00' },
      { label: '₱20', price: '20.00' },
    ],
  },
];

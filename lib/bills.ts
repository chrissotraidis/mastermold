/**
 * A repeating charge counts as a bill unless it is everyday spending. Groceries
 * or coffee every month repeat, but they are not bills you have to pay.
 */
const EVERYDAY = new Set([
  "groceries",
  "restaurants",
  "coffee-shops",
  "gas",
  "rideshare",
  "public-transit",
  "parking",
  "shopping",
  "clothing",
  "electronics",
  "entertainment",
  "personal",
  "gifts",
]);

export function isBill(item: { typical_amount: number; category_id: string | null }): boolean {
  return item.typical_amount < 0 && !EVERYDAY.has(item.category_id ?? "");
}

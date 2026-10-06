/** Shared (client-safe) account type list. */
export type AccountTypeValue =
  | "brokerage"
  | "retirement"
  | "crypto_exchange"
  | "wallet"
  | "bank"
  | "cash"
  | "credit_card"
  | "loan"
  | "mortgage"
  | "property"
  | "vehicle"
  | "other";

export const ACCOUNT_TYPES: Array<{ value: AccountTypeValue; label: string; kind: "asset" | "liability" }> = [
  { value: "brokerage", label: "Brokerage", kind: "asset" },
  { value: "retirement", label: "Retirement", kind: "asset" },
  { value: "crypto_exchange", label: "Crypto exchange", kind: "asset" },
  { value: "wallet", label: "Wallet", kind: "asset" },
  { value: "bank", label: "Bank account", kind: "asset" },
  { value: "cash", label: "Cash", kind: "asset" },
  { value: "property", label: "Real estate", kind: "asset" },
  { value: "vehicle", label: "Vehicle", kind: "asset" },
  { value: "other", label: "Other asset", kind: "asset" },
  { value: "credit_card", label: "Credit card", kind: "liability" },
  { value: "loan", label: "Loan", kind: "liability" },
  { value: "mortgage", label: "Mortgage", kind: "liability" },
];

export function accountTypeLabel(value: string) {
  return ACCOUNT_TYPES.find((item) => item.value === value)?.label ?? "Account";
}

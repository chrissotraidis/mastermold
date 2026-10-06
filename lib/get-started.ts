/** The three things that make Master Mold yours. Shared by Welcome and Today. */
export type GetStartedStepId = "money" | "accounts" | "journal";

export type GetStartedStep = {
  id: GetStartedStepId;
  title: string;
  detail: string;
  href: string;
  cta: string;
};

export const GET_STARTED_STEPS: GetStartedStep[] = [
  {
    id: "money",
    title: "Add your money",
    detail: "Import your manual_holdings JSON book or a CSV, or add holdings one at a time.",
    href: "/portfolio?action=import-holdings",
    cta: "Import holdings",
  },
  {
    id: "accounts",
    title: "Add accounts and debts",
    detail: "Cash, cards, loans and property roll into net worth next to your holdings.",
    href: "/portfolio?action=add-account",
    cta: "Add an account",
  },
  {
    id: "journal",
    title: "Log your first call",
    detail: "Write a decision down before the outcome. Master Mold grades it later.",
    href: "/journal#record-call",
    cta: "Open Journal",
  },
];


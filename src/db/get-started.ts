import { GET_STARTED_STEPS, type GetStartedStep } from "@/lib/get-started";
import { store } from "@/src/db/store";

export type GetStartedProgress = {
  steps: Array<GetStartedStep & { done: boolean }>;
  doneCount: number;
  complete: boolean;
};

/** Reads only the user's own local rows; sample data never counts as done. */
export function getStartedProgress(): GetStartedProgress {
  const local = store();
  const done: Record<GetStartedStep["id"], boolean> = {
    money: local.manualHoldings().length + local.importedHoldings().length > 0,
    accounts: local.financialAccounts().length > 0,
    journal: local.loggedJournalEntries().length > 0,
  };
  const steps = GET_STARTED_STEPS.map((step) => ({ ...step, done: done[step.id] }));
  const doneCount = steps.filter((step) => step.done).length;
  return { steps, doneCount, complete: doneCount === steps.length };
}


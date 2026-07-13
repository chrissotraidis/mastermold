export const ANTI_OVERFIT_CONSTITUTION = [
  "Parameters are frozen before evaluation; changing a window resets the evaluation clock.",
  "Change one parameter or module at a time.",
  "Write every report and never delete losing runs.",
  "Require at least 40 enters for expectancy and 150 labeled decisions for promotion.",
  "Grid-search only inside walk-forward training folds; reject optima whose neighboring cells are catastrophic.",
  "When replay and shadow disagree, shadow evidence wins.",
] as const;

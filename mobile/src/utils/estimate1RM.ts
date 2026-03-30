export type OneRepMaxFormula = "epley" | "brzycki" | "lombardi";

export const estimate1RM = (
  weight: number,
  reps: number,
  formula: OneRepMaxFormula = "epley",
): number => {
  if (weight < 0 || reps < 0) {
    throw new Error("Weight and reps must be non-negative");
  }

  if (weight === 0 || reps === 0) {
    return 0;
  }

  if (reps === 1) {
    return Number(weight.toFixed(2));
  }

  switch (formula) {
    case "brzycki":
      if (reps >= 37) {
        return Number(weight.toFixed(2));
      }

      return Number(((weight * 36) / (37 - reps)).toFixed(2));
    case "lombardi":
      return Number((weight * Math.pow(reps, 0.1)).toFixed(2));
    case "epley":
    default:
      return Number((weight * (1 + reps / 30)).toFixed(2));
  }
};

import { PlanGoal } from "./enums";
import type { SupportedLanguage } from "./exerciseMetadata";

export const planGoalLabels: Record<PlanGoal, Record<SupportedLanguage, string>> = {
  [PlanGoal.Hypertrophy]: {
    en: "Hypertrophy",
    zh: "增肌",
  },
  [PlanGoal.Strength]: {
    en: "Strength",
    zh: "力量",
  },
  [PlanGoal.Endurance]: {
    en: "Endurance",
    zh: "耐力",
  },
  [PlanGoal.General]: {
    en: "General",
    zh: "通用",
  },
};

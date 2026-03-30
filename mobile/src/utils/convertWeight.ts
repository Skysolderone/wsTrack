import { WeightUnit } from "../constants/enums";

const LBS_PER_KG = 2.2046226218;

export const convertWeight = (
  value: number,
  from: WeightUnit,
  to: WeightUnit,
): number => {
  if (from === to) {
    return Number(value.toFixed(2));
  }

  const convertedValue =
    from === WeightUnit.KG ? value * LBS_PER_KG : value / LBS_PER_KG;

  return Number(convertedValue.toFixed(2));
};

import { WeightUnit } from "../../constants/enums";
import { convertWeight } from "../convertWeight";

describe("convertWeight", () => {
  test("kg→lbs：100kg = 220.46lbs", () => {
    expect(convertWeight(100, WeightUnit.KG, WeightUnit.LBS)).toBe(220.46);
  });

  test("lbs→kg：225lbs = 102.06kg", () => {
    expect(convertWeight(225, WeightUnit.LBS, WeightUnit.KG)).toBe(102.06);
  });

  test("相同单位转换返回原值", () => {
    expect(convertWeight(100, WeightUnit.KG, WeightUnit.KG)).toBe(100);
  });

  test("0 返回 0", () => {
    expect(convertWeight(0, WeightUnit.KG, WeightUnit.LBS)).toBe(0);
    expect(convertWeight(0, WeightUnit.LBS, WeightUnit.KG)).toBe(0);
  });

  test("精度：结果保留 2 位小数", () => {
    expect(convertWeight(1, WeightUnit.KG, WeightUnit.LBS)).toBe(2.2);
    expect(convertWeight(2.2, WeightUnit.LBS, WeightUnit.KG)).toBe(1);
  });
});

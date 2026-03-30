import { calculateVolume } from "../calculateVolume";

describe("calculateVolume", () => {
  test("正常计算：3组(100kg×10) = 3000", () => {
    expect(
      calculateVolume([
        { reps: 10, weight: 100 },
        { reps: 10, weight: 100 },
        { reps: 10, weight: 100 },
      ]),
    ).toBe(3000);
  });

  test("排除热身组：1组warmup(60×10) + 3组(100×10) = 3000", () => {
    expect(
      calculateVolume([
        { isWarmup: true, reps: 10, weight: 60 },
        { reps: 10, weight: 100 },
        { reps: 10, weight: 100 },
        { reps: 10, weight: 100 },
      ]),
    ).toBe(3000);
  });

  test("空数组返回 0", () => {
    expect(calculateVolume([])).toBe(0);
  });

  test("未完成的组(isCompleted=false)不计入", () => {
    expect(
      calculateVolume([
        { isCompleted: false, reps: 10, weight: 100 },
        { isCompleted: true, reps: 8, weight: 120 },
      ]),
    ).toBe(960);
  });

  test("weight=null 的组跳过", () => {
    expect(
      calculateVolume([
        { reps: 10, weight: null },
        { reps: 8, weight: 120 },
      ]),
    ).toBe(960);
  });

  test("reps=null 的组跳过", () => {
    expect(
      calculateVolume([
        { reps: null, weight: 100 },
        { reps: 8, weight: 120 },
      ]),
    ).toBe(960);
  });

  test("混合：部分有效部分无效", () => {
    expect(
      calculateVolume([
        { isCompleted: false, reps: 10, weight: 100 },
        { isWarmup: true, reps: 12, weight: 60 },
        { reps: 8, weight: null },
        { reps: null, weight: 80 },
        { isCompleted: true, reps: 6, weight: 140 },
      ]),
    ).toBe(840);
  });
});

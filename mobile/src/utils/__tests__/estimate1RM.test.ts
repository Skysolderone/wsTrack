import { estimate1RM } from "../estimate1RM";

describe("estimate1RM", () => {
  test("Epley公式：100kg × 10reps = 133.33", () => {
    expect(estimate1RM(100, 10, "epley")).toBe(133.33);
  });

  test("默认公式为 Epley", () => {
    expect(estimate1RM(100, 10)).toBe(133.33);
  });

  test("Brzycki公式：100kg × 10reps = 133.33", () => {
    expect(estimate1RM(100, 10, "brzycki")).toBe(133.33);
  });

  test("Lombardi公式：100kg × 10reps", () => {
    expect(estimate1RM(100, 10, "lombardi")).toBe(125.89);
  });

  test("1 rep 返回原重量", () => {
    expect(estimate1RM(100, 1, "epley")).toBe(100);
    expect(estimate1RM(100, 1, "brzycki")).toBe(100);
    expect(estimate1RM(100, 1, "lombardi")).toBe(100);
  });

  test("Brzycki 37+ reps 回退为原重量", () => {
    expect(estimate1RM(60, 40, "brzycki")).toBe(60);
  });

  test("0 reps 返回 0", () => {
    expect(estimate1RM(100, 0, "epley")).toBe(0);
  });

  test("负数输入抛出错误", () => {
    expect(() => estimate1RM(-100, 10, "epley")).toThrow(
      "Weight and reps must be non-negative",
    );
    expect(() => estimate1RM(100, -10, "epley")).toThrow(
      "Weight and reps must be non-negative",
    );
  });
});

import { act, fireEvent, render } from "@testing-library/react-native";

import { PRType } from "../../constants/enums";
import { PRCelebration } from "../PRCelebration";

const celebration = {
  exerciseId: "exercise-1",
  exerciseName: "杠铃卧推",
  records: [
    {
      displayUnit: "kg",
      displayValue: 105,
      label: "最大重量",
      type: PRType.MaxWeight,
      value: 105,
    },
  ],
  workoutSetId: "set-1",
};

describe("PRCelebration", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("显示 PR 类型和数值", () => {
    const { getByTestId } = render(
      <PRCelebration celebration={celebration} onClose={jest.fn()} visible />,
    );

    expect(getByTestId("pr-celebration-primary-record").props.children.join("")).toContain(
      "最大重量 · 105kg",
    );
  });

  test("2 秒后自动消失，触发 onDismiss", () => {
    const onDismiss = jest.fn();

    render(
      <PRCelebration
        celebration={celebration}
        onClose={jest.fn()}
        onDismiss={onDismiss}
        visible
      />,
    );

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("点击可提前关闭", () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <PRCelebration
        celebration={celebration}
        onClose={jest.fn()}
        onDismiss={onDismiss}
        visible
      />,
    );

    fireEvent.press(getByTestId("pr-celebration-overlay"));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

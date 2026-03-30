import { act, fireEvent, render } from "@testing-library/react-native";

import { RestTimer } from "../RestTimer";

describe("RestTimer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("初始显示预设时间", () => {
    const { getByTestId } = render(
      <RestTimer
        durationSeconds={90}
        onAdjust={jest.fn()}
        onSkip={jest.fn()}
        remainingSeconds={90}
        visible
      />,
    );

    expect(getByTestId("rest-timer-display").props.children).toBe("01:30");
  });

  test("倒计时到 0 触发 onComplete", () => {
    const onComplete = jest.fn();

    render(
      <RestTimer
        durationSeconds={90}
        onAdjust={jest.fn()}
        onComplete={onComplete}
        onSkip={jest.fn()}
        remainingSeconds={90}
        visible
      />,
    );

    act(() => {
      jest.advanceTimersByTime(90_000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("+15s 按钮增加时间", () => {
    const onAdjust = jest.fn();
    const { getByTestId } = render(
      <RestTimer
        durationSeconds={90}
        onAdjust={onAdjust}
        onSkip={jest.fn()}
        remainingSeconds={90}
        visible
      />,
    );

    fireEvent.press(getByTestId("rest-timer-plus-15"));

    expect(onAdjust).toHaveBeenCalledWith(15);
  });

  test("-15s 按钮减少时间", () => {
    const onAdjust = jest.fn();
    const { getByTestId } = render(
      <RestTimer
        durationSeconds={90}
        onAdjust={onAdjust}
        onSkip={jest.fn()}
        remainingSeconds={90}
        visible
      />,
    );

    fireEvent.press(getByTestId("rest-timer-minus-15"));

    expect(onAdjust).toHaveBeenCalledWith(-15);
  });

  test("-15s 不低于 0", () => {
    const onAdjust = jest.fn();
    const { getByTestId } = render(
      <RestTimer
        durationSeconds={10}
        onAdjust={onAdjust}
        onSkip={jest.fn()}
        remainingSeconds={0}
        visible
      />,
    );

    fireEvent.press(getByTestId("rest-timer-minus-15"));

    expect(onAdjust).toHaveBeenCalledWith(0);
  });

  test("跳过按钮触发 onSkip", () => {
    const onSkip = jest.fn();
    const { getByTestId } = render(
      <RestTimer
        durationSeconds={90}
        onAdjust={jest.fn()}
        onSkip={onSkip}
        remainingSeconds={90}
        visible
      />,
    );

    fireEvent.press(getByTestId("rest-timer-skip"));

    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

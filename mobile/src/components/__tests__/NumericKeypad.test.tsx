import { fireEvent, render } from "@testing-library/react-native";

import { NumericKeypad } from "../NumericKeypad";

const readText = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((item) => readText(item)).join("");
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
};

const createProps = () => ({
  leftShortcuts: [-2.5, -5],
  onClose: jest.fn(),
  onConfirm: jest.fn(),
  previousValue: 95,
  rightShortcuts: [2.5, 5],
  title: "输入重量",
  unitLabel: "kg",
  value: null as number | null,
  visible: true,
});

describe("NumericKeypad", () => {
  test("点击数字按钮更新显示值：依次点击 1-0-0 显示 100", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} />);

    fireEvent.press(getByTestId("numeric-keypad-key-1"));
    fireEvent.press(getByTestId("numeric-keypad-key-0"));
    fireEvent.press(getByTestId("numeric-keypad-key-0"));

    expect(readText(getByTestId("numeric-keypad-display").props.children)).toBe("100kg");
  });

  test("点击 +2.5：100 → 102.5", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} value={100} />);

    fireEvent.press(getByTestId("numeric-keypad-shortcut-2.5"));

    expect(readText(getByTestId("numeric-keypad-display").props.children)).toBe("102.50kg");
  });

  test("点击 -2.5：100 → 97.5", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} value={100} />);

    fireEvent.press(getByTestId("numeric-keypad-shortcut--2.5"));

    expect(readText(getByTestId("numeric-keypad-display").props.children)).toBe("97.50kg");
  });

  test("点击 +5：100 → 105", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} value={100} />);

    fireEvent.press(getByTestId("numeric-keypad-shortcut-5"));

    expect(readText(getByTestId("numeric-keypad-display").props.children)).toBe("105kg");
  });

  test("点击 -5：100 → 95", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} value={100} />);

    fireEvent.press(getByTestId("numeric-keypad-shortcut--5"));

    expect(readText(getByTestId("numeric-keypad-display").props.children)).toBe("95kg");
  });

  test("-2.5 不低于 0：当前 0，点击 -2.5 仍为 0", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} value={0} />);

    fireEvent.press(getByTestId("numeric-keypad-shortcut--2.5"));

    expect(readText(getByTestId("numeric-keypad-display").props.children)).toBe("0kg");
  });

  test("退格：123 → 12", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} value={123} />);

    fireEvent.press(getByTestId("numeric-keypad-backspace"));

    expect(readText(getByTestId("numeric-keypad-display").props.children)).toBe("12kg");
  });

  test("清空：123 → 空", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} value={123} />);

    fireEvent.press(getByTestId("numeric-keypad-clear"));

    expect(readText(getByTestId("numeric-keypad-display").props.children)).toBe("");
  });

  test("小数点：输入 67.5", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} />);

    fireEvent.press(getByTestId("numeric-keypad-key-6"));
    fireEvent.press(getByTestId("numeric-keypad-key-7"));
    fireEvent.press(getByTestId("numeric-keypad-key-decimal"));
    fireEvent.press(getByTestId("numeric-keypad-key-5"));

    expect(readText(getByTestId("numeric-keypad-display").props.children)).toBe("67.5kg");
  });

  test("不能输入两个小数点", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} />);

    fireEvent.press(getByTestId("numeric-keypad-key-1"));
    fireEvent.press(getByTestId("numeric-keypad-key-decimal"));
    fireEvent.press(getByTestId("numeric-keypad-key-2"));
    fireEvent.press(getByTestId("numeric-keypad-key-decimal"));
    fireEvent.press(getByTestId("numeric-keypad-key-3"));

    expect(readText(getByTestId("numeric-keypad-display").props.children)).toBe("1.23kg");
  });

  test("确认按钮触发 onConfirm(value)", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} value={100} />);

    fireEvent.press(getByTestId("numeric-keypad-confirm"));

    expect(props.onConfirm).toHaveBeenCalledWith(100);
    expect(props.onClose).toHaveBeenCalled();
  });

  test("显示上次参考值（灰色小字）", () => {
    const props = createProps();
    const { getByTestId } = render(<NumericKeypad {...props} />);

    expect(readText(getByTestId("numeric-keypad-reference").props.children)).toContain(
      "上次参考: 95kg",
    );
  });
});

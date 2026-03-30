import { act, fireEvent, render } from "@testing-library/react-native";

import { SearchBar } from "../SearchBar";

describe("SearchBar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("输入文字后 300ms 触发 onSearch", () => {
    const onDebouncedChange = jest.fn();
    const { getByTestId } = render(
      <SearchBar delay={300} onDebouncedChange={onDebouncedChange} />,
    );

    fireEvent.changeText(getByTestId("search-bar-input"), "卧推");

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onDebouncedChange).toHaveBeenCalledWith("卧推");
  });

  test("快速连续输入只触发一次（防抖）", () => {
    const onDebouncedChange = jest.fn();
    const { getByTestId } = render(
      <SearchBar delay={300} onDebouncedChange={onDebouncedChange} />,
    );

    fireEvent.changeText(getByTestId("search-bar-input"), "卧");

    act(() => {
      jest.advanceTimersByTime(100);
    });

    fireEvent.changeText(getByTestId("search-bar-input"), "卧推");

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onDebouncedChange).toHaveBeenCalledTimes(1);
    expect(onDebouncedChange).toHaveBeenCalledWith("卧推");
  });

  test('清空按钮触发 onSearch("")', () => {
    const onDebouncedChange = jest.fn();
    const { getByTestId } = render(
      <SearchBar delay={300} initialValue="卧推" onDebouncedChange={onDebouncedChange} />,
    );

    fireEvent.press(getByTestId("search-bar-clear"));

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onDebouncedChange).toHaveBeenCalledWith("");
  });

  test("placeholder 显示正确", () => {
    const { getByPlaceholderText } = render(
      <SearchBar onDebouncedChange={jest.fn()} placeholder="搜索动作" />,
    );

    expect(getByPlaceholderText("搜索动作")).toBeTruthy();
  });
});

import { render } from "@testing-library/react-native";
import { processColor } from "react-native";

import { MuscleGroup } from "../../constants/enums";
import { MuscleHeatmap } from "../MuscleHeatmap";

describe("MuscleHeatmap", () => {
  const readFill = (fill: unknown): unknown =>
    typeof fill === "object" && fill !== null && "payload" in fill
      ? (fill as { payload: unknown }).payload
      : fill;

  test("传入数据后 SVG 正常渲染不崩溃", () => {
    const { getByTestId } = render(
      <MuscleHeatmap
        data={[
          {
            frequency: 5,
            muscle: MuscleGroup.Chest,
            volume: 5000,
          },
        ]}
        language="zh"
      />,
    );

    expect(getByTestId("muscle-heatmap-front-chest-6")).toBeTruthy();
  });

  test("无数据时显示全灰色", () => {
    const { getByTestId } = render(<MuscleHeatmap data={[]} language="zh" />);

    expect(readFill(getByTestId("muscle-heatmap-front-chest-6").props.fill)).toBe(
      processColor("#2A2A3A"),
    );
    expect(readFill(getByTestId("muscle-heatmap-back-back-6").props.fill)).toBe(
      processColor("#2A2A3A"),
    );
  });

  test("高频肌群颜色深于低频", () => {
    const { getByTestId } = render(
      <MuscleHeatmap
        data={[
          {
            frequency: 5,
            muscle: MuscleGroup.Chest,
            volume: 5000,
          },
          {
            frequency: 1,
            muscle: MuscleGroup.Back,
            volume: 1200,
          },
        ]}
        language="zh"
      />,
    );

    expect(readFill(getByTestId("muscle-heatmap-front-chest-6").props.fill)).toBe(
      processColor("#E74C3C"),
    );
    expect(readFill(getByTestId("muscle-heatmap-back-back-6").props.fill)).toBe(
      processColor("#3498DB"),
    );
  });
});

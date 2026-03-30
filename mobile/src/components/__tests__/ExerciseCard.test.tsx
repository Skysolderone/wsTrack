import { fireEvent, render } from "@testing-library/react-native";
import { Text } from "react-native";

import { Equipment, ExerciseCategory, MuscleGroup, TrackingType } from "../../constants/enums";
import type { Exercise } from "../../models";
import { ExerciseCard } from "../ExerciseCard";

const exercise = {
  equipment: Equipment.Barbell,
  id: "exercise-1",
  isCustom: false,
  name: "杠铃卧推",
  nameEn: "Barbell Bench Press",
  primaryMuscles: [MuscleGroup.Chest, MuscleGroup.Triceps],
  secondaryMuscles: [MuscleGroup.Shoulders],
  category: ExerciseCategory.Strength,
  trackingType: TrackingType.WeightReps,
} as unknown as Exercise;

describe("ExerciseCard", () => {
  test("显示动作名称", () => {
    const { getByText } = render(
      <ExerciseCard exercise={exercise} language="zh" onPress={jest.fn()} />,
    );

    expect(getByText("杠铃卧推")).toBeTruthy();
  });

  test("显示肌群标签", () => {
    const { getByTestId } = render(
      <ExerciseCard exercise={exercise} language="zh" onPress={jest.fn()} />,
    );

    expect(getByTestId("exercise-card-muscle-chest").props.children).toBe("胸部");
  });

  test("显示器械图标", () => {
    const { getByTestId } = render(
      <ExerciseCard exercise={exercise} language="zh" onPress={jest.fn()} />,
    );

    expect(getByTestId("exercise-card-equipment").findByType(Text).props.children).toBe("杠铃");
  });

  test("点击触发 onPress", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <ExerciseCard exercise={exercise} language="zh" onPress={onPress} />,
    );

    fireEvent.press(getByTestId("exercise-card-pressable"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

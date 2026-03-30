import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Ellipse,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import {
  getLocalizedValue,
  muscleGroupLabels,
  type SupportedLanguage,
} from "../constants/exerciseMetadata";
import { colors } from "../constants/colors";
import { MuscleGroup } from "../constants/enums";
import { radii, spacing } from "../constants/sizes";

export interface MuscleHeatmapDatum {
  frequency: number;
  muscle: MuscleGroup;
  volume: number;
}

interface MuscleHeatmapProps {
  data: MuscleHeatmapDatum[];
  language: SupportedLanguage;
}

interface MuscleRegion {
  height: number;
  muscle: MuscleGroup;
  type: "ellipse" | "rect";
  width: number;
  x: number;
  y: number;
}

const FRONT_REGIONS: MuscleRegion[] = [
  { height: 28, muscle: MuscleGroup.Shoulders, type: "ellipse", width: 58, x: 56, y: 70 },
  { height: 28, muscle: MuscleGroup.Shoulders, type: "ellipse", width: 58, x: 126, y: 70 },
  { height: 54, muscle: MuscleGroup.Biceps, type: "rect", width: 20, x: 40, y: 94 },
  { height: 54, muscle: MuscleGroup.Biceps, type: "rect", width: 20, x: 164, y: 94 },
  { height: 42, muscle: MuscleGroup.Forearms, type: "rect", width: 18, x: 40, y: 152 },
  { height: 42, muscle: MuscleGroup.Forearms, type: "rect", width: 18, x: 166, y: 152 },
  { height: 50, muscle: MuscleGroup.Chest, type: "rect", width: 44, x: 73, y: 92 },
  { height: 50, muscle: MuscleGroup.Chest, type: "rect", width: 44, x: 123, y: 92 },
  { height: 52, muscle: MuscleGroup.Abs, type: "rect", width: 54, x: 93, y: 146 },
  { height: 58, muscle: MuscleGroup.Quads, type: "rect", width: 34, x: 84, y: 216 },
  { height: 58, muscle: MuscleGroup.Quads, type: "rect", width: 34, x: 122, y: 216 },
];

const BACK_REGIONS: MuscleRegion[] = [
  { height: 28, muscle: MuscleGroup.Shoulders, type: "ellipse", width: 58, x: 246, y: 70 },
  { height: 28, muscle: MuscleGroup.Shoulders, type: "ellipse", width: 58, x: 316, y: 70 },
  { height: 54, muscle: MuscleGroup.Triceps, type: "rect", width: 20, x: 230, y: 94 },
  { height: 54, muscle: MuscleGroup.Triceps, type: "rect", width: 20, x: 354, y: 94 },
  { height: 42, muscle: MuscleGroup.Forearms, type: "rect", width: 18, x: 230, y: 152 },
  { height: 42, muscle: MuscleGroup.Forearms, type: "rect", width: 18, x: 356, y: 152 },
  { height: 62, muscle: MuscleGroup.Back, type: "rect", width: 46, x: 263, y: 92 },
  { height: 62, muscle: MuscleGroup.Back, type: "rect", width: 46, x: 313, y: 92 },
  { height: 38, muscle: MuscleGroup.Glutes, type: "rect", width: 38, x: 272, y: 194 },
  { height: 38, muscle: MuscleGroup.Glutes, type: "rect", width: 38, x: 312, y: 194 },
  { height: 56, muscle: MuscleGroup.Hamstrings, type: "rect", width: 30, x: 276, y: 236 },
  { height: 56, muscle: MuscleGroup.Hamstrings, type: "rect", width: 30, x: 316, y: 236 },
  { height: 40, muscle: MuscleGroup.Calves, type: "rect", width: 26, x: 278, y: 300 },
  { height: 40, muscle: MuscleGroup.Calves, type: "rect", width: 26, x: 318, y: 300 },
];

const resolveHeatColor = (frequency: number): string => {
  if (frequency <= 0) {
    return "#2A2A3A";
  }

  if (frequency <= 2) {
    return "#3498DB";
  }

  if (frequency <= 4) {
    return "#2ECC71";
  }

  return "#E74C3C";
};

const RegionShape = ({
  color,
  region,
  onPress,
}: {
  color: string;
  onPress: () => void;
  region: MuscleRegion;
}) =>
  region.type === "ellipse" ? (
    <Ellipse
      cx={region.x + region.width / 2}
      cy={region.y + region.height / 2}
      fill={color}
      onPress={onPress}
      opacity={0.92}
      rx={region.width / 2}
      ry={region.height / 2}
      stroke={colors.border}
      strokeWidth={1}
    />
  ) : (
    <Rect
      fill={color}
      height={region.height}
      onPress={onPress}
      opacity={0.92}
      rx={10}
      stroke={colors.border}
      strokeWidth={1}
      width={region.width}
      x={region.x}
      y={region.y}
    />
  );

export const MuscleHeatmap = ({ data, language }: MuscleHeatmapProps) => {
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);

  const lookup = useMemo(
    () =>
      new Map(
        data.map((item) => [
          item.muscle,
          {
            color: resolveHeatColor(item.frequency),
            frequency: item.frequency,
            volume: item.volume,
          },
        ]),
      ),
    [data],
  );

  const selectedDatum = selectedMuscle ? lookup.get(selectedMuscle) ?? null : null;

  return (
    <View style={styles.container}>
      <Svg height={390} viewBox="0 0 430 390" width="100%">
        <SvgText fill={colors.textMuted} fontSize="14" fontWeight="700" x="86" y="28">
          Front
        </SvgText>
        <SvgText fill={colors.textMuted} fontSize="14" fontWeight="700" x="304" y="28">
          Back
        </SvgText>

        <Circle cx="110" cy="54" fill={colors.surfaceAlt} r="22" stroke={colors.border} />
        <Rect
          fill={colors.surfaceAlt}
          height="250"
          rx="24"
          stroke={colors.border}
          width="74"
          x="73"
          y="78"
        />
        <Circle cx="300" cy="54" fill={colors.surfaceAlt} r="22" stroke={colors.border} />
        <Rect
          fill={colors.surfaceAlt}
          height="250"
          rx="24"
          stroke={colors.border}
          width="74"
          x="263"
          y="78"
        />

        {FRONT_REGIONS.map((region, index) => (
          <RegionShape
            key={`front-${region.muscle}-${index}`}
            color={lookup.get(region.muscle)?.color ?? "#2A2A3A"}
            onPress={() => setSelectedMuscle(region.muscle)}
            region={region}
          />
        ))}

        {BACK_REGIONS.map((region, index) => (
          <RegionShape
            key={`back-${region.muscle}-${index}`}
            color={lookup.get(region.muscle)?.color ?? "#2A2A3A"}
            onPress={() => setSelectedMuscle(region.muscle)}
            region={region}
          />
        ))}
      </Svg>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: "#2A2A3A" }]} />
          <Text style={styles.legendLabel}>未训练</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: "#3498DB" }]} />
          <Text style={styles.legendLabel}>低频</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: "#2ECC71" }]} />
          <Text style={styles.legendLabel}>中频</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: "#E74C3C" }]} />
          <Text style={styles.legendLabel}>高频</Text>
        </View>
      </View>

      {selectedMuscle && selectedDatum ? (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipTitle}>
            {getLocalizedValue(muscleGroupLabels, selectedMuscle, language)}
          </Text>
          <Text style={styles.tooltipText}>训练频次：{selectedDatum.frequency}</Text>
          <Text style={styles.tooltipText}>训练容量：{selectedDatum.volume.toFixed(0)}</Text>
        </View>
      ) : (
        <Text style={styles.hint}>点击任意肌群区域查看频次和容量。</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    width: "100%",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "center",
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  legendSwatch: {
    borderRadius: radii.pill,
    height: 10,
    width: 10,
  },
  legendLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  tooltip: {
    alignSelf: "stretch",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  tooltipTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  tooltipText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  hint: {
    color: colors.textSubtle,
    fontSize: 13,
    textAlign: "center",
  },
});

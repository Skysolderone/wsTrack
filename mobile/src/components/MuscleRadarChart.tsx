import { StyleSheet, useWindowDimensions, View } from "react-native";
import {
  VictoryArea,
  VictoryChart,
  VictoryPolarAxis,
  VictoryTheme,
} from "victory-native";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";

export interface MuscleRadarDatum {
  axis: string;
  value: number;
}

interface MuscleRadarChartProps {
  data: MuscleRadarDatum[];
}

export const MuscleRadarChart = ({ data }: MuscleRadarChartProps) => {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(width - 72, 260);

  return (
    <View style={styles.container}>
      <VictoryChart
        domain={{ y: [0, 1] }}
        height={300}
        polar
        theme={VictoryTheme.material}
        width={chartWidth}
      >
        <VictoryPolarAxis
          labelPlacement="parallel"
          style={{
            axis: { stroke: colors.border },
            grid: { stroke: colors.border, strokeDasharray: "4,6" },
            tickLabels: { fill: colors.textMuted, fontSize: 11 },
          }}
          tickFormat={() => ""}
          tickValues={[0.25, 0.5, 0.75, 1]}
        />
        {data.map((point) => (
          <VictoryPolarAxis
            axisValue={point.axis}
            key={point.axis}
            label={point.axis}
            labelPlacement="perpendicular"
            style={{
              axis: { stroke: colors.border },
              grid: { stroke: colors.border },
              tickLabels: { fill: colors.textMuted, fontSize: 11 },
            }}
          />
        ))}
        <VictoryArea
          data={data}
          style={{
            data: {
              fill: "rgba(108, 92, 231, 0.26)",
              stroke: colors.primarySoft,
              strokeWidth: 2.5,
            },
          }}
          x="axis"
          y="value"
        />
      </VictoryChart>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    width: "100%",
  },
});

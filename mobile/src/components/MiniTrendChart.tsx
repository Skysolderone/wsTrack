import { StyleSheet, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";

import { colors } from "../constants/colors";

interface MiniTrendChartProps {
  data: number[];
  height?: number;
  width?: number;
}

const buildPoints = (data: number[], width: number, height: number): string => {
  if (data.length === 0) {
    return `0,${height} ${width},${height}`;
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(1, max - min);

  return data
    .map((value, index) => {
      const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
      const normalized = (value - min) / range;
      const y = height - normalized * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
};

export const MiniTrendChart = ({
  data,
  height = 34,
  width = 96,
}: MiniTrendChartProps) => (
  <View style={styles.wrap}>
    <Svg height={height} width={width}>
      <Polyline
        fill="none"
        points={buildPoints(data, width, height)}
        stroke={colors.primarySoft}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
      />
    </Svg>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});

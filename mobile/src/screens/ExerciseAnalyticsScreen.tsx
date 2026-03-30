import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  VictoryAxis,
  VictoryChart,
  VictoryLine,
  VictoryScatter,
  VictoryTheme,
} from "victory-native";

import { ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import { database } from "../database";
import type { Exercise } from "../models";
import type { RootStackParamList } from "../navigation/types";
import {
  getExerciseMaxWeightHistory,
  getExerciseSessionHistory,
  getExerciseVolumeHistory,
  type ExerciseHistoryPoint,
  type ExerciseSessionHistoryItem,
} from "../services/AnalyticsService";

type ExerciseAnalyticsScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "ExerciseAnalytics"
>;

const axisStyle = {
  axis: { stroke: colors.border },
  grid: { stroke: colors.border, strokeDasharray: "4,6" },
  tickLabels: { fill: colors.textMuted, fontSize: 11 },
};

export const ExerciseAnalyticsScreen = ({
  navigation,
  route,
}: ExerciseAnalyticsScreenProps) => {
  const { width } = useWindowDimensions();
  const { exerciseId } = route.params;
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [volumeHistory, setVolumeHistory] = useState<ExerciseHistoryPoint[]>([]);
  const [maxWeightHistory, setMaxWeightHistory] = useState<ExerciseHistoryPoint[]>([]);
  const [sessionHistory, setSessionHistory] = useState<ExerciseSessionHistoryItem[]>([]);

  const loadData = useCallback(async () => {
    const [exerciseRecord, volume, maxWeight, sessions] = await Promise.all([
      database.get<Exercise>("exercises").find(exerciseId),
      getExerciseVolumeHistory(exerciseId, 20),
      getExerciseMaxWeightHistory(exerciseId, 20),
      getExerciseSessionHistory(exerciseId, 12),
    ]);

    setExercise(exerciseRecord);
    setVolumeHistory(volume);
    setMaxWeightHistory(maxWeight);
    setSessionHistory(sessions);
  }, [exerciseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!exercise) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScreenContainer
      onBackPress={() => navigation.goBack()}
      subtitle={exercise.nameEn ?? "单动作训练分析"}
      title={`${exercise.name} 分析`}
    >
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>容量趋势</Text>
        {volumeHistory.length > 0 ? (
          <VictoryChart
            domainPadding={{ x: 18, y: 20 }}
            height={240}
            theme={VictoryTheme.material}
            width={Math.max(width - 48, 280)}
          >
            <VictoryAxis style={axisStyle} />
            <VictoryAxis dependentAxis style={axisStyle} />
            <VictoryLine
              data={volumeHistory.map((point, index) => ({ x: index + 1, y: point.value }))}
              style={{ data: { stroke: colors.primary, strokeWidth: 3 } }}
            />
            <VictoryScatter
              data={volumeHistory.map((point, index) => ({ x: index + 1, y: point.value }))}
              size={4}
              style={{ data: { fill: colors.primarySoft } }}
            />
          </VictoryChart>
        ) : (
          <Text style={styles.emptyText}>还没有足够的数据绘制趋势。</Text>
        )}
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>最大重量趋势</Text>
        {maxWeightHistory.length > 0 ? (
          <VictoryChart
            domainPadding={{ x: 18, y: 20 }}
            height={240}
            theme={VictoryTheme.material}
            width={Math.max(width - 48, 280)}
          >
            <VictoryAxis style={axisStyle} />
            <VictoryAxis dependentAxis style={axisStyle} />
            <VictoryLine
              data={maxWeightHistory.map((point, index) => ({ x: index + 1, y: point.value }))}
              style={{ data: { stroke: colors.warning, strokeWidth: 3 } }}
            />
            <VictoryScatter
              data={maxWeightHistory.map((point, index) => ({ x: index + 1, y: point.value }))}
              size={4}
              style={{ data: { fill: colors.warning } }}
            />
          </VictoryChart>
        ) : (
          <Text style={styles.emptyText}>还没有记录到该动作的最大重量。</Text>
        )}
      </View>

      <View style={styles.historyList}>
        <Text style={styles.chartTitle}>历史明细</Text>
        {sessionHistory.map((session) => (
          <View key={session.workoutId} style={styles.sessionCard}>
            <View style={styles.sessionHeader}>
              <Text style={styles.sessionTitle}>{session.dateLabel}</Text>
              <Text style={styles.sessionMeta}>容量 {session.volume}</Text>
            </View>

            <View style={styles.setsWrap}>
              {session.sets.map((set) => (
                <Pressable
                  key={`${session.workoutId}-${set.setNumber}`}
                  onPress={() => navigation.navigate("WorkoutDetail", { workoutId: session.workoutId })}
                  style={({ pressed }) => [
                    styles.setChip,
                    set.isPr ? styles.setChipPr : undefined,
                    pressed ? styles.cardPressed : undefined,
                  ]}
                >
                  <Text style={styles.setChipText}>
                    {set.setNumber}组 · {set.weight ?? "--"}
                    {set.unit} x {set.reps ?? "--"} · RPE {set.rpe ?? "--"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  loadingState: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
  chartCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: "hidden",
    paddingVertical: spacing.md,
  },
  chartTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    padding: spacing.md,
  },
  historyList: {
    gap: spacing.md,
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  sessionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sessionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  sessionMeta: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: "700",
  },
  setsWrap: {
    gap: spacing.xs,
  },
  setChip: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  setChipPr: {
    borderColor: colors.warning,
    borderWidth: 1,
  },
  setChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  cardPressed: {
    opacity: 0.82,
  },
});

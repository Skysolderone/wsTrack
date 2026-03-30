import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { PlanGoal } from "../constants/enums";
import { planGoalLabels } from "../constants/planMetadata";
import { radii, spacing } from "../constants/sizes";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import {
  loadWorkoutStartOptions,
  type WorkoutStartOptions,
} from "../services/WorkoutService";
import { useSettingsStore } from "../store/settingsStore";
import { useWorkoutStore } from "../store/workoutStore";
import { formatDuration } from "../utils";

type StartWorkoutScreenProps = BottomTabScreenProps<MainTabParamList, "Training">;

const formatDateLabel = (timestamp: number | null): string => {
  if (!timestamp) {
    return "未训练";
  }

  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${month}/${day} ${hour}:${minute}`;
};

export const StartWorkoutScreen = (_props: StartWorkoutScreenProps) => {
  const language = useSettingsStore((state) => state.language);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const activeWorkout = useWorkoutStore((state) => state.activeWorkout);
  const hasHydrated = useWorkoutStore((state) => state.hasHydrated);
  const discardRecoveredWorkout = useWorkoutStore((state) => state.discardRecoveredWorkout);
  const startWorkout = useWorkoutStore((state) => state.startWorkout);
  const startWorkoutFromRepeat = useWorkoutStore((state) => state.startWorkoutFromRepeat);
  const [options, setOptions] = useState<WorkoutStartOptions>({
    activePlanDays: [],
    activePlanName: null,
    recentWorkouts: [],
  });
  const [loading, setLoading] = useState(true);
  const restorePromptedRef = useRef(false);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setOptions(await loadWorkoutStartOptions());
    } catch (error) {
      Alert.alert("加载失败", error instanceof Error ? error.message : "请稍后再试");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    if (!activeWorkout) {
      restorePromptedRef.current = false;
    }
  }, [activeWorkout]);

  useEffect(() => {
    if (!hasHydrated || !activeWorkout || restorePromptedRef.current) {
      return;
    }

    restorePromptedRef.current = true;
    Alert.alert("检测到未完成训练", "上次训练尚未结束，是否恢复继续？", [
      {
        text: "稍后",
        style: "cancel",
      },
      {
        text: "恢复训练",
        onPress: () => navigation.navigate("ActiveWorkout"),
      },
    ]);
  }, [activeWorkout, hasHydrated, navigation]);

  const guardBeforeStart = async (
    startAction: () => Promise<string | null>,
  ): Promise<void> => {
    if (activeWorkout) {
      Alert.alert("已有进行中的训练", "请先恢复当前训练，或放弃后再开始新的训练。", [
        {
          text: "恢复",
          onPress: () => navigation.navigate("ActiveWorkout"),
        },
        {
          text: "放弃当前",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await discardRecoveredWorkout();
              const workoutId = await startAction();
              if (workoutId) {
                navigation.navigate("ActiveWorkout");
              }
            })();
          },
        },
        {
          text: "取消",
          style: "cancel",
        },
      ]);
      return;
    }

    try {
      const workoutId = await startAction();
      if (workoutId) {
        navigation.navigate("ActiveWorkout");
      }
    } catch (error) {
      Alert.alert("启动失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  return (
    <ScreenContainer
      headerRight={
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("ExerciseLibrary")}
          style={({ pressed }) => [
            styles.headerButton,
            pressed ? styles.headerButtonPressed : undefined,
          ]}
        >
          <Text style={styles.headerButtonText}>动作库</Text>
        </Pressable>
      }
      subtitle="从计划、空白训练或最近一次训练开始。训练中断后支持恢复。"
      title="开始训练"
    >
      {activeWorkout ? (
        <View style={styles.resumeCard}>
          <View style={styles.resumeCopy}>
            <Text style={styles.resumeTitle}>存在未完成训练</Text>
            <Text style={styles.resumeSubtitle}>
              已进行 {formatDuration(activeWorkout.elapsedSeconds)}，当前 {activeWorkout.exercises.length} 个动作。
            </Text>
          </View>
          <View style={styles.resumeActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate("ActiveWorkout")}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.primaryButtonText}>恢复训练</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void discardRecoveredWorkout();
              }}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.secondaryButtonText}>放弃</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>从计划开始</Text>
        <Text style={styles.sectionSubtitle}>
          {options.activePlanName
            ? `当前激活计划：${options.activePlanName}`
            : "还没有激活计划，可先去计划页设置。"}
        </Text>

        {options.activePlanDays.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {loading ? "正在读取计划..." : "暂无可直接启动的训练日"}
            </Text>
          </View>
        ) : (
          options.activePlanDays.map((day) => (
            <Pressable
              key={day.id}
              onPress={() => {
                void guardBeforeStart(() => startWorkout(day.id));
              }}
              style={({ pressed }) => [
                styles.optionCard,
                pressed ? styles.optionCardPressed : undefined,
              ]}
            >
              <View style={styles.optionRow}>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{day.name}</Text>
                  <Text style={styles.optionMeta}>
                    {day.planName} · {day.exerciseCount} 个动作 ·{" "}
                    {planGoalLabels[day.planGoal ?? PlanGoal.General][language]}
                  </Text>
                </View>
                <Text style={styles.optionHint}>{formatDateLabel(day.lastUsedAt)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>空白开始</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void guardBeforeStart(() => startWorkout());
          }}
          style={({ pressed }) => [
            styles.blankStartButton,
            pressed ? styles.buttonPressed : undefined,
          ]}
        >
          <Text style={styles.blankStartText}>开始空白训练</Text>
          <Text style={styles.blankStartHint}>训练中可随时添加动作</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>再练一次</Text>
        <Text style={styles.sectionSubtitle}>最近 7 天训练记录，点击即可复制结构和预填数据。</Text>

        {options.recentWorkouts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {loading ? "正在读取历史..." : "最近 7 天没有已完成训练"}
            </Text>
          </View>
        ) : (
          options.recentWorkouts.map((workout) => (
            <Pressable
              key={workout.workoutId}
              onPress={() => {
                void guardBeforeStart(() => startWorkoutFromRepeat(workout.workoutId));
              }}
              style={({ pressed }) => [
                styles.optionCard,
                pressed ? styles.optionCardPressed : undefined,
              ]}
            >
              <View style={styles.optionRow}>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{workout.title}</Text>
                  <Text style={styles.optionMeta}>
                    {workout.exerciseCount} 个动作 · {workout.totalSets} 组 · {workout.totalVolume}
                  </Text>
                </View>
                <Text style={styles.optionHint}>{formatDateLabel(workout.startedAt)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  headerButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerButtonPressed: {
    opacity: 0.8,
  },
  headerButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  resumeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  resumeCopy: {
    gap: spacing.xs,
  },
  resumeTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  resumeSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
  },
  resumeActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    justifyContent: "center",
    minWidth: 88,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.82,
  },
  optionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  optionCardPressed: {
    opacity: 0.86,
  },
  optionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  optionCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  optionMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  optionHint: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: "700",
  },
  blankStartButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  blankStartText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  blankStartHint: {
    color: colors.text,
    fontSize: 13,
    opacity: 0.88,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.lg,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});

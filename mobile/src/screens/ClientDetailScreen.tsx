import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import {
  VictoryAxis,
  VictoryChart,
  VictoryLine,
  VictoryScatter,
  VictoryTheme,
} from "victory-native";

import { InfoCard, OptionChip, ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import {
  addComment,
  assignPlan,
  getClientWorkouts,
  getWorkoutComments,
  type CoachClientWorkoutItem,
  type CoachWorkoutCommentItem,
} from "../services/CoachService";
import { loadPlanSummaries } from "../services/PlanService";
import { formatDuration } from "../utils";

type ClientDetailScreenProps = NativeStackScreenProps<RootStackParamList, "ClientDetail">;

type RangeKey = "30d" | "90d";

const rangeOptions: Array<{
  days: number;
  key: RangeKey;
  label: string;
}> = [
  { days: 30, key: "30d", label: "30天" },
  { days: 90, key: "90d", label: "90天" },
];

export const ClientDetailScreen = ({
  navigation,
  route,
}: ClientDetailScreenProps) => {
  const { clientId, clientName } = route.params;
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<RangeKey>("30d");
  const [workouts, setWorkouts] = useState<CoachClientWorkoutItem[]>([]);
  const [commentsByWorkout, setCommentsByWorkout] = useState<Record<string, CoachWorkoutCommentItem[]>>(
    {},
  );
  const [draftComments, setDraftComments] = useState<Record<string, string>>({});

  const chartWidth = Math.max(width - 48, 280);

  const loadDetail = useCallback(async () => {
    try {
      const days = rangeOptions.find((item) => item.key === range)?.days ?? 30;
      const nextWorkouts = await getClientWorkouts(clientId, {
        startAt: Date.now() - days * 24 * 60 * 60 * 1000,
      });
      const commentsEntries = await Promise.all(
        nextWorkouts.slice(0, 8).map(async (workout) => [
          workout.workoutId,
          await getWorkoutComments(workout.workoutId),
        ]),
      );

      setWorkouts(nextWorkouts);
      setCommentsByWorkout(Object.fromEntries(commentsEntries));
    } catch (error) {
      Alert.alert("加载失败", error instanceof Error ? error.message : "请稍后再试");
    }
  }, [clientId, range]);

  useFocusEffect(
    useCallback(() => {
      void loadDetail();
    }, [loadDetail]),
  );

  const chartData = useMemo(
    () =>
      [...workouts]
        .reverse()
        .map((workout, index) => ({
          label: `${new Date(workout.startedAt).getMonth() + 1}/${new Date(workout.startedAt).getDate()}`,
          x: index + 1,
          y: workout.totalVolume,
        })),
    [workouts],
  );

  const handleAssignActivePlan = async () => {
    try {
      const plans = await loadPlanSummaries();
      const activePlan = plans.find((item) => item.isActive);
      if (!activePlan) {
        Alert.alert("没有激活计划", "请先在计划页设置一个当前激活计划。");
        return;
      }

      await assignPlan(clientId, activePlan.id);
      Alert.alert("推送成功", `已将 ${activePlan.name} 推送给 ${clientName}。`);
    } catch (error) {
      Alert.alert("推送失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const handleComment = async (workoutId: string) => {
    const nextComment = draftComments[workoutId]?.trim() ?? "";
    if (!nextComment) {
      Alert.alert("请输入评语", "训练评语不能为空。");
      return;
    }

    try {
      const savedComment = await addComment(workoutId, nextComment);
      setCommentsByWorkout((current) => ({
        ...current,
        [workoutId]: [savedComment, ...(current[workoutId] ?? [])],
      }));
      setDraftComments((current) => ({
        ...current,
        [workoutId]: "",
      }));
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  return (
    <ScreenContainer
      onBackPress={() => navigation.goBack()}
      subtitle="查看近阶段训练走势，并给每次训练添加教练评语。"
      title={clientName}
    >
      <View style={styles.metricsRow}>
        <InfoCard
          description="近阶段训练次数"
          title="Workouts"
          value={`${workouts.length}`}
        />
        <InfoCard
          description="最新训练容量"
          title="Volume"
          value={`${Math.round(workouts[0]?.totalVolume ?? 0)}`}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>时间范围</Text>
        <View style={styles.chipRow}>
          {rangeOptions.map((item) => (
            <OptionChip
              key={item.key}
              label={item.label}
              onPress={() => setRange(item.key)}
              selected={range === item.key}
            />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>容量趋势</Text>
        {chartData.length > 0 ? (
          <VictoryChart
            domainPadding={{ x: 16, y: 20 }}
            height={220}
            theme={VictoryTheme.material}
            width={chartWidth}
          >
            <VictoryAxis
              style={axisStyle}
              tickFormat={(tick) => chartData[Math.max(0, Number(tick) - 1)]?.label ?? ""}
              tickValues={chartData.map((item) => item.x)}
            />
            <VictoryAxis dependentAxis style={axisStyle} />
            <VictoryLine
              data={chartData}
              style={{
                data: {
                  stroke: colors.primarySoft,
                  strokeWidth: 3,
                },
              }}
            />
            <VictoryScatter
              data={chartData}
              size={4}
              style={{
                data: {
                  fill: colors.primary,
                },
              }}
            />
          </VictoryChart>
        ) : (
          <Text style={styles.emptyText}>当前时间范围内还没有训练记录。</Text>
        )}
      </View>

      <Pressable
        onPress={() => {
          void handleAssignActivePlan();
        }}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed ? styles.cardPressed : undefined,
        ]}
      >
        <Text style={styles.primaryButtonText}>推送当前激活计划</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.workoutList} horizontal={false}>
        {workouts.map((workout) => (
          <View key={workout.workoutId} style={styles.workoutCard}>
            <Text style={styles.workoutTitle}>{workout.title}</Text>
            <Text style={styles.workoutMeta}>
              {new Date(workout.startedAt).toLocaleString()} · {formatDuration(workout.durationSeconds)}
            </Text>
            <Text style={styles.workoutMeta}>
              容量 {Math.round(workout.totalVolume)} · {workout.exerciseCount} 个动作
            </Text>

            <View style={styles.commentList}>
              {(commentsByWorkout[workout.workoutId] ?? []).map((comment) => (
                <View key={comment.id} style={styles.commentBubble}>
                  <Text style={styles.commentAuthor}>{comment.coachName ?? "教练评语"}</Text>
                  <Text style={styles.commentText}>{comment.comment}</Text>
                </View>
              ))}
            </View>

            <TextInput
              multiline
              onChangeText={(value) =>
                setDraftComments((current) => ({
                  ...current,
                  [workout.workoutId]: value,
                }))
              }
              placeholder="给这次训练添加评语"
              placeholderTextColor={colors.textSubtle}
              selectionColor={colors.primary}
              style={styles.commentInput}
              textAlignVertical="top"
              value={draftComments[workout.workoutId] ?? ""}
            />
            <Pressable
              onPress={() => {
                void handleComment(workout.workoutId);
              }}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.cardPressed : undefined,
              ]}
            >
              <Text style={styles.secondaryButtonText}>保存评语</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
};

const axisStyle = {
  axis: { stroke: colors.border },
  grid: { stroke: colors.border, strokeDasharray: "4,6" },
  tickLabels: { fill: colors.textMuted, fontSize: 11 },
};

const styles = StyleSheet.create({
  metricsRow: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  workoutList: {
    gap: spacing.md,
  },
  workoutCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  workoutTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  workoutMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  commentList: {
    gap: spacing.sm,
  },
  commentBubble: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.sm,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  commentAuthor: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: "700",
  },
  commentText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  commentInput: {
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    minHeight: 88,
    padding: spacing.md,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: spacing.md,
    textAlign: "center",
  },
  cardPressed: {
    opacity: 0.82,
  },
});

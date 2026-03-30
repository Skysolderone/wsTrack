import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type ViewShot from "react-native-view-shot";

import {
  ChallengeComplete,
  InfoCard,
  OptionChip,
  ScreenContainer,
  WorkoutShareCard,
  shareCapturedWorkoutCard,
  type WorkoutShareTemplate,
} from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import { loadWorkoutDetail, type WorkoutDetailData } from "../services/HistoryService";
import { loadWorkoutSummary } from "../services/WorkoutService";
import { useWorkoutStore } from "../store/workoutStore";
import { formatDuration } from "../utils";

type WorkoutSummaryScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "WorkoutSummary"
>;

const shareTemplates: Array<{
  label: string;
  value: WorkoutShareTemplate;
}> = [
  { label: "渐变蓝", value: "gradient_blue" },
  { label: "极简黑", value: "minimal_black" },
  { label: "运动感", value: "sport_energy" },
];

export const WorkoutSummaryScreen = ({
  navigation,
  route,
}: WorkoutSummaryScreenProps) => {
  const { workoutId } = route.params;
  const persistSummary = useWorkoutStore((state) => state.saveWorkoutSummary);
  const clearWorkoutSummary = useWorkoutStore((state) => state.clearWorkoutSummary);
  const challengeCelebration = useWorkoutStore((state) => state.challengeCelebration);
  const clearChallengeCelebration = useWorkoutStore(
    (state) => state.clearChallengeCelebration,
  );
  const shareCardRef = useRef<ViewShot | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [shareTemplate, setShareTemplate] =
    useState<WorkoutShareTemplate>("gradient_blue");
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof loadWorkoutSummary>> | null>(
    null,
  );
  const [detail, setDetail] = useState<WorkoutDetailData | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        setLoading(true);
        const [nextSummary, nextDetail] = await Promise.all([
          loadWorkoutSummary(workoutId),
          loadWorkoutDetail(workoutId),
        ]);

        if (!active) {
          return;
        }

        setSummary(nextSummary);
        setDetail(nextDetail);
        setRating(nextSummary.rating);
        setNotes(nextSummary.notes);
      } catch (error) {
        Alert.alert("加载失败", error instanceof Error ? error.message : "请稍后再试");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      active = false;
      clearChallengeCelebration();
      clearWorkoutSummary();
    };
  }, [clearChallengeCelebration, clearWorkoutSummary, workoutId]);

  const shareData = useMemo(() => {
    if (!summary || !detail) {
      return null;
    }

    return {
      dateLabel: summary.dateLabel,
      durationLabel: formatDuration(summary.durationSeconds),
      exercises: detail.exercises.map((exercise) => ({
        name: exercise.name,
        prCount: exercise.sets.filter((set) => set.isPr).length,
        setCount: exercise.sets.filter((set) => set.isCompleted).length || exercise.sets.length,
        volume: exercise.volume,
      })),
      prItems: summary.prItems,
      title: summary.title,
      totalVolume: summary.totalVolume,
    };
  }, [detail, summary]);

  const handleShare = async () => {
    if (!shareData || !shareCardRef.current) {
      return;
    }

    try {
      setSharing(true);
      const uri = await shareCardRef.current.capture();
      await shareCapturedWorkoutCard(uri);
    } catch (error) {
      Alert.alert("分享失败", error instanceof Error ? error.message : "请稍后再试");
    } finally {
      setSharing(false);
    }
  };

  if (loading || !summary || !detail) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScreenContainer
        onBackPress={() => navigation.goBack()}
        subtitle="补充评分和日志后保存，本次训练会正式进入历史。"
        testID="workout-summary-screen"
        title="训练摘要"
      >
        <InfoCard
          description={summary.dateLabel}
          testID="workout-summary-total-volume-card"
          title={summary.title}
          value={`${summary.totalVolume}`}
          valueTestID="workout-summary-total-volume-value"
        />

        <View style={styles.metricsRow}>
          <InfoCard
            description="训练时长"
            testID="workout-summary-duration-card"
            title="Duration"
            value={formatDuration(summary.durationSeconds)}
            valueTestID="workout-summary-duration-value"
          />
          <InfoCard
            description="完成总组数"
            testID="workout-summary-total-sets-card"
            title="Sets"
            value={`${summary.totalSets}`}
            valueTestID="workout-summary-total-sets-value"
          />
        </View>

        <View style={styles.metricsRow}>
          <InfoCard
            description="动作数量"
            testID="workout-summary-exercise-count-card"
            title="Exercises"
            value={`${summary.exerciseCount}`}
            valueTestID="workout-summary-exercise-count-value"
          />
          <InfoCard
            description="PR 数量"
            testID="workout-summary-pr-count-card"
            title="PR"
            value={`${summary.prItems.length}`}
            valueTestID="workout-summary-pr-count-value"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>训练评分</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable
                key={value}
                onPress={() => setRating(value)}
                style={({ pressed }) => [
                  styles.starButton,
                  rating === value ? styles.starButtonActive : undefined,
                  pressed ? styles.buttonPressed : undefined,
                ]}
              >
                <Text style={styles.starText}>{rating && rating >= value ? "★" : "☆"}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>PR 标记</Text>
          {summary.prItems.length === 0 ? (
            <Text style={styles.emptyText}>本次没有检测到新的 PR。</Text>
          ) : (
            summary.prItems.map((item) => (
              <View key={item} style={styles.prItem}>
                <Text style={styles.prText}>{item}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>训练分享卡片</Text>
          <Text style={styles.cardSubtitle}>选择模板后导出图片，直接进入系统分享面板。</Text>
          <View style={styles.templateRow}>
            {shareTemplates.map((item) => (
              <OptionChip
                key={item.value}
                label={item.label}
                onPress={() => setShareTemplate(item.value)}
                selected={shareTemplate === item.value}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={sharing}
            onPress={() => {
              void handleShare();
            }}
            style={({ pressed }) => [
              styles.secondaryButton,
              sharing ? styles.buttonDisabled : undefined,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {sharing ? "生成分享卡片中..." : "分享训练截图"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>训练日志</Text>
          <TextInput
            multiline
            numberOfLines={5}
            onChangeText={setNotes}
            placeholder="记录状态、强度感受、下次调整点"
            placeholderTextColor={colors.textSubtle}
            selectionColor={colors.primary}
            style={styles.notesInput}
            textAlignVertical="top"
            value={notes}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void (async () => {
              try {
                await persistSummary({
                  notes,
                  rating,
                  workoutId,
                });
                navigation.popToTop();
              } catch (error) {
                Alert.alert("保存失败", error instanceof Error ? error.message : "请稍后再试");
              }
            })();
          }}
          style={({ pressed }) => [
            styles.saveButton,
            pressed ? styles.buttonPressed : undefined,
          ]}
          testID="workout-summary-save-button"
        >
          <Text style={styles.saveButtonText}>保存训练记录</Text>
        </Pressable>

        {shareData ? (
          <View pointerEvents="none" style={styles.hiddenCapture}>
            <WorkoutShareCard data={shareData} ref={shareCardRef} template={shareTemplate} />
          </View>
        ) : null}
      </ScreenContainer>

      <ChallengeComplete
        celebration={challengeCelebration}
        onClose={clearChallengeCelebration}
        visible={Boolean(challengeCelebration)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.background,
    flex: 1,
  },
  loadingState: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
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
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  cardSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  templateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  starRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  starButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  starButtonActive: {
    backgroundColor: colors.primary,
  },
  starText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  prItem: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  prText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  notesInput: {
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 120,
    padding: spacing.md,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  secondaryButtonText: {
    color: colors.primarySoft,
    fontSize: 14,
    fontWeight: "800",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  saveButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  hiddenCapture: {
    left: -9999,
    position: "absolute",
    top: -9999,
  },
});

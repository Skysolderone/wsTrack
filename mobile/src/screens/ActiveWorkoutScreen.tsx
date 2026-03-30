import { useEffect, useMemo, useState } from "react";
import type { SectionListData } from "react-native";
import {
  Alert,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react-native";

import {
  ExercisePickerModal,
  NumericKeypad,
  PRCelebration,
  RestTimer,
  VideoRecorder,
} from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import {
  getSuggestion,
  type ProgressionSuggestion,
} from "../services/ProgressionService";
import { useWorkoutStore, type ActiveExercise, type ActiveSet } from "../store/workoutStore";
import { formatDuration } from "../utils";

type ActiveWorkoutScreenProps = NativeStackScreenProps<RootStackParamList, "ActiveWorkout">;

interface WorkoutSection {
  data: ActiveSet[];
  exercise: ActiveExercise;
  key: string;
}

interface KeypadTarget {
  allowDecimal: boolean;
  field: "reps" | "weight";
  leftShortcuts: number[];
  previousValue: number | null;
  rightShortcuts: number[];
  setId: string;
  title: string;
  unitLabel?: string;
  value: number | null;
}

const rpeOptions = Array.from({ length: 9 }, (_, index) => 6 + index * 0.5);

const buildReferenceLabel = (
  value: number | null,
  suffix = "",
): string => (value !== null ? `${value}${suffix}` : "--");

const confidenceStyles: Record<ProgressionSuggestion["confidence"], string> = {
  high: "高",
  low: "低",
  medium: "中",
};

export const ActiveWorkoutScreen = ({ navigation }: ActiveWorkoutScreenProps) => {
  const activeWorkout = useWorkoutStore((state) => state.activeWorkout);
  const addExercise = useWorkoutStore((state) => state.addExercise);
  const addSet = useWorkoutStore((state) => state.addSet);
  const adjustRestTimer = useWorkoutStore((state) => state.adjustRestTimer);
  const clearPRCelebration = useWorkoutStore((state) => state.clearPRCelebration);
  const completeSet = useWorkoutStore((state) => state.completeSet);
  const finishWorkout = useWorkoutStore((state) => state.finishWorkout);
  const lastCompletedSetId = useWorkoutStore((state) => state.lastCompletedSetId);
  const prCelebration = useWorkoutStore((state) => state.prCelebration);
  const removeExercise = useWorkoutStore((state) => state.removeExercise);
  const skipRestTimer = useWorkoutStore((state) => state.skipRestTimer);
  const updateSet = useWorkoutStore((state) => state.updateSet);
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [keypadTarget, setKeypadTarget] = useState<KeypadTarget | null>(null);
  const [rpeTarget, setRpeTarget] = useState<ActiveSet | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, ProgressionSuggestion>>({});

  const sections = useMemo<WorkoutSection[]>(
    () =>
      activeWorkout?.exercises.map((exercise) => ({
        data: collapsedIds.includes(exercise.workoutExerciseId) ? [] : exercise.sets,
        exercise,
        key: exercise.workoutExerciseId,
      })) ?? [],
    [activeWorkout?.exercises, collapsedIds],
  );

  const recorderTarget = useMemo(() => {
    if (!activeWorkout) {
      return null;
    }

    const allSets = activeWorkout.exercises.flatMap((exercise) =>
      exercise.sets.map((set) => ({
        exerciseName: exercise.exerciseName,
        setNumber: set.setNumber,
        workoutSetId: set.workoutSetId,
      })),
    );
    const preferred =
      (lastCompletedSetId
        ? allSets.find((set) => set.workoutSetId === lastCompletedSetId)
        : null) ??
      activeWorkout.exercises.flatMap((exercise) =>
        exercise.sets
          .filter((set) => !set.isCompleted)
          .slice(0, 1)
          .map((set) => ({
            exerciseName: exercise.exerciseName,
            setNumber: set.setNumber,
            workoutSetId: set.workoutSetId,
          })),
      )[0];

    return preferred ?? null;
  }, [activeWorkout, lastCompletedSetId]);

  useEffect(() => {
    if (!activeWorkout) {
      setSuggestions({});
      return;
    }

    let active = true;

    void (async () => {
      const uniqueExerciseIds = Array.from(
        new Set(activeWorkout.exercises.map((exercise) => exercise.exerciseId)),
      );
      const suggestionEntries = await Promise.all(
        uniqueExerciseIds.map(async (exerciseId) => [exerciseId, await getSuggestion(exerciseId)]),
      );

      if (!active) {
        return;
      }

      setSuggestions(Object.fromEntries(suggestionEntries));
    })();

    return () => {
      active = false;
    };
  }, [activeWorkout]);

  if (!activeWorkout) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>当前没有进行中的训练</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.primaryAction,
            pressed ? styles.buttonPressed : undefined,
          ]}
        >
          <Text style={styles.primaryActionText}>返回开始页</Text>
        </Pressable>
      </View>
    );
  }

  const handleFinishWorkout = () => {
    Alert.alert("结束训练", "将进入训练摘要页，可补充评分和日志。", [
      {
        text: "取消",
        style: "cancel",
      },
      {
        text: "结束",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const workoutId = await finishWorkout();
            if (workoutId) {
              navigation.replace("WorkoutSummary", { workoutId });
            }
          })();
        },
      },
    ]);
  };

  const renderSectionHeader = ({
    section,
  }: {
    section: SectionListData<ActiveSet, WorkoutSection>;
  }) => {
    const collapsed = collapsedIds.includes(section.exercise.workoutExerciseId);
    const suggestion = suggestions[section.exercise.exerciseId];

    return (
      <View style={styles.sectionHeader}>
        <Pressable
          onPress={() =>
            setCollapsedIds((current) =>
              current.includes(section.exercise.workoutExerciseId)
                ? current.filter((id) => id !== section.exercise.workoutExerciseId)
                : [...current, section.exercise.workoutExerciseId],
            )
          }
          style={({ pressed }) => [
            styles.sectionMain,
            pressed ? styles.buttonPressed : undefined,
          ]}
          testID={`active-workout-exercise-${section.exercise.exerciseId}`}
        >
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>{section.exercise.exerciseName}</Text>
            <Text style={styles.sectionMeta}>
              {section.exercise.volume} 容量 · {section.exercise.sets.length} 组
            </Text>
            {suggestion ? (
              <View style={styles.suggestionBubble}>
                <Text style={styles.suggestionTitle}>
                  AI 建议 · {suggestion.suggestedWeight}
                  {section.exercise.sets[0]?.unit ?? "kg"} x {suggestion.suggestedReps}
                  <Text style={styles.suggestionConfidence}>
                    {" "}
                    · 置信度 {confidenceStyles[suggestion.confidence]}
                  </Text>
                </Text>
                <Text style={styles.suggestionText}>{suggestion.reason}</Text>
              </View>
            ) : null}
          </View>
          {collapsed ? (
            <ChevronDown color={colors.textMuted} size={18} strokeWidth={2.4} />
          ) : (
            <ChevronUp color={colors.textMuted} size={18} strokeWidth={2.4} />
          )}
        </Pressable>

        <View style={styles.sectionActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void addSet(section.exercise.workoutExerciseId);
            }}
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? styles.buttonPressed : undefined,
            ]}
            testID={`active-workout-add-set-${section.exercise.exerciseId}`}
          >
            <Plus color={colors.text} size={16} strokeWidth={2.8} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert("移除动作", `确认移除 ${section.exercise.exerciseName} 吗？`, [
                { text: "取消", style: "cancel" },
                {
                  text: "移除",
                  style: "destructive",
                  onPress: () => {
                    void removeExercise(section.exercise.workoutExerciseId);
                  },
                },
              ])
            }
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderRightAction = (item: ActiveSet) => (
    <Pressable
      accessibilityRole="button"
      disabled={item.isCompleted}
      onPress={() => {
        void completeSet(item.workoutSetId);
      }}
      style={({ pressed }) => [
        styles.completeSwipe,
        item.isCompleted ? styles.completeSwipeDone : undefined,
        pressed ? styles.buttonPressed : undefined,
      ]}
    >
      <Text style={styles.completeSwipeText}>{item.isCompleted ? "已完成" : "完成"}</Text>
    </Pressable>
  );

  const renderRow = ({ item }: { item: ActiveSet }) => (
    <Swipeable overshootRight={false} renderRightActions={() => renderRightAction(item)}>
      <View
        style={[
          styles.setRow,
          item.isWarmup ? styles.setRowWarmup : undefined,
          item.isCompleted ? styles.setRowCompleted : undefined,
          item.isPr ? styles.setRowPr : undefined,
        ]}
        testID={`active-workout-set-row-${item.setNumber}`}
      >
        <View style={styles.groupCell}>
          <Text style={styles.groupLabel}>{item.setNumber}</Text>
        </View>

        <Pressable
          onPress={() =>
            setKeypadTarget({
              allowDecimal: true,
              field: "weight",
              leftShortcuts: [-5, -2.5],
              previousValue: item.previousWeight,
              rightShortcuts: [2.5, 5],
              setId: item.workoutSetId,
              title: "输入重量",
              unitLabel: item.unit,
              value: item.weight,
            })
          }
          style={({ pressed }) => [
            styles.valueCell,
            pressed ? styles.buttonPressed : undefined,
          ]}
          testID={`active-workout-set-weight-${item.setNumber}`}
        >
          <Text
            style={styles.valueMain}
            testID={`active-workout-set-weight-value-${item.setNumber}`}
          >
            {item.weight ?? "--"}
          </Text>
          <Text style={styles.valueSub}>
            上次 {buildReferenceLabel(item.previousWeight, item.unit)}
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            setKeypadTarget({
              allowDecimal: false,
              field: "reps",
              leftShortcuts: [-1],
              previousValue: item.previousReps,
              rightShortcuts: [1],
              setId: item.workoutSetId,
              title: "输入次数",
              value: item.reps,
            })
          }
          style={({ pressed }) => [
            styles.valueCell,
            pressed ? styles.buttonPressed : undefined,
          ]}
          testID={`active-workout-set-reps-${item.setNumber}`}
        >
          <Text
            style={styles.valueMain}
            testID={`active-workout-set-reps-value-${item.setNumber}`}
          >
            {item.reps ?? "--"}
          </Text>
          <Text style={styles.valueSub}>上次 {buildReferenceLabel(item.previousReps)}</Text>
        </Pressable>

        <Pressable
          onPress={() => setRpeTarget(item)}
          style={({ pressed }) => [
            styles.smallCell,
            pressed ? styles.buttonPressed : undefined,
          ]}
          testID={`active-workout-set-rpe-${item.setNumber}`}
        >
          <Text style={styles.smallCellText}>{item.rpe ?? "--"}</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            void updateSet(item.workoutSetId, { isWarmup: !item.isWarmup });
          }}
          style={({ pressed }) => [
            styles.toggleCell,
            item.isWarmup ? styles.toggleCellActive : undefined,
            pressed ? styles.buttonPressed : undefined,
          ]}
          testID={`active-workout-set-warmup-${item.setNumber}`}
        >
          <Text style={styles.toggleText}>热身</Text>
        </Pressable>

        <Pressable
          disabled={item.isCompleted}
          onPress={() => {
            void completeSet(item.workoutSetId);
          }}
          style={({ pressed }) => [
            styles.checkCell,
            item.isCompleted ? styles.checkCellDone : undefined,
            pressed ? styles.buttonPressed : undefined,
          ]}
          testID={`active-workout-set-complete-${item.setNumber}`}
        >
          <Text style={styles.checkText}>{item.isCompleted ? "✓" : "完成"}</Text>
        </Pressable>
      </View>
    </Swipeable>
  );

  return (
    <View style={styles.container} testID="active-workout-screen">
      <View style={styles.topBar}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>训练计时</Text>
          <Text style={styles.metricValue} testID="active-workout-timer-value">
            {formatDuration(activeWorkout.elapsedSeconds)}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>总容量</Text>
          <Text style={styles.metricValue} testID="active-workout-total-volume-value">
            {activeWorkout.totalVolume}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={handleFinishWorkout}
          style={({ pressed }) => [
            styles.finishButton,
            pressed ? styles.buttonPressed : undefined,
          ]}
          testID="active-workout-finish-button"
        >
          <Text style={styles.finishButtonText}>完成</Text>
        </Pressable>
      </View>

      <SectionList
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.workoutSetId}
        renderItem={renderRow}
        renderSectionHeader={renderSectionHeader}
        sections={sections}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.gridHeader}>
            <Text style={styles.gridHeaderText}>组号</Text>
            <Text style={styles.gridHeaderText}>重量</Text>
            <Text style={styles.gridHeaderText}>次数</Text>
            <Text style={styles.gridHeaderText}>RPE</Text>
            <Text style={styles.gridHeaderText}>热身</Text>
            <Text style={styles.gridHeaderText}>完成</Text>
          </View>
        }
      />

      <View style={styles.bottomToolbar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPickerVisible(true)}
          style={({ pressed }) => [
            styles.addExerciseButton,
            pressed ? styles.buttonPressed : undefined,
          ]}
          testID="active-workout-add-exercise-button"
        >
          <Text style={styles.addExerciseText}>添加动作</Text>
        </Pressable>
      </View>

      <RestTimer
        durationSeconds={activeWorkout.restTimerDuration}
        onAdjust={(delta) => {
          void adjustRestTimer(delta);
        }}
        onSkip={() => {
          void skipRestTimer();
        }}
        remainingSeconds={activeWorkout.restTimeRemaining}
        visible={activeWorkout.isRestTimerActive}
      />

      <ExercisePickerModal
        multiple
        onClose={() => setPickerVisible(false)}
        onSubmit={(exerciseIds) => {
          void (async () => {
            try {
              for (const exerciseId of exerciseIds) {
                await addExercise(exerciseId);
              }
              setPickerVisible(false);
            } catch (error) {
              Alert.alert("添加失败", error instanceof Error ? error.message : "请稍后再试");
            }
          })();
        }}
        title="添加训练动作"
        visible={pickerVisible}
      />

      <NumericKeypad
        allowDecimal={keypadTarget?.allowDecimal}
        leftShortcuts={keypadTarget?.leftShortcuts ?? []}
        onClose={() => setKeypadTarget(null)}
        onConfirm={(value) => {
          if (!keypadTarget) {
            return;
          }

          if (keypadTarget.field === "weight") {
            void updateSet(keypadTarget.setId, { weight: value });
            return;
          }

          void updateSet(keypadTarget.setId, { reps: value });
        }}
        previousValue={keypadTarget?.previousValue ?? null}
        rightShortcuts={keypadTarget?.rightShortcuts ?? []}
        title={keypadTarget?.title ?? ""}
        unitLabel={keypadTarget?.unitLabel}
        value={keypadTarget?.value ?? null}
        visible={keypadTarget !== null}
      />

      <Modal
        animationType="slide"
        onRequestClose={() => setRpeTarget(null)}
        transparent
        visible={rpeTarget !== null}
      >
        <View style={styles.modalOverlay}>
          <Pressable onPress={() => setRpeTarget(null)} style={styles.modalScrim} />
          <View style={styles.rpeSheet} testID="active-workout-rpe-sheet">
            <Text style={styles.rpeTitle}>选择 RPE</Text>
            <View style={styles.rpeGrid}>
              {rpeOptions.map((value) => (
                <Pressable
                  key={value}
                  onPress={() => {
                    if (!rpeTarget) {
                      return;
                    }

                    void updateSet(rpeTarget.workoutSetId, { rpe: value });
                    setRpeTarget(null);
                  }}
                  style={({ pressed }) => [
                    styles.rpeChip,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                  testID={`active-workout-rpe-option-${value.toFixed(1)}`}
                >
                  <Text style={styles.rpeChipText}>{value.toFixed(1)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (!rpeTarget) {
                  return;
                }

                void updateSet(rpeTarget.workoutSetId, { rpe: null });
                setRpeTarget(null);
              }}
              style={({ pressed }) => [
                styles.clearRpeButton,
                pressed ? styles.buttonPressed : undefined,
              ]}
              testID="active-workout-rpe-clear"
            >
              <Text style={styles.clearRpeText}>清空 RPE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <PRCelebration
        celebration={prCelebration}
        onClose={clearPRCelebration}
        visible={prCelebration !== null}
      />

      <VideoRecorder target={recorderTarget} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  primaryAction: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primaryActionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  topBar: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  metricValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  finishButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    justifyContent: "center",
    minWidth: 82,
    paddingHorizontal: spacing.md,
  },
  finishButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  gridHeader: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  gridHeaderText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  listContent: {
    paddingBottom: 180,
    paddingTop: spacing.md,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sectionMain: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    padding: spacing.md,
  },
  sectionCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sectionMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  suggestionBubble: {
    backgroundColor: "rgba(108, 92, 231, 0.12)",
    borderColor: "rgba(108, 92, 231, 0.24)",
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: 4,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  suggestionTitle: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: "800",
  },
  suggestionConfidence: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: "700",
  },
  suggestionText: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  sectionActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  setRow: {
    alignItems: "stretch",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  setRowWarmup: {
    opacity: 0.68,
  },
  setRowCompleted: {
    backgroundColor: "rgba(108, 92, 231, 0.18)",
    borderColor: colors.primary,
  },
  setRowPr: {
    borderColor: colors.warning,
  },
  groupCell: {
    alignItems: "center",
    justifyContent: "center",
    width: 38,
  },
  groupLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  valueCell: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flex: 1.2,
    gap: 2,
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  valueMain: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  valueSub: {
    color: colors.textSubtle,
    fontSize: 10,
  },
  smallCell: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flex: 0.8,
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  smallCellText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  toggleCell: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flex: 0.9,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  toggleCellActive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.textMuted,
  },
  toggleText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  checkCell: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  checkCellDone: {
    backgroundColor: colors.surfaceAlt,
  },
  checkText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  completeSwipe: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    justifyContent: "center",
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
    width: 84,
  },
  completeSwipeDone: {
    backgroundColor: colors.surfaceAlt,
  },
  completeSwipeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  bottomToolbar: {
    backgroundColor: colors.backgroundElevated,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: spacing.lg,
    position: "absolute",
    right: 0,
  },
  addExerciseButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  addExerciseText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  modalOverlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: "flex-end",
  },
  modalScrim: {
    flex: 1,
  },
  rpeSheet: {
    backgroundColor: colors.backgroundElevated,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.md,
    padding: spacing.lg,
  },
  rpeTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  rpeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  rpeChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    minWidth: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rpeChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  clearRpeButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  clearRpeText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
});

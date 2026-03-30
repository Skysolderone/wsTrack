import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import DraggableFlatList, {
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import {
  ArrowLeft,
  GripVertical,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";

import { ExercisePickerModal, OptionChip } from "../components";
import { colors } from "../constants/colors";
import { PlanGoal } from "../constants/enums";
import { planGoalLabels } from "../constants/planMetadata";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import {
  addDayToPlan,
  addExerciseToDay,
  deleteDay,
  loadPlanEditorData,
  removePlanExercise,
  renameDay,
  reorderExercises,
  setActivePlan,
  updatePlan,
  updatePlanExercise,
  type PlanEditorData,
  type PlanExerciseItem,
} from "../services/PlanService";
import { saveAsTemplate } from "../services/TemplateService";
import { useSettingsStore } from "../store/settingsStore";

type PlanEditorScreenProps = NativeStackScreenProps<RootStackParamList, "PlanEditor">;

interface ExerciseDraftForm {
  notes: string;
  restSeconds: string;
  targetReps: string;
  targetSets: string;
}

const buildExerciseDraft = (item: PlanExerciseItem): ExerciseDraftForm => ({
  notes: item.notes ?? "",
  restSeconds: item.restSeconds?.toString() ?? "",
  targetReps: item.targetReps ?? "",
  targetSets: item.targetSets.toString(),
});

const buildDraftMap = (plan: PlanEditorData): Record<string, ExerciseDraftForm> =>
  Object.fromEntries(
    plan.days.flatMap((day) =>
      day.exercises.map((exercise) => [exercise.id, buildExerciseDraft(exercise)] as const),
    ),
  );

const parseTargetSets = (value: string, fallback: number): number => {
  const nextValue = Number.parseInt(value, 10);

  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : fallback;
};

const parseRestSeconds = (value: string, fallback: number | null): number | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const nextValue = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(nextValue) || nextValue < 0) {
    return fallback;
  }

  return nextValue;
};

export const PlanEditorScreen = ({ navigation, route }: PlanEditorScreenProps) => {
  const { planId } = route.params;
  const language = useSettingsStore((state) => state.language);
  const initializedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [plan, setPlan] = useState<PlanEditorData | null>(null);
  const [planName, setPlanName] = useState("");
  const [goal, setGoal] = useState<PlanGoal>(PlanGoal.General);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ExerciseDraftForm>>({});
  const [pickerVisible, setPickerVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const loadPlan = useCallback(async () => {
    try {
      setLoading(true);
      const nextPlan = await loadPlanEditorData(planId);

      setPlan(nextPlan);
      setDrafts(buildDraftMap(nextPlan));
      setExpandedIds((current) =>
        current.filter((exerciseId) =>
          nextPlan.days.some((day) => day.exercises.some((exercise) => exercise.id === exerciseId)),
        ),
      );
      setSelectedDayId((current) => {
        if (current && nextPlan.days.some((day) => day.id === current)) {
          return current;
        }

        return nextPlan.days[0]?.id ?? null;
      });

      if (!initializedRef.current) {
        setPlanName(nextPlan.name);
        setGoal(nextPlan.goal ?? PlanGoal.General);
        initializedRef.current = true;
      }
    } catch (error) {
      Alert.alert("加载失败", error instanceof Error ? error.message : "请稍后再试", [
        { text: "返回", onPress: () => navigation.goBack() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [navigation, planId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const currentDay = useMemo(
    () => plan?.days.find((day) => day.id === selectedDayId) ?? null,
    [plan, selectedDayId],
  );

  const updateExerciseInState = useCallback(
    (exerciseId: string, updates: Partial<PlanExerciseItem>) => {
      setPlan((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          days: current.days.map((day) => ({
            ...day,
            exercises: day.exercises.map((exercise) =>
              exercise.id === exerciseId ? { ...exercise, ...updates } : exercise,
            ),
          })),
        };
      });
    },
    [],
  );

  const handleSaveMeta = async () => {
    if (savingMeta) {
      return;
    }

    try {
      setSavingMeta(true);
      await updatePlan(planId, {
        goal,
        name: planName,
      });
      setPlan((current) =>
        current
          ? {
              ...current,
              goal,
              name: planName.trim() || "未命名计划",
            }
          : current,
      );
      Alert.alert("已保存", "计划名称和目标已更新。");
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "请稍后再试");
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSetActive = async () => {
    try {
      await setActivePlan(planId);
      setPlan((current) =>
        current
          ? {
              ...current,
              isActive: true,
            }
          : current,
      );
    } catch (error) {
      Alert.alert("设置失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const handleSaveAsTemplate = async () => {
    try {
      await updatePlan(planId, {
        goal,
        name: planName,
      });
      await saveAsTemplate(planId, `${(planName.trim() || "未命名计划").trim()} 模板`);
      Alert.alert("已保存", "当前计划已另存为模板，可在模板页查看。");
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const handleAddDay = async () => {
    try {
      const nextIndex = (plan?.days.length ?? 0) + 1;
      const createdDayId = await addDayToPlan(planId, `Day ${nextIndex}`);
      await loadPlan();
      setSelectedDayId(createdDayId);
    } catch (error) {
      Alert.alert("添加失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const openRenameDayModal = () => {
    if (!currentDay) {
      return;
    }

    setRenameValue(currentDay.name);
    setRenameVisible(true);
  };

  const handleRenameDay = async () => {
    if (!currentDay) {
      return;
    }

    try {
      await renameDay(currentDay.id, renameValue);
      setRenameVisible(false);
      await loadPlan();
    } catch (error) {
      Alert.alert("重命名失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const handleDeleteDay = () => {
    if (!currentDay) {
      return;
    }

    Alert.alert("删除训练日", `确认删除 ${currentDay.name} 吗？其下动作会一并移除。`, [
      { style: "cancel", text: "取消" },
      {
        style: "destructive",
        text: "删除",
        onPress: () => {
          void (async () => {
            try {
              await deleteDay(currentDay.id);
              await loadPlan();
            } catch (error) {
              Alert.alert("删除失败", error instanceof Error ? error.message : "请稍后再试");
            }
          })();
        },
      },
    ]);
  };

  const handleAddExercises = async (exerciseIds: string[]) => {
    if (!currentDay) {
      return;
    }

    try {
      for (const exerciseId of exerciseIds) {
        await addExerciseToDay(currentDay.id, exerciseId, 3);
      }

      setPickerVisible(false);
      await loadPlan();
    } catch (error) {
      Alert.alert("添加失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const handleRemoveExercise = (exerciseId: string) => {
    Alert.alert("移除动作", "确认从当前训练日移除这个动作吗？", [
      { style: "cancel", text: "取消" },
      {
        style: "destructive",
        text: "移除",
        onPress: () => {
          void (async () => {
            try {
              await removePlanExercise(exerciseId);
              setExpandedIds((current) => current.filter((item) => item !== exerciseId));
              await loadPlan();
            } catch (error) {
              Alert.alert("移除失败", error instanceof Error ? error.message : "请稍后再试");
            }
          })();
        },
      },
    ]);
  };

  const handleDraftChange = (
    exerciseId: string,
    key: keyof ExerciseDraftForm,
    value: string,
  ) => {
    setDrafts((current) => ({
      ...current,
      [exerciseId]: {
        ...(current[exerciseId] ?? {
          notes: "",
          restSeconds: "",
          targetReps: "",
          targetSets: "3",
        }),
        [key]: value,
      },
    }));
  };

  const handleSaveExerciseConfig = async (item: PlanExerciseItem) => {
    const draft = drafts[item.id] ?? buildExerciseDraft(item);
    const targetSets = parseTargetSets(draft.targetSets, item.targetSets);
    const targetReps = draft.targetReps.trim() || null;
    const restSeconds = parseRestSeconds(draft.restSeconds, item.restSeconds);
    const notes = draft.notes.trim() || null;

    try {
      await updatePlanExercise(item.id, {
        notes,
        restSeconds,
        targetReps,
        targetSets,
      });
      updateExerciseInState(item.id, {
        notes,
        restSeconds,
        targetReps,
        targetSets,
      });
      setDrafts((current) => ({
        ...current,
        [item.id]: {
          notes: notes ?? "",
          restSeconds: restSeconds?.toString() ?? "",
          targetReps: targetReps ?? "",
          targetSets: targetSets.toString(),
        },
      }));
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const handleReorder = async (items: PlanExerciseItem[]) => {
    if (!currentDay) {
      return;
    }

    setPlan((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        days: current.days.map((day) =>
          day.id === currentDay.id
            ? {
                ...day,
                exercises: items.map((exercise, index) => ({
                  ...exercise,
                  sortOrder: index,
                })),
              }
            : day,
        ),
      };
    });

    try {
      await reorderExercises(
        currentDay.id,
        items.map((item) => item.id),
      );
    } catch (error) {
      Alert.alert("排序失败", error instanceof Error ? error.message : "请稍后再试");
      await loadPlan();
    }
  };

  const renderRightActions = (exerciseId: string) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => handleRemoveExercise(exerciseId)}
      style={({ pressed }) => [
        styles.deleteAction,
        pressed ? styles.deleteActionPressed : undefined,
      ]}
    >
      <Trash2 color={colors.text} size={18} strokeWidth={2.2} />
      <Text style={styles.deleteActionText}>删除</Text>
    </Pressable>
  );

  const renderExerciseItem = ({
    drag,
    isActive,
    item,
  }: RenderItemParams<PlanExerciseItem>) => {
    const expanded = expandedIds.includes(item.id);
    const draft = drafts[item.id] ?? buildExerciseDraft(item);

    return (
      <Swipeable overshootRight={false} renderRightActions={() => renderRightActions(item.id)}>
        <View
          style={[
            styles.exerciseCard,
            expanded ? styles.exerciseCardExpanded : undefined,
            isActive ? styles.exerciseCardDragging : undefined,
          ]}
        >
          <View style={styles.exerciseRow}>
            <Pressable
              onPress={() =>
                setExpandedIds((current) =>
                  current.includes(item.id)
                    ? current.filter((value) => value !== item.id)
                    : [...current, item.id],
                )
              }
              style={({ pressed }) => [
                styles.exerciseMain,
                pressed ? styles.exerciseMainPressed : undefined,
              ]}
            >
              <Text numberOfLines={1} style={styles.exerciseName}>
                {item.exercise.name}
              </Text>
              <Text style={styles.exerciseMeta}>
                {item.targetSets} 组 · {item.targetReps ?? "未设置"} · 休息{" "}
                {item.restSeconds ?? 0}s
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              delayLongPress={120}
              onLongPress={drag}
              style={({ pressed }) => [
                styles.dragHandle,
                pressed ? styles.dragHandlePressed : undefined,
              ]}
            >
              <GripVertical color={colors.textMuted} size={18} strokeWidth={2.2} />
            </Pressable>
          </View>

          {expanded ? (
            <View style={styles.exerciseEditor}>
              <View style={styles.inlineFields}>
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>目标组数</Text>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={(value) => handleDraftChange(item.id, "targetSets", value)}
                    placeholder="3"
                    placeholderTextColor={colors.textSubtle}
                    selectionColor={colors.primary}
                    style={styles.input}
                    value={draft.targetSets}
                  />
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>目标次数</Text>
                  <TextInput
                    onChangeText={(value) => handleDraftChange(item.id, "targetReps", value)}
                    placeholder="8-12"
                    placeholderTextColor={colors.textSubtle}
                    selectionColor={colors.primary}
                    style={styles.input}
                    value={draft.targetReps}
                  />
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>休息时间</Text>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={(value) => handleDraftChange(item.id, "restSeconds", value)}
                    placeholder="90"
                    placeholderTextColor={colors.textSubtle}
                    selectionColor={colors.primary}
                    style={styles.input}
                    value={draft.restSeconds}
                  />
                </View>
              </View>

              <View style={styles.notesBlock}>
                <Text style={styles.fieldLabel}>备注</Text>
                <TextInput
                  multiline
                  numberOfLines={4}
                  onChangeText={(value) => handleDraftChange(item.id, "notes", value)}
                  placeholder="例如：最后一组接近力竭，控制离心节奏"
                  placeholderTextColor={colors.textSubtle}
                  selectionColor={colors.primary}
                  style={[styles.input, styles.notesInput]}
                  textAlignVertical="top"
                  value={draft.notes}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void handleSaveExerciseConfig(item);
                }}
                style={({ pressed }) => [
                  styles.saveExerciseButton,
                  pressed ? styles.saveExerciseButtonPressed : undefined,
                ]}
              >
                <Text style={styles.saveExerciseButtonText}>保存动作参数</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Swipeable>
    );
  };

  if (loading && !plan) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>正在加载计划...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.topBarButton,
            pressed ? styles.topBarButtonPressed : undefined,
          ]}
        >
          <ArrowLeft color={colors.text} size={18} strokeWidth={2.4} />
        </Pressable>
        <Text numberOfLines={1} style={styles.topBarTitle}>
          计划编辑
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void handleSaveMeta();
          }}
          style={({ pressed }) => [
            styles.topBarSaveButton,
            pressed ? styles.topBarSaveButtonPressed : undefined,
          ]}
        >
          <Text style={styles.topBarSaveText}>{savingMeta ? "保存中" : "保存"}</Text>
        </Pressable>
      </View>

      <View style={styles.metaCard}>
        <Text style={styles.sectionTitle}>基础信息</Text>
        <TextInput
          onChangeText={setPlanName}
          placeholder="计划名称"
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          style={styles.metaInput}
          value={planName}
        />

        <View style={styles.goalWrap}>
          {Object.values(PlanGoal).map((value) => (
            <OptionChip
              key={value}
              label={planGoalLabels[value][language]}
              onPress={() => setGoal(value)}
              selected={goal === value}
            />
          ))}
        </View>

        <View style={styles.planStatusRow}>
          <Text style={styles.planStatusText}>
            {plan?.isActive ? "当前为激活计划" : "可将此计划设为当前训练模板"}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={plan?.isActive}
            onPress={() => {
              void handleSetActive();
            }}
            style={({ pressed }) => [
              styles.activatePlanButton,
              plan?.isActive ? styles.activatePlanButtonActive : undefined,
              pressed ? styles.activatePlanButtonPressed : undefined,
            ]}
          >
            <Text
              style={[
                styles.activatePlanButtonText,
                plan?.isActive ? styles.activatePlanButtonTextActive : undefined,
              ]}
            >
              {plan?.isActive ? "已激活" : "设为当前计划"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void handleSaveAsTemplate();
          }}
          style={({ pressed }) => [
            styles.saveTemplateButton,
            pressed ? styles.saveTemplateButtonPressed : undefined,
          ]}
        >
          <Text style={styles.saveTemplateButtonText}>另存为模板</Text>
        </Pressable>
      </View>

      <View style={styles.dayTabsCard}>
        <View style={styles.dayTabsHeader}>
          <Text style={styles.sectionTitle}>训练日</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void handleAddDay();
            }}
            style={({ pressed }) => [
              styles.dayAddButton,
              pressed ? styles.dayAddButtonPressed : undefined,
            ]}
          >
            <Plus color={colors.text} size={16} strokeWidth={2.8} />
            <Text style={styles.dayAddButtonText}>添加 Day</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          contentContainerStyle={styles.dayTabsWrap}
          showsHorizontalScrollIndicator={false}
        >
          {plan?.days.map((day, index) => (
            <Pressable
              key={day.id}
              onLongPress={() => {
                setSelectedDayId(day.id);
                setRenameValue(day.name);
                setRenameVisible(true);
              }}
              onPress={() => setSelectedDayId(day.id)}
              style={({ pressed }) => [
                styles.dayTab,
                selectedDayId === day.id ? styles.dayTabSelected : undefined,
                pressed ? styles.dayTabPressed : undefined,
              ]}
            >
              <Text
                style={[
                  styles.dayTabTitle,
                  selectedDayId === day.id ? styles.dayTabTitleSelected : undefined,
                ]}
              >
                {day.name}
              </Text>
              <Text
                style={[
                  styles.dayTabMeta,
                  selectedDayId === day.id ? styles.dayTabMetaSelected : undefined,
                ]}
              >
                Day {index + 1}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {currentDay ? (
        <>
          <View style={styles.dayToolbar}>
            <View style={styles.dayToolbarCopy}>
              <Text style={styles.dayTitle}>{currentDay.name}</Text>
              <Text style={styles.daySubtitle}>
                点击动作展开编辑，长按右侧拖拽排序，左滑删除动作。
              </Text>
            </View>
            <View style={styles.dayToolbarActions}>
              <Pressable
                accessibilityRole="button"
                onPress={openRenameDayModal}
                style={({ pressed }) => [
                  styles.iconAction,
                  pressed ? styles.iconActionPressed : undefined,
                ]}
              >
                <PencilLine color={colors.text} size={16} strokeWidth={2.2} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleDeleteDay}
                style={({ pressed }) => [
                  styles.iconAction,
                  pressed ? styles.iconActionPressed : undefined,
                ]}
              >
                <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>

          <DraggableFlatList
            activationDistance={16}
            contentContainerStyle={styles.listContent}
            data={currentDay.exercises}
            keyExtractor={(item) => item.id}
            onDragEnd={({ data }) => {
              void handleReorder(data);
            }}
            renderItem={renderExerciseItem}
            showsVerticalScrollIndicator={false}
            style={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyDayCard}>
                <Text style={styles.emptyDayTitle}>这个训练日还没有动作</Text>
                <Text style={styles.emptyDaySubtitle}>
                  先从动作库选择动作，再设置组数、次数范围和休息时间。
                </Text>
              </View>
            }
          />
        </>
      ) : (
        <View style={styles.noDayCard}>
          <Text style={styles.emptyDayTitle}>这个计划还没有训练日</Text>
          <Text style={styles.emptyDaySubtitle}>
            先添加一个 Day，再把动作从动作库加入计划。
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void handleAddDay();
            }}
            style={({ pressed }) => [
              styles.noDayButton,
              pressed ? styles.noDayButtonPressed : undefined,
            ]}
          >
            <Text style={styles.noDayButtonText}>添加第一个 Day</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.bottomBar}>
        <Pressable
          accessibilityRole="button"
          disabled={!currentDay}
          onPress={() => setPickerVisible(true)}
          style={({ pressed }) => [
            styles.bottomSecondaryButton,
            !currentDay ? styles.bottomSecondaryButtonDisabled : undefined,
            pressed ? styles.bottomButtonPressed : undefined,
          ]}
        >
          <Text style={styles.bottomSecondaryButtonText}>添加动作</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void handleSaveMeta();
          }}
          style={({ pressed }) => [
            styles.bottomPrimaryButton,
            pressed ? styles.bottomButtonPressed : undefined,
          ]}
        >
          <Text style={styles.bottomPrimaryButtonText}>
            {savingMeta ? "保存中..." : "保存计划"}
          </Text>
        </Pressable>
      </View>

      <ExercisePickerModal
        initialSelectedIds={[]}
        multiple
        onClose={() => setPickerVisible(false)}
        onSubmit={(exerciseIds) => {
          void handleAddExercises(exerciseIds);
        }}
        title="添加训练动作"
        visible={pickerVisible}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setRenameVisible(false)}
        transparent
        visible={renameVisible}
      >
        <View style={styles.dialogOverlay}>
          <Pressable onPress={() => setRenameVisible(false)} style={styles.dialogScrim} />
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>重命名训练日</Text>
            <Text style={styles.dialogSubtitle}>名称修改后会立即写入当前计划。</Text>
            <TextInput
              autoFocus
              onChangeText={setRenameValue}
              placeholder="例如：Push / Pull / Legs"
              placeholderTextColor={colors.textSubtle}
              selectionColor={colors.primary}
              style={styles.dialogInput}
              value={renameValue}
            />
            <View style={styles.dialogActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setRenameVisible(false)}
                style={({ pressed }) => [
                  styles.dialogButton,
                  pressed ? styles.dialogButtonPressed : undefined,
                ]}
              >
                <Text style={styles.dialogButtonText}>取消</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void handleRenameDay();
                }}
                style={({ pressed }) => [
                  styles.dialogPrimaryButton,
                  pressed ? styles.dialogButtonPressed : undefined,
                ]}
              >
                <Text style={styles.dialogPrimaryButtonText}>保存名称</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  loadingState: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    padding: spacing.lg,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  topBarButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  topBarButtonPressed: {
    opacity: 0.78,
  },
  topBarTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  topBarSaveButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    minWidth: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  topBarSaveButtonPressed: {
    opacity: 0.8,
  },
  topBarSaveText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  metaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  metaInput: {
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  goalWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  planStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  planStatusText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  activatePlanButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    minWidth: 112,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activatePlanButtonActive: {
    backgroundColor: colors.surfaceAlt,
  },
  activatePlanButtonPressed: {
    opacity: 0.82,
  },
  activatePlanButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  activatePlanButtonTextActive: {
    color: colors.primarySoft,
  },
  saveTemplateButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  saveTemplateButtonPressed: {
    opacity: 0.82,
  },
  saveTemplateButtonText: {
    color: colors.primarySoft,
    fontSize: 13,
    fontWeight: "800",
  },
  dayTabsCard: {
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  dayTabsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayAddButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dayAddButtonPressed: {
    opacity: 0.8,
  },
  dayAddButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  dayTabsWrap: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  dayTab: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    minWidth: 116,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dayTabSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayTabPressed: {
    opacity: 0.82,
  },
  dayTabTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  dayTabTitleSelected: {
    color: colors.text,
  },
  dayTabMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  dayTabMetaSelected: {
    color: colors.text,
  },
  dayToolbar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  dayToolbarCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  dayTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  daySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  dayToolbarActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  iconAction: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  iconActionPressed: {
    opacity: 0.78,
  },
  list: {
    flex: 1,
    marginTop: spacing.md,
  },
  listContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  exerciseCardExpanded: {
    borderColor: colors.primarySoft,
  },
  exerciseCardDragging: {
    opacity: 0.94,
  },
  exerciseRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  exerciseMain: {
    flex: 1,
    gap: spacing.xs,
  },
  exerciseMainPressed: {
    opacity: 0.86,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  exerciseMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  dragHandle: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  dragHandlePressed: {
    opacity: 0.78,
  },
  exerciseEditor: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  inlineFields: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  fieldBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  notesBlock: {
    gap: spacing.xs,
  },
  notesInput: {
    minHeight: 96,
  },
  saveExerciseButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  saveExerciseButtonPressed: {
    opacity: 0.82,
  },
  saveExerciseButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  deleteAction: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    gap: spacing.xs,
    height: "100%",
    justifyContent: "center",
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.md,
    width: 82,
  },
  deleteActionPressed: {
    opacity: 0.84,
  },
  deleteActionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  noDayCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    margin: spacing.lg,
    padding: spacing.xl,
  },
  emptyDayCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyDayTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyDaySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  noDayButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  noDayButtonPressed: {
    opacity: 0.8,
  },
  noDayButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  bottomBar: {
    backgroundColor: colors.backgroundElevated,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  bottomSecondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  bottomSecondaryButtonDisabled: {
    opacity: 0.42,
  },
  bottomSecondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  bottomPrimaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  bottomPrimaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  bottomButtonPressed: {
    opacity: 0.82,
  },
  dialogOverlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  dialogScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  dialogCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  dialogTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  dialogSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  dialogInput: {
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dialogActions: {
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "flex-end",
  },
  dialogButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    justifyContent: "center",
    minWidth: 88,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dialogPrimaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    minWidth: 104,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dialogButtonPressed: {
    opacity: 0.8,
  },
  dialogButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  dialogPrimaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
});

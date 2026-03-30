import { useCallback, useState } from "react";
import type { ListRenderItem } from "react-native";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronRight, Plus } from "lucide-react-native";

import { colors } from "../constants/colors";
import { PlanGoal } from "../constants/enums";
import { planGoalLabels } from "../constants/planMetadata";
import { radii, spacing } from "../constants/sizes";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import {
  getAssignedPlans,
  importAssignedPlan,
  type CoachAssignedPlanNotification,
} from "../services/CoachService";
import {
  archivePlan,
  createPlan,
  deletePlan,
  duplicatePlan,
  loadPlanSummaries,
  setActivePlan,
  type PlanSummary,
} from "../services/PlanService";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";

type PlanListScreenProps = BottomTabScreenProps<MainTabParamList, "Plans">;

const formatLastUsedAt = (timestamp: number | null): string => {
  if (!timestamp) {
    return "未使用";
  }

  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}/${month}/${day}`;
};

export const PlanListScreen = (_props: PlanListScreenProps) => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const language = useSettingsStore((state) => state.language);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [assignedPlans, setAssignedPlans] = useState<CoachAssignedPlanNotification[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reloadPlans = useCallback(async () => {
    try {
      setLoading(true);
      const [nextPlans, nextAssignments] = await Promise.all([
        loadPlanSummaries(),
        accessToken
          ? getAssignedPlans().catch(() => [])
          : Promise.resolve<CoachAssignedPlanNotification[]>([]),
      ]);
      setPlans(nextPlans);
      setAssignedPlans(nextAssignments);
    } catch (error) {
      Alert.alert("加载失败", error instanceof Error ? error.message : "请稍后再试");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      void reloadPlans();
    }, [reloadPlans]),
  );

  const handleCreatePlan = async () => {
    try {
      const planId = await createPlan("未命名计划", PlanGoal.General);
      navigation.navigate("PlanEditor", { planId });
    } catch (error) {
      Alert.alert("创建失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const handleActivate = async (planId: string) => {
    try {
      await setActivePlan(planId);
      await reloadPlans();
    } catch (error) {
      Alert.alert("切换失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const handleDuplicate = async (planId: string) => {
    try {
      const duplicatedPlanId = await duplicatePlan(planId);
      await reloadPlans();
      navigation.navigate("PlanEditor", { planId: duplicatedPlanId });
    } catch (error) {
      Alert.alert("复制失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const handleImportAssignedPlan = async (assignment: CoachAssignedPlanNotification) => {
    try {
      const planId = await importAssignedPlan(assignment);
      await reloadPlans();
      navigation.navigate("PlanEditor", { planId });
    } catch (error) {
      Alert.alert("导入失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const confirmArchive = (planId: string) => {
    Alert.alert("归档计划", "归档后计划会从列表隐藏，但不会立即物理删除。", [
      { style: "cancel", text: "取消" },
      {
        style: "destructive",
        text: "归档",
        onPress: () => {
          void (async () => {
            try {
              await archivePlan(planId);
              await reloadPlans();
            } catch (error) {
              Alert.alert("归档失败", error instanceof Error ? error.message : "请稍后再试");
            }
          })();
        },
      },
    ]);
  };

  const confirmDelete = (planId: string) => {
    Alert.alert("删除计划", "MVP 阶段删除按软删除处理，删除后会从列表隐藏。", [
      { style: "cancel", text: "取消" },
      {
        style: "destructive",
        text: "删除",
        onPress: () => {
          void (async () => {
            try {
              await deletePlan(planId);
              await reloadPlans();
            } catch (error) {
              Alert.alert("删除失败", error instanceof Error ? error.message : "请稍后再试");
            }
          })();
        },
      },
    ]);
  };

  const openPlanMenu = (plan: PlanSummary) => {
    Alert.alert(plan.name, "选择操作", [
      {
        text: "编辑",
        onPress: () => navigation.navigate("PlanEditor", { planId: plan.id }),
      },
      {
        text: "复制",
        onPress: () => {
          void handleDuplicate(plan.id);
        },
      },
      {
        text: "归档",
        style: "destructive",
        onPress: () => confirmArchive(plan.id),
      },
      {
        text: "删除",
        style: "destructive",
        onPress: () => confirmDelete(plan.id),
      },
      { style: "cancel", text: "取消" },
    ]);
  };

  const renderPlanCard: ListRenderItem<PlanSummary> = ({ item }) => {
    const goalLabel = planGoalLabels[item.goal ?? PlanGoal.General][language];

    return (
      <View style={[styles.planCard, item.isActive ? styles.planCardActive : undefined]}>
        <Pressable
          onLongPress={() => openPlanMenu(item)}
          onPress={() => navigation.navigate("PlanEditor", { planId: item.id })}
          style={({ pressed }) => [
            styles.planBody,
            pressed ? styles.planBodyPressed : undefined,
          ]}
          testID={`plan-list-card-${item.id}`}
        >
          <View style={styles.planHeader}>
            <View style={styles.planHeaderCopy}>
              <Text numberOfLines={1} style={styles.planName} testID={`plan-list-card-name-${item.id}`}>
                {item.name}
              </Text>
              <Text style={styles.planHint}>长按卡片可编辑、复制、归档或删除</Text>
            </View>
            <ChevronRight color={colors.textMuted} size={18} strokeWidth={2.2} />
          </View>

          <View style={styles.badgeRow}>
            <View style={styles.goalBadge}>
              <Text style={styles.goalBadgeText}>{goalLabel}</Text>
            </View>
            {item.isActive ? (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>当前激活</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Day 数</Text>
              <Text style={styles.metaValue}>{item.dayCount}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>上次使用</Text>
              <Text style={styles.metaValue}>{formatLastUsedAt(item.lastUsedAt)}</Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.cardFooter}>
          <Pressable
            accessibilityRole="button"
            disabled={item.isActive}
            onPress={() => {
              void handleActivate(item.id);
            }}
            style={({ pressed }) => [
              styles.activateButton,
              item.isActive ? styles.activateButtonActive : undefined,
              pressed ? styles.activateButtonPressed : undefined,
            ]}
            testID={`plan-list-activate-${item.id}`}
          >
            <Text
              style={[
                styles.activateButtonText,
                item.isActive ? styles.activateButtonTextActive : undefined,
              ]}
            >
              {item.isActive ? "当前计划" : "设为当前计划"}
            </Text>
          </Pressable>
          <Text style={styles.footerHint}>点击卡片进入编辑</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container} testID="plan-list-screen">
      <FlatList
        contentContainerStyle={styles.content}
        data={plans}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>正在加载计划...</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>还没有训练计划</Text>
              <Text style={styles.emptySubtitle}>
                从一个空计划开始，按 Day 组织训练动作和目标参数。
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void handleCreatePlan();
                }}
                style={({ pressed }) => [
                  styles.emptyAction,
                  pressed ? styles.emptyActionPressed : undefined,
                ]}
                testID="plan-list-empty-create"
              >
                <Text style={styles.emptyActionText}>创建第一个计划</Text>
              </Pressable>
            </View>
          )
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>训练计划</Text>
                <Text style={styles.subtitle}>
                  用卡片管理所有周期和分化计划，当前激活计划会高亮显示。
                </Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.navigate("Community")}
                  style={({ pressed }) => [
                    styles.templateButton,
                    pressed ? styles.templateButtonPressed : undefined,
                  ]}
                  testID="plan-list-community-button"
                >
                  <Text style={styles.templateButtonText}>社区</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.navigate("TemplateList")}
                  style={({ pressed }) => [
                    styles.templateButton,
                    pressed ? styles.templateButtonPressed : undefined,
                  ]}
                  testID="plan-list-template-button"
                >
                  <Text style={styles.templateButtonText}>模板</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void handleCreatePlan();
                  }}
                  style={({ pressed }) => [
                    styles.addButton,
                    pressed ? styles.addButtonPressed : undefined,
                  ]}
                  testID="plan-list-create-button"
                >
                  <Plus color={colors.text} size={18} strokeWidth={2.8} />
                </Pressable>
              </View>
            </View>

            {assignedPlans.length > 0 ? (
              <View style={styles.assignmentSection}>
                <Text style={styles.assignmentTitle}>教练推送计划</Text>
                {assignedPlans.map((assignment) => (
                  <View key={assignment.assignmentId} style={styles.assignmentCard}>
                    <View style={styles.assignmentCopy}>
                      <Text style={styles.assignmentName}>{assignment.title}</Text>
                      <Text style={styles.assignmentMeta}>
                        {assignment.coachName} ·{" "}
                        {new Date(assignment.createdAt).toLocaleDateString()}
                      </Text>
                      <Text style={styles.assignmentMessage}>{assignment.message}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        void handleImportAssignedPlan(assignment);
                      }}
                    style={({ pressed }) => [
                      styles.assignmentButton,
                      pressed ? styles.activateButtonPressed : undefined,
                    ]}
                    testID={`plan-list-assignment-import-${assignment.assignmentId}`}
                  >
                      <Text style={styles.assignmentButtonText}>导入</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        }
        renderItem={renderPlanCard}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    marginBottom: spacing.sm,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  headerCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
    justifyContent: "flex-end",
  },
  assignmentSection: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  assignmentTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  assignmentCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  assignmentCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  assignmentName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  assignmentMeta: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: "700",
  },
  assignmentMessage: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  assignmentButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    minWidth: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  assignmentButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 42,
    justifyContent: "center",
    marginTop: spacing.xs,
    width: 42,
  },
  addButtonPressed: {
    opacity: 0.82,
  },
  templateButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  templateButtonPressed: {
    opacity: 0.82,
  },
  templateButtonText: {
    color: colors.primarySoft,
    fontSize: 13,
    fontWeight: "800",
  },
  planCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  planCardActive: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 12,
  },
  planBody: {
    gap: spacing.md,
    padding: spacing.md,
  },
  planBodyPressed: {
    opacity: 0.9,
  },
  planHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  planHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  planName: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "800",
  },
  planHint: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  goalBadge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  goalBadgeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  activeBadge: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activeBadgeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  metaRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  metaItem: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.md,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  metaValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  cardFooter: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.md,
  },
  activateButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    minWidth: 116,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activateButtonActive: {
    backgroundColor: colors.surfaceAlt,
  },
  activateButtonPressed: {
    opacity: 0.84,
  },
  activateButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  activateButtonTextActive: {
    color: colors.primarySoft,
  },
  footerHint: {
    color: colors.textSubtle,
    flex: 1,
    fontSize: 12,
    textAlign: "right",
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  emptyAction: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  emptyActionPressed: {
    opacity: 0.82,
  },
  emptyActionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
});

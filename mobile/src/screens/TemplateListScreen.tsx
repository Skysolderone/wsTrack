import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { PlanGoal } from "../constants/enums";
import { planGoalLabels } from "../constants/planMetadata";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import {
  applyTemplate,
  getBuiltInTemplates,
  getUserTemplates,
  type TemplatePreview,
} from "../services/TemplateService";
import { useSettingsStore } from "../store/settingsStore";

type TemplateListScreenProps = NativeStackScreenProps<RootStackParamList, "TemplateList">;

export const TemplateListScreen = ({ navigation }: TemplateListScreenProps) => {
  const language = useSettingsStore((state) => state.language);
  const [loading, setLoading] = useState(true);
  const [builtInTemplates, setBuiltInTemplates] = useState<TemplatePreview[]>([]);
  const [userTemplates, setUserTemplates] = useState<TemplatePreview[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const [builtIn, user] = await Promise.all([
        getBuiltInTemplates(),
        getUserTemplates(),
      ]);
      setBuiltInTemplates(builtIn);
      setUserTemplates(user);
    } catch (error) {
      Alert.alert("加载失败", error instanceof Error ? error.message : "请稍后再试");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTemplates();
    }, [loadTemplates]),
  );

  const handleApplyTemplate = async (templateId: string) => {
    try {
      const planId = await applyTemplate(templateId);
      navigation.navigate("PlanEditor", { planId });
    } catch (error) {
      Alert.alert("创建失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const renderTemplateCard = (template: TemplatePreview) => {
    const expanded = expandedIds.includes(template.id);
    const goalLabel = planGoalLabels[template.goal ?? PlanGoal.General][language];

    return (
      <View key={template.id} style={styles.templateCard}>
        <Pressable
          onPress={() =>
            setExpandedIds((current) =>
              current.includes(template.id)
                ? current.filter((id) => id !== template.id)
                : [...current, template.id],
            )
          }
          style={({ pressed }) => [
            styles.templateHeader,
            pressed ? styles.cardPressed : undefined,
          ]}
        >
          <View style={styles.templateHeaderCopy}>
            <Text style={styles.templateName}>{template.name}</Text>
            <Text style={styles.templateDescription}>
              {template.description ?? "点击展开查看 Day 和动作配置。"}
            </Text>
          </View>
          {expanded ? (
            <ChevronUp color={colors.textMuted} size={18} strokeWidth={2.2} />
          ) : (
            <ChevronDown color={colors.textMuted} size={18} strokeWidth={2.2} />
          )}
        </Pressable>

        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{goalLabel}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{template.dayCount} 天</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{template.isBuiltIn ? "内置" : "我的模板"}</Text>
          </View>
        </View>

        {expanded ? (
          <View style={styles.previewBody}>
            {template.days.map((day) => (
              <View key={day.id} style={styles.dayCard}>
                <Text style={styles.dayTitle}>{day.name}</Text>
                <View style={styles.exerciseWrap}>
                  {day.exercises.map((exercise) => (
                    <View
                      key={`${day.id}-${exercise.id}-${exercise.sortOrder}`}
                      style={styles.exerciseChip}
                    >
                      <Text style={styles.exerciseChipText}>
                        {exercise.exerciseName} · {exercise.targetSets} 组 ·{" "}
                        {exercise.targetReps ?? "未设定"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            <Pressable
              onPress={() => {
                void handleApplyTemplate(template.id);
              }}
              style={({ pressed }) => [
                styles.applyButton,
                pressed ? styles.cardPressed : undefined,
              ]}
            >
              <Text style={styles.applyButtonText}>使用此模板</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ScreenContainer
      onBackPress={() => navigation.goBack()}
      subtitle="从经典模板快速生成计划，也能查看你保存的自定义模板。"
      title="训练模板"
    >
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>正在加载模板...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>内置模板</Text>
            <Text style={styles.sectionSubtitle}>
              经典分化和周期模板，适合快速开新计划。
            </Text>
            {builtInTemplates.map(renderTemplateCard)}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>我的模板</Text>
            <Text style={styles.sectionSubtitle}>
              在计划编辑页可将当前计划另存为模板，方便复用和分享。
            </Text>
            {userTemplates.length > 0 ? (
              userTemplates.map(renderTemplateCard)
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>还没有自定义模板</Text>
                <Text style={styles.emptySubtitle}>
                  打开任意计划，在编辑页点击“另存为模板”即可加入这里。
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  loadingState: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  templateCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  templateHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  templateHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  templateName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  templateDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  badge: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  previewBody: {
    gap: spacing.md,
  },
  dayCard: {
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  dayTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  exerciseWrap: {
    gap: spacing.sm,
  },
  exerciseChip: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  exerciseChipText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  applyButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  applyButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  cardPressed: {
    opacity: 0.84,
  },
});

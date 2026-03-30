import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  VictoryAxis,
  VictoryChart,
  VictoryLine,
  VictoryScatter,
  VictoryTheme,
} from "victory-native";

import { InfoCard, ScreenContainer } from "../components";
import {
  equipmentLabels,
  getLocalizedValue,
  muscleGroupLabels,
} from "../constants/exerciseMetadata";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import { database } from "../database";
import type { Exercise } from "../models";
import type { RootStackParamList } from "../navigation/types";
import {
  loadExerciseInsights,
  updateExerciseNotes,
  type ExerciseHistoryInsights,
} from "../services/ExerciseLibraryService";
import { useSettingsStore } from "../store/settingsStore";

type ExerciseDetailScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "ExerciseDetail"
>;

export const ExerciseDetailScreen = ({
  navigation,
  route,
}: ExerciseDetailScreenProps) => {
  const { width } = useWindowDimensions();
  const language = useSettingsStore((state) => state.language);
  const { exerciseId } = route.params;
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [insights, setInsights] = useState<ExerciseHistoryInsights | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const loadDetail = useCallback(async () => {
    const [exerciseRecord, summary] = await Promise.all([
      database.get<Exercise>("exercises").find(exerciseId),
      loadExerciseInsights(database, exerciseId),
    ]);

    setExercise(exerciseRecord);
    setInsights(summary);
    setNoteDraft(exerciseRecord.notes ?? "");
  }, [exerciseId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useFocusEffect(
    useCallback(() => {
      void loadDetail();
    }, [loadDetail]),
  );

  const handleSaveNotes = async () => {
    if (!exercise) {
      return;
    }

    try {
      setSavingNote(true);
      await updateExerciseNotes(database, exercise.id, noteDraft);
      await loadDetail();
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "请稍后再试");
    } finally {
      setSavingNote(false);
    }
  };

  if (!exercise || !insights) {
    return (
      <ScreenContainer
        onBackPress={() => navigation.goBack()}
        title="动作详情"
        subtitle="加载中..."
      />
    );
  }

  return (
    <ScreenContainer
      headerRight={
        exercise.isCustom ? (
          <Pressable
            onPress={() => navigation.navigate("CreateExercise", { exerciseId: exercise.id })}
            style={({ pressed }) => [
              styles.editButton,
              pressed ? styles.editButtonPressed : undefined,
            ]}
          >
            <Text style={styles.editButtonText}>编辑</Text>
          </Pressable>
        ) : undefined
      }
      onBackPress={() => navigation.goBack()}
      title={exercise.name}
      subtitle={exercise.nameEn ?? "预设动作"}
    >
      <View style={styles.metaCard}>
        <View style={styles.tags}>
          {exercise.primaryMuscles.map((muscle) => (
            <View key={muscle} style={styles.tag}>
              <Text style={styles.tagText}>
                {getLocalizedValue(muscleGroupLabels, muscle, language)}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.equipmentText}>
          器械：{getLocalizedValue(equipmentLabels, exercise.equipment, language)}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        <InfoCard
          description={insights.latestSession ? `${insights.latestSession.totalSets} 组` : "暂无历史记录"}
          title="最近一次训练"
          value={
            insights.latestSession
              ? `${insights.latestSession.volume.toFixed(0)}`
              : "--"
          }
        />
        <InfoCard
          description={
            insights.personalBest
              ? `${insights.personalBest.weight} x ${insights.personalBest.reps}`
              : "暂无历史最佳"
          }
          title="历史最佳"
          value={
            insights.personalBest
              ? `${insights.personalBest.estimatedOneRm.toFixed(1)}kg`
              : "--"
          }
        />
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>历史容量趋势</Text>
        {insights.trend.length > 0 ? (
          <VictoryChart
            domainPadding={{ x: 18, y: 20 }}
            height={240}
            theme={VictoryTheme.material}
            width={Math.max(width - 48, 280)}
          >
            <VictoryAxis style={axisStyle} />
            <VictoryAxis dependentAxis style={axisStyle} />
            <VictoryLine
              data={insights.trend}
              style={{
                data: {
                  stroke: colors.chart,
                  strokeWidth: 3,
                },
              }}
              x="x"
              y="y"
            />
            <VictoryScatter
              data={insights.trend}
              size={4}
              style={{
                data: {
                  fill: colors.primarySoft,
                },
              }}
              x="x"
              y="y"
            />
          </VictoryChart>
        ) : (
          <Text style={styles.emptyText}>当前动作还没有历史训练数据。</Text>
        )}
        <Pressable
          onPress={() =>
            navigation.navigate("ExerciseAnalytics", {
              exerciseId: exercise.id,
            })
          }
          style={({ pressed }) => [
            styles.analyticsButton,
            pressed ? styles.analyticsButtonPressed : undefined,
          ]}
        >
          <Text style={styles.analyticsButtonText}>查看完整动作分析</Text>
        </Pressable>
      </View>

      <View style={styles.notesCard}>
        <Text style={styles.sectionTitle}>用户备注</Text>
        <TextInput
          multiline
          numberOfLines={5}
          onChangeText={setNoteDraft}
          placeholder="记录姿势提示、疼痛提醒、替代动作等"
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          style={styles.notesInput}
          textAlignVertical="top"
          value={noteDraft}
        />
        <Pressable
          onPress={handleSaveNotes}
          style={({ pressed }) => [
            styles.saveButton,
            pressed ? styles.saveButtonPressed : undefined,
          ]}
        >
          <Text style={styles.saveButtonText}>{savingNote ? "保存中..." : "保存备注"}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
};

const axisStyle = {
  axis: { stroke: colors.border },
  grid: { stroke: colors.border, strokeDasharray: "4,6" },
  tickLabels: { fill: colors.textMuted, fontSize: 11 },
};

const styles = StyleSheet.create({
  editButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    minWidth: 52,
    paddingHorizontal: spacing.sm,
  },
  editButtonPressed: {
    opacity: 0.82,
  },
  editButtonText: {
    color: colors.primarySoft,
    fontSize: 13,
    fontWeight: "700",
  },
  metaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  tag: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  tagText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  equipmentText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  metricsRow: {
    gap: spacing.md,
  },
  chartCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  analyticsButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: "center",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  analyticsButtonPressed: {
    opacity: 0.82,
  },
  analyticsButtonText: {
    color: colors.primarySoft,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionTitle: {
    alignSelf: "flex-start",
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    paddingBottom: spacing.md,
  },
  notesCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  notesInput: {
    color: colors.text,
    fontSize: 15,
    minHeight: 120,
    padding: 0,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
  },
  saveButtonPressed: {
    opacity: 0.88,
  },
  saveButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
});

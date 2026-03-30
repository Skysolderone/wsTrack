import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Flag,
  Target,
} from "lucide-react-native";
import { Q } from "@nozbe/watermelondb";
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryLine,
  VictoryScatter,
  VictoryTheme,
} from "victory-native";

import {
  ExercisePickerModal,
  InfoCard,
  MuscleHeatmap,
  MuscleRadarChart,
  OptionChip,
  type MuscleRadarDatum,
} from "../components";
import {
  getLocalizedValue,
  muscleGroupLabels,
} from "../constants/exerciseMetadata";
import { colors } from "../constants/colors";
import { MuscleGroup } from "../constants/enums";
import { radii, spacing } from "../constants/sizes";
import { database } from "../database";
import type { Exercise } from "../models";
import type { RootStackParamList } from "../navigation/types";
import {
  getExerciseVolumeHistory,
  getStreak,
  getWeeklyVolume,
  getWeeklyVolumeComparison,
  getWeeklyWorkoutCount,
  type ExerciseHistoryPoint,
  type WeeklyVolumeComparison,
  type WeeklyVolumePoint,
} from "../services/AnalyticsService";
import { getActiveChallenges, type ChallengeItem } from "../services/ChallengeService";
import {
  getMuscleFrequency,
  getMuscleVolumeDistribution,
  getUntrainedMuscles,
  type MuscleFrequencyPoint,
  type MuscleVolumePoint,
} from "../services/MuscleAnalyticsService";
import {
  onBodyWeightChange,
  readBodyWeight,
  type HealthBodyWeightSample,
} from "../services/HealthKitService";
import {
  generateMonthlyReport,
  generateWeeklyReport,
} from "../services/ReportService";
import {
  checkFatigueRisk,
  detectPlateau,
  type FatigueRiskWarning,
  type PlateauDetection,
} from "../services/ProgressionService";
import { useSettingsStore } from "../store/settingsStore";
import { startOfMonth, startOfWeek } from "../utils";

const axisStyle = {
  axis: { stroke: colors.border },
  grid: { stroke: colors.border, strokeDasharray: "4,6" },
  tickLabels: { fill: colors.textMuted, fontSize: 11 },
};

const formatPercentChange = (value: number | null): string =>
  value === null ? "新记录周期" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

const formatSignedVolume = (value: number): string =>
  `${value > 0 ? "+" : ""}${Math.round(value)}`;

const MUSCLE_RANGE_OPTIONS = [7, 30, 90] as const;
const UNTRAINED_MUSCLE_DAYS = 14;

const buildRadarData = (distribution: MuscleVolumePoint[]): MuscleRadarDatum[] => {
  const lookup = new Map(distribution.map((item) => [item.muscle, item.ratio]));

  return [
    { axis: "Chest", value: lookup.get(MuscleGroup.Chest) ?? 0 },
    { axis: "Back", value: lookup.get(MuscleGroup.Back) ?? 0 },
    { axis: "Shoulders", value: lookup.get(MuscleGroup.Shoulders) ?? 0 },
    {
      axis: "Arms",
      value:
        (lookup.get(MuscleGroup.Biceps) ?? 0) +
        (lookup.get(MuscleGroup.Triceps) ?? 0) +
        (lookup.get(MuscleGroup.Forearms) ?? 0),
    },
    { axis: "Core", value: lookup.get(MuscleGroup.Abs) ?? 0 },
    {
      axis: "Legs",
      value:
        (lookup.get(MuscleGroup.Glutes) ?? 0) +
        (lookup.get(MuscleGroup.Quads) ?? 0) +
        (lookup.get(MuscleGroup.Hamstrings) ?? 0) +
        (lookup.get(MuscleGroup.Calves) ?? 0),
    },
  ];
};

export const AnalyticsScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const healthKitEnabled = useSettingsStore((state) => state.healthKitEnabled);
  const language = useSettingsStore((state) => state.language);
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [muscleRangeDays, setMuscleRangeDays] =
    useState<(typeof MUSCLE_RANGE_OPTIONS)[number]>(30);
  const [weeklyVolume, setWeeklyVolume] = useState<WeeklyVolumePoint[]>([]);
  const [weeklyWorkoutCount, setWeeklyWorkoutCountState] = useState(0);
  const [streak, setStreakState] = useState(0);
  const [comparison, setComparison] = useState<WeeklyVolumeComparison | null>(null);
  const [fatigueRisk, setFatigueRisk] = useState<FatigueRiskWarning | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [selectedExerciseName, setSelectedExerciseName] = useState("选择动作");
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistoryPoint[]>([]);
  const [plateauWarning, setPlateauWarning] = useState<PlateauDetection | null>(null);
  const [muscleFrequency, setMuscleFrequency] = useState<MuscleFrequencyPoint[]>([]);
  const [muscleVolumeDistribution, setMuscleVolumeDistribution] = useState<MuscleVolumePoint[]>(
    [],
  );
  const [untrainedMuscles, setUntrainedMuscles] = useState<MuscleGroup[]>([]);
  const [activeChallenges, setActiveChallenges] = useState<ChallengeItem[]>([]);
  const [bodyWeightSamples, setBodyWeightSamples] = useState<HealthBodyWeightSample[]>([]);
  const [loadingExerciseHistory, setLoadingExerciseHistory] = useState(false);
  const [exportingReport, setExportingReport] = useState<"month" | "week" | null>(null);

  const chartWidth = Math.max(width - 48, 280);

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    const [
      weeklyVolumePoints,
      workoutCount,
      streakValue,
      comparisonValue,
      fatigueWarning,
      challenges,
      exercises,
    ] =
      await Promise.all([
        getWeeklyVolume(8),
        getWeeklyWorkoutCount(),
        getStreak(),
        getWeeklyVolumeComparison(),
        checkFatigueRisk(),
        getActiveChallenges(),
        database
          .get<Exercise>("exercises")
          .query(Q.where("is_archived", false), Q.sortBy("sort_order", Q.asc))
          .fetch(),
      ]);

    setWeeklyVolume(weeklyVolumePoints);
    setWeeklyWorkoutCountState(workoutCount);
    setStreakState(streakValue);
    setComparison(comparisonValue);
    setFatigueRisk(fatigueWarning);
    setActiveChallenges(challenges);
    setSelectedExerciseId((current) =>
      current && exercises.some((exercise) => exercise.id === current)
        ? current
        : exercises[0]?.id ?? null,
    );
    setLoading(false);
  }, []);

  const loadExerciseHistory = useCallback(async () => {
    if (!selectedExerciseId) {
      setExerciseHistory([]);
      setSelectedExerciseName("选择动作");
      return;
    }

    setLoadingExerciseHistory(true);

    const [exerciseRecord, history, plateau] = await Promise.all([
      database.get<Exercise>("exercises").find(selectedExerciseId),
      getExerciseVolumeHistory(selectedExerciseId, 16),
      detectPlateau(selectedExerciseId),
    ]);

    setSelectedExerciseName(exerciseRecord.name);
    setExerciseHistory(history);
    setPlateauWarning(plateau);
    setLoadingExerciseHistory(false);
  }, [selectedExerciseId]);

  const loadMuscleAnalytics = useCallback(async () => {
    const [distribution, frequency, untrained] = await Promise.all([
      getMuscleVolumeDistribution(muscleRangeDays),
      getMuscleFrequency(muscleRangeDays),
      getUntrainedMuscles(UNTRAINED_MUSCLE_DAYS),
    ]);

    setMuscleVolumeDistribution(distribution);
    setMuscleFrequency(frequency);
    setUntrainedMuscles(untrained);
  }, [muscleRangeDays]);

  const loadBodyWeight = useCallback(async () => {
    if (!healthKitEnabled) {
      setBodyWeightSamples([]);
      return;
    }

    try {
      const samples = await readBodyWeight({
        endDate: new Date(),
        startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      });
      setBodyWeightSamples(samples);
    } catch {
      setBodyWeightSamples([]);
    }
  }, [healthKitEnabled]);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([loadDashboard(), loadMuscleAnalytics(), loadBodyWeight()]);
    }, [loadBodyWeight, loadDashboard, loadMuscleAnalytics]),
  );

  useEffect(() => {
    void loadExerciseHistory();
  }, [loadExerciseHistory]);

  useEffect(() => {
    if (!healthKitEnabled) {
      return;
    }

    return onBodyWeightChange((samples) => {
      setBodyWeightSamples(samples);
    });
  }, [healthKitEnabled]);

  const weeklyBarData = useMemo(
    () =>
      weeklyVolume.map((point, index) => ({
        label: point.label,
        x: index + 1,
        y: point.totalVolume,
      })),
    [weeklyVolume],
  );

  const exerciseLineData = useMemo(
    () =>
      [...exerciseHistory]
        .reverse()
        .map((point, index) => ({
          label: point.label,
          x: index + 1,
          y: point.value,
        })),
    [exerciseHistory],
  );

  const muscleHeatmapData = useMemo(
    () =>
      muscleVolumeDistribution.map((item) => ({
        frequency:
          muscleFrequency.find((frequencyItem) => frequencyItem.muscle === item.muscle)?.sessions ??
          0,
        muscle: item.muscle,
        volume: item.totalVolume,
      })),
    [muscleFrequency, muscleVolumeDistribution],
  );

  const muscleRadarData = useMemo(
    () => buildRadarData(muscleVolumeDistribution),
    [muscleVolumeDistribution],
  );

  const bodyWeightLineData = useMemo(
    () =>
      bodyWeightSamples.map((sample, index) => ({
        label: `${new Date(sample.startDate).getMonth() + 1}/${new Date(sample.startDate).getDate()}`,
        x: index + 1,
        y: sample.value,
      })),
    [bodyWeightSamples],
  );

  const isComparisonPositive = (comparison?.delta ?? 0) >= 0;

  const handleExportReport = async (mode: "month" | "week") => {
    try {
      setExportingReport(mode);
      const filePath =
        mode === "week"
          ? await generateWeeklyReport(startOfWeek(new Date()))
          : await generateMonthlyReport(startOfMonth(new Date()));

      await Share.share({
        message: mode === "week" ? "wsTrack 周训练报告" : "wsTrack 月训练报告",
        title: mode === "week" ? "导出周报 PDF" : "导出月报 PDF",
        url: `file://${filePath}`,
      });
    } catch (error) {
      Alert.alert("导出失败", error instanceof Error ? error.message : "请稍后再试");
    } finally {
      setExportingReport(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.container}
        testID="analytics-screen"
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>分析</Text>
              <Text style={styles.subtitle}>
                用本周训练频率、近 8 周容量和单动作趋势快速判断训练状态。
              </Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate("Challenges")}
              style={({ pressed }) => [
                styles.challengeNavButton,
                pressed ? styles.cardPressed : undefined,
              ]}
            >
              <Flag color={colors.primarySoft} size={16} strokeWidth={2.2} />
              <Text style={styles.challengeNavText}>挑战</Text>
            </Pressable>
          </View>
          <View style={styles.exportRow}>
            <Pressable
              onPress={() => {
                void handleExportReport("week");
              }}
              style={({ pressed }) => [
                styles.exportButton,
                pressed ? styles.cardPressed : undefined,
              ]}
            >
              <Text style={styles.exportButtonText}>
                {exportingReport === "week" ? "导出中..." : "周报 PDF"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void handleExportReport("month");
              }}
              style={({ pressed }) => [
                styles.exportButton,
                pressed ? styles.cardPressed : undefined,
              ]}
            >
              <Text style={styles.exportButtonText}>
                {exportingReport === "month" ? "导出中..." : "月报 PDF"}
              </Text>
            </Pressable>
          </View>
        </View>

        {fatigueRisk ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>疲劳风险提醒</Text>
            <Text style={styles.warningText}>{fatigueRisk.message}</Text>
          </View>
        ) : null}

        {activeChallenges.length > 0 ? (
          <View style={styles.challengePreviewCard}>
            <View style={styles.challengePreviewHeader}>
              <Text style={styles.challengePreviewTitle}>进行中的挑战</Text>
              <Text style={styles.challengePreviewCount}>{activeChallenges.length} 个</Text>
            </View>
            {activeChallenges.slice(0, 2).map((challenge) => (
              <View key={challenge.id} style={styles.challengePreviewRow}>
                <Text style={styles.challengePreviewLabel}>
                  {challenge.type === "volume"
                    ? "训练容量"
                    : challenge.type === "frequency"
                      ? "训练频率"
                      : challenge.type === "time_slot"
                        ? "固定时段"
                        : "有氧时长"}
                </Text>
                <Text style={styles.challengePreviewValue}>{challenge.progressPercent}%</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.metricsGrid}>
          <View style={styles.metricCardWrap}>
            <InfoCard
              description="本周已完成训练次数"
              testID="analytics-weekly-workout-count-card"
              title="本周频率"
              value={`${weeklyWorkoutCount}`}
              valueTestID="analytics-weekly-workout-count-value"
            />
          </View>
          <View style={styles.metricCardWrap}>
            <InfoCard
              description="连续训练天数"
              testID="analytics-streak-card"
              title="Streak"
              value={`${streak}`}
              valueTestID="analytics-streak-value"
            />
          </View>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCardWrap}>
            <InfoCard
              description={`上周 ${Math.round(comparison?.previousWeekVolume ?? 0)}`}
              testID="analytics-weekly-volume-card"
              title="本周总容量"
              value={`${Math.round(comparison?.thisWeekVolume ?? 0)}`}
              valueTestID="analytics-weekly-volume-value"
            />
          </View>
          <View style={styles.metricCardWrap}>
            <View style={styles.comparisonCard}>
              <View style={styles.comparisonHeader}>
                <Text style={styles.comparisonTitle}>周容量对比</Text>
                {isComparisonPositive ? (
                  <ArrowUpRight color={colors.success} size={18} strokeWidth={2.3} />
                ) : (
                  <ArrowDownRight color={colors.danger} size={18} strokeWidth={2.3} />
                )}
              </View>
              <Text
                style={[
                  styles.comparisonValue,
                  isComparisonPositive ? styles.positiveText : styles.negativeText,
                ]}
              >
                {formatSignedVolume(comparison?.delta ?? 0)}
              </Text>
              <Text style={styles.comparisonDescription}>
                {formatPercentChange(comparison?.percentChange ?? null)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.chartCopy}>
              <Text style={styles.chartTitle}>近 8 周总容量</Text>
              <Text style={styles.chartSubtitle}>按周聚合，观察训练负荷爬升趋势。</Text>
            </View>
          </View>
          {weeklyBarData.length > 0 ? (
            <VictoryChart
              domainPadding={{ x: 18, y: 24 }}
              height={260}
              theme={VictoryTheme.material}
              width={chartWidth}
            >
              <VictoryAxis
                style={axisStyle}
                tickFormat={(tick) => weeklyBarData[Math.max(0, Number(tick) - 1)]?.label ?? ""}
                tickValues={weeklyBarData.map((point) => point.x)}
              />
              <VictoryAxis dependentAxis style={axisStyle} />
              <VictoryBar
                barWidth={20}
                cornerRadius={{ top: 6 }}
                data={weeklyBarData}
                style={{
                  data: {
                    fill: colors.primary,
                  },
                }}
              />
            </VictoryChart>
          ) : (
            <Text style={styles.emptyText}>还没有可用于分析的已完成训练。</Text>
          )}
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.chartCopy}>
              <Text style={styles.chartTitle}>单动作容量趋势</Text>
              <Text style={styles.chartSubtitle}>当前动作：{selectedExerciseName}</Text>
            </View>
            <Pressable
              onPress={() => setExercisePickerVisible(true)}
              style={({ pressed }) => [
                styles.selectButton,
                pressed ? styles.cardPressed : undefined,
              ]}
            >
              <Target color={colors.primarySoft} size={16} strokeWidth={2.2} />
              <Text style={styles.selectButtonText}>选择动作</Text>
            </Pressable>
          </View>

          {selectedExerciseId ? (
            <>
              {loadingExerciseHistory ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : exerciseLineData.length > 0 ? (
                <VictoryChart
                  domainPadding={{ x: 18, y: 24 }}
                  height={260}
                  theme={VictoryTheme.material}
                  width={chartWidth}
                >
                  <VictoryAxis
                    style={axisStyle}
                    tickFormat={(tick) =>
                      exerciseLineData[Math.max(0, Number(tick) - 1)]?.label ?? ""
                    }
                    tickValues={exerciseLineData.map((point) => point.x)}
                  />
                  <VictoryAxis dependentAxis style={axisStyle} />
                  <VictoryLine
                    data={exerciseLineData}
                    style={{
                      data: {
                        stroke: colors.chart,
                        strokeWidth: 3,
                      },
                    }}
                  />
                  <VictoryScatter
                    data={exerciseLineData}
                    size={4}
                    style={{
                      data: {
                        fill: colors.primarySoft,
                      },
                    }}
                  />
                </VictoryChart>
              ) : (
                <Text style={styles.emptyText}>该动作还没有足够的历史数据。</Text>
              )}
              {plateauWarning ? (
                <View style={styles.warningCardInline}>
                  <Text style={styles.warningTitle}>平台期提醒</Text>
                  <Text style={styles.warningText}>{plateauWarning.message}</Text>
                </View>
              ) : null}
              <Pressable
                onPress={() =>
                  navigation.navigate("ExerciseAnalytics", {
                    exerciseId: selectedExerciseId,
                  })
                }
                style={({ pressed }) => [
                  styles.analyticsLink,
                  pressed ? styles.cardPressed : undefined,
                ]}
              >
                <Text style={styles.analyticsLinkText}>查看完整动作分析</Text>
                <ChevronRight color={colors.primarySoft} size={18} strokeWidth={2.2} />
              </Pressable>
            </>
          ) : (
            <Text style={styles.emptyText}>先选择一个动作，再查看容量趋势。</Text>
          )}
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.chartCopy}>
              <Text style={styles.chartTitle}>肌群分析</Text>
              <Text style={styles.chartSubtitle}>
                结合容量分布和训练频次，观察近阶段训练覆盖是否均衡。
              </Text>
            </View>
          </View>

          <View style={styles.rangeChipRow}>
            {MUSCLE_RANGE_OPTIONS.map((days) => (
              <OptionChip
                key={days}
                label={`${days}天`}
                onPress={() => setMuscleRangeDays(days)}
                selected={muscleRangeDays === days}
              />
            ))}
          </View>

          <MuscleHeatmap data={muscleHeatmapData} language={language} />
          <MuscleRadarChart data={muscleRadarData} />

          <View style={styles.untrainedBlock}>
            <Text style={styles.untrainedTitle}>
              超过 {UNTRAINED_MUSCLE_DAYS} 天未训练的肌群
            </Text>
            <View style={styles.untrainedWrap}>
              {untrainedMuscles.length > 0 ? (
                untrainedMuscles.map((muscle) => (
                  <View key={muscle} style={styles.untrainedChip}>
                    <Text style={styles.untrainedChipText}>
                      {getLocalizedValue(muscleGroupLabels, muscle, language)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.chartSubtitle}>近期主要肌群都有覆盖。</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.chartCopy}>
              <Text style={styles.chartTitle}>体重趋势</Text>
              <Text style={styles.chartSubtitle}>
                {healthKitEnabled
                  ? "最近 90 天的体重记录，来源于 Apple Health。"
                  : "在设置中开启 HealthKit 后可查看体重趋势。"}
              </Text>
            </View>
          </View>

          {!healthKitEnabled ? (
            <Text style={styles.emptyText}>尚未启用 HealthKit 体重同步。</Text>
          ) : bodyWeightLineData.length > 0 ? (
            <VictoryChart
              domainPadding={{ x: 18, y: 16 }}
              height={240}
              theme={VictoryTheme.material}
              width={chartWidth}
            >
              <VictoryAxis
                style={axisStyle}
                tickFormat={(tick) =>
                  bodyWeightLineData[Math.max(0, Number(tick) - 1)]?.label ?? ""
                }
                tickValues={bodyWeightLineData.map((point) => point.x)}
              />
              <VictoryAxis dependentAxis style={axisStyle} />
              <VictoryLine
                data={bodyWeightLineData}
                style={{
                  data: {
                    stroke: colors.success,
                    strokeWidth: 3,
                  },
                }}
              />
              <VictoryScatter
                data={bodyWeightLineData}
                size={4}
                style={{
                  data: {
                    fill: colors.success,
                  },
                }}
              />
            </VictoryChart>
          ) : (
            <Text style={styles.emptyText}>最近 90 天没有读取到体重样本。</Text>
          )}
        </View>
      </ScrollView>

      <ExercisePickerModal
        initialSelectedIds={selectedExerciseId ? [selectedExerciseId] : []}
        multiple={false}
        onClose={() => setExercisePickerVisible(false)}
        onSubmit={(exerciseIds) => {
          setSelectedExerciseId(exerciseIds[0] ?? null);
          setExercisePickerVisible(false);
        }}
        title="选择动作查看趋势"
        visible={exercisePickerVisible}
      />
    </>
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
  loadingState: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
  header: {
    gap: spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  exportRow: {
    flexDirection: "row",
    gap: spacing.sm,
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
  challengeNavButton: {
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
  challengeNavText: {
    color: colors.primarySoft,
    fontSize: 13,
    fontWeight: "800",
  },
  exportButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  exportButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  warningCard: {
    backgroundColor: "rgba(253, 203, 110, 0.12)",
    borderColor: "rgba(253, 203, 110, 0.24)",
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  warningCardInline: {
    alignSelf: "stretch",
    backgroundColor: "rgba(253, 203, 110, 0.12)",
    borderColor: "rgba(253, 203, 110, 0.24)",
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    marginHorizontal: spacing.sm,
    padding: spacing.md,
  },
  warningTitle: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: "800",
  },
  warningText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  challengePreviewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  challengePreviewHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  challengePreviewTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  challengePreviewCount: {
    color: colors.primarySoft,
    fontSize: 13,
    fontWeight: "700",
  },
  challengePreviewRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  challengePreviewLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  challengePreviewValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  metricCardWrap: {
    flex: 1,
  },
  comparisonCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  comparisonHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  comparisonTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  comparisonValue: {
    fontSize: 28,
    fontWeight: "800",
  },
  comparisonDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  positiveText: {
    color: colors.success,
  },
  negativeText: {
    color: colors.danger,
  },
  chartCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  rangeChipRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  chartHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    width: "100%",
  },
  chartCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  chartTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  chartSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  selectButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectButtonText: {
    color: colors.primarySoft,
    fontSize: 13,
    fontWeight: "700",
  },
  analyticsLink: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  analyticsLinkText: {
    color: colors.primarySoft,
    fontSize: 14,
    fontWeight: "700",
  },
  untrainedBlock: {
    alignSelf: "stretch",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  untrainedTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  untrainedWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  untrainedChip: {
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  untrainedChipText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: "700",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlign: "center",
  },
  cardPressed: {
    opacity: 0.82,
  },
});

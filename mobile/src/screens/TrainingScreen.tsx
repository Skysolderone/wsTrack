import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { InfoCard, ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import { useSettingsStore } from "../store/settingsStore";
import { calculateVolume } from "../utils";

const sampleSets = [
  { weight: 20, reps: 10, isWarmup: true },
  { weight: 60, reps: 8, isWarmup: false },
  { weight: 70, reps: 8, isWarmup: false },
  { weight: 72.5, reps: 6, isWarmup: false },
];

const todaysExercises = [
  "杠铃卧推 4 x 6-8",
  "高位下拉 4 x 8-10",
  "推举 3 x 6-8",
];

export const TrainingScreen = () => {
  const { t } = useTranslation();
  const weightUnit = useSettingsStore((state) => state.weightUnit);
  const workingVolume = calculateVolume(sampleSets);

  return (
    <ScreenContainer
      title={t("screens.trainingTitle")}
      subtitle={t("screens.trainingSubtitle")}
    >
      <View style={styles.metricsRow}>
        <InfoCard
          title={t("common.workingVolume")}
          value={`${workingVolume} ${weightUnit}`}
          description={`${sampleSets.filter((set) => !set.isWarmup).length} ${t("common.sets")}`}
        />
        <InfoCard
          title={t("common.offlineReady")}
          value="SQLite"
          description="WatermelonDB local-first storage"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("screens.trainingTitle")}</Text>
        {todaysExercises.map((exercise) => (
          <View key={exercise} style={styles.exerciseRow}>
            <Text style={styles.exerciseName}>{exercise}</Text>
            <Text style={styles.exerciseMeta}>Rest 90s</Text>
          </View>
        ))}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  metricsRow: {
    gap: spacing.md,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  exerciseRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  exerciseName: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  exerciseMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
});

import { forwardRef } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import ViewShot from "react-native-view-shot";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";

export type WorkoutShareTemplate = "gradient_blue" | "minimal_black" | "sport_energy";

export interface WorkoutShareExerciseSummary {
  name: string;
  prCount: number;
  setCount: number;
  volume: number;
}

export interface WorkoutShareData {
  dateLabel: string;
  durationLabel: string;
  exercises: WorkoutShareExerciseSummary[];
  prItems: string[];
  title: string;
  totalVolume: number;
}

interface WorkoutShareCardProps {
  data: WorkoutShareData;
  template: WorkoutShareTemplate;
}

const templateCopy: Record<
  WorkoutShareTemplate,
  {
    accent: string;
    background: string;
    chipBackground: string;
    overlay: string;
    title: string;
  }
> = {
  gradient_blue: {
    accent: "#4DD0E1",
    background: "#12263F",
    chipBackground: "rgba(77, 208, 225, 0.14)",
    overlay: "rgba(77, 208, 225, 0.2)",
    title: "Gradient Blue",
  },
  minimal_black: {
    accent: "#F5F6FA",
    background: "#050509",
    chipBackground: "rgba(255, 255, 255, 0.06)",
    overlay: "rgba(255, 255, 255, 0.08)",
    title: "Minimal Black",
  },
  sport_energy: {
    accent: "#FDCB6E",
    background: "#1A1021",
    chipBackground: "rgba(253, 203, 110, 0.16)",
    overlay: "rgba(108, 92, 231, 0.18)",
    title: "Sport Energy",
  },
};

export const shareCapturedWorkoutCard = async (uri: string): Promise<void> => {
  await Share.share({
    message: "来自 wsTrack 的训练截图",
    url: uri,
  });
};

export const WorkoutShareCard = forwardRef<ViewShot, WorkoutShareCardProps>(
  ({ data, template }, ref) => {
    const theme = templateCopy[template];
    const previewExercises = data.exercises.slice(0, 5);

    return (
      <ViewShot
        options={{
          fileName: `wstrack-workout-${template}`,
          format: "jpg",
          quality: 0.95,
        }}
        ref={ref}
        style={[
          styles.captureWrap,
          {
            backgroundColor: theme.background,
          },
        ]}
      >
        <View
          style={[
            styles.overlayCircle,
            styles.overlayCircleLarge,
            {
              backgroundColor: theme.overlay,
            },
          ]}
        />
        <View
          style={[
            styles.overlayCircle,
            styles.overlayCircleSmall,
            {
              backgroundColor: theme.chipBackground,
            },
          ]}
        />

        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text style={[styles.brand, { color: theme.accent }]}>wsTrack</Text>
            <Text style={styles.templateLabel}>{theme.title}</Text>
          </View>
          <Text style={styles.title}>{data.title}</Text>
          <Text style={styles.subtitle}>{data.dateLabel}</Text>
        </View>

        <View style={styles.metricRow}>
          <View style={[styles.metricCard, { backgroundColor: theme.chipBackground }]}>
            <Text style={styles.metricLabel}>时长</Text>
            <Text style={styles.metricValue}>{data.durationLabel}</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: theme.chipBackground }]}>
            <Text style={styles.metricLabel}>容量</Text>
            <Text style={styles.metricValue}>{Math.round(data.totalVolume)}</Text>
          </View>
        </View>

        <View style={styles.exerciseList}>
          {previewExercises.map((exercise) => (
            <View
              key={`${exercise.name}-${exercise.volume}`}
              style={[styles.exerciseRow, { borderColor: theme.overlay }]}
            >
              <View style={styles.exerciseCopy}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                <Text style={styles.exerciseMeta}>
                  {exercise.setCount} 组 · 容量 {Math.round(exercise.volume)}
                </Text>
              </View>
              {exercise.prCount > 0 ? (
                <View style={[styles.prChip, { backgroundColor: theme.chipBackground }]}>
                  <Text style={[styles.prChipText, { color: theme.accent }]}>
                    PR x {exercise.prCount}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>本次 PR</Text>
          <Text style={styles.footerText}>
            {data.prItems.length > 0 ? data.prItems.slice(0, 3).join(" · ") : "稳定完成训练"}
          </Text>
        </View>
      </ViewShot>
    );
  },
);

WorkoutShareCard.displayName = "WorkoutShareCard";

const styles = StyleSheet.create({
  brand: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  captureWrap: {
    borderRadius: radii.lg,
    gap: spacing.lg,
    minHeight: 580,
    overflow: "hidden",
    padding: spacing.xl,
    width: 360,
  },
  exerciseCopy: {
    flex: 1,
    gap: 4,
  },
  exerciseList: {
    gap: spacing.sm,
  },
  exerciseMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  exerciseRow: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  footer: {
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    borderTopWidth: 1,
    gap: spacing.xs,
    marginTop: "auto",
    paddingTop: spacing.md,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  footerTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  header: {
    gap: spacing.sm,
  },
  metricCard: {
    borderRadius: radii.md,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  metricRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
  },
  overlayCircle: {
    borderRadius: 999,
    position: "absolute",
  },
  overlayCircleLarge: {
    height: 220,
    right: -60,
    top: -40,
    width: 220,
  },
  overlayCircleSmall: {
    bottom: 120,
    height: 150,
    left: -50,
    width: 150,
  },
  prChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  prChipText: {
    fontSize: 11,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  templateLabel: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 34,
  },
});

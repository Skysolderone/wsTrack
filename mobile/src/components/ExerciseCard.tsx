import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  equipmentLabels,
  getLocalizedValue,
  muscleGroupLabels,
  type SupportedLanguage,
} from "../constants/exerciseMetadata";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import type { Exercise } from "../models";

interface ExerciseCardProps {
  exercise: Exercise;
  language: SupportedLanguage;
  onLongPress?: () => void;
  onPress: () => void;
  selected?: boolean;
  trailing?: ReactNode;
}

const buildEquipmentAbbreviation = (
  exercise: Exercise,
  language: SupportedLanguage,
): string => {
  const label = getLocalizedValue(equipmentLabels, exercise.equipment, language);

  if (language === "zh") {
    return label.slice(0, 2);
  }

  return label
    .split(" ")
    .map((segment) => segment[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

export const ExerciseCard = memo(
  ({
    exercise,
    language,
    onLongPress,
    onPress,
    selected = false,
    trailing,
  }: ExerciseCardProps) => (
    <Pressable
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected ? styles.cardSelected : undefined,
        pressed ? styles.cardPressed : undefined,
      ]}
    >
      <View style={styles.leading}>
        <View style={styles.equipmentBadge}>
          <Text style={styles.equipmentText}>
            {buildEquipmentAbbreviation(exercise, language)}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {exercise.name}
          </Text>
          {exercise.isCustom ? <Text style={styles.customBadge}>自定义</Text> : null}
        </View>
        {exercise.nameEn ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {exercise.nameEn}
          </Text>
        ) : null}
        <View style={styles.tags}>
          {exercise.primaryMuscles.slice(0, 3).map((muscle) => (
            <View key={`${exercise.id}-${muscle}`} style={styles.tag}>
              <Text style={styles.tagText}>
                {getLocalizedValue(muscleGroupLabels, muscle, language)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Pressable>
  ),
);

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  cardSelected: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.primary,
  },
  leading: {
    justifyContent: "center",
  },
  equipmentBadge: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  equipmentText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  trailing: {
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
  },
  customBadge: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
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
});

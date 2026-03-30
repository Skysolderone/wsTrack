import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  allMuscleGroups,
  getLocalizedValue,
  muscleGroupLabels,
  type SupportedLanguage,
} from "../constants/exerciseMetadata";
import { colors } from "../constants/colors";
import type { MuscleGroup } from "../constants/enums";
import { radii, spacing } from "../constants/sizes";
import { OptionChip } from "./OptionChip";

interface MuscleGroupSelectorProps {
  label: string;
  language: SupportedLanguage;
  onChange: (value: MuscleGroup[]) => void;
  selected: MuscleGroup[];
}

export const MuscleGroupSelector = ({
  label,
  language,
  onChange,
  selected,
}: MuscleGroupSelectorProps) => {
  const [visible, setVisible] = useState(false);

  const summary = useMemo(() => {
    if (selected.length === 0) {
      return "未选择";
    }

    return selected
      .map((value) => getLocalizedValue(muscleGroupLabels, value, language))
      .join("、");
  }, [language, selected]);

  const toggleValue = (value: MuscleGroup) => {
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];

    onChange(next);
  };

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.field,
          pressed ? styles.fieldPressed : undefined,
        ]}
      >
        <Text style={styles.label}>{label}</Text>
        <Text numberOfLines={2} style={styles.summary}>
          {summary}
        </Text>
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => setVisible(false)}
        presentationStyle="overFullScreen"
        transparent
        visible={visible}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={() => setVisible(false)}>
                <Text style={styles.doneText}>完成</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.chips}>
                {allMuscleGroups.map((muscle) => (
                  <OptionChip
                    key={muscle}
                    label={getLocalizedValue(muscleGroupLabels, muscle, language)}
                    onPress={() => toggleValue(muscle)}
                    selected={selected.includes(muscle)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  field: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  fieldPressed: {
    opacity: 0.85,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  summary: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  overlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.backgroundElevated,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: "72%",
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  doneText: {
    color: colors.primarySoft,
    fontSize: 15,
    fontWeight: "700",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});

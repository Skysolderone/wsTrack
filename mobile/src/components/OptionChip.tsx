import { Pressable, StyleSheet, Text } from "react-native";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";

interface OptionChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export const OptionChip = ({ label, onPress, selected }: OptionChipProps) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.chip,
      selected ? styles.chipSelected : undefined,
      pressed ? styles.chipPressed : undefined,
    ]}
  >
    <Text style={[styles.label, selected ? styles.labelSelected : undefined]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  labelSelected: {
    color: colors.text,
  },
});

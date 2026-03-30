import { StyleSheet, Text, View } from "react-native";

import {
  allEquipmentTypes,
  equipmentLabels,
  getLocalizedValue,
  type SupportedLanguage,
} from "../constants/exerciseMetadata";
import { colors } from "../constants/colors";
import type { Equipment } from "../constants/enums";
import { radii, spacing } from "../constants/sizes";
import { OptionChip } from "./OptionChip";

interface EquipmentPickerProps {
  label?: string;
  language: SupportedLanguage;
  onChange: (value: Equipment) => void;
  value: Equipment;
}

export const EquipmentPicker = ({
  label = "器械类型",
  language,
  onChange,
  value,
}: EquipmentPickerProps) => (
  <View style={styles.container}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.chips}>
      {allEquipmentTypes.map((equipment) => (
        <OptionChip
          key={equipment}
          label={getLocalizedValue(equipmentLabels, equipment, language)}
          onPress={() => onChange(equipment)}
          selected={value === equipment}
        />
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});

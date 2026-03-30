import { StyleSheet, Text, View } from "react-native";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";

interface InfoCardProps {
  description: string;
  descriptionTestID?: string;
  testID?: string;
  title: string;
  titleTestID?: string;
  value: string;
  valueTestID?: string;
}

export const InfoCard = ({
  description,
  descriptionTestID,
  testID,
  title,
  titleTestID,
  value,
  valueTestID,
}: InfoCardProps) => (
  <View style={styles.card} testID={testID}>
    <Text style={styles.title} testID={titleTestID}>
      {title}
    </Text>
    <Text style={styles.value} testID={valueTestID}>
      {value}
    </Text>
    <Text style={styles.description} testID={descriptionTestID}>
      {description}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  title: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  value: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});

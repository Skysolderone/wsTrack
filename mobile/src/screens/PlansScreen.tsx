import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { InfoCard, ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";

const planDays = ["Push", "Pull", "Legs", "Upper", "Lower"];

export const PlansScreen = () => {
  const { t } = useTranslation();

  return (
    <ScreenContainer title={t("screens.plansTitle")} subtitle={t("screens.plansSubtitle")}>
      <InfoCard
        title={t("common.activePlan")}
        value="5-Day Upper/Lower"
        description="Goal: hypertrophy"
      />

      <View style={styles.list}>
        {planDays.map((day, index) => (
          <View key={day} style={styles.dayCard}>
            <Text style={styles.dayTitle}>
              Day {index + 1} · {day}
            </Text>
            <Text style={styles.dayMeta}>4 exercises · 70-90 min</Text>
          </View>
        ))}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  dayCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  dayTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  dayMeta: {
    color: colors.textMuted,
    fontSize: 14,
  },
});

import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import { OptionChip, ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { WeightUnit } from "../constants/enums";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import { requestPermissions as requestHealthKitPermissions } from "../services/HealthKitService";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";

export const SettingsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const {
    defaultRestSeconds,
    healthKitEnabled,
    language,
    setDefaultRestSeconds,
    setHealthKitEnabled,
    setLanguage,
    setWeightUnit,
    weightUnit,
  } = useSettingsStore((state) => state);

  const handleHealthKitToggle = async (nextValue: boolean): Promise<void> => {
    if (!nextValue) {
      setHealthKitEnabled(false);
      return;
    }

    try {
      const granted = await requestHealthKitPermissions();
      setHealthKitEnabled(granted);
    } catch {
      setHealthKitEnabled(false);
    }
  };

  return (
    <ScreenContainer
      title={t("screens.settingsTitle")}
      subtitle={t("screens.settingsSubtitle")}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.account")}</Text>
        <Pressable
          onPress={() => navigation.navigate(accessToken ? "Profile" : "Login")}
          style={({ pressed }) => [
            styles.accountButton,
            pressed ? styles.pressed : undefined,
          ]}
        >
          <Text style={styles.accountButtonLabel}>
            {accessToken ? t("settings.profile") : t("auth.signIn")}
          </Text>
          <Text style={styles.accountHint}>
            {accessToken ? t("settings.profileHint") : t("settings.loginHint")}
          </Text>
        </Pressable>
      </View>

      {user?.role === "coach" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>教练模式</Text>
          <Pressable
            onPress={() => navigation.navigate("CoachDashboard")}
            style={({ pressed }) => [
              styles.accountButton,
              pressed ? styles.pressed : undefined,
            ]}
          >
            <Text style={styles.accountButtonLabel}>打开教练仪表盘</Text>
            <Text style={styles.accountHint}>
              查看会员状态、训练趋势、计划推送和训练评语。
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.weightUnit")}</Text>
        <View style={styles.row}>
          <OptionChip
            label={t("settings.kilograms")}
            onPress={() => setWeightUnit(WeightUnit.KG)}
            selected={weightUnit === WeightUnit.KG}
          />
          <OptionChip
            label={t("settings.pounds")}
            onPress={() => setWeightUnit(WeightUnit.LBS)}
            selected={weightUnit === WeightUnit.LBS}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.language")}</Text>
        <View style={styles.row}>
          <OptionChip
            label={t("settings.chinese")}
            onPress={() => setLanguage("zh")}
            selected={language === "zh"}
          />
          <OptionChip
            label={t("settings.english")}
            onPress={() => setLanguage("en")}
            selected={language === "en"}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.defaultRest")}</Text>
        <View style={styles.restRow}>
          <Pressable
            onPress={() => setDefaultRestSeconds(defaultRestSeconds - 15)}
            style={({ pressed }) => [styles.restButton, pressed ? styles.pressed : undefined]}
          >
            <Text style={styles.restButtonLabel}>-15s</Text>
          </Pressable>
          <Text style={styles.restValue}>
            {defaultRestSeconds} {t("common.restSeconds")}
          </Text>
          <Pressable
            onPress={() => setDefaultRestSeconds(defaultRestSeconds + 15)}
            style={({ pressed }) => [styles.restButton, pressed ? styles.pressed : undefined]}
          >
            <Text style={styles.restButtonLabel}>+15s</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.healthRow}>
          <View style={styles.healthTextWrap}>
            <Text style={styles.sectionTitle}>{t("settings.healthKit")}</Text>
            <Text style={styles.accountHint}>{t("settings.healthKitHint")}</Text>
          </View>
          <Switch
            onValueChange={(value) => void handleHealthKitToggle(value)}
            thumbColor={colors.surface}
            trackColor={{
              false: colors.border,
              true: colors.primary,
            }}
            value={healthKitEnabled}
          />
        </View>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  accountButton: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  accountButtonLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  accountHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  healthRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  healthTextWrap: {
    flex: 1,
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  restRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  restButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  restButtonLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  restValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.7,
  },
});

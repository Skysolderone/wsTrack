import { useCallback, useEffect, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import { getCurrentUser, signOut } from "../services/AuthService";
import { clearSyncMetadata, fullSync, getSyncStatus } from "../services/SyncService";
import { normalizeApiError } from "../services/api";
import { useAuthStore } from "../store/authStore";

type ProfileScreenProps = NativeStackScreenProps<RootStackParamList, "Profile">;

const formatTimestamp = (value: number | null, fallback: string): string => {
  if (value === null) {
    return fallback;
  }

  return new Date(value).toLocaleString();
};

export const ProfileScreen = ({ navigation }: ProfileScreenProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const loadProfile = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const [status] = await Promise.all([
        getSyncStatus(),
        accessToken ? getCurrentUser() : Promise.resolve(null),
      ]);

      setPendingCount(status.pendingCount);
      setLastSyncAt(status.lastSyncAt);
    } catch (error) {
      setErrorMessage(normalizeApiError(error).message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSync = async (): Promise<void> => {
    try {
      setSyncing(true);
      setErrorMessage(null);
      await fullSync();
      const status = await getSyncStatus();
      setPendingCount(status.pendingCount);
      setLastSyncAt(status.lastSyncAt);
    } catch (error) {
      setErrorMessage(normalizeApiError(error).message);
    } finally {
      setSyncing(false);
    }
  };

  const handleResetSync = async (): Promise<void> => {
    await clearSyncMetadata();
    setLastSyncAt(null);
  };

  if (!accessToken) {
    return (
      <ScreenContainer
        onBackPress={navigation.goBack}
        testID="profile-screen"
        title={t("profile.title")}
        subtitle={t("profile.signedOutSubtitle")}
      >
        <View style={styles.card}>
          <Text style={styles.bodyText}>{t("profile.signInRequired")}</Text>
          <Pressable
            onPress={() => navigation.replace("Login")}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.primaryButtonPressed : undefined,
            ]}
            testID="profile-signin-button"
          >
            <Text style={styles.primaryButtonLabel}>{t("auth.signIn")}</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      onBackPress={navigation.goBack}
      testID="profile-screen"
      title={t("profile.title")}
      subtitle={t("profile.subtitle")}
    >
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("profile.account")}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("auth.email")}</Text>
          <Text style={styles.infoValue}>{user?.email ?? "-"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("profile.nickname")}</Text>
          <Text style={styles.infoValue}>{user?.nickname ?? "-"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("profile.role")}</Text>
          <Text style={styles.infoValue}>{user?.role ?? "-"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("profile.syncSection")}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("profile.pendingChanges")}</Text>
          <Text style={styles.infoValue} testID="profile-pending-count-value">
            {pendingCount}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("profile.lastSyncAt")}</Text>
          <Text style={styles.infoValue} testID="profile-last-sync-value">
            {formatTimestamp(lastSyncAt, t("profile.never"))}
          </Text>
        </View>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        <Pressable
          disabled={syncing}
          onPress={() => void handleSync()}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || syncing) ? styles.primaryButtonPressed : undefined,
          ]}
          testID="profile-sync-button"
        >
          <Text style={styles.primaryButtonLabel}>
            {syncing ? t("profile.syncing") : t("profile.syncNow")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void loadProfile()}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.secondaryButtonPressed : undefined,
          ]}
          testID="profile-refresh-button"
        >
          <Text style={styles.secondaryButtonLabel}>{t("profile.refreshProfile")}</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleResetSync()}
          style={({ pressed }) => [styles.linkButton, pressed ? styles.linkPressed : undefined]}
          testID="profile-reset-sync-button"
        >
          <Text style={styles.linkText}>{t("profile.resetSyncCursor")}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("profile.dataManagement")}</Text>
        <Text style={styles.bodyText}>{t("profile.dataManagementHint")}</Text>
        <Pressable
          onPress={() => void signOut()}
          style={({ pressed }) => [
            styles.dangerButton,
            pressed ? styles.secondaryButtonPressed : undefined,
          ]}
          testID="profile-signout-button"
        >
          <Text style={styles.dangerButtonLabel}>{t("profile.signOut")}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  bodyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: "rgba(231, 76, 60, 0.16)",
    borderColor: "rgba(231, 76, 60, 0.3)",
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: spacing.sm,
  },
  dangerButtonLabel: {
    color: "#FF7675",
    fontSize: 15,
    fontWeight: "700",
  },
  errorText: {
    color: "#FF7675",
    fontSize: 14,
    lineHeight: 20,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  infoRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    maxWidth: "55%",
    textAlign: "right",
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  linkPressed: {
    opacity: 0.7,
  },
  linkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
  },
  primaryButtonLabel: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: spacing.sm,
  },
  secondaryButtonLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButtonPressed: {
    opacity: 0.8,
  },
});

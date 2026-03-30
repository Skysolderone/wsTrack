import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import { resetToMainTabs } from "../navigation/navigationRef";
import type { RootStackParamList } from "../navigation/types";
import { signIn, signInWithApple } from "../services/AuthService";
import { normalizeApiError } from "../services/api";

type LoginScreenProps = NativeStackScreenProps<RootStackParamList, "Login">;

export const LoginScreen = ({ navigation }: LoginScreenProps) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (): Promise<void> => {
    try {
      setLoading(true);
      setErrorMessage(null);
      await signIn(email, password);
      resetToMainTabs();
    } catch (error) {
      setErrorMessage(normalizeApiError(error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLogin = async (): Promise<void> => {
    try {
      setLoading(true);
      setErrorMessage(null);
      await signInWithApple();
      resetToMainTabs();
    } catch (error) {
      setErrorMessage(normalizeApiError(error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer
      onBackPress={navigation.canGoBack() ? navigation.goBack : undefined}
      testID="login-screen"
      title={t("auth.loginTitle")}
      subtitle={t("auth.loginSubtitle")}
    >
      <View style={styles.card}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("auth.email")}</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder={t("auth.emailPlaceholder")}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            testID="login-email-input"
            value={email}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("auth.password")}</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder={t("auth.passwordPlaceholder")}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={styles.input}
            testID="login-password-input"
            value={password}
          />
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          disabled={loading}
          onPress={() => void handleLogin()}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || loading) ? styles.primaryButtonPressed : undefined,
          ]}
          testID="login-submit-button"
        >
          <Text style={styles.primaryButtonLabel}>
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </Text>
        </Pressable>

        {Platform.OS === "ios" ? (
          <Pressable
            disabled={loading}
            onPress={() => void handleAppleLogin()}
            style={({ pressed }) => [
              styles.secondaryButton,
              (pressed || loading) ? styles.secondaryButtonPressed : undefined,
            ]}
            testID="login-apple-button"
          >
            <Text style={styles.secondaryButtonLabel}>{t("auth.signInWithApple")}</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => navigation.replace("SignUp")}
          style={({ pressed }) => [styles.linkButton, pressed ? styles.linkPressed : undefined]}
          testID="login-go-signup-button"
        >
          <Text style={styles.linkText}>{t("auth.goToSignUp")}</Text>
        </Pressable>

        <Pressable
          onPress={resetToMainTabs}
          style={({ pressed }) => [styles.ghostButton, pressed ? styles.linkPressed : undefined]}
          testID="login-continue-offline-button"
        >
          <Text style={styles.ghostButtonLabel}>{t("auth.continueOffline")}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorText: {
    color: "#FF7675",
    fontSize: 14,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  ghostButton: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  ghostButtonLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
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

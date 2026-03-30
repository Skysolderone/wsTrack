import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import { resetToMainTabs } from "../navigation/navigationRef";
import type { RootStackParamList } from "../navigation/types";
import { signUp } from "../services/AuthService";
import { normalizeApiError } from "../services/api";

type SignUpScreenProps = NativeStackScreenProps<RootStackParamList, "SignUp">;

export const SignUpScreen = ({ navigation }: SignUpScreenProps) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (): Promise<void> => {
    if (password !== confirmPassword) {
      setErrorMessage(t("auth.passwordMismatch"));
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      await signUp(email, password);
      resetToMainTabs();
    } catch (error) {
      setErrorMessage(normalizeApiError(error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer
      onBackPress={navigation.goBack}
      testID="signup-screen"
      title={t("auth.signUpTitle")}
      subtitle={t("auth.signUpSubtitle")}
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
            testID="signup-email-input"
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
            testID="signup-password-input"
            value={password}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("auth.confirmPassword")}</Text>
          <TextInput
            onChangeText={setConfirmPassword}
            placeholder={t("auth.confirmPasswordPlaceholder")}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={styles.input}
            testID="signup-confirm-password-input"
            value={confirmPassword}
          />
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          disabled={loading}
          onPress={() => void handleSignUp()}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || loading) ? styles.primaryButtonPressed : undefined,
          ]}
          testID="signup-submit-button"
        >
          <Text style={styles.primaryButtonLabel}>
            {loading ? t("auth.signingUp") : t("auth.signUp")}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.replace("Login")}
          style={({ pressed }) => [styles.linkButton, pressed ? styles.linkPressed : undefined]}
          testID="signup-go-login-button"
        >
          <Text style={styles.linkText}>{t("auth.goToLogin")}</Text>
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
});

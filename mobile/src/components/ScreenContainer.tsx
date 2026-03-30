import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";

interface ScreenContainerProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  onBackPress?: () => void;
  headerRight?: ReactNode;
}

export const ScreenContainer = ({
  children,
  headerRight,
  onBackPress,
  title,
  subtitle,
}: ScreenContainerProps) => (
  <ScrollView
    contentContainerStyle={styles.content}
    showsVerticalScrollIndicator={false}
    style={styles.container}
  >
    <View style={styles.header}>
      {onBackPress || headerRight ? (
        <View style={styles.headerRow}>
          {onBackPress ? (
            <Pressable
              accessibilityRole="button"
              onPress={onBackPress}
              style={({ pressed }) => [
                styles.backButton,
                pressed ? styles.backButtonPressed : undefined,
              ]}
            >
              <ArrowLeft color={colors.text} size={18} strokeWidth={2.4} />
            </Pressable>
          ) : (
            <View style={styles.backPlaceholder} />
          )}
          {headerRight ?? <View style={styles.backPlaceholder} />}
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    <View style={styles.body}>{children}</View>
  </ScrollView>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  backButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  backButtonPressed: {
    opacity: 0.8,
  },
  backPlaceholder: {
    height: 36,
    width: 36,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  body: {
    gap: spacing.md,
  },
});

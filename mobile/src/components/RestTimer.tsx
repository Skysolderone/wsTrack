import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import { formatDuration } from "../utils";

interface RestTimerProps {
  durationSeconds: number;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
  remainingSeconds: number;
  visible: boolean;
}

const RING_SIZE = 96;
const RING_RADIUS = 38;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const RestTimer = ({
  durationSeconds,
  onAdjust,
  onSkip,
  remainingSeconds,
  visible,
}: RestTimerProps) => {
  if (!visible) {
    return null;
  }

  const safeDuration = Math.max(durationSeconds, 1);
  const progress = Math.max(0, Math.min(1, remainingSeconds / safeDuration));
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.ringWrap}>
          <Svg height={RING_SIZE} width={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              fill="none"
              r={RING_RADIUS}
              stroke={colors.border}
              strokeWidth={8}
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              fill="none"
              r={RING_RADIUS}
              stroke={colors.primary}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              strokeWidth={8}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>

          <View style={styles.ringContent}>
            <Text style={styles.timerValue}>{formatDuration(remainingSeconds)}</Text>
            <Text style={styles.timerLabel}>组间休息</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onAdjust(-15)}
            style={({ pressed }) => [
              styles.adjustButton,
              pressed ? styles.adjustButtonPressed : undefined,
            ]}
          >
            <Text style={styles.adjustText}>-15s</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => onAdjust(15)}
            style={({ pressed }) => [
              styles.adjustButton,
              pressed ? styles.adjustButtonPressed : undefined,
            ]}
          >
            <Text style={styles.adjustText}>+15s</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onSkip}
            style={({ pressed }) => [
              styles.skipButton,
              pressed ? styles.adjustButtonPressed : undefined,
            ]}
          >
            <Text style={styles.skipText}>跳过</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    bottom: 88,
    left: spacing.lg,
    position: "absolute",
    right: spacing.lg,
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
    padding: spacing.md,
  },
  ringWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ringContent: {
    alignItems: "center",
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
  },
  timerValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  timerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  actions: {
    flex: 1,
    gap: spacing.sm,
  },
  adjustButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  adjustButtonPressed: {
    opacity: 0.78,
  },
  adjustText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  skipButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  skipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
});

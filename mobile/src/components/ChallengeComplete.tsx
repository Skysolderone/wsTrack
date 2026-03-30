import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ChallengeType } from "../constants/enums";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import type { ChallengeCelebrationPayload } from "../store/workoutStore";

interface ChallengeCompleteProps {
  celebration: ChallengeCelebrationPayload | null;
  onClose: () => void;
  visible: boolean;
}

interface BurstConfig {
  angle: number;
  color: string;
  distance: number;
  size: number;
}

const BURST_COLORS = [colors.primary, colors.success, colors.warning, "#4DD0E1"];

const challengeTypeLabels: Record<ChallengeType, string> = {
  [ChallengeType.CardioDuration]: "有氧时长",
  [ChallengeType.Frequency]: "训练频率",
  [ChallengeType.TimeSlot]: "固定时段训练",
  [ChallengeType.Volume]: "训练容量",
};

const buildBursts = (): BurstConfig[] =>
  Array.from({ length: 18 }, (_, index) => ({
    angle: (Math.PI * 2 * index) / 18,
    color: BURST_COLORS[index % BURST_COLORS.length] ?? colors.primary,
    distance: 74 + (index % 4) * 16,
    size: 8 + (index % 3) * 4,
  }));

const Burst = ({
  config,
  progress,
}: {
  config: BurstConfig;
  progress: SharedValue<number>;
}) => {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(config.angle) * config.distance * progress.value },
      {
        translateY:
          Math.sin(config.angle) * config.distance * progress.value -
          42 * progress.value,
      },
      { scale: 1 - progress.value * 0.3 },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.burst,
        animatedStyle,
        {
          backgroundColor: config.color,
          height: config.size,
          width: config.size,
        },
      ]}
    />
  );
};

export const ChallengeComplete = ({
  celebration,
  onClose,
  visible,
}: ChallengeCompleteProps) => {
  const progress = useSharedValue(0);
  const bursts = useMemo(() => buildBursts(), []);

  useEffect(() => {
    if (!visible || !celebration) {
      progress.value = 0;
      return;
    }

    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 1500,
      easing: Easing.out(Easing.cubic),
    });
    Vibration.vibrate([0, 100, 80, 120]);

    const timeout = setTimeout(() => {
      onClose();
    }, 2200);

    return () => {
      clearTimeout(timeout);
    };
  }, [celebration, onClose, progress, visible]);

  if (!visible || !celebration) {
    return null;
  }

  const primaryChallenge = celebration.challenges[0];
  const secondaryCount = Math.max(0, celebration.challenges.length - 1);

  return (
    <Pressable onPress={onClose} style={styles.overlay}>
      <View style={styles.burstLayer}>
        {bursts.map((config, index) => (
          <Burst key={`${config.angle}-${index}`} config={config} progress={progress} />
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>成就达成</Text>
        {primaryChallenge ? (
          <>
            <Text style={styles.challengeTitle}>
              {challengeTypeLabels[primaryChallenge.type]}
            </Text>
            <Text style={styles.challengeText}>
              已完成目标 {primaryChallenge.currentValue}/{primaryChallenge.targetValue}
            </Text>
          </>
        ) : null}
        {secondaryCount > 0 ? (
          <Text style={styles.secondaryText}>同时完成 {secondaryCount} 个挑战</Text>
        ) : null}
        <Text style={styles.hint}>点击任意位置关闭</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(8, 8, 14, 0.82)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 45,
  },
  burstLayer: {
    alignItems: "center",
    height: 280,
    justifyContent: "center",
    position: "absolute",
    width: 280,
  },
  burst: {
    borderRadius: radii.pill,
    position: "absolute",
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.success,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    width: "84%",
  },
  challengeText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  challengeTitle: {
    color: colors.success,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  hint: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  secondaryText: {
    color: colors.primarySoft,
    fontSize: 14,
    fontWeight: "700",
  },
  title: {
    color: colors.warning,
    fontSize: 28,
    fontWeight: "900",
  },
});

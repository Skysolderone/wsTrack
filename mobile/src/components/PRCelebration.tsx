import { useEffect, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import type { PRCelebrationPayload } from "../store/workoutStore";

interface PRCelebrationProps {
  celebration: PRCelebrationPayload | null;
  onDismiss?: () => void;
  onClose: () => void;
  visible: boolean;
}

interface ParticleConfig {
  angle: number;
  color: string;
  distance: number;
  size: number;
}

const PARTICLE_COLORS = [colors.primary, colors.primarySoft, colors.warning, colors.success];

const buildParticleConfigs = (): ParticleConfig[] =>
  Array.from({ length: 16 }, (_, index) => ({
    angle: (Math.PI * 2 * index) / 16,
    color: PARTICLE_COLORS[index % PARTICLE_COLORS.length] ?? colors.primary,
    distance: 68 + (index % 4) * 18,
    size: 8 + (index % 3) * 4,
  }));

const Particle = ({
  config,
  progress,
}: {
  config: ParticleConfig;
  progress: SharedValue<number>;
}) => {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(config.angle) * config.distance * progress.value },
      {
        translateY:
          Math.sin(config.angle) * config.distance * progress.value -
          36 * progress.value,
      },
      { scale: 1 - progress.value * 0.35 },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
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

export const PRCelebration = ({
  celebration,
  onDismiss,
  onClose,
  visible,
}: PRCelebrationProps) => {
  const progress = useSharedValue(0);
  const particles = useMemo(() => buildParticleConfigs(), []);
  const handleDismiss = onDismiss ?? onClose;

  useEffect(() => {
    if (!visible || !celebration) {
      progress.value = 0;
      return;
    }

    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 1400,
      easing: Easing.out(Easing.cubic),
    });
    Vibration.vibrate([0, 80, 60, 100]);

    const timeout = setTimeout(() => {
      handleDismiss();
    }, 2000);

    return () => {
      clearTimeout(timeout);
    };
  }, [celebration, handleDismiss, progress, visible]);

  if (!visible || !celebration) {
    return null;
  }

  const primaryRecord = celebration.records[0];
  const secondaryCount = Math.max(0, celebration.records.length - 1);

  return (
    <Pressable onPress={handleDismiss} style={styles.overlay} testID="pr-celebration-overlay">
      <View style={styles.particlesLayer}>
        {particles.map((config, index) => (
          <Particle key={`${config.angle}-${index}`} config={config} progress={progress} />
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>🏆 新纪录!</Text>
        <Text style={styles.exerciseName}>{celebration.exerciseName}</Text>
        {primaryRecord ? (
          <Text style={styles.primaryRecord} testID="pr-celebration-primary-record">
            {primaryRecord.label} · {primaryRecord.displayValue}
            {primaryRecord.displayUnit}
          </Text>
        ) : null}
        {secondaryCount > 0 ? (
          <Text style={styles.secondaryRecord}>同时刷新 {secondaryCount} 项 PR</Text>
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
    zIndex: 40,
  },
  particlesLayer: {
    alignItems: "center",
    height: 260,
    justifyContent: "center",
    position: "absolute",
    width: 260,
  },
  particle: {
    borderRadius: radii.pill,
    position: "absolute",
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.warning,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    width: "82%",
  },
  title: {
    color: colors.warning,
    fontSize: 28,
    fontWeight: "900",
  },
  exerciseName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  primaryRecord: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryRecord: {
    color: colors.primarySoft,
    fontSize: 14,
    fontWeight: "700",
  },
  hint: {
    color: colors.textSubtle,
    fontSize: 13,
  },
});

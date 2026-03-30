import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { OptionChip, ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { ChallengeType } from "../constants/enums";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import {
  createChallenge,
  getActiveChallenges,
  getCompletedChallenges,
  type ChallengeItem,
} from "../services/ChallengeService";

type ChallengesScreenProps = NativeStackScreenProps<RootStackParamList, "Challenges">;

const DURATION_OPTIONS = [7, 14, 30] as const;

const challengeLabels: Record<ChallengeType, string> = {
  [ChallengeType.CardioDuration]: "有氧时长",
  [ChallengeType.Frequency]: "训练频率",
  [ChallengeType.TimeSlot]: "固定时段",
  [ChallengeType.Volume]: "训练容量",
};

const challengeHints: Record<ChallengeType, string> = {
  [ChallengeType.CardioDuration]: "目标按分钟输入，系统会在保存时换算为秒。",
  [ChallengeType.Frequency]: "目标表示在周期内完成的训练次数。",
  [ChallengeType.TimeSlot]: "会按创建时的本地时段统计相同时段训练次数。",
  [ChallengeType.Volume]: "目标表示累计训练容量。",
};

const normalizeTargetValue = (type: ChallengeType, value: number): number =>
  type === ChallengeType.CardioDuration ? Math.round(value * 60) : value;

const formatValue = (type: ChallengeType, value: number): string => {
  switch (type) {
    case ChallengeType.CardioDuration:
      return `${Math.round(value / 60)} 分钟`;
    case ChallengeType.Frequency:
    case ChallengeType.TimeSlot:
      return `${Math.round(value)} 次`;
    case ChallengeType.Volume:
    default:
      return `${Math.round(value)}`;
  }
};

const ProgressBar = ({ progressPercent }: { progressPercent: number }) => (
  <View style={styles.progressTrack}>
    <View
      style={[
        styles.progressFill,
        {
          width: `${Math.max(0, Math.min(100, progressPercent))}%`,
        },
      ]}
    />
  </View>
);

export const ChallengesScreen = ({ navigation }: ChallengesScreenProps) => {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeChallenges, setActiveChallenges] = useState<ChallengeItem[]>([]);
  const [completedChallenges, setCompletedChallenges] = useState<ChallengeItem[]>([]);
  const [selectedType, setSelectedType] = useState<ChallengeType>(ChallengeType.Frequency);
  const [selectedDays, setSelectedDays] = useState<(typeof DURATION_OPTIONS)[number]>(7);
  const [targetValue, setTargetValue] = useState("4");

  const loadChallenges = useCallback(async (): Promise<void> => {
    setLoading(true);
    const [active, completed] = await Promise.all([
      getActiveChallenges(),
      getCompletedChallenges(),
    ]);
    setActiveChallenges(active);
    setCompletedChallenges(completed);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadChallenges();
  }, [loadChallenges]);

  const parsedTarget = useMemo(() => Number(targetValue), [targetValue]);

  const handleCreate = async (): Promise<void> => {
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      return;
    }

    try {
      setCreating(true);
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + selectedDays * 24 * 60 * 60 * 1000);
      await createChallenge(
        selectedType,
        normalizeTargetValue(selectedType, parsedTarget),
        startDate,
        endDate,
      );
      setModalVisible(false);
      await loadChallenges();
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <ScreenContainer
        onBackPress={navigation.goBack}
        title="训练挑战"
        subtitle="用阶段性目标追踪训练容量、频率和时段一致性。"
        headerRight={
          <Pressable
            onPress={() => setModalVisible(true)}
            style={({ pressed }) => [
              styles.headerButton,
              pressed ? styles.pressed : undefined,
            ]}
          >
            <Text style={styles.headerButtonText}>新建</Text>
          </Pressable>
        }
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>进行中的挑战</Text>
          {activeChallenges.length === 0 ? (
            <Text style={styles.emptyText}>还没有进行中的挑战，先创建一个短周期目标。</Text>
          ) : (
            activeChallenges.map((challenge) => (
              <View key={challenge.id} style={styles.challengeCard}>
                <View style={styles.challengeHeader}>
                  <Text style={styles.challengeTitle}>{challengeLabels[challenge.type]}</Text>
                  <Text style={styles.challengeMeta}>剩余 {challenge.remainingDays} 天</Text>
                </View>
                <Text style={styles.challengeValue}>
                  {formatValue(challenge.type, challenge.currentValue)} /{" "}
                  {formatValue(challenge.type, challenge.targetValue)}
                </Text>
                <ProgressBar progressPercent={challenge.progressPercent} />
                <Text style={styles.challengeMeta}>{challenge.progressPercent}% 已完成</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>已完成挑战</Text>
          {completedChallenges.length === 0 ? (
            <Text style={styles.emptyText}>完成的挑战会显示在这里。</Text>
          ) : (
            completedChallenges.slice(0, 12).map((challenge) => (
              <View key={challenge.id} style={styles.completedCard}>
                <Text style={styles.completedTitle}>{challengeLabels[challenge.type]}</Text>
                <Text style={styles.completedText}>
                  达成 {formatValue(challenge.type, challenge.targetValue)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScreenContainer>

      <Modal
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
        transparent
        visible={modalVisible}
      >
        <View style={styles.modalOverlay}>
          <Pressable onPress={() => setModalVisible(false)} style={styles.modalScrim} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>创建新挑战</Text>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>挑战类型</Text>
              <View style={styles.chipWrap}>
                {Object.values(ChallengeType).map((type) => (
                  <OptionChip
                    key={type}
                    label={challengeLabels[type]}
                    onPress={() => setSelectedType(type)}
                    selected={selectedType === type}
                  />
                ))}
              </View>
              <Text style={styles.fieldHint}>{challengeHints[selectedType]}</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>目标值</Text>
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={setTargetValue}
                placeholder="输入目标值"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
                value={targetValue}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>挑战周期</Text>
              <View style={styles.chipWrap}>
                {DURATION_OPTIONS.map((days) => (
                  <OptionChip
                    key={days}
                    label={`${days} 天`}
                    onPress={() => setSelectedDays(days)}
                    selected={selectedDays === days}
                  />
                ))}
              </View>
            </View>

            <Pressable
              disabled={creating}
              onPress={() => void handleCreate()}
              style={({ pressed }) => [
                styles.createButton,
                (pressed || creating) ? styles.pressed : undefined,
              ]}
            >
              <Text style={styles.createButtonText}>{creating ? "创建中..." : "创建挑战"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  challengeCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  challengeHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  challengeMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  challengeTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  challengeValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  completedCard: {
    backgroundColor: "rgba(0, 208, 132, 0.1)",
    borderColor: "rgba(0, 208, 132, 0.22)",
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  completedText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  completedTitle: {
    color: colors.success,
    fontSize: 15,
    fontWeight: "800",
  },
  createButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
  },
  createButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  field: {
    gap: spacing.sm,
  },
  fieldHint: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 18,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    minWidth: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  input: {
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  modalOverlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: "flex-end",
  },
  modalScrim: {
    flex: 1,
  },
  pressed: {
    opacity: 0.8,
  },
  progressFill: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
  },
  progressTrack: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.pill,
    height: 10,
    overflow: "hidden",
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
    fontSize: 17,
    fontWeight: "800",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.md,
    padding: spacing.lg,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
});

import { useCallback, useState } from "react";
import type { ListRenderItem } from "react-native";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { InfoCard, MiniTrendChart, ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { CoachClientStatus } from "../constants/enums";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import {
  addClient,
  getClientDashboard,
  type CoachClientItem,
  type CoachDashboardSummary,
} from "../services/CoachService";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const getStatusColor = (lastWorkoutAt: number | null): string => {
  if (!lastWorkoutAt) {
    return colors.danger;
  }

  const elapsed = Date.now() - lastWorkoutAt;
  if (elapsed >= SEVEN_DAYS_MS) {
    return colors.danger;
  }

  if (elapsed >= THREE_DAYS_MS) {
    return colors.warning;
  }

  return colors.success;
};

const formatLastWorkout = (timestamp: number | null): string => {
  if (!timestamp) {
    return "暂无训练";
  }

  return new Date(timestamp).toLocaleDateString();
};

export const CoachDashboardScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [inviteEmail, setInviteEmail] = useState("");
  const [dashboard, setDashboard] = useState<CoachDashboardSummary | null>(null);
  const [submittingInvite, setSubmittingInvite] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const nextDashboard = await getClientDashboard();
      setDashboard(nextDashboard);
    } catch (error) {
      Alert.alert("加载失败", error instanceof Error ? error.message : "请稍后再试");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert("请输入邮箱", "需要输入会员邮箱后才能发送邀请。");
      return;
    }

    try {
      setSubmittingInvite(true);
      await addClient(inviteEmail);
      setInviteEmail("");
      await loadDashboard();
    } catch (error) {
      Alert.alert("邀请失败", error instanceof Error ? error.message : "请稍后再试");
    } finally {
      setSubmittingInvite(false);
    }
  };

  const renderClientCard: ListRenderItem<CoachClientItem> = ({ item }) => {
    const statusColor = getStatusColor(item.lastWorkoutAt);

    return (
      <Pressable
        onPress={() =>
          navigation.navigate("ClientDetail", {
            clientId: item.clientId,
            clientName: item.clientName,
          })
        }
        style={({ pressed }) => [
          styles.clientCard,
          pressed ? styles.cardPressed : undefined,
        ]}
      >
        <View style={styles.clientHeader}>
          <View style={styles.clientCopy}>
            <Text style={styles.clientName}>{item.clientName}</Text>
            <Text style={styles.clientEmail}>{item.clientEmail}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>
            {item.workoutsThisWeek > 0 ? "本周已训练" : "本周未训练"}
          </Text>
          <Text style={styles.statusMeta}>
            {item.status === CoachClientStatus.Active
              ? "活跃关系"
              : item.status === CoachClientStatus.Paused
                ? "暂停中"
                : "已终止"}
          </Text>
        </View>

        <View style={styles.trendRow}>
          <MiniTrendChart data={item.volumeTrend} />
          <View style={styles.trendMeta}>
            <Text style={styles.trendValue}>{item.workoutsThisWeek}</Text>
            <Text style={styles.trendHint}>本周训练次数</Text>
          </View>
        </View>

        <Text style={styles.lastWorkoutText}>
          最近训练：{formatLastWorkout(item.lastWorkoutAt)}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScreenContainer
      onBackPress={() => navigation.goBack()}
      subtitle="快速查看会员活跃度、近期容量走势和是否需要跟进。"
      title="教练仪表盘"
    >
      <View style={styles.metricsRow}>
        <InfoCard
          description="正在跟进的会员"
          title="Active"
          value={`${dashboard?.activeCount ?? 0}`}
        />
        <InfoCard
          description="需要关注"
          title="Attention"
          value={`${dashboard?.attentionCount ?? 0}`}
        />
      </View>

      <View style={styles.inviteCard}>
        <Text style={styles.sectionTitle}>添加会员</Text>
        <TextInput
          onChangeText={setInviteEmail}
          placeholder="输入会员邮箱"
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          style={styles.input}
          value={inviteEmail}
        />
        <Pressable
          disabled={submittingInvite}
          onPress={() => {
            void handleInvite();
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed ? styles.cardPressed : undefined,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {submittingInvite ? "发送中..." : "发送邀请"}
          </Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={dashboard?.clients ?? []}
        keyExtractor={(item) => item.clientId}
        renderItem={renderClientCard}
        scrollEnabled={false}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>还没有会员</Text>
            <Text style={styles.emptySubtitle}>先发送邀请，再开始跟进训练和评语。</Text>
          </View>
        }
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  metricsRow: {
    gap: spacing.md,
  },
  inviteCard: {
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
  input: {
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  listContent: {
    gap: spacing.md,
  },
  clientCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  clientHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  clientCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  clientName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  clientEmail: {
    color: colors.textMuted,
    fontSize: 13,
  },
  statusDot: {
    borderRadius: radii.pill,
    height: 12,
    width: 12,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statusLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  statusMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  trendRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  trendMeta: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  trendValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  trendHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  lastWorkoutText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  cardPressed: {
    opacity: 0.82,
  },
});

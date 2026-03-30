import { useCallback, useState } from "react";
import type { ListRenderItem } from "react-native";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { OptionChip, ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { PlanGoal, SharedPlanDifficulty } from "../constants/enums";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import {
  getSharedPlans,
  publishPlan,
  type CommunityFilters,
  type SharedPlanListItem,
  type SharedPlanSort,
} from "../services/CommunityService";
import { loadPlanSummaries } from "../services/PlanService";

const goalOptions: Array<{ label: string; value: CommunityFilters["goal"] }> = [
  { label: "全部目标", value: "all" },
  { label: "增肌", value: PlanGoal.Hypertrophy },
  { label: "力量", value: PlanGoal.Strength },
  { label: "耐力", value: PlanGoal.Endurance },
  { label: "通用", value: PlanGoal.General },
];

const difficultyOptions: Array<{
  label: string;
  value: CommunityFilters["difficulty"];
}> = [
  { label: "全部难度", value: "all" },
  { label: "新手", value: SharedPlanDifficulty.Beginner },
  { label: "进阶", value: SharedPlanDifficulty.Intermediate },
  { label: "高级", value: SharedPlanDifficulty.Advanced },
];

const sortOptions: Array<{ label: string; value: SharedPlanSort }> = [
  { label: "最新", value: "latest" },
  { label: "热度", value: "hot" },
  { label: "评分", value: "rating" },
];

export const CommunityScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [filters, setFilters] = useState<CommunityFilters>({
    difficulty: "all",
    goal: "all",
  });
  const [sort, setSort] = useState<SharedPlanSort>("latest");
  const [plans, setPlans] = useState<SharedPlanListItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      try {
        const response = await getSharedPlans(filters, sort, nextPage);
        setHasMore(response.hasMore);
        setPage(nextPage);
        setPlans((current) => (append ? [...current, ...response.items] : response.items));
      } catch (error) {
        Alert.alert("加载失败", error instanceof Error ? error.message : "请稍后再试");
      }
    },
    [filters, sort],
  );

  useFocusEffect(
    useCallback(() => {
      void loadPage(0, false);
    }, [loadPage]),
  );

  const handlePublishActivePlan = async () => {
    try {
      const localPlans = await loadPlanSummaries();
      const activePlan = localPlans.find((item) => item.isActive);
      if (!activePlan) {
        Alert.alert("没有激活计划", "先在计划页激活一个计划，再发布到社区。");
        return;
      }

      await publishPlan(
        activePlan.id,
        activePlan.name,
        "来自 wsTrack 社区的共享计划",
        SharedPlanDifficulty.Intermediate,
      );
      await loadPage(0, false);
    } catch (error) {
      Alert.alert("发布失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const renderPlanCard: ListRenderItem<SharedPlanListItem> = ({ item }) => (
    <Pressable
      onPress={() => navigation.navigate("SharedPlanDetail", { sharedPlanId: item.id })}
      style={({ pressed }) => [
        styles.planCard,
        pressed ? styles.cardPressed : undefined,
      ]}
    >
      <Text style={styles.planTitle}>{item.title}</Text>
      <Text style={styles.planDescription} numberOfLines={2}>
        {item.description}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{item.goal ?? "general"}</Text>
        <Text style={styles.metaText}>{item.difficulty}</Text>
        <Text style={styles.metaText}>评分 {item.averageRating.toFixed(1)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>点赞 {item.likesCount}</Text>
        <Text style={styles.metaText}>使用 {item.useCount}</Text>
        <Text style={styles.metaText}>评价 {item.reviewCount}</Text>
      </View>
    </Pressable>
  );

  return (
    <ScreenContainer
      onBackPress={() => navigation.goBack()}
      subtitle="浏览社区计划，按目标和难度筛选后直接导入。"
      title="社区计划"
      headerRight={
        <Pressable
          onPress={() => {
            void handlePublishActivePlan();
          }}
          style={({ pressed }) => [
            styles.publishButton,
            pressed ? styles.cardPressed : undefined,
          ]}
        >
          <Text style={styles.publishButtonText}>发布当前计划</Text>
        </Pressable>
      }
    >
      <View style={styles.filterBlock}>
        <Text style={styles.filterTitle}>目标</Text>
        <View style={styles.chipRow}>
          {goalOptions.map((item) => (
            <OptionChip
              key={item.label}
              label={item.label}
              onPress={() => setFilters((current) => ({ ...current, goal: item.value }))}
              selected={filters.goal === item.value}
            />
          ))}
        </View>

        <Text style={styles.filterTitle}>难度</Text>
        <View style={styles.chipRow}>
          {difficultyOptions.map((item) => (
            <OptionChip
              key={item.label}
              label={item.label}
              onPress={() =>
                setFilters((current) => ({ ...current, difficulty: item.value }))
              }
              selected={filters.difficulty === item.value}
            />
          ))}
        </View>

        <Text style={styles.filterTitle}>排序</Text>
        <View style={styles.chipRow}>
          {sortOptions.map((item) => (
            <OptionChip
              key={item.value}
              label={item.label}
              onPress={() => setSort(item.value)}
              selected={sort === item.value}
            />
          ))}
        </View>
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={plans}
        keyExtractor={(item) => item.id}
        renderItem={renderPlanCard}
        scrollEnabled={false}
        ListFooterComponent={
          hasMore ? (
            <Pressable
              onPress={() => {
                void loadPage(page + 1, true);
              }}
              style={({ pressed }) => [
                styles.loadMoreButton,
                pressed ? styles.cardPressed : undefined,
              ]}
            >
              <Text style={styles.loadMoreText}>加载更多</Text>
            </Pressable>
          ) : null
        }
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  filterBlock: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  filterTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  publishButton: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  publishButtonText: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: "700",
  },
  listContent: {
    gap: spacing.md,
  },
  planCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  planTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  planDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metaText: {
    color: colors.text,
    fontSize: 12,
  },
  loadMoreButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: spacing.md,
  },
  loadMoreText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  cardPressed: {
    opacity: 0.82,
  },
});

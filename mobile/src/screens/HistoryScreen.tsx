import { useCallback, useMemo, useState } from "react";
import type { ListRenderItem } from "react-native";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { OptionChip, SearchBar } from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import {
  loadCalendarMonthSessions,
  loadWorkoutHistoryPage,
  type HistoryFilters,
  type HistoryWorkoutListItem,
} from "../services/HistoryService";
import {
  addMonths,
  formatDuration,
  formatMonthLabel,
  nextMonthStart,
  startOfMonth,
  toDateKey,
} from "../utils";

type HistoryScreenProps = BottomTabScreenProps<MainTabParamList, "History">;

type ViewMode = "calendar" | "list";
type DateRangeFilter = "7d" | "30d" | "90d" | "all";

const PAGE_SIZE = 20;
const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

const buildFilters = (searchQuery: string, range: DateRangeFilter): HistoryFilters => ({
  dateRangeDays:
    range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null,
  searchQuery,
});

const getCalendarDays = (monthDate: Date): Array<Date | null> => {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = nextMonthStart(monthDate);
  const firstWeekday = monthStart.getDay();
  const leadingEmptyCount = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const totalDays = monthEnd.getDate() === 1 ? new Date(monthEnd.getTime() - 1).getDate() : 30;
  const days = Array.from({ length: leadingEmptyCount }, () => null as Date | null);

  for (let index = 1; index <= totalDays; index += 1) {
    days.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), index));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
};

const renderWorkoutCard = (
  item: HistoryWorkoutListItem,
  onPress: () => void,
): JSX.Element => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.workoutCard,
      pressed ? styles.cardPressed : undefined,
    ]}
    testID="history-workout-card"
  >
    <View style={styles.workoutCardTop}>
      <View style={styles.workoutCardCopy}>
        <Text style={styles.workoutTitle}>{item.title}</Text>
        <Text style={styles.workoutDate}>{item.dateLabel}</Text>
      </View>
      <Text style={styles.volumeValue}>{item.totalVolume}</Text>
    </View>

    <View style={styles.workoutMetaRow}>
      <Text style={styles.workoutMeta}>{formatDuration(item.durationSeconds)}</Text>
      <Text style={styles.workoutMeta}>{item.exerciseCount} 个动作</Text>
      <Text style={styles.workoutMeta}>总容量 {item.totalVolume}</Text>
    </View>
  </Pressable>
);

export const HistoryScreen = (_props: HistoryScreenProps) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeFilter>("30d");
  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [listItems, setListItems] = useState<HistoryWorkoutListItem[]>([]);
  const [listOffset, setListOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [monthItems, setMonthItems] = useState<HistoryWorkoutListItem[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);

  const filters = useMemo(
    () => buildFilters(searchQuery, dateRange),
    [dateRange, searchQuery],
  );

  const monthSessionsByDate = useMemo(() => {
    const map = new Map<string, HistoryWorkoutListItem[]>();
    for (const item of monthItems) {
      const key = toDateKey(new Date(item.startedAt));
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return map;
  }, [monthItems]);

  const selectedDayItems = useMemo(
    () => (selectedDayKey ? monthSessionsByDate.get(selectedDayKey) ?? [] : []),
    [monthSessionsByDate, selectedDayKey],
  );

  const loadListPage = useCallback(
    async (offset: number, append: boolean) => {
      setLoadingList(true);
      const page = await loadWorkoutHistoryPage({
        filters,
        limit: PAGE_SIZE,
        offset,
      });

      setHasMore(page.hasMore);
      setListOffset(offset + page.items.length);
      setListItems((current) => (append ? [...current, ...page.items] : page.items));
      setLoadingList(false);
    },
    [filters],
  );

  const loadMonth = useCallback(async () => {
    setLoadingMonth(true);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = nextMonthStart(monthDate);
    const items = await loadCalendarMonthSessions({
      filters,
      monthEndAt: monthEnd.getTime(),
      monthStartAt: monthStart.getTime(),
    });
    setMonthItems(items);

    const firstKey = items[0] ? toDateKey(new Date(items[0].startedAt)) : toDateKey(monthStart);
    setSelectedDayKey((current) => (current && items.some((item) => toDateKey(new Date(item.startedAt)) === current)
      ? current
      : firstKey));
    setLoadingMonth(false);
  }, [filters, monthDate]);

  useFocusEffect(
    useCallback(() => {
      void loadListPage(0, false);
      void loadMonth();
    }, [loadListPage, loadMonth]),
  );

  const calendarDays = useMemo(() => getCalendarDays(monthDate), [monthDate]);

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>训练历史</Text>
      <Text style={styles.subtitle}>
        按日历或列表浏览所有已完成训练，支持动作名搜索和日期范围筛选。
      </Text>

      <View style={styles.toggleRow}>
        <OptionChip
          label="列表视图"
          onPress={() => setViewMode("list")}
          selected={viewMode === "list"}
          testID="history-view-list"
        />
        <OptionChip
          label="日历视图"
          onPress={() => setViewMode("calendar")}
          selected={viewMode === "calendar"}
          testID="history-view-calendar"
        />
      </View>

      <SearchBar
        initialValue={searchQuery}
        onDebouncedChange={setSearchQuery}
        placeholder="按动作名搜索历史记录"
      />

      <View style={styles.filterRow}>
        {[
          { key: "7d", label: "7天" },
          { key: "30d", label: "30天" },
          { key: "90d", label: "90天" },
          { key: "all", label: "全部" },
        ].map((item) => (
          <OptionChip
            key={item.key}
            label={item.label}
            onPress={() => setDateRange(item.key as DateRangeFilter)}
            selected={dateRange === item.key}
            testID={`history-range-${item.key}`}
          />
        ))}
      </View>

      {viewMode === "calendar" ? (
        <View style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <Pressable
              onPress={() => setMonthDate((current) => addMonths(current, -1))}
              style={({ pressed }) => [
                styles.monthButton,
                pressed ? styles.cardPressed : undefined,
              ]}
            >
              <ChevronLeft color={colors.text} size={18} strokeWidth={2.4} />
            </Pressable>
            <Text style={styles.monthTitle}>{formatMonthLabel(monthDate)}</Text>
            <Pressable
              onPress={() => setMonthDate((current) => addMonths(current, 1))}
              style={({ pressed }) => [
                styles.monthButton,
                pressed ? styles.cardPressed : undefined,
              ]}
            >
              <ChevronRight color={colors.text} size={18} strokeWidth={2.4} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels.map((label) => (
              <Text key={label} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDays.map((day, index) => {
              if (!day) {
                return <View key={`empty-${index}`} style={styles.dayCell} />;
              }

              const key = toDateKey(day);
              const hasSession = monthSessionsByDate.has(key);
              const selected = selectedDayKey === key;

              return (
                <Pressable
                  key={key}
                  onPress={() => setSelectedDayKey(key)}
                  style={({ pressed }) => [
                    styles.dayCell,
                    selected ? styles.dayCellSelected : undefined,
                    pressed ? styles.cardPressed : undefined,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayLabel,
                      selected ? styles.dayLabelSelected : undefined,
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                  {hasSession ? <View style={styles.dayDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {viewMode === "calendar" ? (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>
            {selectedDayKey ?? "当日训练"}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {loadingMonth ? "正在加载月度记录..." : `共 ${selectedDayItems.length} 条训练`}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const data = viewMode === "calendar" ? selectedDayItems : listItems;

  const renderItem: ListRenderItem<HistoryWorkoutListItem> = ({ item }) =>
    renderWorkoutCard(item, () =>
      navigation.navigate("WorkoutDetail", { workoutId: item.workoutId }),
    );

  return (
    <View style={styles.container} testID="history-screen">
      <FlatList
        contentContainerStyle={styles.content}
        data={data}
        keyExtractor={(item) => item.workoutId}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {viewMode === "calendar"
                ? loadingMonth
                  ? "正在加载当月训练..."
                  : "当前没有匹配的训练"
                : loadingList
                  ? "正在加载训练历史..."
                  : "当前没有匹配的训练"}
            </Text>
          </View>
        }
        ListHeaderComponent={header}
        onEndReached={() => {
          if (viewMode !== "list" || loadingList || !hasMore) {
            return;
          }

          void loadListPage(listOffset, true);
        }}
        onEndReachedThreshold={0.3}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  toggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  calendarCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  monthHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  monthButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  monthTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  weekdayRow: {
    flexDirection: "row",
  },
  weekdayLabel: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  dayCell: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: "13%",
  },
  dayCellSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  dayLabelSelected: {
    color: colors.text,
  },
  dayDot: {
    backgroundColor: colors.warning,
    borderRadius: radii.pill,
    height: 6,
    marginTop: 2,
    width: 6,
  },
  sectionBlock: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  workoutCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  cardPressed: {
    opacity: 0.84,
  },
  workoutCardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  workoutCardCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  workoutTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  workoutDate: {
    color: colors.textMuted,
    fontSize: 13,
  },
  volumeValue: {
    color: colors.primarySoft,
    fontSize: 18,
    fontWeight: "800",
  },
  workoutMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  workoutMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.textMuted,
    fontSize: 14,
  },
});

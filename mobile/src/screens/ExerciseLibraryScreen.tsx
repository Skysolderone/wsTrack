import { useEffect, useMemo, useState } from "react";
import type { ListRenderItem } from "react-native";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ArrowLeft } from "lucide-react-native";
import { Q } from "@nozbe/watermelondb";

import {
  ExerciseCard,
  OptionChip,
  SearchBar,
} from "../components";
import {
  allEquipmentTypes,
  allExerciseCategories,
  allMuscleGroups,
  categoryLabels,
  equipmentLabels,
  getLocalizedValue,
  muscleGroupLabels,
} from "../constants/exerciseMetadata";
import { colors } from "../constants/colors";
import type {
  Equipment,
  ExerciseCategory,
  MuscleGroup,
} from "../constants/enums";
import { radii, spacing } from "../constants/sizes";
import { database } from "../database";
import type { Exercise } from "../models";
import type { RootStackParamList } from "../navigation/types";
import { useSettingsStore } from "../store/settingsStore";
import { matchesExerciseSearch } from "../utils";

export const ExerciseLibraryScreen = () => {
  const language = useSettingsStore((state) => state.language);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const canGoBack = navigation.canGoBack();
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleGroup[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<ExerciseCategory[]>([]);

  useEffect(() => {
    const subscription = database
      .get<Exercise>("exercises")
      .query(Q.where("is_archived", false), Q.sortBy("sort_order", Q.asc))
      .observe()
      .subscribe((records) => {
        setAllExercises(records);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const filteredExercises = useMemo(
    () =>
      allExercises.filter((exercise) => {
        const matchesSearch = matchesExerciseSearch(exercise, searchQuery);
        const matchesMuscles =
          selectedMuscles.length === 0 ||
          [...exercise.primaryMuscles, ...exercise.secondaryMuscles].some((muscle) =>
            selectedMuscles.includes(muscle),
          );
        const matchesEquipment =
          selectedEquipment.length === 0 || selectedEquipment.includes(exercise.equipment);
        const matchesCategory =
          selectedCategories.length === 0 || selectedCategories.includes(exercise.category);

        return matchesSearch && matchesMuscles && matchesEquipment && matchesCategory;
      }),
    [allExercises, searchQuery, selectedCategories, selectedEquipment, selectedMuscles],
  );

  const toggleSelection = <T extends string>(
    current: T[],
    value: T,
    setter: (values: T[]) => void,
  ) => {
    setter(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const renderItem: ListRenderItem<Exercise> = ({ item }) => (
    <ExerciseCard
      exercise={item}
      language={language}
      onPress={() => navigation.navigate("ExerciseDetail", { exerciseId: item.id })}
    />
  );

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.content}
        data={filteredExercises}
        initialNumToRender={10}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>没有匹配的动作</Text>
            <Text style={styles.emptySubtitle}>试试中文、英文名或拼音首字母搜索。</Text>
          </View>
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {canGoBack ? (
              <View style={styles.headerTopRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.goBack()}
                  style={({ pressed }) => [
                    styles.backButton,
                    pressed ? styles.backButtonPressed : undefined,
                  ]}
                >
                  <ArrowLeft color={colors.text} size={18} strokeWidth={2.4} />
                </Pressable>
              </View>
            ) : null}
            <Text style={styles.title}>动作库</Text>
            <Text style={styles.subtitle}>
              共 {allExercises.length} 个动作，支持实时搜索、肌群/器械/类型多选筛选。
            </Text>

            <SearchBar onDebouncedChange={setSearchQuery} />

            <View style={styles.filterCard}>
              <View style={styles.filterHeader}>
                <Text style={styles.filterTitle}>按肌群</Text>
                {selectedMuscles.length > 0 ? (
                  <Pressable onPress={() => setSelectedMuscles([])}>
                    <Text style={styles.clearText}>清空</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.filterWrap}>
                {allMuscleGroups.map((muscle) => (
                  <OptionChip
                    key={muscle}
                    label={getLocalizedValue(muscleGroupLabels, muscle, language)}
                    onPress={() =>
                      toggleSelection(selectedMuscles, muscle, setSelectedMuscles)
                    }
                    selected={selectedMuscles.includes(muscle)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.filterCard}>
              <View style={styles.filterHeader}>
                <Text style={styles.filterTitle}>按器械</Text>
                {selectedEquipment.length > 0 ? (
                  <Pressable onPress={() => setSelectedEquipment([])}>
                    <Text style={styles.clearText}>清空</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.filterWrap}>
                {allEquipmentTypes.map((equipment) => (
                  <OptionChip
                    key={equipment}
                    label={getLocalizedValue(equipmentLabels, equipment, language)}
                    onPress={() =>
                      toggleSelection(selectedEquipment, equipment, setSelectedEquipment)
                    }
                    selected={selectedEquipment.includes(equipment)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.filterCard}>
              <View style={styles.filterHeader}>
                <Text style={styles.filterTitle}>按类型</Text>
                {selectedCategories.length > 0 ? (
                  <Pressable onPress={() => setSelectedCategories([])}>
                    <Text style={styles.clearText}>清空</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.filterWrap}>
                {allExerciseCategories.map((category) => (
                  <OptionChip
                    key={category}
                    label={getLocalizedValue(categoryLabels, category, language)}
                    onPress={() =>
                      toggleSelection(selectedCategories, category, setSelectedCategories)
                    }
                    selected={selectedCategories.includes(category)}
                  />
                ))}
              </View>
            </View>
          </View>
        }
        maxToRenderPerBatch={10}
        removeClippedSubviews
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        updateCellsBatchingPeriod={40}
        windowSize={9}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate("CreateExercise")}
        style={({ pressed }) => [
          styles.fab,
          pressed ? styles.fabPressed : undefined,
        ]}
      >
        <Text style={styles.fabPlus}>+</Text>
        <Text style={styles.fabLabel}>自定义动作</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  list: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: 112,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  headerTopRow: {
    alignItems: "flex-start",
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
    opacity: 0.78,
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
  filterCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  filterHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  filterTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  clearText: {
    color: colors.primarySoft,
    fontSize: 13,
    fontWeight: "700",
  },
  filterWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
  fab: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    bottom: spacing.lg,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    position: "absolute",
    right: spacing.lg,
  },
  fabPressed: {
    opacity: 0.88,
  },
  fabPlus: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 22,
  },
  fabLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
});

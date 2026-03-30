import { useEffect, useMemo, useState } from "react";
import type { ListRenderItem } from "react-native";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Check, X } from "lucide-react-native";
import { Q } from "@nozbe/watermelondb";

import { colors } from "../constants/colors";
import {
  allEquipmentTypes,
  allExerciseCategories,
  allMuscleGroups,
  categoryLabels,
  equipmentLabels,
  getLocalizedValue,
  muscleGroupLabels,
} from "../constants/exerciseMetadata";
import type {
  Equipment,
  ExerciseCategory,
  MuscleGroup,
} from "../constants/enums";
import { radii, spacing } from "../constants/sizes";
import { database } from "../database";
import type { Exercise } from "../models";
import { useSettingsStore } from "../store/settingsStore";
import { matchesExerciseSearch } from "../utils";
import { ExerciseCard } from "./ExerciseCard";
import { OptionChip } from "./OptionChip";
import { SearchBar } from "./SearchBar";

interface ExercisePickerModalProps {
  initialSelectedIds?: string[];
  multiple?: boolean;
  onClose: () => void;
  onSubmit: (exerciseIds: string[]) => void;
  title?: string;
  visible: boolean;
}

const toggleValue = <T extends string>(values: T[], value: T): T[] =>
  values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];

export const ExercisePickerModal = ({
  initialSelectedIds = [],
  multiple = false,
  onClose,
  onSubmit,
  title = "选择动作",
  visible,
}: ExercisePickerModalProps) => {
  const language = useSettingsStore((state) => state.language);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleGroup[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<ExerciseCategory[]>([]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

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
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSearchQuery("");
    setSelectedIds(initialSelectedIds);
    setSelectedMuscles([]);
    setSelectedEquipment([]);
    setSelectedCategories([]);
  }, [initialSelectedIds, visible]);

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

  const handleExercisePress = (exerciseId: string) => {
    if (!multiple) {
      onSubmit([exerciseId]);
      return;
    }

    setSelectedIds((current) => toggleValue(current, exerciseId));
  };

  const handleConfirm = () => {
    if (selectedIds.length === 0) {
      return;
    }

    onSubmit(selectedIds);
  };

  const renderItem: ListRenderItem<Exercise> = ({ item }) => {
    const selected = selectedIds.includes(item.id);

    return (
      <ExerciseCard
        exercise={item}
        language={language}
        onPress={() => handleExercisePress(item.id)}
        selected={selected}
        testID={`exercise-picker-card-${item.id}`}
        trailing={
          selected ? (
            <View style={styles.selectionBadge}>
              <Check color={colors.text} size={14} strokeWidth={3} />
            </View>
          ) : null
        }
      />
    );
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable onPress={onClose} style={styles.scrim} />
        <View style={styles.sheet} testID="exercise-picker-modal">
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>
                {multiple
                  ? `已选 ${selectedIds.length} 个动作`
                  : `从 ${allExercises.length} 个动作中选择 1 个`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.closeButtonPressed : undefined,
              ]}
              testID="exercise-picker-close"
            >
              <X color={colors.text} size={18} strokeWidth={2.4} />
            </Pressable>
          </View>

          <FlatList
            contentContainerStyle={styles.content}
            data={filteredExercises}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>没有匹配的动作</Text>
                <Text style={styles.emptySubtitle}>调整搜索词或筛选条件后再试。</Text>
              </View>
            }
            ListHeaderComponent={
              <View style={styles.filters}>
                <SearchBar
                  initialValue={searchQuery}
                  onDebouncedChange={setSearchQuery}
                  placeholder="搜索动作、英文名或拼音首字母"
                />

                <View style={styles.filterCard}>
                  <View style={styles.filterHeader}>
                    <Text style={styles.filterTitle}>肌群</Text>
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
                          setSelectedMuscles((current) => toggleValue(current, muscle))
                        }
                        selected={selectedMuscles.includes(muscle)}
                      />
                    ))}
                  </View>
                </View>

                <View style={styles.filterCard}>
                  <View style={styles.filterHeader}>
                    <Text style={styles.filterTitle}>器械</Text>
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
                          setSelectedEquipment((current) => toggleValue(current, equipment))
                        }
                        selected={selectedEquipment.includes(equipment)}
                      />
                    ))}
                  </View>
                </View>

                <View style={styles.filterCard}>
                  <View style={styles.filterHeader}>
                    <Text style={styles.filterTitle}>类型</Text>
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
                          setSelectedCategories((current) => toggleValue(current, category))
                        }
                        selected={selectedCategories.includes(category)}
                      />
                    ))}
                  </View>
                </View>
              </View>
            }
            removeClippedSubviews
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
          />

          {multiple ? (
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                已选 {selectedIds.length} 个动作
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={selectedIds.length === 0}
                onPress={handleConfirm}
                style={({ pressed }) => [
                  styles.confirmButton,
                  selectedIds.length === 0 ? styles.confirmButtonDisabled : undefined,
                  pressed ? styles.confirmButtonPressed : undefined,
                ]}
                testID="exercise-picker-confirm"
              >
                <Text style={styles.confirmButtonText}>添加所选动作</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.backgroundElevated,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    height: "80%",
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  closeButtonPressed: {
    opacity: 0.72,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: 120,
  },
  filters: {
    gap: spacing.md,
    marginBottom: spacing.md,
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
    fontWeight: "600",
  },
  filterWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  selectionBadge: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
  footer: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  footerText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 14,
  },
  confirmButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    minWidth: 136,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  confirmButtonDisabled: {
    opacity: 0.42,
  },
  confirmButtonPressed: {
    opacity: 0.8,
  },
  confirmButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
});

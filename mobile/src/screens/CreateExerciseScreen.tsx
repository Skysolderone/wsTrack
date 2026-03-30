import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  EquipmentPicker,
  MuscleGroupSelector,
  OptionChip,
  ScreenContainer,
} from "../components";
import {
  categoryLabels,
  getLocalizedValue,
  trackingTypeLabels,
} from "../constants/exerciseMetadata";
import { colors } from "../constants/colors";
import {
  ExerciseCategory,
  Equipment,
  TrackingType,
  type MuscleGroup,
} from "../constants/enums";
import { radii, spacing } from "../constants/sizes";
import { database } from "../database";
import type { Exercise } from "../models";
import type { RootStackParamList } from "../navigation/types";
import {
  createCustomExercise,
  updateCustomExercise,
} from "../services/ExerciseLibraryService";
import { useSettingsStore } from "../store/settingsStore";

type CreateExerciseScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "CreateExercise"
>;

interface FormState {
  equipment: Equipment;
  name: string;
  nameEn: string;
  notes: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  trackingType: TrackingType;
}

const initialFormState: FormState = {
  equipment: Equipment.Barbell,
  name: "",
  nameEn: "",
  notes: "",
  primaryMuscles: [],
  secondaryMuscles: [],
  trackingType: TrackingType.WeightReps,
};

const deriveCategoryPreview = (
  equipment: Equipment,
  trackingType: TrackingType,
): ExerciseCategory => {
  if (trackingType === TrackingType.Distance) {
    return ExerciseCategory.Cardio;
  }

  if (equipment === Equipment.Bodyweight && trackingType !== TrackingType.WeightReps) {
    return ExerciseCategory.Bodyweight;
  }

  return ExerciseCategory.Strength;
};

export const CreateExerciseScreen = ({
  navigation,
  route,
}: CreateExerciseScreenProps) => {
  const language = useSettingsStore((state) => state.language);
  const exerciseId = route.params?.exerciseId;
  const [form, setForm] = useState<FormState>(initialFormState);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!exerciseId) {
      setForm(initialFormState);
      return;
    }

    let active = true;

    const loadExercise = async () => {
      const exercise = await database.get<Exercise>("exercises").find(exerciseId);

      if (!active) {
        return;
      }

      setForm({
        equipment: exercise.equipment,
        name: exercise.name,
        nameEn: exercise.nameEn ?? "",
        notes: exercise.notes ?? "",
        primaryMuscles: exercise.primaryMuscles,
        secondaryMuscles: exercise.secondaryMuscles,
        trackingType: exercise.trackingType,
      });
    };

    void loadExercise();

    return () => {
      active = false;
    };
  }, [exerciseId]);

  const isValid = form.name.trim().length > 0 && form.primaryMuscles.length > 0;
  const categoryPreview = useMemo(
    () => deriveCategoryPreview(form.equipment, form.trackingType),
    [form.equipment, form.trackingType],
  );

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    if (!isValid || submitting) {
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        equipment: form.equipment,
        name: form.name,
        nameEn: form.nameEn,
        notes: form.notes,
        primaryMuscles: form.primaryMuscles,
        secondaryMuscles: form.secondaryMuscles,
        trackingType: form.trackingType,
      };

      if (exerciseId) {
        await updateCustomExercise(database, exerciseId, payload);
      } else {
        await createCustomExercise(database, payload);
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "请稍后再试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer
      onBackPress={() => navigation.goBack()}
      title={exerciseId ? "编辑自定义动作" : "创建自定义动作"}
      subtitle="填写动作基础信息，保存后会自动返回动作库。"
    >
      <View style={styles.form}>
        <View style={styles.card}>
          <Text style={styles.label}>名称 *</Text>
          <TextInput
            onChangeText={(value) => updateField("name", value)}
            placeholder="例如：杠铃上斜卧推"
            placeholderTextColor={colors.textSubtle}
            selectionColor={colors.primary}
            style={styles.input}
            value={form.name}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>英文名</Text>
          <TextInput
            onChangeText={(value) => updateField("nameEn", value)}
            placeholder="Incline Barbell Bench Press"
            placeholderTextColor={colors.textSubtle}
            selectionColor={colors.primary}
            style={styles.input}
            value={form.nameEn}
          />
        </View>

        <MuscleGroupSelector
          label="主要肌群 *"
          language={language}
          onChange={(value) => updateField("primaryMuscles", value)}
          selected={form.primaryMuscles}
        />

        <MuscleGroupSelector
          label="次要肌群"
          language={language}
          onChange={(value) => updateField("secondaryMuscles", value)}
          selected={form.secondaryMuscles}
        />

        <EquipmentPicker
          language={language}
          onChange={(value) => updateField("equipment", value)}
          value={form.equipment}
        />

        <View style={styles.card}>
          <Text style={styles.label}>记录类型</Text>
          <View style={styles.chips}>
            {Object.values(TrackingType).map((trackingType) => (
              <OptionChip
                key={trackingType}
                label={getLocalizedValue(trackingTypeLabels, trackingType, language)}
                onPress={() => updateField("trackingType", trackingType)}
                selected={form.trackingType === trackingType}
              />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>分类预览</Text>
          <Text style={styles.previewValue}>
            {getLocalizedValue(categoryLabels, categoryPreview, language)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>备注</Text>
          <TextInput
            multiline
            numberOfLines={5}
            onChangeText={(value) => updateField("notes", value)}
            placeholder="记录动作要点、角度或替代建议"
            placeholderTextColor={colors.textSubtle}
            selectionColor={colors.primary}
            style={[styles.input, styles.notesInput]}
            textAlignVertical="top"
            value={form.notes}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!isValid || submitting}
          onPress={handleSave}
          style={({ pressed }) => [
            styles.saveButton,
            (!isValid || submitting) ? styles.saveButtonDisabled : undefined,
            pressed ? styles.saveButtonPressed : undefined,
          ]}
        >
          <Text style={styles.saveButtonText}>
            {submitting ? "保存中..." : "保存动作"}
          </Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  input: {
    color: colors.text,
    fontSize: 15,
    minHeight: 24,
    padding: 0,
  },
  notesInput: {
    minHeight: 112,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  previewValue: {
    color: colors.primarySoft,
    fontSize: 15,
    fontWeight: "700",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
  },
  saveButtonDisabled: {
    backgroundColor: colors.surfaceAlt,
  },
  saveButtonPressed: {
    opacity: 0.88,
  },
  saveButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
});

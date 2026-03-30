import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { ScreenContainer } from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import {
  getSharedPlanDetail,
  importSharedPlan,
  ratePlan,
  reportPlan,
  type SharedPlanDetail,
} from "../services/CommunityService";

type SharedPlanDetailScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "SharedPlanDetail"
>;

export const SharedPlanDetailScreen = ({
  navigation,
  route,
}: SharedPlanDetailScreenProps) => {
  const { sharedPlanId } = route.params;
  const [detail, setDetail] = useState<SharedPlanDetail | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const nextDetail = await getSharedPlanDetail(sharedPlanId);
        if (active) {
          setDetail(nextDetail);
        }
      } catch (error) {
        Alert.alert("加载失败", error instanceof Error ? error.message : "请稍后再试");
      }
    })();

    return () => {
      active = false;
    };
  }, [sharedPlanId]);

  const handleImport = async () => {
    try {
      const planId = await importSharedPlan(sharedPlanId);
      navigation.navigate("PlanEditor", { planId });
    } catch (error) {
      Alert.alert("导入失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const handleRate = async () => {
    try {
      await ratePlan(sharedPlanId, rating, comment);
      const nextDetail = await getSharedPlanDetail(sharedPlanId);
      setDetail(nextDetail);
      setComment("");
    } catch (error) {
      Alert.alert("评分失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  if (!detail) {
    return (
      <View style={styles.loadingState}>
        <Text style={styles.loadingText}>正在加载社区计划...</Text>
      </View>
    );
  }

  return (
    <ScreenContainer
      onBackPress={() => navigation.goBack()}
      subtitle={`${detail.plan.difficulty} · 评分 ${detail.plan.averageRating.toFixed(1)}`}
      title={detail.plan.title}
    >
      <View style={styles.card}>
        <Text style={styles.description}>{detail.plan.description}</Text>
        <Pressable
          onPress={() => {
            void handleImport();
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed ? styles.cardPressed : undefined,
          ]}
        >
          <Text style={styles.primaryButtonText}>导入为我的计划</Text>
        </Pressable>
      </View>

      {detail.planSnapshot.days.map((day) => (
        <View key={day.name} style={styles.card}>
          <Text style={styles.dayTitle}>{day.name}</Text>
          {day.exercises.map((exercise) => (
            <View key={`${day.name}-${exercise.exerciseId}`} style={styles.exerciseRow}>
              <View style={styles.exerciseCopy}>
                <Text style={styles.exerciseName}>{exercise.exerciseName}</Text>
                <Text style={styles.exerciseMeta}>
                  {exercise.targetSets} 组 · {exercise.targetReps ?? "--"} · 休息{" "}
                  {exercise.restSeconds ?? 90}s
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.dayTitle}>写评价</Text>
        <View style={styles.ratingRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              key={value}
              onPress={() => setRating(value)}
              style={({ pressed }) => [
                styles.starButton,
                rating === value ? styles.starButtonActive : undefined,
                pressed ? styles.cardPressed : undefined,
              ]}
            >
              <Text style={styles.starText}>{rating >= value ? "★" : "☆"}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          multiline
          onChangeText={setComment}
          placeholder="写下你对这个计划的看法"
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          style={styles.commentInput}
          textAlignVertical="top"
          value={comment}
        />
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              void handleRate();
            }}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.cardPressed : undefined,
            ]}
          >
            <Text style={styles.secondaryButtonText}>提交评分</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void reportPlan(sharedPlanId, "内容不合适");
            }}
            style={({ pressed }) => [
              styles.reportButton,
              pressed ? styles.cardPressed : undefined,
            ]}
          >
            <Text style={styles.reportButtonText}>举报</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.dayTitle}>评价列表</Text>
        {detail.reviews.length === 0 ? (
          <Text style={styles.emptyText}>还没有用户评价。</Text>
        ) : (
          detail.reviews.map((review) => (
            <View key={review.id} style={styles.reviewItem}>
              <Text style={styles.reviewTitle}>
                {review.rating}/5 · {new Date(review.createdAt).toLocaleDateString()}
              </Text>
              <Text style={styles.reviewText}>{review.comment || "未填写文字评价"}</Text>
            </View>
          ))
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  loadingState: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
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
  dayTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  exerciseRow: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  exerciseCopy: {
    gap: spacing.xs,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  exerciseMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  ratingRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  starButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  starButtonActive: {
    backgroundColor: colors.primary,
  },
  starText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  commentInput: {
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    minHeight: 96,
    padding: spacing.md,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  reportButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 118, 117, 0.16)",
    borderColor: "rgba(255, 118, 117, 0.28)",
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  reportButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  reviewItem: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.sm,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  reviewTitle: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: "700",
  },
  reviewText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  cardPressed: {
    opacity: 0.82,
  },
});

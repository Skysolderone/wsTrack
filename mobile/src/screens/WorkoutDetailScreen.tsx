import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import Video from "react-native-video";
import type ViewShot from "react-native-view-shot";

import {
  InfoCard,
  OptionChip,
  ScreenContainer,
  WorkoutShareCard,
  shareCapturedWorkoutCard,
  type WorkoutShareTemplate,
} from "../components";
import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import type { RootStackParamList } from "../navigation/types";
import {
  getWorkoutComments,
  type CoachWorkoutCommentItem,
} from "../services/CoachService";
import { loadWorkoutDetail, type WorkoutDetailData } from "../services/HistoryService";
import { getVideosForWorkout, type SavedWorkoutVideo } from "../services/VideoService";
import { useWorkoutStore } from "../store/workoutStore";
import { formatDuration } from "../utils";

type WorkoutDetailScreenProps = NativeStackScreenProps<RootStackParamList, "WorkoutDetail">;

const shareTemplates: Array<{
  label: string;
  value: WorkoutShareTemplate;
}> = [
  { label: "渐变蓝", value: "gradient_blue" },
  { label: "极简黑", value: "minimal_black" },
  { label: "运动感", value: "sport_energy" },
];

const toMediaUri = (path: string | null): string | null => {
  if (!path) {
    return null;
  }

  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("file://")
  ) {
    return path;
  }

  return `file://${path}`;
};

export const WorkoutDetailScreen = ({
  navigation,
  route,
}: WorkoutDetailScreenProps) => {
  const { workoutId } = route.params;
  const activeWorkout = useWorkoutStore((state) => state.activeWorkout);
  const discardRecoveredWorkout = useWorkoutStore((state) => state.discardRecoveredWorkout);
  const startWorkoutFromRepeat = useWorkoutStore((state) => state.startWorkoutFromRepeat);
  const shareCardRef = useRef<ViewShot | null>(null);
  const [detail, setDetail] = useState<WorkoutDetailData | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [shareTemplate, setShareTemplate] =
    useState<WorkoutShareTemplate>("gradient_blue");
  const [sharing, setSharing] = useState(false);
  const [coachComments, setCoachComments] = useState<CoachWorkoutCommentItem[]>([]);
  const [videos, setVideos] = useState<SavedWorkoutVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<SavedWorkoutVideo | null>(null);
  const selectedVideoUri = selectedVideo
    ? toMediaUri(selectedVideo.cloudUrl ?? selectedVideo.filePath)
    : null;

  const loadDetail = useCallback(async () => {
    try {
      const nextDetail = await loadWorkoutDetail(workoutId);
      const [commentsResult, videosResult] = await Promise.allSettled([
        getWorkoutComments(workoutId),
        getVideosForWorkout(workoutId),
      ]);
      setDetail(nextDetail);
      setCoachComments(
        commentsResult.status === "fulfilled" ? commentsResult.value : [],
      );
      setVideos(videosResult.status === "fulfilled" ? videosResult.value : []);
      setExpandedIds(nextDetail.exercises.map((exercise) => exercise.workoutExerciseId));
    } catch (error) {
      Alert.alert("加载失败", error instanceof Error ? error.message : "请稍后再试");
    }
  }, [workoutId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const shareData = useMemo(() => {
    if (!detail) {
      return null;
    }

    return {
      dateLabel: detail.dateLabel,
      durationLabel: formatDuration(detail.durationSeconds),
      exercises: detail.exercises.map((exercise) => ({
        name: exercise.name,
        prCount: exercise.sets.filter((set) => set.isPr).length,
        setCount: exercise.sets.filter((set) => set.isCompleted).length || exercise.sets.length,
        volume: exercise.volume,
      })),
      prItems: detail.exercises.flatMap((exercise) =>
        exercise.sets
          .filter((set) => set.isPr)
          .map((set) => `${exercise.name} · ${set.weight ?? "--"}${set.unit} x ${set.reps ?? "--"}`),
      ),
      title: detail.title,
      totalVolume: detail.totalVolume,
    };
  }, [detail]);

  const handleShare = async () => {
    if (!shareData || !shareCardRef.current) {
      return;
    }

    try {
      setSharing(true);
      const uri = await shareCardRef.current.capture();
      await shareCapturedWorkoutCard(uri);
    } catch (error) {
      Alert.alert("分享失败", error instanceof Error ? error.message : "请稍后再试");
    } finally {
      setSharing(false);
    }
  };

  const handleRepeat = async () => {
    if (activeWorkout) {
      Alert.alert("已有进行中的训练", "恢复或放弃当前训练后，再开始复制训练。", [
        {
          text: "恢复当前",
          onPress: () => navigation.navigate("ActiveWorkout"),
        },
        {
          text: "放弃并开始",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await discardRecoveredWorkout();
              const nextWorkoutId = await startWorkoutFromRepeat(workoutId);
              if (nextWorkoutId) {
                navigation.navigate("ActiveWorkout");
              }
            })();
          },
        },
        { text: "取消", style: "cancel" },
      ]);
      return;
    }

    const nextWorkoutId = await startWorkoutFromRepeat(workoutId);
    if (nextWorkoutId) {
      navigation.navigate("ActiveWorkout");
    }
  };

  if (!detail) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScreenContainer
      onBackPress={() => navigation.goBack()}
      subtitle={detail.dateLabel}
      title={detail.title}
    >
      <View style={styles.metricsRow}>
        <InfoCard
          description="训练时长"
          title="Duration"
          value={formatDuration(detail.durationSeconds)}
        />
        <InfoCard description="总容量" title="Volume" value={`${detail.totalVolume}`} />
      </View>

      <View style={styles.metricsRow}>
        <InfoCard description="动作数" title="Exercises" value={`${detail.exerciseCount}`} />
        <InfoCard
          description="评分"
          title="Rating"
          value={detail.rating ? `${detail.rating}/5` : "--"}
        />
      </View>

      {detail.notes ? (
        <View style={styles.notesCard}>
          <Text style={styles.notesTitle}>训练日志</Text>
          <Text style={styles.notesText}>{detail.notes}</Text>
        </View>
      ) : null}

      {coachComments.length > 0 ? (
        <View style={styles.notesCard}>
          <Text style={styles.notesTitle}>教练评语</Text>
          <View style={styles.commentList}>
            {coachComments.map((comment) => (
              <View key={comment.id} style={styles.commentCard}>
                <Text style={styles.commentAuthor}>
                  {comment.coachName ?? "教练"} ·{" "}
                  {new Date(comment.createdAt).toLocaleDateString()}
                </Text>
                <Text style={styles.commentText}>{comment.comment}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.shareCard}>
        <Text style={styles.shareTitle}>训练截图分享</Text>
        <Text style={styles.shareSubtitle}>可选 3 种模板，直接导出为图片并打开系统分享。</Text>
        <View style={styles.templateRow}>
          {shareTemplates.map((item) => (
            <OptionChip
              key={item.value}
              label={item.label}
              onPress={() => setShareTemplate(item.value)}
              selected={shareTemplate === item.value}
            />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={sharing}
          onPress={() => {
            void handleShare();
          }}
          style={({ pressed }) => [
            styles.shareButton,
            sharing ? styles.buttonDisabled : undefined,
            pressed ? styles.cardPressed : undefined,
          ]}
        >
          <Text style={styles.shareButtonText}>
            {sharing ? "生成分享卡片中..." : "分享训练截图"}
          </Text>
        </Pressable>
      </View>

      {videos.length > 0 ? (
        <View style={styles.shareCard}>
          <Text style={styles.shareTitle}>动作视频</Text>
          <Text style={styles.shareSubtitle}>
            已自动关联到训练组，点击缩略图即可全屏回看。
          </Text>
          <View style={styles.videoGrid}>
            {videos.map((video) => {
              const thumbnailUri = toMediaUri(video.thumbnailPath);

              return (
                <Pressable
                  key={video.id}
                  onPress={() => setSelectedVideo(video)}
                  style={({ pressed }) => [
                    styles.videoCard,
                    pressed ? styles.cardPressed : undefined,
                  ]}
                >
                  {thumbnailUri ? (
                    <Image source={{ uri: thumbnailUri }} style={styles.videoThumbnail} />
                  ) : (
                    <View style={[styles.videoThumbnail, styles.videoThumbnailFallback]}>
                      <Text style={styles.videoThumbnailFallbackText}>无预览</Text>
                    </View>
                  )}
                  <View style={styles.videoMeta}>
                    <Text numberOfLines={1} style={styles.videoTitle}>
                      {video.exerciseName} · 第 {video.setNumber} 组
                    </Text>
                    <Text style={styles.videoSubtitle}>
                      {formatDuration(video.durationSeconds)} ·{" "}
                      {Math.round(video.fileSizeBytes / 1024 / 1024)} MB
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.exerciseList}>
        {detail.exercises.map((exercise) => {
          const expanded = expandedIds.includes(exercise.workoutExerciseId);

          return (
            <View key={exercise.workoutExerciseId} style={styles.exerciseCard}>
              <Pressable
                onPress={() =>
                  setExpandedIds((current) =>
                    current.includes(exercise.workoutExerciseId)
                      ? current.filter((id) => id !== exercise.workoutExerciseId)
                      : [...current, exercise.workoutExerciseId],
                  )
                }
                style={({ pressed }) => [
                  styles.exerciseHeader,
                  pressed ? styles.cardPressed : undefined,
                ]}
              >
                <View style={styles.exerciseCopy}>
                  <Text style={styles.exerciseTitle}>{exercise.name}</Text>
                  <Text style={styles.exerciseMeta}>
                    {exercise.sets.length} 组 · 容量 {exercise.volume}
                  </Text>
                </View>
                {expanded ? (
                  <ChevronUp color={colors.textMuted} size={18} strokeWidth={2.4} />
                ) : (
                  <ChevronDown color={colors.textMuted} size={18} strokeWidth={2.4} />
                )}
              </Pressable>

              {expanded ? (
                <View style={styles.setsWrap}>
                  {exercise.sets.map((set) => (
                    <View
                      key={`${exercise.workoutExerciseId}-${set.setNumber}`}
                      style={[styles.setRow, set.isPr ? styles.setRowPr : undefined]}
                    >
                      <Text style={styles.setCell}>{set.setNumber}</Text>
                      <Text style={styles.setCell}>
                        {set.weight ?? "--"} {set.unit}
                      </Text>
                      <Text style={styles.setCell}>{set.reps ?? "--"} 次</Text>
                      <Text style={styles.setCell}>RPE {set.rpe ?? "--"}</Text>
                      <Text style={styles.setCell}>{set.isWarmup ? "热身" : "正式"}</Text>
                      <Text style={[styles.setCell, set.isPr ? styles.prText : undefined]}>
                        {set.isPr ? "PR" : set.isCompleted ? "完成" : "--"}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void handleRepeat();
        }}
        style={({ pressed }) => [
          styles.repeatButton,
          pressed ? styles.cardPressed : undefined,
        ]}
      >
        <Text style={styles.repeatButtonText}>再练一次</Text>
      </Pressable>

      {shareData ? (
        <View pointerEvents="none" style={styles.hiddenCapture}>
          <WorkoutShareCard data={shareData} ref={shareCardRef} template={shareTemplate} />
        </View>
      ) : null}

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedVideo(null)}
        transparent
        visible={selectedVideo !== null}
      >
        <View style={styles.videoModal}>
          <Pressable onPress={() => setSelectedVideo(null)} style={styles.videoModalScrim} />
          <View style={styles.videoPlayerCard}>
            <View style={styles.videoPlayerHeader}>
              <View style={styles.videoPlayerCopy}>
                <Text style={styles.videoPlayerTitle}>
                  {selectedVideo?.exerciseName ?? "动作视频"}
                </Text>
                <Text style={styles.videoPlayerSubtitle}>
                  {selectedVideo ? `第 ${selectedVideo.setNumber} 组` : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => setSelectedVideo(null)}
                style={({ pressed }) => [
                  styles.closeVideoButton,
                  pressed ? styles.cardPressed : undefined,
                ]}
              >
                <Text style={styles.closeVideoButtonText}>关闭</Text>
              </Pressable>
            </View>
            {selectedVideo && selectedVideoUri ? (
              <Video
                controls
                resizeMode="contain"
                source={{ uri: selectedVideoUri }}
                style={styles.videoPlayer}
              />
            ) : null}
          </View>
        </View>
      </Modal>
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
  metricsRow: {
    gap: spacing.md,
  },
  notesCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  notesTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  notesText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  commentList: {
    gap: spacing.sm,
  },
  commentCard: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.sm,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  commentAuthor: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: "700",
  },
  commentText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  shareCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  shareTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  shareSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  templateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  shareButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  shareButtonText: {
    color: colors.primarySoft,
    fontSize: 14,
    fontWeight: "800",
  },
  videoGrid: {
    gap: spacing.sm,
  },
  videoCard: {
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  videoThumbnail: {
    backgroundColor: colors.surfaceAlt,
    height: 180,
    width: "100%",
  },
  videoThumbnailFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  videoThumbnailFallbackText: {
    color: colors.textSubtle,
    fontSize: 13,
    fontWeight: "700",
  },
  videoMeta: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  videoTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  videoSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
  },
  exerciseList: {
    gap: spacing.md,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  exerciseHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    padding: spacing.md,
  },
  exerciseCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  exerciseTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  exerciseMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  setsWrap: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  setRow: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  setRowPr: {
    borderColor: colors.warning,
    borderWidth: 1,
  },
  setCell: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  prText: {
    color: colors.warning,
    fontWeight: "800",
  },
  repeatButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  repeatButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  cardPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  hiddenCapture: {
    left: -9999,
    position: "absolute",
    top: -9999,
  },
  videoModal: {
    backgroundColor: "rgba(6, 6, 10, 0.84)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  videoModalScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  videoPlayerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    overflow: "hidden",
    padding: spacing.md,
  },
  videoPlayerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  videoPlayerCopy: {
    flex: 1,
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  videoPlayerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  videoPlayerSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
  },
  closeVideoButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeVideoButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  videoPlayer: {
    aspectRatio: 9 / 16,
    backgroundColor: "#000000",
    borderRadius: radii.md,
    width: "100%",
  },
});

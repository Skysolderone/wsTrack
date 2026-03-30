import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from "react-native-vision-camera";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";
import {
  bindRecordingCamera,
  saveVideo,
  startRecording,
  stopRecording,
} from "../services/VideoService";

interface RecorderTarget {
  exerciseName: string;
  setNumber: number;
  workoutSetId: string;
}

interface VideoRecorderProps {
  onSaved?: (videoId: string) => void;
  target: RecorderTarget | null;
}

const MAX_RECORD_SECONDS = 60;
const MIN_RECORD_SECONDS = 15;

export const VideoRecorder = ({ onSaved, target }: VideoRecorderProps) => {
  const device = useCameraDevice("back");
  const cameraPermission = useCameraPermission();
  const microphonePermission = useMicrophonePermission();
  const [visible, setVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(MAX_RECORD_SECONDS);
  const [sessionTarget, setSessionTarget] = useState<RecorderTarget | null>(null);
  const elapsedSeconds = useMemo(
    () => MAX_RECORD_SECONDS - remainingSeconds,
    [remainingSeconds],
  );

  useEffect(
    () => () => {
      bindRecordingCamera(null);
    },
    [],
  );

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (isRecording && remainingSeconds === 0) {
      void handleStopRecording();
    }
  }, [isRecording, remainingSeconds]);

  const ensurePermissions = async (): Promise<boolean> => {
    const cameraGranted = cameraPermission.hasPermission
      ? true
      : await cameraPermission.requestPermission();
    const microphoneGranted = microphonePermission.hasPermission
      ? true
      : await microphonePermission.requestPermission();

    if (!cameraGranted || !microphoneGranted) {
      Alert.alert("权限不足", "请授予摄像头和麦克风权限后再录制动作视频。");
      return false;
    }

    return true;
  };

  const handleOpen = async () => {
    if (!target) {
      Alert.alert("暂无可关联的组", "先完成或选择当前训练组，再开始录制。");
      return;
    }

    const granted = await ensurePermissions();
    if (!granted) {
      return;
    }

    setRemainingSeconds(MAX_RECORD_SECONDS);
    setSessionTarget(target);
    setVisible(true);
  };

  const handleStartRecording = async () => {
    try {
      setRemainingSeconds(MAX_RECORD_SECONDS);
      await startRecording();
      setIsRecording(true);
    } catch (error) {
      Alert.alert("录制失败", error instanceof Error ? error.message : "请稍后再试");
    }
  };

  const resetRecorder = () => {
    setVisible(false);
    setIsRecording(false);
    setRemainingSeconds(MAX_RECORD_SECONDS);
    setSessionTarget(null);
  };

  const handleStopRecording = async () => {
    if (!isRecording || !sessionTarget) {
      return;
    }

    try {
      const result = await stopRecording();
      const videoId = await saveVideo(sessionTarget.workoutSetId, result.filePath, {
        durationSeconds: result.durationSeconds,
        fileSizeBytes: result.fileSizeBytes,
      });
      onSaved?.(videoId);
      Alert.alert(
        "视频已保存",
        `${sessionTarget.exerciseName} 第 ${sessionTarget.setNumber} 组视频已关联。`,
      );
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "请稍后再试");
    } finally {
      resetRecorder();
    }
  };

  const handleDismiss = () => {
    if (isRecording) {
      Alert.alert("录制进行中", "请先点击“停止并保存”，避免丢失当前视频。");
      return;
    }

    resetRecorder();
  };

  const canStop = elapsedSeconds >= MIN_RECORD_SECONDS;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void handleOpen();
        }}
        style={({ pressed }) => [
          styles.fab,
          pressed ? styles.buttonPressed : undefined,
        ]}
      >
        <Text style={styles.fabText}>{target ? "录制" : "视频"}</Text>
      </Pressable>

      <Modal animationType="slide" onRequestClose={handleDismiss} visible={visible}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>训练视频录制</Text>
              <Text style={styles.subtitle}>
                {sessionTarget
                  ? `${sessionTarget.exerciseName} · 第 ${sessionTarget.setNumber} 组`
                  : "当前未定位到训练组"}
              </Text>
            </View>
            <Pressable
              onPress={handleDismiss}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.closeButtonText}>关闭</Text>
            </Pressable>
          </View>

          <View style={styles.preview}>
            {device ? (
              <Camera
                audio
                device={device}
                isActive={visible}
                ref={(camera) => bindRecordingCamera(camera)}
                style={StyleSheet.absoluteFill}
                video
              />
            ) : (
              <Text style={styles.emptyText}>未检测到可用摄像头设备。</Text>
            )}

            <View style={styles.overlay}>
              <Text style={styles.timer}>{remainingSeconds}s</Text>
              <Text style={styles.hint}>
                录制时长 15-60 秒，结束后会自动压缩到 720p。
              </Text>
            </View>
          </View>

          {!isRecording ? (
            <Pressable
              onPress={() => {
                void handleStartRecording();
              }}
              style={({ pressed }) => [
                styles.recordButton,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.recordButtonText}>开始录制</Text>
            </Pressable>
          ) : (
            <Pressable
              disabled={!canStop}
              onPress={() => {
                void handleStopRecording();
              }}
              style={({ pressed }) => [
                styles.stopButton,
                !canStop ? styles.buttonDisabled : undefined,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.recordButtonText}>
                {canStop ? "停止并保存" : `至少录制 ${MIN_RECORD_SECONDS}s`}
              </Text>
            </Pressable>
          )}
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    bottom: 96,
    height: 60,
    justifyContent: "center",
    position: "absolute",
    right: spacing.lg,
    width: 60,
    zIndex: 25,
  },
  fabText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  modal: {
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  closeButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  preview: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    flex: 1,
    overflow: "hidden",
  },
  overlay: {
    backgroundColor: "rgba(8, 8, 14, 0.38)",
    left: 0,
    padding: spacing.md,
    position: "absolute",
    right: 0,
    top: 0,
  },
  timer: {
    color: colors.warning,
    fontSize: 28,
    fontWeight: "900",
  },
  hint: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  recordButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  stopButton: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  recordButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});

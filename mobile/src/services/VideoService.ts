import Config from "react-native-config";
import { Q } from "@nozbe/watermelondb";
import { Video as CompressorVideo } from "react-native-compressor";
import { createThumbnail } from "react-native-create-thumbnail";
import RNFS from "react-native-fs";
import { Camera, type VideoFile } from "react-native-vision-camera";

import { database } from "../database";
import { WorkoutVideo } from "../models";

export interface RecordingResult {
  durationSeconds: number;
  filePath: string;
  fileSizeBytes: number;
}

export interface SavedWorkoutVideo {
  cloudUrl: string | null;
  createdAt: number;
  durationSeconds: number;
  exerciseName: string;
  filePath: string;
  fileSizeBytes: number;
  id: string;
  setNumber: number;
  thumbnailPath: string | null;
  workoutId: string;
  workoutSetId: string;
}

interface RawVideoRow extends Record<string, unknown> {}

let recorderCamera: Camera | null = null;
let recordingPromise: Promise<RecordingResult> | null = null;
let recordingResolve: ((value: RecordingResult) => void) | null = null;
let recordingReject: ((error: Error) => void) | null = null;

const storageBucket = Config.SUPABASE_STORAGE_BUCKET ?? "workout-videos";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const toString = (value: unknown): string =>
  typeof value === "string" ? value : `${value ?? ""}`;

const runRawQuery = async (
  sql: string,
  placeholders: unknown[] = [],
): Promise<RawVideoRow[]> =>
  (await database
    .get<WorkoutVideo>("workout_videos")
    .query(Q.unsafeSqlQuery(sql, placeholders))
    .unsafeFetchRaw()) as RawVideoRow[];

const compressVideo = async (video: VideoFile): Promise<RecordingResult> => {
  const filePath = await CompressorVideo.compress(video.path, {
    compressionMethod: "manual",
    maxSize: 720,
    minimumFileSizeForCompress: 0,
  });
  const stats = await RNFS.stat(filePath);

  return {
    durationSeconds: Math.max(1, Math.round(video.duration ?? 15)),
    filePath,
    fileSizeBytes: video.size ?? stats.size,
  };
};

export const bindRecordingCamera = (camera: Camera | null): void => {
  recorderCamera = camera;
};

export const startRecording = async (): Promise<void> => {
  if (!recorderCamera) {
    throw new Error("摄像头尚未准备好");
  }

  if (recordingPromise) {
    throw new Error("当前已有录制任务");
  }

  recordingPromise = new Promise<RecordingResult>((resolve, reject) => {
    recordingResolve = resolve;
    recordingReject = reject;
  });

  recorderCamera.startRecording({
    fileType: "mp4",
    onRecordingError: (error) => {
      recordingReject?.(error);
      recordingPromise = null;
      recordingResolve = null;
      recordingReject = null;
    },
    onRecordingFinished: (video) => {
      void (async () => {
        try {
          const result = await compressVideo(video);
          recordingResolve?.(result);
        } catch (error) {
          recordingReject?.(
            error instanceof Error ? error : new Error("视频压缩失败"),
          );
        } finally {
          recordingPromise = null;
          recordingResolve = null;
          recordingReject = null;
        }
      })();
    },
  });
};

export const stopRecording = async (): Promise<RecordingResult> => {
  if (!recorderCamera || !recordingPromise) {
    throw new Error("当前没有正在录制的视频");
  }

  await recorderCamera.stopRecording();
  return recordingPromise;
};

export const saveVideo = async (
  workoutSetId: string,
  filePath: string,
  metadata?: {
    durationSeconds?: number;
    fileSizeBytes?: number;
  },
): Promise<string> => {
  const stats = await RNFS.stat(filePath);
  let savedId = "";

  await database.write(async () => {
    const record = await database.get<WorkoutVideo>("workout_videos").create((item) => {
      item.workoutSetId = workoutSetId;
      item.filePath = filePath;
      item.cloudUrl = null;
      item.durationSeconds = metadata?.durationSeconds ?? 15;
      item.fileSizeBytes = metadata?.fileSizeBytes ?? stats.size;
      item.createdAt = Date.now();
    });

    savedId = record.id;
  });

  return savedId;
};

export const getVideosForWorkout = async (workoutId: string): Promise<SavedWorkoutVideo[]> => {
  const rows = await runRawQuery(
    `
      select
        workout_videos.id as id,
        workout_videos.workout_set_id as workout_set_id,
        workout_videos.file_path as file_path,
        workout_videos.cloud_url as cloud_url,
        workout_videos.duration_seconds as duration_seconds,
        workout_videos.file_size_bytes as file_size_bytes,
        workout_videos.created_at as created_at,
        workouts.id as workout_id,
        exercises.name as exercise_name,
        workout_sets.set_number as set_number
      from workout_videos
      inner join workout_sets on workout_sets.id = workout_videos.workout_set_id
      inner join workout_exercises on workout_exercises.id = workout_sets.workout_exercise_id
      inner join workouts on workouts.id = workout_exercises.workout_id
      inner join exercises on exercises.id = workout_exercises.exercise_id
      where workout_videos._status is not 'deleted'
        and workout_sets._status is not 'deleted'
        and workout_exercises._status is not 'deleted'
        and workouts._status is not 'deleted'
        and exercises._status is not 'deleted'
        and workouts.id = ?
      order by workout_videos.created_at desc
    `,
    [workoutId],
  );

  return Promise.all(
    rows.map(async (row) => {
      let thumbnailPath: string | null = null;
      try {
        const thumbnail = await createThumbnail({
          timeStamp: 1000,
          url: toString(row.file_path),
        });
        thumbnailPath = thumbnail.path;
      } catch {
        thumbnailPath = null;
      }

      return {
        cloudUrl: row.cloud_url ? toString(row.cloud_url) : null,
        createdAt: toNumber(row.created_at),
        durationSeconds: toNumber(row.duration_seconds),
        exerciseName: toString(row.exercise_name),
        filePath: toString(row.file_path),
        fileSizeBytes: toNumber(row.file_size_bytes),
        id: toString(row.id),
        setNumber: toNumber(row.set_number),
        thumbnailPath,
        workoutId: toString(row.workout_id),
        workoutSetId: toString(row.workout_set_id),
      };
    }),
  );
};

export const deleteVideo = async (videoId: string): Promise<void> => {
  const record = await database.get<WorkoutVideo>("workout_videos").find(videoId);

  try {
    await RNFS.unlink(record.filePath);
  } catch {
    // Ignore missing file.
  }

  await database.write(async () => {
    await record.markAsDeleted();
  });
};

export const uploadToCloud = async (videoId: string): Promise<string | null> => {
  const supabaseUrl = Config.SUPABASE_URL ?? "";
  const supabaseAnonKey = Config.SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const record = await database.get<WorkoutVideo>("workout_videos").find(videoId);
  const fileName = `${record.workoutSetId}-${record.createdAt}.mp4`;
  const result = await RNFS.uploadFiles({
    files: [
      {
        filename: fileName,
        filepath: record.filePath,
        filetype: "video/mp4",
        name: "file",
      },
    ],
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    method: "POST",
    toUrl: `${supabaseUrl}/storage/v1/object/${storageBucket}/${fileName}`,
  }).promise;

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error("视频上传失败");
  }

  const cloudUrl = `${supabaseUrl}/storage/v1/object/public/${storageBucket}/${fileName}`;

  await database.write(async () => {
    await record.update((item) => {
      item.cloudUrl = cloudUrl;
    });
  });

  return cloudUrl;
};

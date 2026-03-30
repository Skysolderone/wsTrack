declare module "@react-native-community/netinfo" {
  export interface NetInfoState {
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
  }

  export type NetInfoSubscription = (state: NetInfoState) => void;

  const NetInfo: {
    addEventListener: (listener: NetInfoSubscription) => () => void;
    fetch: () => Promise<NetInfoState>;
  };

  export default NetInfo;
}

declare module "@invertase/react-native-apple-authentication" {
  export interface AppleRequestResponse {
    authorizationCode: string | null;
    email: string | null;
    fullName?: {
      familyName?: string | null;
      givenName?: string | null;
    } | null;
    identityToken: string | null;
    user: string;
  }

  export const appleAuth: {
    Operation: {
      LOGIN: number;
    };
    Scope: {
      EMAIL: number;
      FULL_NAME: number;
    };
    performRequest: (options: {
      requestedOperation: number;
      requestedScopes: number[];
    }) => Promise<AppleRequestResponse>;
  };
}

declare module "react-native-health" {
  export interface AppleHealthKitInitOptions {
    permissions: {
      read: string[];
      write: string[];
    };
  }

  export interface AppleHealthKitWeightSample {
    sourceName?: string;
    startDate: string;
    unit: string;
    value: number;
  }

  export interface AppleHealthKitWorkoutInput {
    activityType: string;
    endDate: string;
    energyBurned?: number;
    energyBurnedUnit?: string;
    metadata?: Record<string, string>;
    startDate: string;
  }

  const AppleHealthKit: {
    getWeightSamples: (
      options: {
        endDate: string;
        startDate: string;
      },
      callback: (
        error: Error | null,
        results?: AppleHealthKitWeightSample[],
      ) => void,
    ) => void;
    initHealthKit: (
      options: AppleHealthKitInitOptions,
      callback: (error: Error | null) => void,
    ) => void;
    saveWorkout: (
      options: AppleHealthKitWorkoutInput,
      callback: (error: Error | null) => void,
    ) => void;
  };

  export default AppleHealthKit;
}

declare module "react-native-view-shot" {
  import type { Component } from "react";
  import type { ViewProps } from "react-native";

  interface ViewShotOptions {
    fileName?: string;
    format?: "jpg" | "png" | "webm";
    quality?: number;
    result?: "base64" | "data-uri" | "tmpfile";
  }

  export default class ViewShot extends Component<
    ViewProps & {
      options?: ViewShotOptions;
    }
  > {
    capture: () => Promise<string>;
  }
}

declare module "react-native-html-to-pdf" {
  interface HTMLToPDFOptions {
    base64?: boolean;
    directory?: string;
    fileName: string;
    html: string;
  }

  interface HTMLToPDFResult {
    base64?: string;
    filePath?: string;
  }

  export const generatePDF: (options: HTMLToPDFOptions) => Promise<HTMLToPDFResult>;
}

declare module "react-native-vision-camera" {
  import type { Component } from "react";
  import type { ViewProps } from "react-native";

  export interface CameraDevice {
    id: string;
    name: string;
    position: "back" | "front" | "external";
  }

  export interface CameraPermissionStatus {
    hasPermission: boolean;
    requestPermission: () => Promise<boolean>;
  }

  export interface VideoFile {
    duration?: number;
    path: string;
    size?: number;
  }

  export interface RecordVideoOptions {
    fileType?: "mov" | "mp4";
    flash?: "auto" | "off" | "on";
    onRecordingError: (error: Error) => void;
    onRecordingFinished: (video: VideoFile) => void;
  }

  export class Camera extends Component<
    ViewProps & {
      audio?: boolean;
      device: CameraDevice;
      isActive: boolean;
      style?: ViewProps["style"];
      video?: boolean;
    }
  > {
    startRecording: (options: RecordVideoOptions) => void;
    stopRecording: () => Promise<void>;
  }

  export const useCameraDevice: (position: "back" | "front") => CameraDevice | null;
  export const useCameraPermission: () => CameraPermissionStatus;
  export const useMicrophonePermission: () => CameraPermissionStatus;
}

declare module "react-native-compressor" {
  export const Video: {
    compress: (
      path: string,
      options?: {
        compressionMethod?: "auto" | "manual";
        maxSize?: number;
        minimumFileSizeForCompress?: number;
      },
      onProgress?: (progress: number) => void,
    ) => Promise<string>;
  };
}

declare module "react-native-create-thumbnail" {
  export interface ThumbnailResult {
    path: string;
    size?: number;
  }

  export const createThumbnail: (options: {
    timeStamp?: number;
    url: string;
  }) => Promise<ThumbnailResult>;
}

declare module "react-native-video" {
  import type { Component } from "react";
  import type { ViewProps } from "react-native";

  export default class Video extends Component<
    ViewProps & {
      controls?: boolean;
      paused?: boolean;
      resizeMode?: "contain" | "cover" | "stretch";
      source: {
        uri: string;
      };
    }
  > {}
}

declare module "react-native-fs" {
  export interface StatResult {
    path: string;
    size: number;
  }

  export interface UploadResult {
    body: string;
    headers: Record<string, string>;
    jobId: number;
    statusCode: number;
  }

  const RNFS: {
    stat: (path: string) => Promise<StatResult>;
    unlink: (path: string) => Promise<void>;
    uploadFiles: (options: {
      files: Array<{
        filename: string;
        filepath: string;
        filetype: string;
        name: string;
      }>;
      headers?: Record<string, string>;
      method?: "POST" | "PUT";
      toUrl: string;
    }) => {
      promise: Promise<UploadResult>;
    };
  };

  export default RNFS;
}

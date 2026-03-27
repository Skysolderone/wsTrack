import api, { ApiResponse, PagedResponse, extractApiData } from "./api";
import API_ENDPOINTS from "./apiEndpoints";

export type UUID = string;

export interface ExerciseResponse {
  id: UUID;
  name: string;
  name_en?: string | null;
  category: string;
  primary_muscles: string[];
  secondary_muscles?: string[];
  equipment: string;
  tracking_type: string;
  is_custom: boolean;
  notes?: string | null;
  created_at: string;
}

export interface PlanDetailResponse {
  id: UUID;
  name: string;
  description?: string | null;
  goal?: string | null;
  is_active: boolean;
  days: Array<{
    id: UUID;
    name: string;
    sort_order: number;
    exercises: Array<{
      id: UUID;
      exercise: ExerciseResponse;
      target_sets: number;
      target_reps?: string | null;
      target_weight?: number | null;
      rest_seconds?: number | null;
      superset_group?: number | null;
      sort_order: number;
      notes?: string | null;
    }>;
  }>;
  created_at: string;
  updated_at: string;
}

export interface WorkoutSetData {
  client_id: string;
  set_number: number;
  weight?: number | null;
  reps?: number | null;
  duration_seconds?: number | null;
  distance?: number | null;
  rpe?: number | null;
  is_warmup: boolean;
  is_completed: boolean;
  rest_seconds?: number | null;
  is_pr: boolean;
  unit: "kg" | "lbs";
  completed_at?: string | null;
}

export interface WorkoutExerciseData {
  client_id: string;
  exercise_id: UUID;
  sort_order: number;
  volume: number;
  notes?: string | null;
  sets: WorkoutSetData[];
}

export interface WorkoutFullData {
  client_id: string;
  plan_day_id?: UUID | null;
  started_at: string;
  finished_at?: string | null;
  duration_seconds: number;
  total_volume: number;
  total_sets: number;
  rating?: number | null;
  notes?: string | null;
  exercises: WorkoutExerciseData[];
}

export interface SyncWorkoutResponse {
  synced_ids: Array<{
    client_id: string;
    server_id: UUID;
  }>;
}

export interface PendingWorkoutSyncItem {
  queue_id: string;
  client_id: string;
  payload: WorkoutFullData;
}

export interface SyncLocalStore {
  listPendingWorkoutSyncItems(): Promise<PendingWorkoutSyncItem[]>;
  markWorkoutSynced(params: {
    queueId: string;
    clientId: string;
    serverId: UUID;
  }): Promise<void>;
  mergeExercises(exercises: ExerciseResponse[]): Promise<void>;
  replacePlans(plans: PlanDetailResponse[]): Promise<void>;
  setLastFullSyncAt(isoDate: string): Promise<void>;
}

export interface FullSyncResult {
  pushedWorkoutCount: number;
  pulledExerciseCount: number;
  pulledPlanCount: number;
}

export class SyncService {
  constructor(
    private readonly localStore: SyncLocalStore,
  ) {}

  async pushWorkouts(): Promise<SyncWorkoutResponse["synced_ids"]> {
    const pendingItems = await this.localStore.listPendingWorkoutSyncItems();
    if (pendingItems.length === 0) {
      return [];
    }

    const response = await api.post<ApiResponse<SyncWorkoutResponse>>(
      API_ENDPOINTS.WORKOUTS.SYNC,
      {
        workouts: pendingItems.map((item) => item.payload),
      },
    );

    const payload = extractApiData(response);
    const syncMap = new Map(payload.synced_ids.map((item) => [item.client_id, item.server_id]));

    for (const item of pendingItems) {
      const serverId = syncMap.get(item.client_id);
      if (!serverId) {
        continue;
      }

      await this.localStore.markWorkoutSynced({
        queueId: item.queue_id,
        clientId: item.client_id,
        serverId,
      });
    }

    return payload.synced_ids;
  }

  async pullExercises(): Promise<ExerciseResponse[]> {
    const items = await this.fetchAllPages<ExerciseResponse>(API_ENDPOINTS.EXERCISES.LIST);
    await this.localStore.mergeExercises(items);
    return items;
  }

  async pullPlans(): Promise<PlanDetailResponse[]> {
    const response = await api.get<ApiResponse<PlanDetailResponse[]>>(API_ENDPOINTS.PLANS.LIST);
    const items = extractApiData(response);
    await this.localStore.replacePlans(items);
    return items;
  }

  async fullSync(): Promise<FullSyncResult> {
    const pushed = await this.pushWorkouts();
    const [exercises, plans] = await Promise.all([
      this.pullExercises(),
      this.pullPlans(),
    ]);

    await this.localStore.setLastFullSyncAt(new Date().toISOString());

    return {
      pushedWorkoutCount: pushed.length,
      pulledExerciseCount: exercises.length,
      pulledPlanCount: plans.length,
    };
  }

  private async fetchAllPages<T>(url: string, pageSize = 100): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;

    while (results.length < total) {
      const response = await api.get<ApiResponse<PagedResponse<T>>>(url, {
        params: {
          page,
          page_size: pageSize,
        },
      });

      const payload = extractApiData(response);
      results.push(...payload.items);
      total = payload.pagination.total;

      if (payload.items.length === 0) {
        break;
      }

      page += 1;
    }

    return results;
  }
}

export default SyncService;

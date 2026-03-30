import { Q } from "@nozbe/watermelondb";

import { CoachClientStatus } from "../constants/enums";
import { database } from "../database";
import { CoachClient, WorkoutComment } from "../models";
import { useAuthStore } from "../store/authStore";
import { api, extractApiData } from "./api";
import { COACH } from "./apiEndpoints";
import { buildPlanSnapshot, importPlanSnapshot, type PlanSnapshot } from "./PlanSnapshotService";

export interface CoachClientInviteResult {
  inviteId: string;
  message: string;
}

export interface CoachWorkoutCommentItem {
  coachId: string;
  coachName: string | null;
  comment: string;
  createdAt: number;
  id: string;
  workoutId: string;
}

export interface CoachClientWorkoutItem {
  durationSeconds: number;
  exerciseCount: number;
  startedAt: number;
  title: string;
  totalVolume: number;
  workoutId: string;
}

export interface CoachClientItem {
  clientEmail: string;
  clientId: string;
  clientName: string;
  createdAt: number;
  lastWorkoutAt: number | null;
  status: CoachClientStatus;
  volumeTrend: number[];
  workoutsThisWeek: number;
}

export interface CoachDashboardSummary {
  activeCount: number;
  attentionCount: number;
  clients: CoachClientItem[];
}

export interface CoachAssignedPlanNotification {
  assignmentId: string;
  coachName: string;
  createdAt: number;
  message: string;
  planSnapshot: PlanSnapshot;
  title: string;
}

interface CoachClientResponse {
  client_email: string;
  client_id: string;
  client_name: string;
  created_at: number;
  id: string;
  last_workout_at: number | null;
  notes: string | null;
  status: CoachClientStatus;
  volume_trend: number[];
  workouts_this_week: number;
}

interface CoachWorkoutResponse {
  duration_seconds: number;
  exercise_count: number;
  started_at: number;
  title: string;
  total_volume: number;
  workout_id: string;
}

interface CoachCommentResponse {
  coach_id: string;
  coach_name: string | null;
  comment: string;
  created_at: number;
  id: string;
  workout_id: string;
}

const upsertCoachClients = async (items: CoachClientResponse[]): Promise<void> => {
  const coachId = useAuthStore.getState().user?.id ?? "coach";

  await database.write(async () => {
    for (const item of items) {
      const existing = await database
        .get<CoachClient>("coach_clients")
        .query(Q.where("client_id", item.client_id))
        .fetch();

      if (existing[0]) {
        await existing[0].update((record) => {
          record.coachId = coachId;
          record.clientId = item.client_id;
          record.status = item.status;
          record.notes = item.notes;
          record.createdAt = item.created_at;
        });
      } else {
        await database.get<CoachClient>("coach_clients").create((record) => {
          record._raw.id = item.id;
          record.coachId = coachId;
          record.clientId = item.client_id;
          record.status = item.status;
          record.notes = item.notes;
          record.createdAt = item.created_at;
        });
      }
    }
  });
};

const upsertWorkoutComments = async (items: CoachCommentResponse[]): Promise<void> => {
  await database.write(async () => {
    for (const item of items) {
      const existing = await database
        .get<WorkoutComment>("workout_comments")
        .query(Q.where("workout_id", item.workout_id), Q.where("created_at", item.created_at))
        .fetch();

      if (existing[0]) {
        await existing[0].update((record) => {
          record.coachId = item.coach_id;
          record.workoutId = item.workout_id;
          record.comment = item.comment;
          record.createdAt = item.created_at;
        });
      } else {
        await database.get<WorkoutComment>("workout_comments").create((record) => {
          record._raw.id = item.id;
          record.coachId = item.coach_id;
          record.workoutId = item.workout_id;
          record.comment = item.comment;
          record.createdAt = item.created_at;
        });
      }
    }
  });
};

export const addClient = async (clientEmail: string): Promise<CoachClientInviteResult> => {
  const response = await api.post(COACH.INVITE, {
    client_email: clientEmail.trim(),
  });

  return extractApiData<CoachClientInviteResult>(response);
};

export const acceptInvitation = async (inviteId: string): Promise<void> => {
  await api.post(COACH.ACCEPT_INVITATION(inviteId));
};

export const getMyClients = async (): Promise<CoachClientItem[]> => {
  const response = await api.get(COACH.CLIENTS);
  const items = extractApiData<CoachClientResponse[]>(response);
  await upsertCoachClients(items);

  return items.map((item) => ({
    clientEmail: item.client_email,
    clientId: item.client_id,
    clientName: item.client_name,
    createdAt: item.created_at,
    lastWorkoutAt: item.last_workout_at,
    status: item.status,
    volumeTrend: item.volume_trend,
    workoutsThisWeek: item.workouts_this_week,
  }));
};

export const getClientWorkouts = async (
  clientId: string,
  dateRange?: {
    endAt?: number;
    startAt?: number;
  },
): Promise<CoachClientWorkoutItem[]> => {
  const response = await api.get(COACH.CLIENT_WORKOUTS(clientId), {
    params: {
      end_at: dateRange?.endAt,
      start_at: dateRange?.startAt,
    },
  });

  return extractApiData<CoachWorkoutResponse[]>(response).map((item) => ({
    durationSeconds: item.duration_seconds,
    exerciseCount: item.exercise_count,
    startedAt: item.started_at,
    title: item.title,
    totalVolume: item.total_volume,
    workoutId: item.workout_id,
  }));
};

export const addComment = async (
  workoutId: string,
  comment: string,
): Promise<CoachWorkoutCommentItem> => {
  const response = await api.post(COACH.WORKOUT_COMMENT(workoutId), {
    comment: comment.trim(),
  });
  const payload = extractApiData<CoachCommentResponse>(response);
  await upsertWorkoutComments([payload]);

  return {
    coachId: payload.coach_id,
    coachName: payload.coach_name,
    comment: payload.comment,
    createdAt: payload.created_at,
    id: payload.id,
    workoutId: payload.workout_id,
  };
};

export const getWorkoutComments = async (
  workoutId: string,
): Promise<CoachWorkoutCommentItem[]> => {
  try {
    const response = await api.get(COACH.WORKOUT_COMMENT(workoutId));
    const items = extractApiData<CoachCommentResponse[]>(response);
    await upsertWorkoutComments(items);

    return items.map((item) => ({
      coachId: item.coach_id,
      coachName: item.coach_name,
      comment: item.comment,
      createdAt: item.created_at,
      id: item.id,
      workoutId: item.workout_id,
    }));
  } catch {
    const cached = await database
      .get<WorkoutComment>("workout_comments")
      .query(Q.where("workout_id", workoutId), Q.sortBy("created_at", Q.desc))
      .fetch();

    return cached.map((item) => ({
      coachId: item.coachId,
      coachName: null,
      comment: item.comment,
      createdAt: item.createdAt,
      id: item.id,
      workoutId: item.workoutId,
    }));
  }
};

export const assignPlan = async (clientId: string, planId: string): Promise<void> => {
  const snapshot = await buildPlanSnapshot(planId);

  await api.post(COACH.PUSH_PLAN(clientId), {
    plan_id: planId,
    plan_snapshot: snapshot,
  });
};

export const getClientDashboard = async (): Promise<CoachDashboardSummary> => {
  const response = await api.get(COACH.DASHBOARD);
  const items = extractApiData<CoachClientResponse[]>(response);
  await upsertCoachClients(items);

  const now = Date.now();

  return {
    activeCount: items.filter((item) => item.status === CoachClientStatus.Active).length,
    attentionCount: items.filter((item) => {
      if (!item.last_workout_at) {
        return true;
      }

      return now - item.last_workout_at >= 3 * 24 * 60 * 60 * 1000;
    }).length,
    clients: items.map((item) => ({
      clientEmail: item.client_email,
      clientId: item.client_id,
      clientName: item.client_name,
      createdAt: item.created_at,
      lastWorkoutAt: item.last_workout_at,
      status: item.status,
      volumeTrend: item.volume_trend,
      workoutsThisWeek: item.workouts_this_week,
    })),
  };
};

export const getAssignedPlans = async (): Promise<CoachAssignedPlanNotification[]> => {
  const response = await api.get(COACH.ASSIGNMENTS);

  return extractApiData<
    Array<{
      assignment_id: string;
      coach_name: string;
      created_at: number;
      message: string;
      plan_snapshot: PlanSnapshot;
      title: string;
    }>
  >(response).map((item) => ({
    assignmentId: item.assignment_id,
    coachName: item.coach_name,
    createdAt: item.created_at,
    message: item.message,
    planSnapshot: item.plan_snapshot,
    title: item.title,
  }));
};

export const importAssignedPlan = async (
  assignment: CoachAssignedPlanNotification,
): Promise<string> =>
  importPlanSnapshot(assignment.planSnapshot, {
    nameOverride: `${assignment.title} · 教练推送`,
  });

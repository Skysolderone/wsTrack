const API_PREFIX = "/api/v1";

export const AUTH = {
  REGISTER: `${API_PREFIX}/auth/register`,
  LOGIN: `${API_PREFIX}/auth/login`,
  REFRESH: `${API_PREFIX}/auth/refresh`,
  PROFILE: `${API_PREFIX}/auth/profile`,
  PASSWORD: `${API_PREFIX}/auth/password`,
} as const;

export const EXERCISES = {
  LIST: `${API_PREFIX}/exercises`,
  DETAIL: (id: string) => `${API_PREFIX}/exercises/${id}`,
  CREATE: `${API_PREFIX}/exercises`,
  UPDATE: (id: string) => `${API_PREFIX}/exercises/${id}`,
  DELETE: (id: string) => `${API_PREFIX}/exercises/${id}`,
} as const;

export const PLANS = {
  LIST: `${API_PREFIX}/plans`,
  DETAIL: (id: string) => `${API_PREFIX}/plans/${id}`,
  CREATE: `${API_PREFIX}/plans`,
  UPDATE: (id: string) => `${API_PREFIX}/plans/${id}`,
  DELETE: (id: string) => `${API_PREFIX}/plans/${id}`,
  DUPLICATE: (id: string) => `${API_PREFIX}/plans/${id}/duplicate`,
  ACTIVATE: (id: string) => `${API_PREFIX}/plans/${id}/activate`,
  ADD_DAY: (id: string) => `${API_PREFIX}/plans/${id}/days`,
  UPDATE_DAY: (dayId: string) => `${API_PREFIX}/plans/days/${dayId}`,
  DELETE_DAY: (dayId: string) => `${API_PREFIX}/plans/days/${dayId}`,
  REORDER_DAYS: (dayId: string) => `${API_PREFIX}/plans/days/${dayId}/reorder`,
  ADD_EXERCISE: (dayId: string) => `${API_PREFIX}/plans/days/${dayId}/exercises`,
  UPDATE_EXERCISE: (exerciseId: string) => `${API_PREFIX}/plans/exercises/${exerciseId}`,
  DELETE_EXERCISE: (exerciseId: string) => `${API_PREFIX}/plans/exercises/${exerciseId}`,
  REORDER_EXERCISES: (dayId: string) => `${API_PREFIX}/plans/days/${dayId}/exercises/reorder`,
} as const;

export const WORKOUTS = {
  LIST: `${API_PREFIX}/workouts`,
  DETAIL: (id: string) => `${API_PREFIX}/workouts/${id}`,
  CREATE: `${API_PREFIX}/workouts`,
  UPDATE: (id: string) => `${API_PREFIX}/workouts/${id}`,
  DELETE: (id: string) => `${API_PREFIX}/workouts/${id}`,
  SYNC: `${API_PREFIX}/workouts/sync`,
} as const;

export const STATS = {
  DASHBOARD: `${API_PREFIX}/stats/dashboard`,
  VOLUME: `${API_PREFIX}/stats/volume`,
  MUSCLES: `${API_PREFIX}/stats/muscles`,
  PRS: `${API_PREFIX}/stats/prs`,
  FREQUENCY: `${API_PREFIX}/stats/frequency`,
  EXERCISE: (exerciseId: string) => `${API_PREFIX}/stats/exercise/${exerciseId}`,
} as const;

export const PRS = {
  LIST: `${API_PREFIX}/prs`,
  BY_EXERCISE: (exerciseId: string) => `${API_PREFIX}/prs/exercise/${exerciseId}`,
} as const;

export const TEMPLATES = {
  LIST: `${API_PREFIX}/templates`,
  DETAIL: (id: string) => `${API_PREFIX}/templates/${id}`,
  FROM_PLAN: `${API_PREFIX}/templates/from-plan`,
  APPLY: (id: string) => `${API_PREFIX}/templates/${id}/apply`,
  IMPORT: `${API_PREFIX}/templates/import`,
  EXPORT: (id: string) => `${API_PREFIX}/templates/${id}/export`,
  DELETE: (id: string) => `${API_PREFIX}/templates/${id}`,
} as const;

export const CHALLENGES = {
  LIST: `${API_PREFIX}/challenges`,
  CREATE: `${API_PREFIX}/challenges`,
  UPDATE: (id: string) => `${API_PREFIX}/challenges/${id}`,
  DELETE: (id: string) => `${API_PREFIX}/challenges/${id}`,
} as const;

export const COACH = {
  INVITE: `${API_PREFIX}/coach/invite`,
  CLIENTS: `${API_PREFIX}/coach/clients`,
  CLIENT_DETAIL: (clientId: string) => `${API_PREFIX}/coach/clients/${clientId}`,
  CLIENT_WORKOUTS: (clientId: string) => `${API_PREFIX}/coach/clients/${clientId}/workouts`,
  PUSH_PLAN: (clientId: string) => `${API_PREFIX}/coach/clients/${clientId}/plans`,
  WORKOUT_COMMENT: (workoutId: string) => `${API_PREFIX}/coach/workouts/${workoutId}/comment`,
  DASHBOARD: `${API_PREFIX}/coach/dashboard`,
} as const;

export const CLIENT = {
  INVITATIONS: `${API_PREFIX}/client/invitations`,
  ACCEPT_INVITATION: (id: string) => `${API_PREFIX}/client/invitations/${id}/accept`,
  REJECT_INVITATION: (id: string) => `${API_PREFIX}/client/invitations/${id}/reject`,
  COACHES: `${API_PREFIX}/client/coaches`,
  COMMENTS: `${API_PREFIX}/client/comments`,
} as const;

export const API_ENDPOINTS = {
  AUTH,
  EXERCISES,
  PLANS,
  WORKOUTS,
  STATS,
  PRS,
  TEMPLATES,
  CHALLENGES,
  COACH,
  CLIENT,
} as const;

export default API_ENDPOINTS;

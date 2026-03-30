import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.API_URL || 'http://localhost:8080';
const DEFAULT_PASSWORD = 'StrongPass123';
const DEFAULT_HEADERS = { 'Content-Type': 'application/json' };

const setupErrors = new Rate('setup_errors');
const criticalChecks = new Rate('critical_checks');
const seedDuration = new Trend('seed_duration');
const syncBatchSize = new Trend('sync_batch_size');

export const options = {
  scenarios: {
    api_benchmark: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
    },
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '60s', target: 200 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{name:GET_exercises}': ['p(95)<50'],
    'http_req_duration{name:GET_exercises_search}': ['p(95)<80'],
    'http_req_duration{name:GET_plan_detail}': ['p(95)<100'],
    'http_req_duration{name:POST_sync_single}': ['p(95)<200'],
    'http_req_duration{name:POST_sync_batch}': ['p(95)<500'],
    'http_req_duration{name:GET_dashboard}': ['p(95)<200'],
    'http_req_duration{name:GET_dashboard_nocache}': ['p(95)<500'],
    'http_req_duration{name:GET_volume_stats}': ['p(95)<300'],
    'http_req_duration{name:GET_muscle_stats}': ['p(95)<300'],
    http_req_failed: ['rate<0.001'],
  },
};

export function setup() {
  const startedAt = Date.now();
  const email = `loadtest.${Date.now()}.${Math.floor(Math.random() * 100000)}@example.com`;
  const nickname = `Load Tester ${Math.floor(Math.random() * 1000)}`;

  const registerResponse = http.post(
    `${BASE_URL}/api/v1/auth/register`,
    JSON.stringify({
      email,
      password: DEFAULT_PASSWORD,
      nickname,
    }),
    { headers: DEFAULT_HEADERS, tags: { name: 'POST_register_setup' } },
  );

  ensureSetupSuccess(registerResponse, 'register', [201]);
  const authPayload = parseJSON(registerResponse, 'register');
  const token = authPayload.data.access_token;
  const headers = authHeaders(token);

  const exerciseIDs = ensureExercisePool(headers);
  const plan = createBenchmarkPlan(headers, exerciseIDs);
  seedHistoricalWorkouts(headers, exerciseIDs, plan.dayId);

  seedDuration.add(Date.now() - startedAt);

  return {
    token,
    exerciseId: exerciseIDs[0],
    exerciseIds: exerciseIDs,
    planId: plan.planId,
    planDayId: plan.dayId,
    statsDateFrom: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    statsDateTo: new Date().toISOString(),
  };
}

export default function (data) {
  const headers = authHeaders(data.token);

  const exercisesResponse = http.get(
    `${BASE_URL}/api/v1/exercises?page=1&page_size=20`,
    { headers, tags: { name: 'GET_exercises' } },
  );
  recordCheck(check(exercisesResponse, { 'exercises 200': (res) => res.status === 200 }));

  const searchResponse = http.get(
    `${BASE_URL}/api/v1/exercises?search=${encodeURIComponent('卧推')}`,
    { headers, tags: { name: 'GET_exercises_search' } },
  );
  recordCheck(check(searchResponse, { 'search 200': (res) => res.status === 200 }));

  const planDetailResponse = http.get(
    `${BASE_URL}/api/v1/plans/${data.planId}`,
    { headers, tags: { name: 'GET_plan_detail' } },
  );
  recordCheck(check(planDetailResponse, { 'plan detail 200': (res) => res.status === 200 }));

  const singleSyncPayload = JSON.stringify({
    workouts: [generateWorkoutData(data.exerciseIds, data.planDayId, `single-${__VU}-${__ITER}`, 0)],
  });
  const singleSyncResponse = http.post(
    `${BASE_URL}/api/v1/workouts/sync`,
    singleSyncPayload,
    { headers, tags: { name: 'POST_sync_single' } },
  );
  recordCheck(check(singleSyncResponse, { 'sync single 200': (res) => res.status === 200 }));

  const dashboardNoCacheResponse = http.get(
    `${BASE_URL}/api/v1/stats/dashboard`,
    { headers, tags: { name: 'GET_dashboard_nocache' } },
  );
  recordCheck(check(dashboardNoCacheResponse, { 'dashboard nocache 200': (res) => res.status === 200 }));

  const dashboardResponse = http.get(
    `${BASE_URL}/api/v1/stats/dashboard`,
    { headers, tags: { name: 'GET_dashboard' } },
  );
  recordCheck(check(dashboardResponse, { 'dashboard 200': (res) => res.status === 200 }));

  const volumeResponse = http.get(
    `${BASE_URL}/api/v1/stats/volume?period=weekly&date_from=${encodeURIComponent(data.statsDateFrom)}&date_to=${encodeURIComponent(data.statsDateTo)}`,
    { headers, tags: { name: 'GET_volume_stats' } },
  );
  recordCheck(check(volumeResponse, { 'volume 200': (res) => res.status === 200 }));

  const musclesResponse = http.get(
    `${BASE_URL}/api/v1/stats/muscles?date_from=${encodeURIComponent(data.statsDateFrom)}&date_to=${encodeURIComponent(data.statsDateTo)}`,
    { headers, tags: { name: 'GET_muscle_stats' } },
  );
  recordCheck(check(musclesResponse, { 'muscles 200': (res) => res.status === 200 }));

  const batchPayload = JSON.stringify({
    workouts: buildWorkoutBatch(data.exerciseIds, data.planDayId, 10, __VU * 100000 + __ITER * 10),
  });
  syncBatchSize.add(10);
  const batchSyncResponse = http.post(
    `${BASE_URL}/api/v1/workouts/sync`,
    batchPayload,
    { headers, tags: { name: 'POST_sync_batch' } },
  );
  recordCheck(check(batchSyncResponse, { 'sync batch 200': (res) => res.status === 200 }));

  sleep(0.5);
}

function ensureExercisePool(headers) {
  const listResponse = http.get(
    `${BASE_URL}/api/v1/exercises?page=1&page_size=20`,
    { headers, tags: { name: 'GET_exercises_setup' } },
  );
  ensureSetupSuccess(listResponse, 'list exercises', [200]);

  const listPayload = parseJSON(listResponse, 'list exercises');
  const items = (((listPayload || {}).data || {}).items) || [];
  const exerciseIDs = [];
  let hasBenchPress = false;

  for (const item of items) {
    if (!item || !item.id) {
      continue;
    }

    if (exerciseIDs.length < 5) {
      exerciseIDs.push(item.id);
    }

    if (typeof item.name === 'string' && item.name.indexOf('卧推') >= 0) {
      hasBenchPress = true;
    }
  }

  const templates = [
    {
      name: '杠铃卧推',
      name_en: 'Barbell Bench Press',
      category: 'strength',
      primary_muscles: ['chest'],
      secondary_muscles: ['triceps', 'shoulders'],
      equipment: 'barbell',
      tracking_type: 'weight_reps',
    },
    {
      name: '深蹲',
      name_en: 'Back Squat',
      category: 'strength',
      primary_muscles: ['quads', 'glutes'],
      secondary_muscles: ['hamstrings'],
      equipment: 'barbell',
      tracking_type: 'weight_reps',
    },
    {
      name: '硬拉',
      name_en: 'Deadlift',
      category: 'strength',
      primary_muscles: ['back', 'glutes', 'hamstrings'],
      secondary_muscles: ['forearms'],
      equipment: 'barbell',
      tracking_type: 'weight_reps',
    },
    {
      name: '哑铃划船',
      name_en: 'Dumbbell Row',
      category: 'strength',
      primary_muscles: ['back'],
      secondary_muscles: ['biceps'],
      equipment: 'dumbbell',
      tracking_type: 'weight_reps',
    },
    {
      name: '站姿推举',
      name_en: 'Overhead Press',
      category: 'strength',
      primary_muscles: ['shoulders'],
      secondary_muscles: ['triceps'],
      equipment: 'barbell',
      tracking_type: 'weight_reps',
    },
  ];

  for (const template of templates) {
    if (exerciseIDs.length >= 5 && hasBenchPress) {
      break;
    }

    const createResponse = http.post(
      `${BASE_URL}/api/v1/exercises`,
      JSON.stringify(template),
      { headers, tags: { name: 'POST_create_exercise_setup' } },
    );
    ensureSetupSuccess(createResponse, `create exercise ${template.name}`, [200]);
    const payload = parseJSON(createResponse, `create exercise ${template.name}`);
    if (payload && payload.data && payload.data.id) {
      if (template.name.indexOf('卧推') >= 0) {
        exerciseIDs.unshift(payload.data.id);
      } else {
        exerciseIDs.push(payload.data.id);
      }
      if (template.name.indexOf('卧推') >= 0) {
        hasBenchPress = true;
      }
    }
  }

  if (!hasBenchPress) {
    fail('setup failed: no exercise containing "卧推" is available for search benchmark');
  }

  if (exerciseIDs.length < 5) {
    fail(`setup failed: expected at least 5 exercises, got ${exerciseIDs.length}`);
  }

  return uniqueValues(exerciseIDs).slice(0, 5);
}

function createBenchmarkPlan(headers, exerciseIDs) {
  const planResponse = http.post(
    `${BASE_URL}/api/v1/plans`,
    JSON.stringify({
      name: 'k6 Benchmark Plan',
      goal: 'strength',
    }),
    { headers, tags: { name: 'POST_create_plan_setup' } },
  );
  ensureSetupSuccess(planResponse, 'create plan', [200]);

  const planPayload = parseJSON(planResponse, 'create plan');
  const planId = (((planPayload || {}).data || {}).id);
  if (!planId) {
    fail('setup failed: plan id missing from create plan response');
  }

  const dayResponse = http.post(
    `${BASE_URL}/api/v1/plans/${planId}/days`,
    JSON.stringify({ name: 'Benchmark Day' }),
    { headers, tags: { name: 'POST_add_day_setup' } },
  );
  ensureSetupSuccess(dayResponse, 'add plan day', [200]);

  const dayPayload = parseJSON(dayResponse, 'add plan day');
  const dayId = (((dayPayload || {}).data || {}).id);
  if (!dayId) {
    fail('setup failed: day id missing from add day response');
  }

  for (let index = 0; index < Math.min(3, exerciseIDs.length); index += 1) {
    const exerciseResponse = http.post(
      `${BASE_URL}/api/v1/plans/days/${dayId}/exercises`,
      JSON.stringify({
        exercise_id: exerciseIDs[index],
        target_sets: 4,
        target_reps: '8-12',
        rest_seconds: 90,
      }),
      { headers, tags: { name: 'POST_add_plan_exercise_setup' } },
    );
    ensureSetupSuccess(exerciseResponse, `add plan exercise ${index}`, [200]);
  }

  return { planId, dayId };
}

function seedHistoricalWorkouts(headers, exerciseIDs, planDayId) {
  const workoutCount = 500;
  const batchSize = 50;
  const batchCount = Math.ceil(workoutCount / batchSize);

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const workouts = buildWorkoutBatch(
      exerciseIDs,
      planDayId,
      Math.min(batchSize, workoutCount - batchIndex * batchSize),
      batchIndex * batchSize,
      true,
    );

    const response = http.post(
      `${BASE_URL}/api/v1/workouts/sync`,
      JSON.stringify({ workouts }),
      { headers, tags: { name: 'POST_seed_sync_setup' } },
    );
    ensureSetupSuccess(response, `seed sync batch ${batchIndex + 1}`, [200]);
  }
}

function buildWorkoutBatch(exerciseIDs, planDayId, count, offset, historical) {
  const workouts = [];
  for (let index = 0; index < count; index += 1) {
    workouts.push(generateWorkoutData(exerciseIDs, planDayId, `batch-${offset + index}`, offset + index, historical));
  }
  return workouts;
}

function generateWorkoutData(exerciseIDs, planDayId, label, offset, historical) {
  const exercisePool = Array.isArray(exerciseIDs) ? exerciseIDs : [exerciseIDs];
  const startedAt = historical
    ? new Date(Date.now() - (offset + 1) * 24 * 60 * 60 * 1000)
    : new Date(Date.now() - (offset % 5) * 60 * 60 * 1000);
  startedAt.setUTCMinutes((offset % 4) * 15, 0, 0);

  const finishedAt = new Date(startedAt.getTime() + 45 * 60 * 1000);
  const exercises = [];

  for (let exerciseIndex = 0; exerciseIndex < Math.min(5, exercisePool.length); exerciseIndex += 1) {
    const sets = [];
    let exerciseVolume = 0;

    for (let setIndex = 0; setIndex < 4; setIndex += 1) {
      const weight = roundTo2(60 + exerciseIndex * 10 + setIndex * 2.5 + (offset % 7));
      const reps = 8 + ((offset + setIndex) % 4);
      exerciseVolume += weight * reps;
      sets.push({
        client_id: uuidv4(),
        set_number: setIndex + 1,
        weight,
        reps,
        rpe: roundTo1(7 + (setIndex % 3) * 0.5),
        is_warmup: false,
        is_completed: true,
        rest_seconds: 90,
        is_pr: false,
        unit: 'kg',
        completed_at: new Date(startedAt.getTime() + (setIndex + 1) * 6 * 60 * 1000).toISOString(),
      });
    }

    exercises.push({
      client_id: uuidv4(),
      exercise_id: exercisePool[exerciseIndex % exercisePool.length],
      sort_order: exerciseIndex,
      volume: roundTo2(exerciseVolume),
      sets,
    });
  }

  return {
    client_id: `${label}-${uuidv4()}`,
    plan_day_id: planDayId || null,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: 45 * 60,
    exercises,
  };
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function ensureSetupSuccess(response, context, expectedStatuses) {
  const ok = expectedStatuses.indexOf(response.status) >= 0;
  setupErrors.add(!ok);
  if (ok) {
    return;
  }

  fail(`setup failed during ${context}: status=${response.status} body=${response.body}`);
}

function parseJSON(response, context) {
  try {
    return response.json();
  } catch (error) {
    fail(`${context} returned non-JSON response: ${error} body=${response.body}`);
  }
}

function recordCheck(result) {
  criticalChecks.add(result);
  return result;
}

function roundTo2(value) {
  return Math.round(value * 100) / 100;
}

function roundTo1(value) {
  return Math.round(value * 10) / 10;
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function uniqueValues(values) {
  const seen = {};
  const result = [];

  for (const value of values) {
    if (!value || seen[value]) {
      continue;
    }
    seen[value] = true;
    result.push(value);
  }

  return result;
}

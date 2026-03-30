import { PlanGoal, SharedPlanDifficulty } from "../constants/enums";
import { useAuthStore } from "../store/authStore";
import { buildPlanSnapshot, importPlanSnapshot, type PlanSnapshot } from "./PlanSnapshotService";
import { supabaseRequest } from "./supabase";

export type SharedPlanSort = "hot" | "latest" | "rating";

export interface SharedPlanReview {
  comment: string;
  createdAt: string;
  id: string;
  rating: number;
  sharedPlanId: string;
  userId: string;
}

export interface SharedPlanListItem {
  averageRating: number;
  createdAt: string;
  description: string;
  difficulty: SharedPlanDifficulty;
  goal: PlanGoal | null;
  id: string;
  likesCount: number;
  reviewCount: number;
  title: string;
  useCount: number;
  userId: string;
}

export interface SharedPlanDetail {
  plan: SharedPlanListItem;
  planSnapshot: PlanSnapshot;
  reviews: SharedPlanReview[];
}

export interface CommunityFilters {
  difficulty?: SharedPlanDifficulty | "all";
  goal?: PlanGoal | "all";
}

interface SharedPlanRow {
  created_at: string;
  description: string | null;
  difficulty: SharedPlanDifficulty;
  goal: PlanGoal | null;
  id: string;
  likes_count: number | null;
  plan_snapshot: PlanSnapshot | string;
  title: string;
  use_count?: number | null;
  user_id: string;
}

interface SharedPlanReviewRow {
  comment: string | null;
  created_at: string;
  id: string;
  rating: number;
  shared_plan_id: string;
  user_id: string;
}

const PAGE_SIZE = 12;

const parsePlanSnapshot = (value: SharedPlanRow["plan_snapshot"]): PlanSnapshot =>
  typeof value === "string" ? (JSON.parse(value) as PlanSnapshot) : value;

const buildQueryString = (params: Record<string, string | number | undefined>): string => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.set(key, `${value}`);
    }
  });

  return searchParams.toString();
};

const fetchReviewsForPlans = async (planIds: string[]): Promise<SharedPlanReviewRow[]> => {
  if (planIds.length === 0) {
    return [];
  }

  const values = `(${planIds.join(",")})`;
  return supabaseRequest<SharedPlanReviewRow[]>(
    `/rest/v1/shared_plan_reviews?select=*&shared_plan_id=in.${encodeURIComponent(values)}&order=created_at.desc`,
  );
};

const buildListItem = (
  row: SharedPlanRow,
  reviews: SharedPlanReviewRow[],
): SharedPlanListItem => {
  const relatedReviews = reviews.filter((item) => item.shared_plan_id === row.id);
  const averageRating =
    relatedReviews.length === 0
      ? 0
      : Number(
          (
            relatedReviews.reduce((sum, item) => sum + item.rating, 0) /
            relatedReviews.length
          ).toFixed(1),
        );

  return {
    averageRating,
    createdAt: row.created_at,
    description: row.description ?? "",
    difficulty: row.difficulty,
    goal: row.goal,
    id: row.id,
    likesCount: row.likes_count ?? 0,
    reviewCount: relatedReviews.length,
    title: row.title,
    useCount: row.use_count ?? 0,
    userId: row.user_id,
  };
};

export const publishPlan = async (
  planId: string,
  title: string,
  description: string,
  difficulty: SharedPlanDifficulty,
): Promise<string> => {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    throw new Error("请先登录再发布计划");
  }

  const snapshot = await buildPlanSnapshot(planId);
  const response = await supabaseRequest<SharedPlanRow[]>("/rest/v1/shared_plans", {
    body: JSON.stringify([
      {
        created_at: new Date().toISOString(),
        description: description.trim(),
        difficulty,
        goal: snapshot.goal,
        likes_count: 0,
        plan_snapshot: snapshot,
        title: title.trim(),
        user_id: userId,
      },
    ]),
    headers: {
      Prefer: "return=representation",
    },
    method: "POST",
  });

  return response[0]?.id ?? "";
};

export const getSharedPlans = async (
  filters: CommunityFilters,
  sort: SharedPlanSort,
  page: number,
): Promise<{
  hasMore: boolean;
  items: SharedPlanListItem[];
}> => {
  const offset = Math.max(0, page) * PAGE_SIZE;
  const order = sort === "hot" ? "likes_count.desc" : "created_at.desc";
  const query = buildQueryString({
    difficulty:
      filters.difficulty && filters.difficulty !== "all" ? `eq.${filters.difficulty}` : undefined,
    goal: filters.goal && filters.goal !== "all" ? `eq.${filters.goal}` : undefined,
    limit: PAGE_SIZE,
    offset,
    order,
    select: "id,user_id,plan_snapshot,title,description,goal,difficulty,likes_count,created_at,use_count",
  });

  const plans = await supabaseRequest<SharedPlanRow[]>(`/rest/v1/shared_plans?${query}`);
  const reviews = await fetchReviewsForPlans(plans.map((item) => item.id));
  const items = plans.map((item) => buildListItem(item, reviews));

  return {
    hasMore: plans.length >= PAGE_SIZE,
    items:
      sort === "rating"
        ? [...items].sort((left, right) => right.averageRating - left.averageRating)
        : items,
  };
};

export const getSharedPlanDetail = async (
  sharedPlanId: string,
): Promise<SharedPlanDetail> => {
  const [plans, reviews] = await Promise.all([
    supabaseRequest<SharedPlanRow[]>(
      `/rest/v1/shared_plans?select=*&id=eq.${sharedPlanId}&limit=1`,
    ),
    supabaseRequest<SharedPlanReviewRow[]>(
      `/rest/v1/shared_plan_reviews?select=*&shared_plan_id=eq.${sharedPlanId}&order=created_at.desc`,
    ),
  ]);

  const plan = plans[0];
  if (!plan) {
    throw new Error("社区计划不存在");
  }

  return {
    plan: buildListItem(plan, reviews),
    planSnapshot: parsePlanSnapshot(plan.plan_snapshot),
    reviews: reviews.map((item) => ({
      comment: item.comment ?? "",
      createdAt: item.created_at,
      id: item.id,
      rating: item.rating,
      sharedPlanId: item.shared_plan_id,
      userId: item.user_id,
    })),
  };
};

export const importSharedPlan = async (sharedPlanId: string): Promise<string> => {
  const detail = await getSharedPlanDetail(sharedPlanId);
  return importPlanSnapshot(detail.planSnapshot, {
    nameOverride: `${detail.plan.title} · 社区导入`,
  });
};

export const ratePlan = async (
  sharedPlanId: string,
  rating: number,
  comment: string,
): Promise<void> => {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    throw new Error("请先登录再评分");
  }

  await supabaseRequest("/rest/v1/shared_plan_reviews", {
    body: JSON.stringify([
      {
        comment: comment.trim(),
        created_at: new Date().toISOString(),
        rating: Math.max(1, Math.min(5, Math.round(rating))),
        shared_plan_id: sharedPlanId,
        user_id: userId,
      },
    ]),
    headers: {
      Prefer: "return=minimal",
    },
    method: "POST",
  });
};

export const reportPlan = async (sharedPlanId: string, reason: string): Promise<void> => {
  const userId = useAuthStore.getState().user?.id;

  await supabaseRequest("/rest/v1/shared_plan_reports", {
    body: JSON.stringify([
      {
        created_at: new Date().toISOString(),
        reason: reason.trim(),
        shared_plan_id: sharedPlanId,
        user_id: userId,
      },
    ]),
    headers: {
      Prefer: "return=minimal",
    },
    method: "POST",
  });
};

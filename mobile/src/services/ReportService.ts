import { Q } from "@nozbe/watermelondb";
import { generatePDF } from "react-native-html-to-pdf";

import { PRType, MuscleGroup } from "../constants/enums";
import { database } from "../database";
import type { Workout } from "../models";
import {
  addDays,
  formatDateLabel,
  formatDateTimeLabel,
  nextMonthStart,
  startOfMonth,
  startOfWeek,
} from "../utils";

interface RawRow extends Record<string, unknown> {}

interface TrendPoint {
  label: string;
  totalVolume: number;
}

interface ReportTotals {
  averageDurationSeconds: number;
  totalSets: number;
  totalVolume: number;
  workoutCount: number;
}

interface ReportPRItem {
  achievedAt: number;
  exerciseName: string;
  prType: PRType;
  value: number;
}

interface ReportData {
  muscleDistribution: Array<{
    label: string;
    ratio: number;
    totalVolume: number;
  }>;
  periodLabel: string;
  prs: ReportPRItem[];
  title: string;
  totals: ReportTotals;
  trend: TrendPoint[];
}

interface MuscleContribution {
  muscle: MuscleGroup;
  share: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const nonFullBodyMuscles = Object.values(MuscleGroup).filter(
  (muscle): muscle is MuscleGroup => muscle !== MuscleGroup.FullBody,
);

const muscleLabels: Record<MuscleGroup, string> = {
  [MuscleGroup.Abs]: "腹部",
  [MuscleGroup.Back]: "背部",
  [MuscleGroup.Biceps]: "肱二头",
  [MuscleGroup.Calves]: "小腿",
  [MuscleGroup.Chest]: "胸部",
  [MuscleGroup.Forearms]: "前臂",
  [MuscleGroup.FullBody]: "全身",
  [MuscleGroup.Glutes]: "臀部",
  [MuscleGroup.Hamstrings]: "腿后侧",
  [MuscleGroup.Quads]: "股四头",
  [MuscleGroup.Shoulders]: "肩部",
  [MuscleGroup.Triceps]: "肱三头",
};

const prLabels: Record<PRType, string> = {
  [PRType.Estimated1RM]: "估算 1RM",
  [PRType.MaxVolume]: "最大单组容量",
  [PRType.MaxWeight]: "最大重量",
};

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

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const parseMuscles = (raw: unknown): MuscleGroup[] => {
  if (typeof raw !== "string" || raw.length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is MuscleGroup =>
      nonFullBodyMuscles.includes(value as MuscleGroup),
    );
  } catch {
    return [];
  }
};

const buildMuscleContributions = (
  primaryMuscles: MuscleGroup[],
  secondaryMuscles: MuscleGroup[],
): MuscleContribution[] => {
  const weights = new Map<MuscleGroup, number>();

  for (const muscle of primaryMuscles) {
    weights.set(muscle, (weights.get(muscle) ?? 0) + 1);
  }

  for (const muscle of secondaryMuscles) {
    weights.set(muscle, (weights.get(muscle) ?? 0) + 0.5);
  }

  const totalWeight = Array.from(weights.values()).reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) {
    return [];
  }

  return Array.from(weights.entries()).map(([muscle, weight]) => ({
    muscle,
    share: weight / totalWeight,
  }));
};

const runRawQuery = async (
  sql: string,
  placeholders: unknown[] = [],
): Promise<RawRow[]> =>
  (await database
    .get<Workout>("workouts")
    .query(Q.unsafeSqlQuery(sql, placeholders))
    .unsafeFetchRaw()) as RawRow[];

const loadTotals = async (startAt: number, endAt: number): Promise<ReportTotals> => {
  const [row] = await runRawQuery(
    `
      select
        count(*) as workout_count,
        sum(total_volume) as total_volume,
        sum(total_sets) as total_sets,
        avg(duration_seconds) as average_duration
      from workouts
      where _status is not 'deleted'
        and finished_at is not null
        and started_at >= ?
        and started_at < ?
    `,
    [startAt, endAt],
  );

  return {
    averageDurationSeconds: Math.round(toNumber(row?.average_duration)),
    totalSets: Math.round(toNumber(row?.total_sets)),
    totalVolume: Number(toNumber(row?.total_volume).toFixed(2)),
    workoutCount: Math.round(toNumber(row?.workout_count)),
  };
};

const loadWeeklyTrend = async (startAt: number, endAt: number): Promise<TrendPoint[]> => {
  const startDate = new Date(startAt);
  const endDate = new Date(endAt - 1);
  const normalizedStart = startOfWeek(startDate);
  const totalWeeks = Math.max(
    1,
    Math.ceil((endDate.getTime() - normalizedStart.getTime() + DAY_MS) / (7 * DAY_MS)),
  );

  const rows = await runRawQuery(
    `
      select
        cast((started_at - ?) / ? as integer) as week_index,
        sum(total_volume) as total_volume
      from workouts
      where _status is not 'deleted'
        and finished_at is not null
        and started_at >= ?
        and started_at < ?
      group by week_index
      order by week_index asc
    `,
    [normalizedStart.getTime(), 7 * DAY_MS, startAt, endAt],
  );

  const lookup = new Map(
    rows.map((row) => [toNumber(row.week_index), Number(toNumber(row.total_volume).toFixed(2))]),
  );

  return Array.from({ length: totalWeeks }, (_, index) => {
    const weekStart = addDays(normalizedStart, index * 7);

    return {
      label: formatDateLabel(weekStart.getTime()),
      totalVolume: lookup.get(index) ?? 0,
    };
  });
};

const loadMuscleDistribution = async (
  startAt: number,
  endAt: number,
): Promise<ReportData["muscleDistribution"]> => {
  const rows = await runRawQuery(
    `
      select
        workout_exercises.volume as volume,
        exercises.primary_muscles as primary_muscles,
        exercises.secondary_muscles as secondary_muscles
      from workout_exercises
      inner join workouts on workouts.id = workout_exercises.workout_id
      inner join exercises on exercises.id = workout_exercises.exercise_id
      where workout_exercises._status is not 'deleted'
        and workouts._status is not 'deleted'
        and exercises._status is not 'deleted'
        and workouts.finished_at is not null
        and workouts.started_at >= ?
        and workouts.started_at < ?
    `,
    [startAt, endAt],
  );

  const totals = new Map(nonFullBodyMuscles.map((muscle) => [muscle, 0]));

  for (const row of rows) {
    const contributions = buildMuscleContributions(
      parseMuscles(row.primary_muscles),
      parseMuscles(row.secondary_muscles),
    );
    const volume = toNumber(row.volume);

    for (const contribution of contributions) {
      totals.set(
        contribution.muscle,
        (totals.get(contribution.muscle) ?? 0) + volume * contribution.share,
      );
    }
  }

  const totalVolume = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);

  return Array.from(totals.entries())
    .map(([muscle, volume]) => ({
      label: muscleLabels[muscle],
      ratio: totalVolume > 0 ? volume / totalVolume : 0,
      totalVolume: Number(volume.toFixed(2)),
    }))
    .sort((left, right) => right.totalVolume - left.totalVolume)
    .slice(0, 6);
};

const loadPRsInRange = async (startAt: number, endAt: number): Promise<ReportPRItem[]> => {
  const rows = await runRawQuery(
    `
      select
        personal_records.achieved_at as achieved_at,
        personal_records.pr_type as pr_type,
        personal_records.value as value,
        exercises.name as exercise_name
      from personal_records
      inner join exercises on exercises.id = personal_records.exercise_id
      where personal_records._status is not 'deleted'
        and exercises._status is not 'deleted'
        and personal_records.achieved_at >= ?
        and personal_records.achieved_at < ?
      order by personal_records.achieved_at desc
      limit 12
    `,
    [startAt, endAt],
  );

  return rows.map((row) => ({
    achievedAt: toNumber(row.achieved_at),
    exerciseName: toString(row.exercise_name),
    prType: toString(row.pr_type) as PRType,
    value: Number(toNumber(row.value).toFixed(2)),
  }));
};

const buildBarChart = (points: TrendPoint[]): string => {
  const maxValue = Math.max(1, ...points.map((point) => point.totalVolume));

  return points
    .map((point) => {
      const width = Math.max(6, Math.round((point.totalVolume / maxValue) * 100));
      return `
        <div class="bar-row">
          <div class="bar-copy">
            <span>${escapeHtml(point.label)}</span>
            <strong>${Math.round(point.totalVolume)}</strong>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${width}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
};

const buildDistributionRows = (
  distribution: ReportData["muscleDistribution"],
): string =>
  distribution
    .map((item) => {
      const width = Math.max(8, Math.round(item.ratio * 100));
      return `
        <div class="bar-row">
          <div class="bar-copy">
            <span>${escapeHtml(item.label)}</span>
            <strong>${Math.round(item.totalVolume)}</strong>
          </div>
          <div class="bar-track">
            <div class="bar-fill accent" style="width:${width}%"></div>
          </div>
        </div>
      `;
    })
    .join("");

const buildPrRows = (prs: ReportPRItem[]): string => {
  if (prs.length === 0) {
    return `<p class="empty">本周期没有新的 PR 记录。</p>`;
  }

  return prs
    .map(
      (item) => `
        <div class="list-row">
          <div>
            <strong>${escapeHtml(item.exerciseName)}</strong>
            <p>${escapeHtml(prLabels[item.prType] ?? item.prType)}</p>
          </div>
          <div class="list-meta">
            <strong>${item.value}</strong>
            <span>${escapeHtml(formatDateTimeLabel(item.achievedAt))}</span>
          </div>
        </div>
      `,
    )
    .join("");
};

const buildHtml = (data: ReportData): string => `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {
          background: #0f0f14;
          color: #f5f6fa;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          padding: 28px;
        }
        h1, h2, h3, p {
          margin: 0;
        }
        .hero {
          background: linear-gradient(135deg, rgba(108, 92, 231, 0.24), rgba(77, 208, 225, 0.12));
          border: 1px solid #2c2c3a;
          border-radius: 20px;
          padding: 24px;
          margin-bottom: 18px;
        }
        .hero p {
          color: #a0a3bd;
          margin-top: 8px;
        }
        .grid {
          display: table;
          width: 100%;
          border-spacing: 10px;
          margin: 0 -10px 10px;
        }
        .card {
          background: #1a1a24;
          border: 1px solid #2c2c3a;
          border-radius: 18px;
          display: table-cell;
          padding: 16px;
          vertical-align: top;
          width: 25%;
        }
        .card span {
          color: #a0a3bd;
          display: block;
          font-size: 12px;
          margin-bottom: 6px;
          text-transform: uppercase;
        }
        .card strong {
          font-size: 24px;
        }
        .section {
          background: #1a1a24;
          border: 1px solid #2c2c3a;
          border-radius: 18px;
          margin-top: 16px;
          padding: 18px;
        }
        .section h2 {
          font-size: 18px;
          margin-bottom: 6px;
        }
        .section p.sub {
          color: #a0a3bd;
          margin-bottom: 16px;
        }
        .bar-row {
          margin-bottom: 14px;
        }
        .bar-copy, .list-row {
          align-items: center;
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }
        .bar-copy span, .list-row p, .list-row span {
          color: #a0a3bd;
          font-size: 12px;
        }
        .bar-track {
          background: #14141c;
          border-radius: 999px;
          height: 10px;
          margin-top: 8px;
          overflow: hidden;
        }
        .bar-fill {
          background: #6c5ce7;
          border-radius: 999px;
          height: 100%;
        }
        .bar-fill.accent {
          background: #00d084;
        }
        .list-row {
          background: #14141c;
          border-radius: 14px;
          margin-bottom: 10px;
          padding: 14px;
        }
        .list-meta {
          text-align: right;
        }
        .empty {
          color: #70738b;
        }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1>${escapeHtml(data.title)}</h1>
        <p>${escapeHtml(data.periodLabel)}</p>
      </div>

      <div class="grid">
        <div class="card">
          <span>Workouts</span>
          <strong>${data.totals.workoutCount}</strong>
        </div>
        <div class="card">
          <span>Volume</span>
          <strong>${Math.round(data.totals.totalVolume)}</strong>
        </div>
        <div class="card">
          <span>Sets</span>
          <strong>${data.totals.totalSets}</strong>
        </div>
        <div class="card">
          <span>Avg Duration</span>
          <strong>${Math.round(data.totals.averageDurationSeconds / 60)} min</strong>
        </div>
      </div>

      <div class="section">
        <h2>容量趋势</h2>
        <p class="sub">按周汇总训练容量，便于观察强度与负荷变化。</p>
        ${buildBarChart(data.trend)}
      </div>

      <div class="section">
        <h2>肌群分布</h2>
        <p class="sub">按动作主要/次要肌群分摊训练容量。</p>
        ${buildDistributionRows(data.muscleDistribution)}
      </div>

      <div class="section">
        <h2>PR 列表</h2>
        <p class="sub">统计本周期内自动识别的新纪录。</p>
        ${buildPrRows(data.prs)}
      </div>
    </body>
  </html>
`;

const buildReportData = async (input: {
  endAt: number;
  startAt: number;
  title: string;
}): Promise<ReportData> => {
  const [totals, trend, muscleDistribution, prs] = await Promise.all([
    loadTotals(input.startAt, input.endAt),
    loadWeeklyTrend(input.startAt, input.endAt),
    loadMuscleDistribution(input.startAt, input.endAt),
    loadPRsInRange(input.startAt, input.endAt),
  ]);

  return {
    muscleDistribution,
    periodLabel: `${formatDateTimeLabel(input.startAt)} - ${formatDateTimeLabel(
      input.endAt - 1,
    )}`,
    prs,
    title: input.title,
    totals,
    trend,
  };
};

const generatePdf = async (data: ReportData, fileName: string): Promise<string> => {
  const result = await generatePDF({
    directory: "Documents",
    fileName,
    html: buildHtml(data),
  });

  if (!result.filePath) {
    throw new Error("PDF 生成失败");
  }

  return result.filePath;
};

export const generateWeeklyReport = async (weekStart: Date): Promise<string> => {
  const normalizedStart = startOfWeek(weekStart);
  const endAt = addDays(normalizedStart, 7).getTime();
  const startAt = normalizedStart.getTime();
  const data = await buildReportData({
    endAt,
    startAt,
    title: "wsTrack 周训练报告",
  });

  return generatePdf(
    data,
    `wstrack-weekly-${new Date(startAt).toISOString().slice(0, 10)}`,
  );
};

export const generateMonthlyReport = async (month: Date): Promise<string> => {
  const normalizedStart = startOfMonth(month);
  const startAt = normalizedStart.getTime();
  const endAt = nextMonthStart(month).getTime();
  const data = await buildReportData({
    endAt,
    startAt,
    title: "wsTrack 月训练报告",
  });

  return generatePdf(
    data,
    `wstrack-monthly-${normalizedStart.getFullYear()}-${`${normalizedStart.getMonth() + 1}`.padStart(2, "0")}`,
  );
};

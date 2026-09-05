'use client';

import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

//BKT ENGINE
interface BKTParams {
  pL0: number; // Initial mastery probability
  pT: number; // Transition probability
  pG: number; // Probability of guess
  pS: number; // Probability of slip
}

const DEFAULT_BKT_PARAMS: BKTParams = {
  pL0: 0.25,
  pT: 0.15,
  pG: 0.2,
  pS: 0.1,
};

function calculateNextMastery(
  pL: number,
  isCorrect: boolean,
  params: BKTParams = DEFAULT_BKT_PARAMS
): { pNext: number; pLGivenResponse: number } {
  const { pT, pG, pS } = params;
  let pLGivenResponse = 0;
  if (isCorrect) {
    const numerator = pL * (1 - pS);
    const denominator = pL * (1 - pS) + (1 - pL) * pG;
    pLGivenResponse = denominator === 0 ? pL : numerator / denominator;
  } else {
    const numerator = pL * pS;
    const denominator = pL * pS + (1 - pL) * (1 - pG);
    pLGivenResponse = denominator === 0 ? pL : numerator / denominator;
  }
  const pNext = pLGivenResponse + (1 - pLGivenResponse) * pT;
  return { pNext, pLGivenResponse };
}

function getAdjustedParams(base: BKTParams, difficulty: 'Easy' | 'Medium' | 'Hard'): BKTParams {
  switch (difficulty) {
    case 'Easy':
      return { ...base, pG: 0.3, pS: 0.05 };
    case 'Hard':
      return { ...base, pG: 0.1, pS: 0.2 };
    case 'Medium':
    default:
      return base;
  }
}

export interface ResponseLog {
  questionId: string;
  topicId: string;
  isCorrect: boolean;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

function processResponseSequence(logs: ResponseLog[], baseParams: BKTParams = DEFAULT_BKT_PARAMS) {
  let currentMastery = baseParams.pL0;
  return logs.map((log, index) => {
    const params = getAdjustedParams(baseParams, log.difficulty);
    const pMasteryBefore = currentMastery;
    const { pNext } = calculateNextMastery(pMasteryBefore, log.isCorrect, params);
    currentMastery = pNext;
    return {
      step: index + 1,
      questionId: log.questionId,
      topicId: log.topicId,
      isCorrect: log.isCorrect,
      difficulty: log.difficulty,
      pMasteryBefore,
      pMasteryAfter: pNext,
    };
  });
}

function generateRecommendedPath(topicMasteries: Record<string, { title: string; mastery: number }>) {
  const sorted = Object.entries(topicMasteries).sort(([, a], [, b]) => a.mastery - b.mastery);
  return sorted.map(([id, data], idx) => {
    let status = 'Mastered';
    let actionableStep = 'Proceed to advanced enrichment modules and competitive problem sets.';
    if (data.mastery < 0.4) {
      status = 'Critical Intervention';
      actionableStep = 'Schedule 1-on-1 peer mentoring and review foundational module definitions.';
    } else if (data.mastery < 0.75) {
      status = 'Review Recommended';
      actionableStep = 'Complete targeted practice sets focusing on intermediate problem types.';
    }
    return {
      topicId: id,
      topicTitle: data.title,
      priority: idx + 1,
      status,
      actionableStep,
    };
  });
}

//Friction, risk, distractor

type DistractorType =
  | 'Sign Error'
  | 'Discriminant Misread'
  | 'Formula Misapplication'
  | 'Careless Substitution'
  | 'GCF Oversight'
  | 'Grouping Misstep'
  | 'Incomplete Factoring'
  | 'Elimination Arithmetic Slip'
  | 'Substitution Mix-up'
  | 'Misread Coefficient';

export interface AttemptRecord {
  id: string;
  studentId: string;
  topicId: string;
  topicTitle: string;
  questionId: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isCorrect: boolean;
  dwellTimeMs: number;
  timeToFirstReactionMs: number;
  revisionCount: number;
  distractorId: string | null;
  distractorType: DistractorType | null;
  attemptedAt: string;
}

const DISTRACTOR_TYPES_BY_TOPIC: Record<string, DistractorType[]> = {
  quadratics: ['Sign Error', 'Discriminant Misread', 'Formula Misapplication', 'Careless Substitution'],
  polynomials: ['GCF Oversight', 'Grouping Misstep', 'Sign Error', 'Incomplete Factoring'],
  systems: ['Elimination Arithmetic Slip', 'Substitution Mix-up', 'Sign Error', 'Misread Coefficient'],
};

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

interface AttemptOverride {
  forceDecline?: boolean; // recent attempts trend toward incorrect, revealing forgetting
  forceHighFriction?: boolean; // inflates dwell time well past the class median
  staleDaysOffset?: number; // pushes the whole attempt run further into the past (retention risk)
  guaranteedDistractor?: DistractorType; // guarantees one visible, labeled miss
  forceStable?: boolean; // near-perfect, low-friction run
}


function generateAttemptsForStudent(
  studentId: string,
  topicId: string,
  topicTitle: string,
  mastery: number,
  seedKey: string,
  override?: AttemptOverride
): AttemptRecord[] {
  const rng = mulberry32(hashStringToSeed(seedKey));
  const attemptCount = 4 + Math.floor(rng() * 3);
  const pool = DISTRACTOR_TYPES_BY_TOPIC[topicId] || DISTRACTOR_TYPES_BY_TOPIC.quadratics;
  const signature = pool[Math.floor(rng() * pool.length)];
  const now = Date.now();
  const records: AttemptRecord[] = [];
  let cursorDaysAgo = 3 + Math.floor(rng() * 5);

  for (let i = 0; i < attemptCount; i++) {
    const difficulty: 'Easy' | 'Medium' | 'Hard' = i % 3 === 0 ? 'Easy' : i % 3 === 1 ? 'Medium' : 'Hard';

    let effectiveMastery = mastery;
    if (override?.forceDecline) {
      effectiveMastery = Math.max(0.08, mastery - (i / Math.max(1, attemptCount - 1)) * 0.4);
    }
    if (override?.forceStable) {
      effectiveMastery = Math.max(effectiveMastery, 0.9);
    }

    const difficultyShift = difficulty === 'Easy' ? 0.15 : difficulty === 'Hard' ? -0.15 : 0;
    const successProb = Math.min(0.95, Math.max(0.05, effectiveMastery + difficultyShift + (rng() - 0.5) * 0.15));
    const forceThisIncorrect = !!override?.guaranteedDistractor && i === attemptCount - 2;
    const isCorrect = forceThisIncorrect ? false : override?.forceStable ? true : rng() < successProb;

    const baseDwell = difficulty === 'Easy' ? 9000 : difficulty === 'Medium' ? 17000 : 27000;
    const frictionMultiplier = override?.forceHighFriction ? 2.3 + rng() * 0.7 : 1;
    const masteryDwellFactor = 1 + (1 - effectiveMastery) * 0.9;
    const dwellTimeMs = Math.round(baseDwell * masteryDwellFactor * frictionMultiplier * (0.85 + rng() * 0.3));
    const timeToFirstReactionMs = Math.round(dwellTimeMs * (0.12 + rng() * 0.18));

    const revisionBase = isCorrect ? 2 : 3;
    const revisionCount = Math.floor(rng() * (override?.forceHighFriction ? revisionBase + 2 : revisionBase));

    const distractorType: DistractorType | null = isCorrect
      ? null
      : forceThisIncorrect
      ? (override!.guaranteedDistractor as DistractorType)
      : rng() < 0.55
      ? signature
      : pool[Math.floor(rng() * pool.length)];
    const distractorId = isCorrect ? null : String.fromCharCode(97 + Math.floor(rng() * 3));

    const totalDaysAgo = cursorDaysAgo + (override?.staleDaysOffset ?? 0);
    const attemptedAt = new Date(now - totalDaysAgo * 86400000 - Math.floor(rng() * 10) * 3600000).toISOString();

    records.push({
      id: `${studentId}-${topicId}-${i}`,
      studentId,
      topicId,
      topicTitle,
      questionId: `${topicId}-gen-${i}`,
      difficulty,
      isCorrect,
      dwellTimeMs,
      timeToFirstReactionMs,
      revisionCount,
      distractorId,
      distractorType,
      attemptedAt,
    });

    cursorDaysAgo = Math.max(0, cursorDaysAgo - (2 + Math.floor(rng() * 3)));
  }

  return records.sort((a, b) => new Date(a.attemptedAt).getTime() - new Date(b.attemptedAt).getTime());
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Class Baseline Median dwell time, keyed by "cohortId|topicId". */
function buildClassBaselines(
  attempts: AttemptRecord[],
  studentSheetMap: Record<string, string>
): Record<string, number> {
  const buckets: Record<string, number[]> = {};
  attempts.forEach((a) => {
    const sheetId = studentSheetMap[a.studentId];
    if (!sheetId) return;
    const key = `${sheetId}|${a.topicId}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(a.dwellTimeMs);
  });
  const baselines: Record<string, number> = {};
  Object.entries(buckets).forEach(([key, values]) => {
    baselines[key] = median(values);
  });
  return baselines;
}

export interface TopicDiagnostic {
  topicId: string;
  topicTitle: string;
  bktMastery: number; //sequential BKT estimate from logged attempts
  decayedMastery: number; //bktMastery adjusted for exponential time decay (retention risk)
  frictionRatio: number | null; //individual rolling avg dwell / class baseline median dwell
  isHighFriction: boolean; //frictionRatio > 2.0
  dominantDistractorType: DistractorType | null;
  trend: 'Falling' | 'Stable' | 'Rising';
  lastPracticedAt: string | null;
  attemptCount: number;
  rollingAvgDwellMs: number | null;
}

export interface StudentDiagnostic {
  studentId: string;
  topics: TopicDiagnostic[];
  triageCategory: 'Risk of Fall' | 'High Friction' | 'Ready for Extension' | 'Steady';
  frictionLevel: 'High' | 'Medium' | 'Low';
  overallTrend: 'Falling' | 'Stable' | 'Rising';
  overallStatusLabel: string;
}

const TIME_DECAY_LAMBDA = 0.025; //per day - so stale weeks meaningfully erodes mastery

function computeStudentDiagnostics(
  studentId: string,
  sheetId: string,
  topics: { id: string; title: string }[],
  attemptsByStudent: AttemptRecord[],
  baselines: Record<string, number>,
  initialMasteryByTopic: Record<string, number>
): StudentDiagnostic {
  const topicDiagnostics: TopicDiagnostic[] = topics.map((topic) => {
    const topicAttempts = attemptsByStudent
      .filter((a) => a.topicId === topic.id)
      .sort((a, b) => new Date(a.attemptedAt).getTime() - new Date(b.attemptedAt).getTime());

    const priorMastery = initialMasteryByTopic[topic.id] ?? DEFAULT_BKT_PARAMS.pL0;

    if (topicAttempts.length === 0) {
      return {
        topicId: topic.id,
        topicTitle: topic.title,
        bktMastery: priorMastery,
        decayedMastery: priorMastery,
        frictionRatio: null,
        isHighFriction: false,
        dominantDistractorType: null,
        trend: 'Stable',
        lastPracticedAt: null,
        attemptCount: 0,
        rollingAvgDwellMs: null,
      };
    }

    let mastery = priorMastery;
    topicAttempts.forEach((a) => {
      const params = getAdjustedParams(DEFAULT_BKT_PARAMS, a.difficulty);
      mastery = calculateNextMastery(mastery, a.isCorrect, params).pNext;
    });

    const lastPracticedAt = topicAttempts[topicAttempts.length - 1].attemptedAt;
    const daysSince = (Date.now() - new Date(lastPracticedAt).getTime()) / 86400000;
    const decayedMastery = mastery * Math.exp(-TIME_DECAY_LAMBDA * daysSince);

    const recentWindow = topicAttempts.slice(-3);
    const earlierWindow = topicAttempts.slice(0, Math.max(1, topicAttempts.length - 3));
    const recentAccuracy = recentWindow.filter((a) => a.isCorrect).length / recentWindow.length;
    const earlierAccuracy = earlierWindow.filter((a) => a.isCorrect).length / earlierWindow.length;
    let trend: 'Falling' | 'Stable' | 'Rising' = 'Stable';
    if (recentAccuracy < earlierAccuracy - 0.2) trend = 'Falling';
    else if (recentAccuracy > earlierAccuracy + 0.2) trend = 'Rising';

    const rollingAvgDwellMs = recentWindow.reduce((sum, a) => sum + a.dwellTimeMs, 0) / recentWindow.length;
    const baseline = baselines[`${sheetId}|${topic.id}`] ?? rollingAvgDwellMs;
    const frictionRatio = baseline > 0 ? rollingAvgDwellMs / baseline : null;
    const isHighFriction = frictionRatio !== null && frictionRatio > 2.0;

    const incorrectAttempts = topicAttempts.filter((a) => !a.isCorrect && a.distractorType);
    let dominantDistractorType: DistractorType | null = null;
    if (incorrectAttempts.length > 0) {
      const counts: Record<string, number> = {};
      incorrectAttempts.forEach((a) => {
        if (a.distractorType) counts[a.distractorType] = (counts[a.distractorType] || 0) + 1;
      });
      dominantDistractorType = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as DistractorType;
    }

    return {
      topicId: topic.id,
      topicTitle: topic.title,
      bktMastery: mastery,
      decayedMastery,
      frictionRatio,
      isHighFriction,
      dominantDistractorType,
      trend,
      lastPracticedAt,
      attemptCount: topicAttempts.length,
      rollingAvgDwellMs,
    };
  });

  const maxFriction = Math.max(0, ...topicDiagnostics.map((t) => t.frictionRatio ?? 0));
  const frictionLevel: 'High' | 'Medium' | 'Low' = maxFriction > 2.0 ? 'High' : maxFriction > 1.3 ? 'Medium' : 'Low';

  const weakestTopic = [...topicDiagnostics].sort((a, b) => a.decayedMastery - b.decayedMastery)[0];
  const overallTrend = weakestTopic ? weakestTopic.trend : 'Stable';

  const hasHighFriction = topicDiagnostics.some((t) => t.isHighFriction);
  const hasDecayRisk = topicDiagnostics.some(
    (t) => t.bktMastery - t.decayedMastery > 0.1 || (t.trend === 'Falling' && t.decayedMastery < 0.75)
  );
  const readyForExtension =
    topicDiagnostics.length > 0 && topicDiagnostics.every((t) => t.decayedMastery >= 0.85 && !t.isHighFriction);

  let triageCategory: StudentDiagnostic['triageCategory'] = 'Steady';
  if (hasHighFriction) triageCategory = 'High Friction';
  else if (hasDecayRisk) triageCategory = 'Risk of Fall';
  else if (readyForExtension) triageCategory = 'Ready for Extension';

  const avgDecayed = topicDiagnostics.reduce((s, t) => s + t.decayedMastery, 0) / (topicDiagnostics.length || 1);
  let overallStatusLabel = 'Developing';
  if (avgDecayed < 0.5) overallStatusLabel = 'Needs Support';
  else if (avgDecayed < 0.75) overallStatusLabel = 'Developing';
  else if (avgDecayed < 0.9) overallStatusLabel = 'Solid';
  else overallStatusLabel = 'Advanced';

  return { studentId, topics: topicDiagnostics, triageCategory, frictionLevel, overallTrend, overallStatusLabel };
}

function generateIntervention(diag: StudentDiagnostic, firstName: string): string {
  const weakest = [...diag.topics].sort((a, b) => a.decayedMastery - b.decayedMastery)[0];
  if (!weakest || weakest.attemptCount === 0) {
    return `${firstName} has no logged attempts yet — assign a short diagnostic set before planning an intervention.`;
  }
  const focus = weakest.dominantDistractorType ? `${weakest.dominantDistractorType.toLowerCase()} patterns` : 'the core method';
  const frictionNote =
    weakest.frictionRatio && weakest.frictionRatio > 2
      ? ` ${firstName} is also spending well over double the class median time on these items, so pair the reteach with a worked-example walkthrough rather than more timed drills.`
      : '';
  return `Recommended: a focused 5-minute review of ${focus} in ${weakest.topicTitle} before ${firstName}'s next assessment, followed by two low-stakes practice items to confirm the fix holds.${frictionNote}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatRelativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

//DATA TYPES
type UserRole = 'teacher' | 'student' | 'mentor';
type TeacherTab = 'dashboard' | 'spreadsheets' | 'assessment' | 'synthesis';
type StudentTab = 'materials' | 'practice';

interface Question {
  id: string;
  topicId: string;
  text: string;
  options: string[];
  correctAnswer: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

interface TopicParagraph {
  id: string;
  subtitle: string;
  summary: string;
  content: string;
}

interface Topic {
  id: string;
  title: string;
  paragraphs: TopicParagraph[];
}

interface HistoryPoint {
  step: number;
  mastery: number;
  difficulty: string;
}

interface ManualQuestionEntry {
  id: string;
  topicId: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isCorrect: boolean;
}

interface TeacherRecommendation {
  topicId: string;
  topicTitle: string;
  status: string;
  actionableStep: string;
  currentMastery: number | null;
}

interface MentorRequest {
  id: string;
  studentName: string;
  topicTitle: string;
  currentMastery: number;
  questionText: string;
  timestamp: string;
}

interface SpreadsheetStudent {
  id: string;
  name: string;
  grade: string;
  quadraticsMastery: number;
  polynomialsMastery: number;
  systemsMastery: number;
  weakestTopic: string;
  status: 'Mastered' | 'Review Recommended' | 'Critical Intervention';
  lastActive: string;
}

interface ClassSpreadsheet {
  id: string;
  name: string;
  description: string;
  data: SpreadsheetStudent[];
}

//STATIC DATA

const TOPICS: Topic[] = [
  {
    id: 'quadratics',
    title: 'Quadratic Equations',
    paragraphs: [
      {
        id: 'q-p1',
        subtitle: 'Standard Form & General Properties',
        summary: 'Definition of second-order polynomial equations and coefficient rules.',
        content:
          'A quadratic equation is a second-order polynomial equation in a single variable x: ax² + bx + c = 0, where a is not 0. The coefficient a determines parabola direction, b affects the axis of symmetry location, and c defines the y-intercept.',
      },
      {
        id: 'q-p2',
        subtitle: 'Analytical Solution Methods',
        summary: 'Factoring, completing the square, and the quadratic formula.',
        content:
          'Key techniques for solving include factoring expressions into linear binomials, completing the square, and applying the quadratic formula: x = (-b ± √(b² - 4ac)) / (2a). The discriminant (b² - 4ac) dictates whether roots are real, distinct, or complex.',
      },
    ],
  },
  {
    id: 'polynomials',
    title: 'Polynomial Factoring',
    paragraphs: [
      {
        id: 'p-p1',
        subtitle: 'Greatest Common Factors & Grouping',
        summary: 'Factoring terms by extraction and term grouping strategies.',
        content:
          'Polynomial factoring involves expressing a polynomial as a product of simpler polynomials. The primary step involves identifying the Greatest Common Factor (GCF) across all terms, followed by grouping methods when working with four-term polynomials.',
      },
      {
        id: 'p-p2',
        subtitle: 'Special Quadratic Identities',
        summary: 'Difference of squares, perfect square trinomials, and cubic patterns.',
        content:
          'Recognizing standard algebraic patterns allows rapid factorization. Fundamental identities include the Difference of Squares (a² - b² = (a-b)(a+b)), Perfect Square Trinomials, and the Sum/Difference of Cubes identities.',
      },
    ],
  },
  {
    id: 'systems',
    title: 'Systems of Equations',
    paragraphs: [
      {
        id: 's-p1',
        subtitle: 'Linear Systems & Solution Spaces',
        summary: 'Understanding system intersection types and consistency.',
        content:
          'A linear system consists of two or more equations sharing common variables. The solution space corresponds geometrically to point intersections, line overlaps (infinite solutions), or parallel planes (no solution).',
      },
      {
        id: 's-p2',
        subtitle: 'Algebraic Solving Methods',
        summary: 'Substitution, elimination, and matrix linear algebra.',
        content:
          'Analytical solutions are derived primarily via substitution (isolating one variable), elimination (adding/subtracting scaled equations), or matrix operations such as Cramers Rule and Gaussian Elimination.',
      },
    ],
  },
];

const QUESTIONS_BY_TOPIC: Record<string, Question[]> = {
  quadratics: [
    {
      id: 'q1',
      topicId: 'quadratics',
      text: 'What are the roots of the equation x² - 5x + 6 = 0?',
      options: ['x = 2, x = 3', 'x = -2, x = -3', 'x = 1, x = 6', 'x = -1, x = -6'],
      correctAnswer: 0,
      difficulty: 'Easy',
    },
    {
      id: 'q2',
      topicId: 'quadratics',
      text: 'For what value of k does x² + kx + 9 = 0 have exactly one real solution?',
      options: ['k = 3', 'k = 6 or k = -6', 'k = 9', 'k = 0'],
      correctAnswer: 1,
      difficulty: 'Medium',
    },
    {
      id: 'q3',
      topicId: 'quadratics',
      text: 'If alpha and beta are roots of 2x² - 4x - 5 = 0, find the value of alpha² + beta².',
      options: ['9', '7', '14', '4'],
      correctAnswer: 0,
      difficulty: 'Hard',
    },
    {
      id: 'q4',
      topicId: 'quadratics',
      text: 'What is the vertex of the parabola defined by y = 2x² - 8x + 3?',
      options: ['(2, -5)', '(-2, 27)', '(4, 3)', '(2, 5)'],
      correctAnswer: 0,
      difficulty: 'Medium',
    },
    {
      id: 'q5',
      topicId: 'quadratics',
      text: 'Which discriminant value indicates two distinct irrational roots for integer coefficients?',
      options: ['-4', '0', '25', '13'],
      correctAnswer: 3,
      difficulty: 'Hard',
    },
  ],
  polynomials: [
    {
      id: 'p1',
      topicId: 'polynomials',
      text: 'Factor completely: 4x² - 9',
      options: ['(2x - 3)(2x + 3)', '(4x - 9)(x + 1)', '(2x - 3)²', '(4x - 3)(x + 3)'],
      correctAnswer: 0,
      difficulty: 'Easy',
    },
    {
      id: 'p2',
      topicId: 'polynomials',
      text: 'What is the Greatest Common Factor (GCF) of 12x³y² and 18x²y⁴?',
      options: ['6x²y²', '3xy', '36x³y⁴', '6x³y⁴'],
      correctAnswer: 0,
      difficulty: 'Easy',
    },
    {
      id: 'p3',
      topicId: 'polynomials',
      text: 'Factor completely by grouping: x³ + 3x² - 4x - 12',
      options: ['(x + 3)(x - 2)(x + 2)', '(x - 3)(x² + 4)', '(x + 3)(x² + 4)', '(x - 3)(x - 2)(x + 2)'],
      correctAnswer: 0,
      difficulty: 'Medium',
    },
    {
      id: 'p4',
      topicId: 'polynomials',
      text: 'Which of the following is a factor of x³ - 27?',
      options: ['x² + 3x + 9', 'x² - 3x + 9', 'x + 3', 'x² + 9'],
      correctAnswer: 0,
      difficulty: 'Medium',
    },
    {
      id: 'p5',
      topicId: 'polynomials',
      text: 'If (x - 2) is a factor of x³ - 4x² + kx + 6, find the value of k.',
      options: ['1', '-1', '5', '-5'],
      correctAnswer: 0,
      difficulty: 'Hard',
    },
  ],
  systems: [
    {
      id: 's1',
      topicId: 'systems',
      text: 'Solve the system: 2x + y = 7 and x - y = 2',
      options: ['x = 3, y = 1', 'x = 2, y = 3', 'x = 4, y = -1', 'x = 1, y = 5'],
      correctAnswer: 0,
      difficulty: 'Easy',
    },
    {
      id: 's2',
      topicId: 'systems',
      text: 'How many solutions does a system of parallel distinct linear equations have?',
      options: ['Zero', 'Exactly one', 'Infinitely many', 'Two'],
      correctAnswer: 0,
      difficulty: 'Easy',
    },
    {
      id: 's3',
      topicId: 'systems',
      text: 'For what value of k will the system 3x - 2y = 5 and 6x - 4y = k have infinitely many solutions?',
      options: ['10', '5', '0', '-10'],
      correctAnswer: 0,
      difficulty: 'Medium',
    },
    {
      id: 's4',
      topicId: 'systems',
      text: 'Solve the system: 3x + 2y = 12 and 5x - 2y = 4',
      options: ['x = 2, y = 3', 'x = 3, y = 2', 'x = 4, y = 0', 'x = 1, y = 4.5'],
      correctAnswer: 0,
      difficulty: 'Medium',
    },
    {
      id: 's5',
      topicId: 'systems',
      text: 'Evaluate the determinant of the coefficient matrix for: 2x + 3y = 7 and 4x + 6y = 11',
      options: ['0', '12', '-2', '24'],
      correctAnswer: 0,
      difficulty: 'Hard',
    },
  ],
};

const TOPIC_LIST = TOPICS.map((t) => ({ id: t.id, title: t.title }));

// STATIC DATA — Grade 10A (preloaded cohort)

const GRADE_10A_STUDENTS: SpreadsheetStudent[] = [
  { id: 'ST-10A01', name: 'Alex Brown', grade: 'Grade 10A', quadraticsMastery: 0.45, polynomialsMastery: 0.31, systemsMastery: 0.4, weakestTopic: 'Polynomial Factoring', status: 'Critical Intervention', lastActive: '10 mins ago' },
  { id: 'ST-10A02', name: 'Maria Smith', grade: 'Grade 10A', quadraticsMastery: 0.43, polynomialsMastery: 0.65, systemsMastery: 0.58, weakestTopic: 'Quadratic Equations', status: 'Review Recommended', lastActive: '25 mins ago' },
  { id: 'ST-10A03', name: 'John Lee', grade: 'Grade 10A', quadraticsMastery: 0.52, polynomialsMastery: 0.48, systemsMastery: 0.38, weakestTopic: 'Systems of Equations', status: 'Critical Intervention', lastActive: '1 hr ago' },
  { id: 'ST-10A04', name: 'Insar Amantay', grade: 'Grade 10A', quadraticsMastery: 0.88, polynomialsMastery: 0.85, systemsMastery: 0.82, weakestTopic: 'Systems of Equations', status: 'Mastered', lastActive: 'Just now' },
  { id: 'ST-10A05', name: 'Charlie Savage', grade: 'Grade 10A', quadraticsMastery: 0.78, polynomialsMastery: 0.82, systemsMastery: 0.75, weakestTopic: 'Systems of Equations', status: 'Mastered', lastActive: '5 mins ago' },
  { id: 'ST-10A06', name: 'Lewis Bate', grade: 'Grade 10A', quadraticsMastery: 0.38, polynomialsMastery: 0.32, systemsMastery: 0.35, weakestTopic: 'Polynomial Factoring', status: 'Critical Intervention', lastActive: '2 hrs ago' },
  { id: 'ST-10A07', name: 'Kane Wilson', grade: 'Grade 10A', quadraticsMastery: 0.65, polynomialsMastery: 0.58, systemsMastery: 0.62, weakestTopic: 'Polynomial Factoring', status: 'Review Recommended', lastActive: '1 hr ago' },
  { id: 'ST-10A08', name: 'Sam Greenwood', grade: 'Grade 10A', quadraticsMastery: 0.92, polynomialsMastery: 0.9, systemsMastery: 0.88, weakestTopic: 'Systems of Equations', status: 'Mastered', lastActive: '3 hrs ago' },
  { id: 'ST-10A09', name: 'Sergio Arribas', grade: 'Grade 10A', quadraticsMastery: 0.45, polynomialsMastery: 0.5, systemsMastery: 0.42, weakestTopic: 'Systems of Equations', status: 'Review Recommended', lastActive: 'Yesterday' },
  { id: 'ST-10A10', name: 'Carlos Martin', grade: 'Grade 10A', quadraticsMastery: 0.25, polynomialsMastery: 0.28, systemsMastery: 0.22, weakestTopic: 'Systems of Equations', status: 'Critical Intervention', lastActive: '2 days ago' },
  { id: 'ST-10A11', name: 'Mathys Tel', grade: 'Grade 10A', quadraticsMastery: 0.89, polynomialsMastery: 0.84, systemsMastery: 0.86, weakestTopic: 'Polynomial Factoring', status: 'Mastered', lastActive: '4 hrs ago' },
  { id: 'ST-10A12', name: 'Tom Bischof', grade: 'Grade 10A', quadraticsMastery: 0.72, polynomialsMastery: 0.75, systemsMastery: 0.7, weakestTopic: 'Systems of Equations', status: 'Review Recommended', lastActive: '6 hrs ago' },
  { id: 'ST-10A13', name: 'Elliot Anderson', grade: 'Grade 10A', quadraticsMastery: 0.55, polynomialsMastery: 0.6, systemsMastery: 0.58, weakestTopic: 'Quadratic Equations', status: 'Review Recommended', lastActive: '1 day ago' },
  { id: 'ST-10A14', name: 'Anthony Gordon', grade: 'Grade 10A', quadraticsMastery: 0.3, polynomialsMastery: 0.35, systemsMastery: 0.31, weakestTopic: 'Quadratic Equations', status: 'Critical Intervention', lastActive: '3 days ago' },
  { id: 'ST-10A15', name: 'Lewis Hall', grade: 'Grade 10A', quadraticsMastery: 0.94, polynomialsMastery: 0.91, systemsMastery: 0.95, weakestTopic: 'Polynomial Factoring', status: 'Mastered', lastActive: 'Just now' },
  { id: 'ST-10A16', name: 'Jarrod Bowen', grade: 'Grade 10A', quadraticsMastery: 0.81, polynomialsMastery: 0.79, systemsMastery: 0.83, weakestTopic: 'Polynomial Factoring', status: 'Mastered', lastActive: '30 mins ago' },
  { id: 'ST-10A17', name: 'Adam Wharton', grade: 'Grade 10A', quadraticsMastery: 0.68, polynomialsMastery: 0.62, systemsMastery: 0.66, weakestTopic: 'Polynomial Factoring', status: 'Review Recommended', lastActive: '5 hrs ago' },
  { id: 'ST-10A18', name: 'Jack Hinshelwood', grade: 'Grade 10A', quadraticsMastery: 0.87, polynomialsMastery: 0.85, systemsMastery: 0.89, weakestTopic: 'Polynomial Factoring', status: 'Mastered', lastActive: 'Today' },
  { id: 'ST-10A19', name: 'Harvey Elliott', grade: 'Grade 10A', quadraticsMastery: 0.61, polynomialsMastery: 0.59, systemsMastery: 0.64, weakestTopic: 'Polynomial Factoring', status: 'Review Recommended', lastActive: '1 hr ago' },
  { id: 'ST-10A20', name: 'Cole Palmer', grade: 'Grade 10A', quadraticsMastery: 0.95, polynomialsMastery: 0.96, systemsMastery: 0.94, weakestTopic: 'Systems of Equations', status: 'Mastered', lastActive: 'Just now' },
  { id: 'ST-10A21', name: 'Kieran Tierney', grade: 'Grade 10A', quadraticsMastery: 0.35, polynomialsMastery: 0.29, systemsMastery: 0.38, weakestTopic: 'Polynomial Factoring', status: 'Critical Intervention', lastActive: '4 hrs ago' },
  { id: 'ST-10A22', name: 'Morgan Gibbs-White', grade: 'Grade 10A', quadraticsMastery: 0.7, polynomialsMastery: 0.68, systemsMastery: 0.71, weakestTopic: 'Polynomial Factoring', status: 'Review Recommended', lastActive: 'Yesterday' },
  { id: 'ST-10A23', name: 'Emile Smith Rowe', grade: 'Grade 10A', quadraticsMastery: 0.77, polynomialsMastery: 0.8, systemsMastery: 0.74, weakestTopic: 'Systems of Equations', status: 'Mastered', lastActive: '2 hrs ago' },
  { id: 'ST-10A24', name: 'Conor Gallagher', grade: 'Grade 10A', quadraticsMastery: 0.64, polynomialsMastery: 0.61, systemsMastery: 0.63, weakestTopic: 'Polynomial Factoring', status: 'Review Recommended', lastActive: '12 hrs ago' },
  { id: 'ST-10A25', name: 'Jacob Ramsey', grade: 'Grade 10A', quadraticsMastery: 0.82, polynomialsMastery: 0.8, systemsMastery: 0.85, weakestTopic: 'Polynomial Factoring', status: 'Mastered', lastActive: '3 hrs ago' },
  { id: 'ST-10A26', name: 'Liam Delap', grade: 'Grade 10A', quadraticsMastery: 0.58, polynomialsMastery: 0.52, systemsMastery: 0.54, weakestTopic: 'Polynomial Factoring', status: 'Review Recommended', lastActive: '1 day ago' },
  { id: 'ST-10A27', name: 'James Trafford', grade: 'Grade 10A', quadraticsMastery: 0.79, polynomialsMastery: 0.81, systemsMastery: 0.76, weakestTopic: 'Systems of Equations', status: 'Mastered', lastActive: '4 hrs ago' },
  { id: 'ST-10A28', name: 'Jarrad Branthwaite', grade: 'Grade 10A', quadraticsMastery: 0.83, polynomialsMastery: 0.86, systemsMastery: 0.81, weakestTopic: 'Systems of Equations', status: 'Mastered', lastActive: '5 hrs ago' },
];

// STATIC DATA — Grade 10B, built from the uploaded gradebook

const RAW_10B_STUDENTS: { name: string; quad: number; poly: number; sys: number }[] = [
  { name: 'Jack Harrison', quad: 75, poly: 75, sys: 75 },
  { name: 'Liam Foster', quad: 63, poly: 69, sys: 64 },
  { name: 'Ben Walker', quad: 98, poly: 78, sys: 64 },
  { name: 'Charlie Bennett', quad: 23, poly: 44, sys: 34 },
  { name: 'Harry Dawson', quad: 74, poly: 84, sys: 75 },
  { name: 'Daniel Cooper', quad: 48, poly: 26, sys: 39 },
  { name: 'James Carter', quad: 64, poly: 85, sys: 78 },
  { name: 'Ryan Mitchell', quad: 89, poly: 75, sys: 70 },
  { name: 'Oliver Hughes', quad: 36, poly: 64, sys: 55 },
  { name: 'Thomas Bradley', quad: 75, poly: 90, sys: 100 },
  { name: 'Sam Richardson', quad: 96, poly: 100, sys: 89 },
  { name: 'Lewis Morgan', quad: 75, poly: 69, sys: 76 },
  { name: 'Adam Fletcher', quad: 100, poly: 100, sys: 89 },
  { name: 'George Wilson', quad: 45, poly: 65, sys: 34 },
  { name: 'Joe Turner', quad: 67, poly: 85, sys: 79 },
  { name: 'Max Robinson', quad: 41, poly: 55, sys: 80 },
  { name: 'Ethan Parker', quad: 19, poly: 37, sys: 68 },
  { name: 'Luke Chapman', quad: 87, poly: 93, sys: 100 },
  { name: 'Callum Wright', quad: 79, poly: 100, sys: 79 },
  { name: 'Nathan Collins', quad: 80, poly: 84, sys: 79 },
  { name: 'Alex Thompson', quad: 86, poly: 73, sys: 90 },
  { name: 'Josh Taylor', quad: 84, poly: 79, sys: 93 },
  { name: 'Connor Murray', quad: 73, poly: 67, sys: 70 },
  { name: 'Jake Wilkinson', quad: 56, poly: 89, sys: 89 },
  { name: 'Ben Harper', quad: 83, poly: 96, sys: 59 },
];

function statusFromAverage(avg: number): SpreadsheetStudent['status'] {
  if (avg < 0.4) return 'Critical Intervention';
  if (avg < 0.75) return 'Review Recommended';
  return 'Mastered';
}

function weakestTopicLabel(quad: number, poly: number, sys: number): string {
  const entries: [string, number][] = [
    ['Quadratic Equations', quad],
    ['Polynomial Factoring', poly],
    ['Systems of Equations', sys],
  ];
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}

const LAST_ACTIVE_POOL = ['Just now', '10 mins ago', '25 mins ago', '1 hr ago', '2 hrs ago', '3 hrs ago', '5 hrs ago', 'Yesterday', '2 days ago', 'Today'];
const lastActiveRng = mulberry32(hashStringToSeed('sheet-10b-last-active'));

const GRADE_10B_STUDENTS: SpreadsheetStudent[] = RAW_10B_STUDENTS.map((s, idx) => {
  const quad = s.quad / 100;
  const poly = s.poly / 100;
  const sys = s.sys / 100;
  const avg = (quad + poly + sys) / 3;
  return {
    id: `ST-10B${String(idx + 1).padStart(2, '0')}`,
    name: s.name,
    grade: 'Grade 10B',
    quadraticsMastery: quad,
    polynomialsMastery: poly,
    systemsMastery: sys,
    weakestTopic: weakestTopicLabel(quad, poly, sys),
    status: statusFromAverage(avg),
    lastActive: LAST_ACTIVE_POOL[Math.floor(lastActiveRng() * LAST_ACTIVE_POOL.length)],
  };
});

const INITIAL_SPREADSHEETS: ClassSpreadsheet[] = [
  {
    id: 'sheet-10a',
    name: 'Grade 10A',
    description: 'Preloaded spreadsheet for Grade 10A.',
    data: GRADE_10A_STUDENTS,
  },
  {
    id: 'sheet-10b',
    name: 'Grade 10B',
    description: 'Preloaded spreadsheet for Grade 10B, built from uploaded gradebook data.',
    data: GRADE_10B_STUDENTS,
  },
];

// TELEMETRY ASSEMBLY
const STUDENT_SHEET_MAP: Record<string, string> = {};
INITIAL_SPREADSHEETS.forEach((sheet) => {
  sheet.data.forEach((stu) => {
    STUDENT_SHEET_MAP[stu.id] = sheet.id;
  });
});

const ATTEMPT_OVERRIDES: Record<string, AttemptOverride> = {
  'ST-10A05|quadratics': { forceDecline: true, forceHighFriction: true, staleDaysOffset: 18, guaranteedDistractor: 'Sign Error' },
  'ST-10A05|polynomials': { forceStable: true },
  'ST-10A07|polynomials': { forceHighFriction: true },
  'ST-10A14|quadratics': { staleDaysOffset: 22 },
  'ST-10B04|quadratics': { forceHighFriction: true },
  'ST-10B17|quadratics': { forceHighFriction: true, guaranteedDistractor: 'Discriminant Misread' },
  'ST-10B06|polynomials': { forceHighFriction: true },
};

const ALL_ATTEMPTS: AttemptRecord[] = [];
INITIAL_SPREADSHEETS.forEach((sheet) => {
  sheet.data.forEach((stu) => {
    TOPIC_LIST.forEach((topic) => {
      const masteryField =
        topic.id === 'quadratics' ? stu.quadraticsMastery : topic.id === 'polynomials' ? stu.polynomialsMastery : stu.systemsMastery;
      const overrideKey = `${stu.id}|${topic.id}`;
      ALL_ATTEMPTS.push(
        ...generateAttemptsForStudent(stu.id, topic.id, topic.title, masteryField, overrideKey, ATTEMPT_OVERRIDES[overrideKey])
      );
    });
  });
});

const CLASS_BASELINES = buildClassBaselines(ALL_ATTEMPTS, STUDENT_SHEET_MAP);

const ATTEMPTS_BY_STUDENT: Record<string, AttemptRecord[]> = {};
ALL_ATTEMPTS.forEach((a) => {
  if (!ATTEMPTS_BY_STUDENT[a.studentId]) ATTEMPTS_BY_STUDENT[a.studentId] = [];
  ATTEMPTS_BY_STUDENT[a.studentId].push(a);
});

const DIAGNOSTICS_BY_STUDENT: Record<string, StudentDiagnostic> = {};
Object.keys(STUDENT_SHEET_MAP).forEach((studentId) => {
  const sheetId = STUDENT_SHEET_MAP[studentId];
  const sheet = INITIAL_SPREADSHEETS.find((s) => s.id === sheetId);
  const stu = sheet?.data.find((s) => s.id === studentId);
  DIAGNOSTICS_BY_STUDENT[studentId] = computeStudentDiagnostics(
    studentId,
    sheetId,
    TOPIC_LIST,
    ATTEMPTS_BY_STUDENT[studentId] || [],
    CLASS_BASELINES,
    {
      quadratics: stu?.quadraticsMastery ?? DEFAULT_BKT_PARAMS.pL0,
      polynomials: stu?.polynomialsMastery ?? DEFAULT_BKT_PARAMS.pL0,
      systems: stu?.systemsMastery ?? DEFAULT_BKT_PARAMS.pL0,
    }
  );
});

//APP COMPONENT
export default function App() {
  const [role, setRole] = useState<UserRole>('teacher');

  // Teacher state
  const [teacherTab, setTeacherTab] = useState<TeacherTab>('dashboard');
  const [spreadsheets, setSpreadsheets] = useState<ClassSpreadsheet[]>(INITIAL_SPREADSHEETS);
  const [expandedSheetId, setExpandedSheetId] = useState<string | null>(null);

  // Add cohort / add student
  const [newCohortName, setNewCohortName] = useState('');
  const [newCohortDesc, setNewCohortDesc] = useState('');
  const [newStudentNameInput, setNewStudentNameInput] = useState('');

  // Synthesis hub
  const [synthesisStudentId, setSynthesisStudentId] = useState<string>('ST-10A01');
  const [synthesisGradeFilter, setSynthesisGradeFilter] = useState<string>('ALL');
  const [synthesisSearchQuery, setSynthesisSearchQuery] = useState<string>('');
  const [synthesisSortOrder, setSynthesisSortOrder] = useState<'highest' | 'lowest'>('highest');
  const [generatedBriefing, setGeneratedBriefing] = useState<string | null>(null);

  // Manual assessment
  const [studentName, setStudentName] = useState('');
  const [studentGrade, setStudentGrade] = useState('Grade 10A');
  const [manualQuestions, setManualQuestions] = useState<ManualQuestionEntry[]>([
    { id: '1', topicId: 'quadratics', difficulty: 'Easy', isCorrect: true },
    { id: '2', topicId: 'quadratics', difficulty: 'Medium', isCorrect: false },
    { id: '3', topicId: 'polynomials', difficulty: 'Easy', isCorrect: true },
  ]);
  const [teacherAnalysis, setTeacherAnalysis] = useState<{
    studentName: string;
    studentGrade: string;
    topicResults: Record<string, number | null>;
    recommendations: TeacherRecommendation[];
  } | null>(null);

  // Student state
  const [activeTab, setActiveTab] = useState<StudentTab>('materials');
  const [activeTopicId, setActiveTopicId] = useState<string>('quadratics');
  const [expandedParagraphs, setExpandedParagraphs] = useState<Record<string, boolean>>({});
  const [completedParagraphs, setCompletedParagraphs] = useState<Record<string, boolean>>({});
  const [topicQuestionIndexes, setTopicQuestionIndexes] = useState<Record<string, number>>({
    quadratics: 0,
    polynomials: 0,
    systems: 0,
  });
  const [topicMastery, setTopicMastery] = useState<Record<string, number>>({
    quadratics: DEFAULT_BKT_PARAMS.pL0,
    polynomials: DEFAULT_BKT_PARAMS.pL0,
    systems: DEFAULT_BKT_PARAMS.pL0,
  });
  const [topicMasteryHistories, setTopicMasteryHistories] = useState<Record<string, HistoryPoint[]>>({
    quadratics: [{ step: 0, mastery: DEFAULT_BKT_PARAMS.pL0, difficulty: 'Initial' }],
    polynomials: [{ step: 0, mastery: DEFAULT_BKT_PARAMS.pL0, difficulty: 'Initial' }],
    systems: [{ step: 0, mastery: DEFAULT_BKT_PARAMS.pL0, difficulty: 'Initial' }],
  });
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  // Mentor state
  const [mentorRequests, setMentorRequests] = useState<MentorRequest[]>([
    {
      id: 'req-1',
      studentName: 'Alex Brown',
      topicTitle: 'Polynomial Factoring',
      currentMastery: 0.31,
      questionText: 'Question 2: What is the Greatest Common Factor (GCF) of 12x³y² and 18x²y⁴?',
      timestamp: '2 mins ago',
    },
  ]);
  const [activeHelpSession, setActiveHelpSession] = useState<MentorRequest | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatLog, setChatLog] = useState<{ sender: 'mentor' | 'student'; text: string }[]>([]);

  // NEW: Action Triage + Student 360
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [activeTriageKey, setActiveTriageKey] = useState<'risk' | 'friction' | 'extension' | null>(null);
  const [interventionText, setInterventionText] = useState<string | null>(null);

  // Student helper methods
  const toggleParagraphExpand = (id: string) => {
    setExpandedParagraphs((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const toggleParagraphCompletion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompletedParagraphs((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const totalParagraphsCount = TOPICS.reduce((acc, t) => acc + t.paragraphs.length, 0);
  const completedParagraphsCount = Object.values(completedParagraphs).filter(Boolean).length;
  const studyProgressPercentage = totalParagraphsCount > 0 ? Math.round((completedParagraphsCount / totalParagraphsCount) * 100) : 0;

  const currentTopicQuestions = QUESTIONS_BY_TOPIC[activeTopicId] || [];
  const currentQuestionIdx = topicQuestionIndexes[activeTopicId] || 0;
  const currentQuestion = currentTopicQuestions[currentQuestionIdx];
  const currentMastery = topicMastery[activeTopicId] ?? DEFAULT_BKT_PARAMS.pL0;
  const currentHistory = topicMasteryHistories[activeTopicId] || [];

  const handleStudentSubmitAnswer = () => {
    if (selectedOption === null || !currentQuestion) return;
    const isCorrect = selectedOption === currentQuestion.correctAnswer;
    const params = getAdjustedParams(DEFAULT_BKT_PARAMS, currentQuestion.difficulty);
    const { pNext } = calculateNextMastery(currentMastery, isCorrect, params);
    setTopicMastery((prev) => ({ ...prev, [activeTopicId]: pNext }));
    setTopicMasteryHistories((prev) => {
      const existingHistory = prev[activeTopicId] || [];
      return {
        ...prev,
        [activeTopicId]: [...existingHistory, { step: existingHistory.length, mastery: pNext, difficulty: currentQuestion.difficulty }],
      };
    });
    setSelectedOption(null);
    if (currentQuestionIdx < currentTopicQuestions.length - 1) {
      setTopicQuestionIndexes((prev) => ({ ...prev, [activeTopicId]: prev[activeTopicId] + 1 }));
    }
  };

  const handleRequestHelpFromStudent = () => {
    const topicObj = TOPICS.find((t) => t.id === activeTopicId);
    const newReq: MentorRequest = {
      id: 'req-' + Date.now(),
      studentName: 'Insar Amantay',
      topicTitle: topicObj ? topicObj.title : 'General Math',
      currentMastery: currentMastery,
      questionText: currentQuestion ? `Question ${currentQuestionIdx + 1}: "${currentQuestion.text}"` : 'Need guidance on core concepts.',
      timestamp: 'Just now',
    };
    setMentorRequests((prev) => [newReq, ...prev]);
    alert('Help request for this specific question successfully sent to available Peer Mentors!');
  };

  // Cohort add / delete
  const handleAddCohort = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCohortName.trim()) return;
    const slug = newCohortName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newSheet: ClassSpreadsheet = {
      id: `sheet-${slug}-${Date.now()}`,
      name: newCohortName.trim(),
      description: newCohortDesc.trim() || `Master spreadsheet for ${newCohortName.trim()} cohort.`,
      data: [],
    };
    setSpreadsheets((prev) => [...prev, newSheet]);
    setNewCohortName('');
    setNewCohortDesc('');
  };

  const handleDeleteCohort = (sheetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to remove this grade cohort spreadsheet completely?')) {
      setSpreadsheets((prev) => prev.filter((s) => s.id !== sheetId));
      if (expandedSheetId === sheetId) {
        setExpandedSheetId(null);
      }
    }
  };

  // Spreadsheet "belt"
  const handleAddStudentToSheet = (sheetId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentNameInput.trim()) return;
    const defaultVal = 0.7;
    const newStudent: SpreadsheetStudent = {
      id: `ST-${Math.floor(100 + Math.random() * 900)}`,
      name: newStudentNameInput.trim(),
      grade: spreadsheets.find((s) => s.id === sheetId)?.name || 'Cohort',
      quadraticsMastery: defaultVal,
      polynomialsMastery: defaultVal,
      systemsMastery: defaultVal,
      weakestTopic: 'Polynomial Factoring',
      status: 'Review Recommended',
      lastActive: 'Just now',
    };
    setSpreadsheets((prev) => prev.map((sheet) => (sheet.id === sheetId ? { ...sheet, data: [...sheet.data, newStudent] } : sheet)));
    setNewStudentNameInput('');
  };

  const handleUpdateStudentField = (sheetId: string, studentId: string, field: keyof SpreadsheetStudent, value: any) => {
    setSpreadsheets((prev) =>
      prev.map((sheet) => {
        if (sheet.id !== sheetId) return sheet;
        return {
          ...sheet,
          data: sheet.data.map((student) => {
            if (student.id !== studentId) return student;
            const updated = { ...student, [field]: value };
            if (field === 'quadraticsMastery' || field === 'polynomialsMastery' || field === 'systemsMastery') {
              const avg = (updated.quadraticsMastery + updated.polynomialsMastery + updated.systemsMastery) / 3;
              updated.status = statusFromAverage(avg);
            }
            return updated;
          }),
        };
      })
    );
  };

  const handleRemoveStudentFromSheet = (sheetId: string, studentId: string) => {
    setSpreadsheets((prev) => prev.map((sheet) => (sheet.id === sheetId ? { ...sheet, data: sheet.data.filter((s) => s.id !== studentId) } : sheet)));
  };

  // One-click synthesis generator
  const handleGenerateBriefing = () => {
    let foundStudent: SpreadsheetStudent | null = null;
    for (const sh of spreadsheets) {
      const match = sh.data.find((s) => s.id === synthesisStudentId);
      if (match) {
        foundStudent = match;
        break;
      }
    }
    if (!foundStudent) {
      setGeneratedBriefing('Please select a valid student from the roster to generate the briefing synthesis.');
      return;
    }
    const avgMastery = ((foundStudent.quadraticsMastery + foundStudent.polynomialsMastery + foundStudent.systemsMastery) / 3) * 100;
    const strengths: string[] = [];
    const friction: string[] = [];
    if (foundStudent.quadraticsMastery >= 0.75) strengths.push('Quadratic Equations');
    else friction.push('Quadratic Equations (parabola standard form and discriminant analysis)');
    if (foundStudent.polynomialsMastery >= 0.75) strengths.push('Polynomial Factoring');
    else friction.push('Polynomial Factoring (GCF and grouping strategies)');
    if (foundStudent.systemsMastery >= 0.75) strengths.push('Systems of Equations');
    else friction.push('Systems of Equations (elimination and substitution consistency)');
    const strengthsStr = strengths.length > 0 ? strengths.join(', ') : 'foundational algebra concepts currently under development';
    const frictionStr = friction.length > 0 ? friction.join(' and ') : 'none; student demonstrates exceptional mastery across all tested topics';
    const briefingText =
      `Parent & Admin Progress Briefing for ${foundStudent.name} (${foundStudent.grade}):\n\n` +
      `Over the recent telemetry evaluation period, ${foundStudent.name} has maintained an aggregate mastery score of ${avgMastery.toFixed(1)}%, currently flagged under status: "${foundStudent.status}". ` +
      `Core strengths are observed in ${strengthsStr}, where response trajectories indicate reliable application and low slip frequency. ` +
      `However, targeted areas of friction persist in ${frictionStr}, reflected by occasional error clustering during mid-to-high difficulty drills. ` +
      `Actionable Recommendation: For upcoming parent-teacher conferences and home-study routines, it is recommended to focus on guided practice problem sets addressing these friction areas, paired with peer mentoring sessions to stabilize transitional learning probabilities before formal evaluations.`;
    setGeneratedBriefing(briefingText);
  };

  const getFilteredAndSortedStudents = () => {
    let studentList: SpreadsheetStudent[] = [];
    spreadsheets.forEach((sh) => {
      if (synthesisGradeFilter === 'ALL' || sh.id === synthesisGradeFilter) {
        studentList = studentList.concat(sh.data);
      }
    });
    if (synthesisSearchQuery.trim() !== '') {
      const q = synthesisSearchQuery.toLowerCase().trim();
      studentList = studentList.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.grade.toLowerCase().includes(q));
    }
    studentList.sort((a, b) => {
      const avgA = (a.quadraticsMastery + a.polynomialsMastery + a.systemsMastery) / 3;
      const avgB = (b.quadraticsMastery + b.polynomialsMastery + b.systemsMastery) / 3;
      return synthesisSortOrder === 'highest' ? avgB - avgA : avgA - avgB;
    });
    return studentList;
  };
  const filteredStudents = getFilteredAndSortedStudents();

  // Manual assessment form helpers
  const handleQuestionAmountChange = (newAmount: number) => {
    const targetAmount = Math.max(1, Math.min(20, newAmount));
    setManualQuestions((prev) => {
      if (targetAmount > prev.length) {
        const added: ManualQuestionEntry[] = Array.from({ length: targetAmount - prev.length }).map((_, i) => ({
          id: String(prev.length + i + 1),
          topicId: 'quadratics',
          difficulty: 'Easy',
          isCorrect: true,
        }));
        return [...prev, ...added];
      }
      return prev.slice(0, targetAmount);
    });
  };

  const updateQuestionField = (index: number, field: keyof ManualQuestionEntry, value: string | boolean) => {
    setManualQuestions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value } as ManualQuestionEntry;
      return copy;
    });
  };

  const handleAnalyzeTeacherInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      alert('Please enter a student name.');
      return;
    }
    const topicLogs: Record<string, ResponseLog[]> = { quadratics: [], polynomials: [], systems: [] };
    manualQuestions.forEach((q) => {
      if (topicLogs[q.topicId]) {
        topicLogs[q.topicId].push({ questionId: q.id, topicId: q.topicId, isCorrect: q.isCorrect, difficulty: q.difficulty });
      }
    });
    const topicResults: Record<string, number | null> = {};
    TOPICS.forEach((t) => {
      const logs = topicLogs[t.id];
      if (logs && logs.length > 0) {
        const history = processResponseSequence(logs);
        topicResults[t.id] = history[history.length - 1].pMasteryAfter;
      } else {
        topicResults[t.id] = null;
      }
    });
    const rawRecommendations = generateRecommendedPath({
      quadratics: { title: 'Quadratic Equations', mastery: topicResults.quadratics ?? 0 },
      polynomials: { title: 'Polynomial Factoring', mastery: topicResults.polynomials ?? 0 },
      systems: { title: 'Systems of Equations', mastery: topicResults.systems ?? 0 },
    });
    const recommendations: TeacherRecommendation[] = rawRecommendations.map((rec) => {
      const isAssessed = topicResults[rec.topicId] !== null;
      if (!isAssessed) {
        return {
          topicId: rec.topicId,
          topicTitle: rec.topicTitle,
          status: 'Not Assessed',
          actionableStep: 'No questions submitted for this topic. Assign an evaluation assessment.',
          currentMastery: null,
        };
      }
      return { ...rec, currentMastery: topicResults[rec.topicId] };
    });
    setTeacherAnalysis({ studentName, studentGrade, topicResults, recommendations });
  };

  const activeExpandedSheet = spreadsheets.find((s) => s.id === expandedSheetId);

  // Aggregated data for the dashboard
  const allStudents = spreadsheets.flatMap((s) => s.data);
  const totalStudentsCount = allStudents.length;
  const criticalInterventionStudents = allStudents.filter((s) => s.status === 'Critical Intervention');
  const reviewRecommendedStudents = allStudents.filter((s) => s.status === 'Review Recommended');
  const masteredStudents = allStudents.filter((s) => s.status === 'Mastered');

  //Today's priorities
  const triageGroups = useMemo(() => {
    const risk: SpreadsheetStudent[] = [];
    const friction: SpreadsheetStudent[] = [];
    const extension: SpreadsheetStudent[] = [];
    allStudents.forEach((stu) => {
      const diag = DIAGNOSTICS_BY_STUDENT[stu.id];
      if (!diag) return;
      if (diag.triageCategory === 'High Friction') friction.push(stu);
      else if (diag.triageCategory === 'Risk of Fall') risk.push(stu);
      else if (diag.triageCategory === 'Ready for Extension') extension.push(stu);
    });
    return { risk, friction, extension };
  }, [spreadsheets]);

  const topicAverages = useMemo(() => {
    const sums: Record<string, { total: number; count: number }> = {
      quadratics: { total: 0, count: 0 },
      polynomials: { total: 0, count: 0 },
      systems: { total: 0, count: 0 },
    };
    allStudents.forEach((stu) => {
      const diag = DIAGNOSTICS_BY_STUDENT[stu.id];
      if (!diag) return;
      diag.topics.forEach((t) => {
        if (sums[t.topicId]) {
          sums[t.topicId].total += t.decayedMastery;
          sums[t.topicId].count += 1;
        }
      });
    });
    const result: Record<string, number> = {};
    Object.entries(sums).forEach(([key, val]) => {
      result[key] = val.count > 0 ? Math.round((val.total / val.count) * 100) : 0;
    });
    return result;
  }, [spreadsheets]);

  const classMasteryPct = Math.round(((topicAverages.quadratics || 0) + (topicAverages.polynomials || 0) + (topicAverages.systems || 0)) / 3);

  //Student 360
  const selectedStudent = selectedStudentId ? allStudents.find((s) => s.id === selectedStudentId) || null : null;
  const selectedDiagnostic = selectedStudentId ? DIAGNOSTICS_BY_STUDENT[selectedStudentId] || null : null;
  const selectedAttempts = selectedStudentId
    ? (ATTEMPTS_BY_STUDENT[selectedStudentId] || []).slice().sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime())
    : [];

  const openStudent360 = (id: string) => {
    setSelectedStudentId(id);
    setInterventionText(null);
  };
  const closeStudent360 = () => {
    setSelectedStudentId(null);
    setInterventionText(null);
  };
  const handleGenerateIntervention = () => {
    if (!selectedStudent || !selectedDiagnostic) return;
    setInterventionText(generateIntervention(selectedDiagnostic, selectedStudent.name.split(' ')[0]));
  };

  const frictionDotClass = (t: TopicDiagnostic | undefined): string => {
    if (!t || t.attemptCount === 0) return 'bg-slate-300';
    if (t.isHighFriction) return 'bg-rose-500 animate-pulse';
    if (t.bktMastery - t.decayedMastery > 0.1 || t.trend === 'Falling') return 'bg-amber-400';
    return 'bg-emerald-500';
  };

  const activeTriageList = activeTriageKey === 'risk' ? triageGroups.risk : activeTriageKey === 'friction' ? triageGroups.friction : activeTriageKey === 'extension' ? triageGroups.extension : [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Teacher Analytics Dashboard &amp; BKT Engine</h1>
          <p className="text-sm text-slate-500">
            Current Workspace: {role === 'teacher' ? 'Teacher Centerpiece Dashboard' : role === 'student' ? 'Student Workspace' : 'Peer Mentor Portal'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-sm font-medium shadow-xs">
            <button
              onClick={() => setRole('teacher')}
              className={`px-4 py-2 rounded-md transition-all ${role === 'teacher' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Teacher
            </button>
            <button
              onClick={() => setRole('student')}
              className={`px-4 py-2 rounded-md transition-all ${role === 'student' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Student
            </button>
            <button
              onClick={() => setRole('mentor')}
              className={`px-4 py-2 rounded-md transition-all ${role === 'mentor' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Mentor
            </button>
          </div>
        </div>
      </header>

      {/* Main View Router */}
      {role === 'teacher' ? (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          {/* Teacher Sub-Navigation */}
          <div className="flex border-b border-slate-200 bg-white px-4 rounded-lg border overflow-x-auto shadow-xs">
            <button
              onClick={() => setTeacherTab('dashboard')}
              className={`py-4 px-6 text-base font-semibold border-b-2 transition-colors whitespace-nowrap ${teacherTab === 'dashboard' ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              Teacher Dashboard Overview
            </button>
            <button
              onClick={() => setTeacherTab('spreadsheets')}
              className={`py-4 px-6 text-base font-semibold border-b-2 transition-colors whitespace-nowrap ${teacherTab === 'spreadsheets' ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              Class Spreadsheets Belt
            </button>
            <button
              onClick={() => setTeacherTab('assessment')}
              className={`py-4 px-6 text-base font-semibold border-b-2 transition-colors whitespace-nowrap ${teacherTab === 'assessment' ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              Manual Assessment Entry
            </button>
            <button
              onClick={() => setTeacherTab('synthesis')}
              className={`py-4 px-6 text-base font-semibold border-b-2 transition-colors whitespace-nowrap ${teacherTab === 'synthesis' ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              Parent &amp; Admin Synthesis Hub
            </button>
          </div>

          {/* TAB 1: Dashboard */}
          {teacherTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Top Metric Strip */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <h2 className="text-xl font-bold text-slate-900 mb-4 border-b border-slate-100 pb-3">Teacher Dashboard Summary</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Students</span>
                    <span className="block text-3xl font-extrabold text-slate-900 mt-1">{totalStudentsCount}</span>
                  </div>
                  <div className="p-4 bg-sky-50 rounded-lg border border-sky-100">
                    <span className="block text-xs font-semibold text-sky-700 uppercase tracking-wider">Class Mastery</span>
                    <span className="block text-3xl font-extrabold text-sky-900 mt-1">{classMasteryPct}%</span>
                  </div>
                  <div className="p-4 bg-rose-50 rounded-lg border border-rose-100">
                    <span className="block text-xs font-semibold text-rose-700 uppercase tracking-wider">Need Intervention</span>
                    <span className="block text-3xl font-extrabold text-rose-800 mt-1">{criticalInterventionStudents.length}</span>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                    <span className="block text-xs font-semibold text-amber-700 uppercase tracking-wider">On Track</span>
                    <span className="block text-3xl font-extrabold text-amber-800 mt-1">{reviewRecommendedStudents.length}</span>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100 col-span-2 md:col-span-1">
                    <span className="block text-xs font-semibold text-emerald-700 uppercase tracking-wider">Mastered</span>
                    <span className="block text-3xl font-extrabold text-emerald-800 mt-1">{masteredStudents.length}</span>
                  </div>
                </div>
              </div>

              {/* NEW: Today's Priorities — Action Triage Panel */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <h2 className="text-lg font-bold text-slate-900">Today's priorities</h2>
                <p className="text-sm text-slate-500 mt-1 mb-4">
                  Built from dwell time, revision counts and BKT mastery decay across every logged attempt — not just the raw gradebook percentages.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button
                    onClick={() => setActiveTriageKey(activeTriageKey === 'risk' ? null : 'risk')}
                    className={`text-left p-5 rounded-lg border transition-all ${activeTriageKey === 'risk' ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-200' : 'border-rose-200 bg-rose-50/60 hover:bg-rose-50'}`}
                  >
                    <span className="block text-xs font-semibold text-rose-700 uppercase tracking-wide">Alert: Risk of fall</span>
                    <span className="block text-4xl font-extrabold text-rose-900 mt-2">{triageGroups.risk.length}</span>
                    <span className="text-xs font-semibold text-rose-600 mt-2 inline-block">Open list &rarr;</span>
                  </button>
                  <button
                    onClick={() => setActiveTriageKey(activeTriageKey === 'friction' ? null : 'friction')}
                    className={`text-left p-5 rounded-lg border transition-all ${activeTriageKey === 'friction' ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'}`}
                  >
                    <span className="block text-xs font-semibold text-amber-700 uppercase tracking-wide">Alert: High friction</span>
                    <span className="block text-4xl font-extrabold text-amber-900 mt-2">{triageGroups.friction.length}</span>
                    <span className="text-xs font-semibold text-amber-600 mt-2 inline-block">Open list &rarr;</span>
                  </button>
                  <button
                    onClick={() => setActiveTriageKey(activeTriageKey === 'extension' ? null : 'extension')}
                    className={`text-left p-5 rounded-lg border transition-all ${activeTriageKey === 'extension' ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200' : 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50'}`}
                  >
                    <span className="block text-xs font-semibold text-emerald-700 uppercase tracking-wide">Ready for extension</span>
                    <span className="block text-4xl font-extrabold text-emerald-900 mt-2">{triageGroups.extension.length}</span>
                    <span className="text-xs font-semibold text-emerald-600 mt-2 inline-block">Open list &rarr;</span>
                  </button>
                </div>

                {activeTriageKey && (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-slate-800">
                        {activeTriageKey === 'risk' ? 'Students at risk of falling back' : activeTriageKey === 'friction' ? 'Students showing high cognitive friction' : 'Students ready for extension work'}
                      </h3>
                      <button onClick={() => setActiveTriageKey(null)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
                        Close
                      </button>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {activeTriageList.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No students currently in this group.</p>}
                      {activeTriageList.map((stu) => {
                        const diag = DIAGNOSTICS_BY_STUDENT[stu.id];
                        const weakest = diag ? [...diag.topics].sort((a, b) => a.decayedMastery - b.decayedMastery)[0] : null;
                        return (
                          <div key={stu.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg gap-3">
                            <div>
                              <button onClick={() => openStudent360(stu.id)} className="text-sm font-semibold text-sky-700 hover:text-sky-900 hover:underline text-left">
                                {stu.name}
                              </button>
                              <p className="text-xs text-slate-500 mt-0.5">{stu.grade}</p>
                              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                {weakest && (
                                  <span className="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded px-2 py-0.5">
                                    {weakest.topicTitle}: {Math.round(weakest.decayedMastery * 100)}%
                                  </span>
                                )}
                                {weakest?.dominantDistractorType && (
                                  <span className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded px-2 py-0.5">{weakest.dominantDistractorType}</span>
                                )}
                              </div>
                            </div>
                            <button onClick={() => openStudent360(stu.id)} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-semibold transition-colors shrink-0">
                              Open profile
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Class Mastery Overview Section */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Class Mastery Overview</h2>
                <div className="space-y-4">
                  {TOPICS.map((topic) => (
                    <div key={topic.id}>
                      <div className="flex justify-between items-center mb-1 text-sm font-semibold">
                        <span className="text-slate-800">{topic.title}</span>
                        <span className="font-mono text-sky-700 font-bold">{topicAverages[topic.id] || 0}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3.5 border border-slate-200 overflow-hidden">
                        <div className="bg-sky-600 h-full rounded-full transition-all duration-500" style={{ width: `${topicAverages[topic.id] || 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Students Requiring Attention Section */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h2 className="text-lg font-bold text-slate-900">Students requiring attention</h2>
                  <span className="text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 rounded-md">
                    {criticalInterventionStudents.length + reviewRecommendedStudents.length} Students Highlighted
                  </span>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold border-b border-slate-200">
                        <th className="p-3.5">Student</th>
                        <th className="p-3.5">Weakest topic</th>
                        <th className="p-3.5 text-center">Mastery</th>
                        <th className="p-3.5">Signal</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {[...criticalInterventionStudents, ...reviewRecommendedStudents].slice(0, 10).map((student) => {
                        const lowestScore = Math.min(student.quadraticsMastery, student.polynomialsMastery, student.systemsMastery);
                        const diag = DIAGNOSTICS_BY_STUDENT[student.id];
                        return (
                          <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3.5 font-semibold">
                              <button onClick={() => openStudent360(student.id)} className="text-slate-900 hover:text-sky-700 hover:underline">
                                {student.name}
                              </button>
                            </td>
                            <td className="p-3.5 text-slate-700">{student.weakestTopic}</td>
                            <td className="p-3.5 text-center font-mono font-bold text-slate-800">{Math.round(lowestScore * 100)}%</td>
                            <td className="p-3.5">
                              <div className="flex items-center gap-1.5">
                                {diag?.topics.map((t) => (
                                  <span key={t.topicId} title={`${t.topicTitle}: ${t.isHighFriction ? 'high friction' : 'ok'}`} className={`w-2.5 h-2.5 rounded-full ${frictionDotClass(t)}`} />
                                ))}
                              </div>
                            </td>
                            <td className="p-3.5">
                              <span
                                className={`inline-block px-2.5 py-1 text-xs font-semibold rounded border ${student.status === 'Critical Intervention' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}
                              >
                                {student.status === 'Critical Intervention' ? 'Critical' : 'Review'}
                              </span>
                            </td>
                            <td className="p-3.5 text-right">
                              <button onClick={() => openStudent360(student.id)} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-semibold transition-colors shadow-xs">
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Class Spreadsheets Belt */}
          {teacherTab === 'spreadsheets' && (
            <div className="space-y-6">
              {expandedSheetId === null ? (
                <div className="space-y-6">
                  {/* Add New Cohort Form */}
                  <form onSubmit={handleAddCohort} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 shadow-xs">
                    <h2 className="text-base font-bold text-slate-900">Add New Grade Cohort</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Cohort Name</label>
                        <input
                          type="text"
                          value={newCohortName}
                          onChange={(e) => setNewCohortName(e.target.value)}
                          placeholder="e.g. Grade 11A, Grade 7B"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500"
                          required
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Notes (Optional)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newCohortDesc}
                            onChange={(e) => setNewCohortDesc(e.target.value)}
                            placeholder="e.g. Honors Math Class cohort for 2026 academic term"
                            className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500"
                          />
                          <button type="submit" className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold transition-colors shrink-0 shadow-xs">
                            + Create Cohort
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>

                  {/* Cohorts Belt Grid */}
                  <div className="space-y-4">
                    <div className="bg-white border border-slate-200 rounded-lg p-5 flex justify-between items-center">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">Active Grade Cohorts</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Select a cohort spreadsheet to add or edit student records, or remove an unused cohort.</p>
                      </div>
                      <span className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded font-semibold border border-slate-200">
                        {spreadsheets.length} Cohort{spreadsheets.length === 1 ? '' : 's'} Total
                      </span>
                    </div>

                    {spreadsheets.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-400 text-sm">No grade cohorts defined. Use the creation panel above to add a new cohort.</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {spreadsheets.map((sheet) => {
                          const studentCount = sheet.data.length;
                          const isPopulated = studentCount > 0;
                          return (
                            <div
                              key={sheet.id}
                              onClick={() => setExpandedSheetId(sheet.id)}
                              className={`p-4 rounded-lg border text-left cursor-pointer transition-all flex flex-col justify-between h-36 shadow-xs group relative ${isPopulated ? 'bg-white border-sky-300 hover:border-sky-500 hover:shadow-md' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                            >
                              <div className="pr-6">
                                <span className="text-base font-bold text-slate-900 block truncate">{sheet.name}</span>
                                <span className="text-xs text-slate-500 block mt-1 line-clamp-2">{sheet.description}</span>
                              </div>
                              <button onClick={(e) => handleDeleteCohort(sheet.id, e)} title="Delete cohort" className="absolute top-3 right-3 text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                              <div className="flex justify-between items-center border-t border-slate-100 pt-2 mt-2">
                                <span className="text-xs font-medium text-slate-500">{isPopulated ? `${studentCount} student${studentCount === 1 ? '' : 's'}` : 'Empty'}</span>
                                <span className="text-xs font-semibold text-sky-600 group-hover:translate-x-0.5 transition-transform">Open Sheet &rarr;</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {activeExpandedSheet && (
                    <>
                      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <button onClick={() => setExpandedSheetId(null)} className="text-xs font-semibold text-sky-600 hover:text-sky-800 mb-2 flex items-center gap-1">
                            &larr; Back to Grade Cohorts Belt
                          </button>
                          <h2 className="text-lg font-bold text-slate-900">{activeExpandedSheet.name} Spreadsheet</h2>
                          <p className="text-xs text-slate-500 mt-0.5">{activeExpandedSheet.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={(e) => handleDeleteCohort(activeExpandedSheet.id, e)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-xs font-semibold transition-colors">
                            Delete Cohort
                          </button>
                          <span className="text-xs bg-sky-50 text-sky-700 px-3 py-1.5 rounded border border-sky-200 font-semibold">{activeExpandedSheet.data.length} Student Roster Count</span>
                        </div>
                      </div>

                      <form onSubmit={(e) => handleAddStudentToSheet(activeExpandedSheet.id, e)} className="bg-sky-50/60 border border-sky-200 rounded-lg p-4 flex flex-col sm:flex-row items-center gap-3">
                        <div className="flex-1 w-full">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Add Student (Name Only)</label>
                          <input
                            type="text"
                            value={newStudentNameInput}
                            onChange={(e) => setNewStudentNameInput(e.target.value)}
                            placeholder="Enter student full name..."
                            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500"
                            required
                          />
                        </div>
                        <div className="sm:self-end w-full sm:w-auto">
                          <button type="submit" className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors">
                            + Add Student
                          </button>
                        </div>
                      </form>

                      <div className="bg-white border border-slate-200 rounded-lg p-6">
                        {activeExpandedSheet.data.length === 0 ? (
                          <div className="text-center py-12 text-slate-400 text-sm">No students in this spreadsheet yet. Use the form above to add students.</div>
                        ) : (
                          <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-100 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
                                  <th className="p-3.5">ID</th>
                                  <th className="p-3.5">Student Name (Editable)</th>
                                  <th className="p-3.5 text-center">Quadratic Eq %</th>
                                  <th className="p-3.5 text-center">Polynomial Factoring %</th>
                                  <th className="p-3.5 text-center">Systems Eq %</th>
                                  <th className="p-3.5">Signal</th>
                                  <th className="p-3.5">Status Flag</th>
                                  <th className="p-3.5 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 text-sm">
                                {activeExpandedSheet.data.map((row) => {
                                  const diag = DIAGNOSTICS_BY_STUDENT[row.id];
                                  const quadDiag = diag?.topics.find((t) => t.topicId === 'quadratics');
                                  const polyDiag = diag?.topics.find((t) => t.topicId === 'polynomials');
                                  const sysDiag = diag?.topics.find((t) => t.topicId === 'systems');
                                  return (
                                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                                      <td className="p-3.5 font-mono text-xs text-slate-500">{row.id}</td>
                                      <td className="p-3.5">
                                        <button onClick={() => openStudent360(row.id)} className="w-full text-left px-2 py-1 text-sm font-semibold text-slate-900 hover:text-sky-700 hover:underline rounded transition-colors">
                                          {row.name}
                                        </button>
                                      </td>
                                      <td className="p-3.5 text-center font-mono">
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          value={Math.round(row.quadraticsMastery * 100)}
                                          onChange={(e) => {
                                            const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100;
                                            handleUpdateStudentField(activeExpandedSheet.id, row.id, 'quadraticsMastery', val);
                                          }}
                                          className="w-16 px-1.5 py-1 text-center font-mono text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white focus:border-sky-500 focus:outline-none"
                                        />
                                        <span className="text-xs text-slate-400 ml-0.5">%</span>
                                      </td>
                                      <td className="p-3.5 text-center font-mono">
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          value={Math.round(row.polynomialsMastery * 100)}
                                          onChange={(e) => {
                                            const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100;
                                            handleUpdateStudentField(activeExpandedSheet.id, row.id, 'polynomialsMastery', val);
                                          }}
                                          className="w-16 px-1.5 py-1 text-center font-mono text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white focus:border-sky-500 focus:outline-none"
                                        />
                                        <span className="text-xs text-slate-400 ml-0.5">%</span>
                                      </td>
                                      <td className="p-3.5 text-center font-mono">
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          value={Math.round(row.systemsMastery * 100)}
                                          onChange={(e) => {
                                            const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100;
                                            handleUpdateStudentField(activeExpandedSheet.id, row.id, 'systemsMastery', val);
                                          }}
                                          className="w-16 px-1.5 py-1 text-center font-mono text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white focus:border-sky-500 focus:outline-none"
                                        />
                                        <span className="text-xs text-slate-400 ml-0.5">%</span>
                                      </td>
                                      <td className="p-3.5">
                                        <div className="flex items-center gap-1.5">
                                          <span title="Quadratic Equations" className={`w-2.5 h-2.5 rounded-full ${frictionDotClass(quadDiag)}`} />
                                          <span title="Polynomial Factoring" className={`w-2.5 h-2.5 rounded-full ${frictionDotClass(polyDiag)}`} />
                                          <span title="Systems of Equations" className={`w-2.5 h-2.5 rounded-full ${frictionDotClass(sysDiag)}`} />
                                        </div>
                                      </td>
                                      <td className="p-3.5">
                                        <span
                                          className={`inline-block px-2.5 py-1 text-xs font-semibold rounded border ${row.status === 'Mastered' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : row.status === 'Review Recommended' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'}`}
                                        >
                                          {row.status}
                                        </span>
                                      </td>
                                      <td className="p-3.5 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <button onClick={() => openStudent360(row.id)} className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded text-xs font-semibold transition-colors">
                                            Open Profile
                                          </button>
                                          <button
                                            onClick={() => handleRemoveStudentFromSheet(activeExpandedSheet.id, row.id)}
                                            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-xs font-semibold transition-colors"
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Manual Assessment Entry */}
          {teacherTab === 'assessment' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form onSubmit={handleAnalyzeTeacherInput} className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-5 shadow-xs">
                <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Student Assessment Entry</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Student Name</label>
                    <input
                      type="text"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="e.g. Ollie Watkins"
                      className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Grade / Level</label>
                    <select value={studentGrade} onChange={(e) => setStudentGrade(e.target.value)} className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500">
                      {spreadsheets.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount of Questions Assessed ({manualQuestions.length})</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={manualQuestions.length}
                    onChange={(e) => handleQuestionAmountChange(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Question Breakdown &amp; Evaluation</span>
                  {manualQuestions.map((q, idx) => (
                    <div key={q.id} className="p-3 border border-slate-200 rounded-md bg-slate-50 space-y-2">
                      <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                        <span>Question #{idx + 1}</span>
                        <label className="flex items-center cursor-pointer space-x-2">
                          <span className="text-xs text-slate-600">Result:</span>
                          <select
                            value={q.isCorrect ? 'true' : 'false'}
                            onChange={(e) => updateQuestionField(idx, 'isCorrect', e.target.value === 'true')}
                            className={`text-xs font-semibold px-2 py-1 rounded border focus:outline-none ${q.isCorrect ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-red-100 text-red-800 border-red-300'}`}
                          >
                            <option value="true">Correct</option>
                            <option value="false">Incorrect</option>
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xxs font-medium text-slate-500 mb-0.5">Topic Type</label>
                          <select value={q.topicId} onChange={(e) => updateQuestionField(idx, 'topicId', e.target.value)} className="w-full text-xs p-1.5 border border-slate-300 rounded bg-white text-slate-800">
                            {TOPICS.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xxs font-medium text-slate-500 mb-0.5">Difficulty Level</label>
                          <select
                            value={q.difficulty}
                            onChange={(e) => updateQuestionField(idx, 'difficulty', e.target.value as 'Easy' | 'Medium' | 'Hard')}
                            className="w-full text-xs p-1.5 border border-slate-300 rounded bg-white text-slate-800"
                          >
                            <option value="Easy">Easy</option>
                            <option value="Medium">Medium</option>
                            <option value="Hard">Hard</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="submit" className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-md transition-colors shadow-xs">
                  Run BKT &amp; Generate Path
                </button>
              </form>

              <div className="lg:col-span-7 space-y-6">
                {teacherAnalysis ? (
                  <div className="space-y-6">
                    <div className="bg-white border border-slate-200 rounded-lg p-5">
                      <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">Personalized Learning Path</h2>
                          <p className="text-sm text-slate-600 mt-0.5">
                            Student: <span className="font-semibold">{teacherAnalysis.studentName}</span> ({teacherAnalysis.studentGrade})
                          </p>
                        </div>
                        <span className="text-xs bg-sky-50 text-sky-700 px-3 py-1 rounded border border-sky-200 font-semibold">{manualQuestions.length} Questions Processed</span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                        {TOPICS.map((t) => {
                          const score = teacherAnalysis.topicResults[t.id];
                          return (
                            <div key={t.id} className="p-3 bg-slate-50 rounded border border-slate-100">
                              <span className="block text-xs text-slate-500 font-medium truncate">{t.title}</span>
                              <span className={`block text-base font-bold font-mono mt-1 ${score !== null ? 'text-slate-800' : 'text-slate-400 italic text-xs'}`}>
                                {score !== null ? `${(score * 100).toFixed(1)}%` : 'Not Assessed'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-6">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Recommended Action Plan</h3>
                      <div className="space-y-4">
                        {teacherAnalysis.recommendations.map((rec) => (
                          <div key={rec.topicId} className="p-4 border border-slate-200 rounded-lg flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50/50">
                            <div>
                              <span className="text-base font-bold text-slate-900">{rec.topicTitle}</span>
                              <p className="text-sm text-slate-600 mt-1">{rec.actionableStep}</p>
                            </div>
                            <div className="shrink-0 text-left sm:text-right">
                              <span
                                className={`inline-block text-xs font-semibold px-2.5 py-1 rounded border ${rec.status === 'Not Assessed' ? 'bg-slate-100 border-slate-300 text-slate-600' : rec.status === 'Mastered' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : rec.status === 'Review Recommended' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'}`}
                              >
                                {rec.status}
                              </span>
                              <div className="text-xs font-mono text-slate-500 mt-1">{rec.currentMastery !== null ? `Skill Confidence = ${(rec.currentMastery * 100).toFixed(1)}%` : 'Skill Confidence = N/A'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-500">
                    <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm font-medium text-slate-700">No Assessment Analyzed Yet</p>
                    <p className="text-xs text-slate-400 mt-1">Fill out student evaluation details on the left and submit to view personalized paths.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Synthesis Hub */}
          {teacherTab === 'synthesis' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">One-Click Parent and Admin Synthesis Hub</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Instantly parse telemetry history into a plain-language summary paragraph for parent-teacher conferences.</p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Filter Cohort Grade</label>
                      <select value={synthesisGradeFilter} onChange={(e) => setSynthesisGradeFilter(e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500">
                        <option value="ALL">All Cohorts &amp; Grades</option>
                        {spreadsheets.map((sh) => (
                          <option key={sh.id} value={sh.id}>
                            {sh.name} ({sh.data.length} students)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Search Student Name / ID</label>
                      <input
                        type="text"
                        value={synthesisSearchQuery}
                        onChange={(e) => setSynthesisSearchQuery(e.target.value)}
                        placeholder="Type name or student ID..."
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Sort Average Mastery</label>
                      <div className="flex bg-white rounded-md border border-slate-300 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setSynthesisSortOrder('highest')}
                          className={`flex-1 py-2 text-xs font-semibold transition-colors ${synthesisSortOrder === 'highest' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          Highest First
                        </button>
                        <button
                          type="button"
                          onClick={() => setSynthesisSortOrder('lowest')}
                          className={`flex-1 py-2 text-xs font-semibold transition-colors ${synthesisSortOrder === 'lowest' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          Lowest First
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Select Student ({filteredStudents.length} available)</label>
                    <select value={synthesisStudentId} onChange={(e) => setSynthesisStudentId(e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500">
                      {filteredStudents.length === 0 ? (
                        <option value="">No matching students found</option>
                      ) : (
                        filteredStudents.map((stu) => {
                          const avg = (((stu.quadraticsMastery + stu.polynomialsMastery + stu.systemsMastery) / 3) * 100).toFixed(1);
                          return (
                            <option key={stu.id} value={stu.id}>
                              {stu.name} [{stu.grade}] - Avg: {avg}% ({stu.status})
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>

                  <button onClick={handleGenerateBriefing} className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-md shadow-xs transition-colors flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    Generate Briefing Summary
                  </button>
                </div>

                {generatedBriefing && (
                  <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-5 space-y-3">
                    <div className="flex justify-between items-center border-b border-emerald-200 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Generated Synthesis Paragraph (Ready for Export)</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedBriefing);
                          alert('Briefing text successfully copied to clipboard!');
                        }}
                        className="px-3 py-1 bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold rounded transition-colors shadow-xs"
                      >
                        Copy to Clipboard
                      </button>
                    </div>
                    <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed font-sans">{generatedBriefing}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Student 360 Modal — replaces the old static telemetry modal */}
          {selectedStudent && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
                <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex justify-between items-start z-10">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{selectedStudent.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{selectedStudent.grade}</p>
                    <p className="text-xs text-slate-400">ID: {selectedStudent.id}</p>
                  </div>
                  <button onClick={closeStudent360} className="text-slate-400 hover:text-slate-600 font-bold text-lg">
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {selectedDiagnostic ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                          <span className="block text-xs text-slate-500">Status</span>
                          <span className="block text-sm font-bold text-slate-900 mt-0.5">{selectedDiagnostic.overallStatusLabel}</span>
                        </div>
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                          <span className="block text-xs text-slate-500">Trend</span>
                          <span
                            className={`block text-sm font-bold mt-0.5 ${selectedDiagnostic.overallTrend === 'Falling' ? 'text-rose-700' : selectedDiagnostic.overallTrend === 'Rising' ? 'text-emerald-700' : 'text-slate-800'}`}
                          >
                            {selectedDiagnostic.overallTrend}
                          </span>
                        </div>
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                          <span className="block text-xs text-slate-500">Cognitive friction</span>
                          <span
                            className={`block text-sm font-bold mt-0.5 ${selectedDiagnostic.frictionLevel === 'High' ? 'text-rose-700' : selectedDiagnostic.frictionLevel === 'Medium' ? 'text-amber-700' : 'text-emerald-700'}`}
                          >
                            {selectedDiagnostic.frictionLevel}
                          </span>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-3">Active concepts</h4>
                        <div className="space-y-2">
                          {selectedDiagnostic.topics.map((t) => (
                            <div key={t.topicId} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg gap-3">
                              <div>
                                <span className="block text-sm font-semibold text-slate-900">{t.topicTitle}</span>
                                <span className="block text-xs text-slate-500 mt-0.5">
                                  {t.attemptCount === 0 ? 'No attempts logged yet.' : `${t.attemptCount} attempts logged. Last practiced ${t.lastPracticedAt ? formatRelativeDate(t.lastPracticedAt) : 'n/a'}.`}
                                </span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="block text-sm font-mono font-bold text-slate-900">{Math.round(t.decayedMastery * 100)}%</span>
                                <span
                                  className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded border ${t.isHighFriction ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse' : t.dominantDistractorType ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}
                                >
                                  {t.dominantDistractorType ? t.dominantDistractorType : 'Stable'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-sky-50/70 border border-sky-200 rounded-lg p-4 space-y-3">
                        <h4 className="text-sm font-bold text-sky-900">Teacher recommendations</h4>
                        <p className="text-sm text-slate-700 leading-relaxed">{interventionText || generateIntervention(selectedDiagnostic, selectedStudent.name.split(' ')[0])}</p>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-3">Attempt history ({selectedAttempts.length})</h4>
                        {selectedAttempts.length === 0 ? (
                          <p className="text-xs text-slate-400">No attempts recorded for this student yet.</p>
                        ) : (
                          <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead className="sticky top-0 bg-slate-100">
                                <tr className="text-slate-600 font-semibold border-b border-slate-200">
                                  <th className="p-2.5">Topic</th>
                                  <th className="p-2.5">Difficulty</th>
                                  <th className="p-2.5">Result</th>
                                  <th className="p-2.5">Dwell time</th>
                                  <th className="p-2.5">First reaction</th>
                                  <th className="p-2.5">Revisions</th>
                                  <th className="p-2.5">Distractor</th>
                                  <th className="p-2.5">When</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {selectedAttempts.map((a) => (
                                  <tr key={a.id} className="hover:bg-slate-50">
                                    <td className="p-2.5 font-medium text-slate-800">{a.topicTitle}</td>
                                    <td className="p-2.5 text-slate-600">{a.difficulty}</td>
                                    <td className="p-2.5">
                                      <span className={`font-semibold ${a.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>{a.isCorrect ? 'Correct' : 'Incorrect'}</span>
                                    </td>
                                    <td className="p-2.5 font-mono text-slate-700">{formatDuration(a.dwellTimeMs)}</td>
                                    <td className="p-2.5 font-mono text-slate-500">{formatDuration(a.timeToFirstReactionMs)}</td>
                                    <td className="p-2.5 text-slate-700">{a.revisionCount}</td>
                                    <td className="p-2.5 text-slate-600">{a.distractorType || '—'}</td>
                                    <td className="p-2.5 text-slate-500">{formatRelativeDate(a.attemptedAt)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">No telemetry data yet for this student. Diagnostics will appear once attempts are logged.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : role === 'student' ? (
        // STUDENT ROLE VIEW
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <div className="flex justify-between items-center bg-white px-4 rounded-lg border border-slate-200 shadow-xs">
            <div className="flex">
              <button
                onClick={() => setActiveTab('materials')}
                className={`py-4 px-6 text-base font-semibold border-b-2 transition-colors ${activeTab === 'materials' ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                Study Materials
              </button>
              <button
                onClick={() => setActiveTab('practice')}
                className={`py-4 px-6 text-base font-semibold border-b-2 transition-colors ${activeTab === 'practice' ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                Interactive Practice &amp; Tracing
              </button>
            </div>
          </div>
          {activeTab === 'materials' ? (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold uppercase tracking-wider text-slate-700">Overall Curriculum Completion Progress</span>
                  <span className="text-sm font-mono font-bold text-sky-700">
                    {completedParagraphsCount} / {totalParagraphsCount} Modules ({studyProgressPercentage}%)
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${studyProgressPercentage}%` }} />
                </div>
              </div>
              <div className="space-y-5">
                {TOPICS.map((topic) => (
                  <div key={topic.id} className="bg-white border border-slate-200 rounded-lg p-6">
                    <h2 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-3">{topic.title}</h2>
                    <div className="space-y-4">
                      {topic.paragraphs.map((paragraph) => {
                        const isExpanded = !!expandedParagraphs[paragraph.id];
                        const isCompleted = !!completedParagraphs[paragraph.id];
                        return (
                          <div key={paragraph.id} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50 shadow-xs">
                            <div onClick={() => toggleParagraphExpand(paragraph.id)} className="p-4 bg-white flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors">
                              <div className="flex items-center space-x-3.5">
                                <input
                                  type="checkbox"
                                  checked={isCompleted}
                                  onClick={(e) => toggleParagraphCompletion(paragraph.id, e)}
                                  onChange={() => {}}
                                  className="h-5 w-5 text-emerald-600 rounded border-slate-300 focus:ring-0 cursor-pointer"
                                />
                                <div>
                                  <h3 className="text-base font-semibold text-slate-800">{paragraph.subtitle}</h3>
                                  <p className="text-sm text-slate-500 mt-0.5">{paragraph.summary}</p>
                                </div>
                              </div>
                              <svg className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                            {isExpanded && <div className="p-5 bg-slate-50 border-t border-slate-200 text-sm md:text-base text-slate-700 leading-relaxed font-sans">{paragraph.content}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1 bg-white border border-slate-200 rounded-lg p-5 h-fit">
                <h2 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Practice Topics</h2>
                <nav className="space-y-2">
                  {TOPICS.map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => {
                        setActiveTopicId(topic.id);
                        setSelectedOption(null);
                      }}
                      className={`w-full text-left px-4 py-3 text-sm rounded-md font-semibold transition-colors ${activeTopicId === topic.id ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      {topic.title}
                    </button>
                  ))}
                </nav>
              </div>
              <div className="lg:col-span-3 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between">
                    {currentQuestion ? (
                      <>
                        <div>
                          <div className="flex justify-between items-center mb-5">
                            <span className="text-sm font-bold uppercase tracking-wider text-slate-500">
                              Question {currentQuestionIdx + 1} of {currentTopicQuestions.length}
                            </span>
                            <span className="text-sm font-bold px-3 py-1 rounded border border-sky-200 bg-sky-50 text-sky-700">Difficulty: {currentQuestion.difficulty}</span>
                          </div>
                          <p className="text-base font-semibold text-slate-900 mb-6 leading-normal">{currentQuestion.text}</p>
                          <div className="space-y-3">
                            {currentQuestion.options.map((option, idx) => (
                              <button
                                key={idx}
                                onClick={() => setSelectedOption(idx)}
                                className={`w-full text-left px-4 py-3.5 text-sm md:text-base font-medium rounded-lg border transition-colors ${selectedOption === idx ? 'border-sky-500 bg-sky-50 text-sky-900 shadow-xs' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-8 space-y-3">
                          <button
                            onClick={handleStudentSubmitAnswer}
                            disabled={selectedOption === null}
                            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors shadow-xs"
                          >
                            Submit Answer &amp; Update Tracing
                          </button>
                          <button
                            onClick={handleRequestHelpFromStudent}
                            className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                            Request Help for This Specific Question
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="py-16 text-center text-sm font-medium text-slate-500">Topic evaluation complete! All questions answered.</div>
                    )}
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Estimated Mastery: {TOPICS.find((t) => t.id === activeTopicId)?.title}</h3>
                      <span className="text-sm font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">{(currentMastery * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-64 w-full mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={currentHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="step" stroke="#64748b" fontSize={12} />
                          <YAxis domain={[0, 1]} stroke="#64748b" fontSize={12} />
                          <Tooltip />
                          <Line type="monotone" dataKey="mastery" stroke="#0284c7" strokeWidth={2.5} dot={{ fill: '#059669', r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        // MENTOR ROLE VIEW
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Peer Mentor Assistance Hub</h2>
              <p className="text-sm text-slate-500 mt-0.5">Review live help requests from students struggling with specific questions and connect to provide real-time guidance.</p>
            </div>

            {activeHelpSession ? (
              <div className="border border-sky-200 bg-sky-50/40 rounded-lg p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-sky-200 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-sky-950">Live Mentorship Session with {activeHelpSession.studentName}</h3>
                    <p className="text-xs text-sky-800 mt-0.5">
                      Topic: <span className="font-semibold">{activeHelpSession.topicTitle}</span> | Student Mastery: <span className="font-mono font-bold">{(activeHelpSession.currentMastery * 100).toFixed(1)}%</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to end/close this session?')) {
                          setMentorRequests((prev) => prev.filter((r) => r.id !== activeHelpSession.id));
                          setActiveHelpSession(null);
                          setChatLog([]);
                        }
                      }}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold transition-colors shadow-xs"
                    >
                      End Session
                    </button>
                    <button onClick={() => setActiveHelpSession(null)} className="px-3 py-1.5 bg-white border border-sky-300 text-sky-800 rounded text-xs font-semibold hover:bg-sky-100 transition-colors">
                      Minimize
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-white border border-sky-200 rounded text-xs text-slate-700">
                  <span className="font-bold text-sky-900">Target Question:</span> {activeHelpSession.questionText}
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto p-3 bg-white border border-slate-200 rounded-md">
                  {chatLog.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">No messages yet. Send a guidance hint or breakdown to start helping!</p>
                  ) : (
                    chatLog.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.sender === 'mentor' ? 'items-end' : 'items-start'}`}>
                        <span className="text-xxs text-slate-400 mb-0.5">{msg.sender === 'mentor' ? 'You (Mentor)' : activeHelpSession.studentName}</span>
                        <div className={`p-3 rounded-lg text-xs max-w-md ${msg.sender === 'mentor' ? 'bg-sky-600 text-white rounded-br-none' : 'bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200'}`}>{msg.text}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && chatMessage.trim()) {
                        setChatLog((prev) => [...prev, { sender: 'mentor', text: chatMessage }]);
                        setChatMessage('');
                        setTimeout(() => {
                          setChatLog((prev) => [...prev, { sender: 'student', text: 'Thanks! That explanation makes much more sense now.' }]);
                        }, 1000);
                      }
                    }}
                    placeholder="Type an explanation or hint..."
                    className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500"
                  />
                  <button
                    onClick={() => {
                      if (!chatMessage.trim()) return;
                      setChatLog((prev) => [...prev, { sender: 'mentor', text: chatMessage }]);
                      setChatMessage('');
                      setTimeout(() => {
                        setChatLog((prev) => [...prev, { sender: 'student', text: 'Thanks! That explanation makes much more sense now.' }]);
                      }, 1000);
                    }}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Incoming Student Help Queue ({mentorRequests.length})</span>
                {mentorRequests.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8 bg-slate-50 rounded-lg border border-slate-100">No active peer mentor requests right now.</p>
                ) : (
                  mentorRequests.map((req) => (
                    <div key={req.id} className="p-4 border border-slate-200 rounded-lg bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-100/60 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{req.studentName}</span>
                          <span className="text-xxs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-semibold">Mastery: {(req.currentMastery * 100).toFixed(1)}%</span>
                          <span className="text-xxs text-slate-400">{req.timestamp}</span>
                        </div>
                        <p className="text-xs font-semibold text-sky-700">{req.topicTitle}</p>
                        <p className="text-xs text-slate-600">{req.questionText}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setMentorRequests((prev) => prev.filter((r) => r.id !== req.id));
                          }}
                          className="px-3 py-2 bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-red-200 text-xs font-semibold rounded-md transition-colors"
                        >
                          Deny
                        </button>
                        <button
                          onClick={() => {
                            setActiveHelpSession(req);
                            setChatLog([]);
                          }}
                          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
                        >
                          Accept &amp; Assist
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
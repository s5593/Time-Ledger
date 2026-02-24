// lib/types.ts
import { Timestamp } from "firebase/firestore";

export type PlanTop3Item = { text: string; done: boolean };

export type PlanDoc = {
  top3: PlanTop3Item[];
  note: string;
  createdAt?: any;
  updatedAt?: any;
};

export type EntryDoc = {
  id: string;
  text: string;
  minutes: number;
  category: string;
  mood: string;
  success: boolean;
  createdAt?: any;
  updatedAt?: any;
};

export type ReviewComputed = {
  totalMinutes: number;
  entryCount: number;
  successCount: number;
  planTotal: number;
  planDone: number;
  byCategory: Record<string, number>;
};

export type FeedbackOutput = {
  summary: string;
  gaps: string[];
  praise: string[];
  improve: string[];
  tomorrowTop3Suggestion: string[];
};

export type FeedbackRun = {
  runId: string;
  seq: number;
  createdAt: Timestamp | Date;
  status: "created" | "superseded";
  input: {
    date: string;
    planSnapshot: { top3: PlanTop3Item[]; note: string };
    entriesSnapshot: {
      itemsDigest: Array<Pick<EntryDoc, "text" | "minutes" | "category" | "mood" | "success">>;
      computedDigest: Pick<ReviewComputed, "totalMinutes" | "entryCount" | "successCount" | "byCategory">;
    };
    reflectionSnapshot: string;
    userContext: { notes: string; constraints?: string[]; followupQuestion?: string };
    parentRunId?: string;
  };
  output: FeedbackOutput;
  userReaction?: { comment: string; accepted: string[]; rejected: string[]; createdAt: Timestamp | Date };
};

export type ReviewDoc = {
  reflection: string;
  computed: ReviewComputed;
  feedback?: { activeRunId: string | null; runSeq: number; runs: FeedbackRun[] };
  createdAt?: any;
  updatedAt?: any;
};

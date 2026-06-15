/// <reference types="node" />
// @ts-nocheck
/**
 * Benchmark runner sketch for the UML grader.
 *
 * Expected usage:
 * 1. Start apps/grader on http://127.0.0.1:4100.
 * 2. Run this script against labelled JSONL samples.
 * 3. Check whether model scores fall inside teacher-approved score bands.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface TrainingSample {
  sampleId: string;
  input: {
    teacherReference: string;
    studentSubmission: string;
    maxScore: number;
    synonymsMap?: Record<string, string[]>;
  };
  expectedOutput: {
    scoreBand: { min: number; max: number };
    keyIssues: string[];
  };
}

interface GradeResponse {
  score: number;
  maxScore: number;
  summary: string;
  discrepancies: { message: string }[];
  flags: { manualReviewRecommended: boolean; lowConfidence: boolean };
}

const GRADER_BASE_URL = process.env.GRADER_BASE_URL ?? 'http://127.0.0.1:4100';
const INPUT_PATH = join(__dirname, '..', 'training-samples.example.jsonl');
const OUTPUT_PATH = join(__dirname, '..', 'benchmark-results.generated.json');

async function grade(sample: TrainingSample): Promise<GradeResponse> {
  const response = await fetch(`${GRADER_BASE_URL}/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assignmentId: sample.sampleId,
      submissionId: sample.sampleId,
      solutionUxf: sample.input.teacherReference,
      submissionUxf: sample.input.studentSubmission,
      maxScore: sample.input.maxScore,
      synonymsMap: sample.input.synonymsMap ?? {},
    }),
  });

  if (!response.ok) {
    throw new Error(`Grader failed for ${sample.sampleId}: ${response.status}`);
  }

  return response.json() as Promise<GradeResponse>;
}

async function main() {
  const samples = readFileSync(INPUT_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TrainingSample);

  const results = [];
  for (const sample of samples) {
    const result = await grade(sample);
    const inBand =
      result.score >= sample.expectedOutput.scoreBand.min &&
      result.score <= sample.expectedOutput.scoreBand.max;

    results.push({
      sampleId: sample.sampleId,
      score: result.score,
      expectedBand: sample.expectedOutput.scoreBand,
      inBand,
      manualReviewRecommended: result.flags.manualReviewRecommended,
      lowConfidence: result.flags.lowConfidence,
      summary: result.summary,
    });
  }

  const scoreBandAccuracy =
    results.filter((item) => item.inBand).length / Math.max(results.length, 1);

  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ scoreBandAccuracy, results }, null, 2),
  );

  console.log(`Score-band accuracy: ${(scoreBandAccuracy * 100).toFixed(1)}%`);
  console.log(`Wrote benchmark report to ${OUTPUT_PATH}`);
}

void main();


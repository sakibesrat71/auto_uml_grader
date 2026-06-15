/// <reference types="node" />
// @ts-nocheck
/**
 * Dataset builder for UML grader training examples.
 *
 * This script is intentionally kept outside the production app. It demonstrates
 * a standard ML data-preparation stage: gather labelled fixture pairs, attach
 * expected score bands, and emit normalized training samples.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface FixturePair {
  sampleId: string;
  teacherFile: string;
  studentFile: string;
  scoreBand: { min: number; max: number };
  split: 'train' | 'validation' | 'test';
  keyIssues: string[];
}

const FIXTURE_DIR = join(__dirname, '..', '..', 'test-fixtures');
const OUTPUT_PATH = join(__dirname, '..', 'training-samples.generated.jsonl');

const fixturePairs: FixturePair[] = [
  {
    sampleId: 'shop-001',
    teacherFile: 'shop_teacher_solution.uxf',
    studentFile: 'shop_student_submission_expected_7_to_8.uxf',
    scoreBand: { min: 7, max: 8 },
    split: 'train',
    keyIssues: ['mostly correct classes', 'relationship details need work'],
  },
  {
    sampleId: 'library-001',
    teacherFile: 'library_teacher_solution.uxf',
    studentFile: 'library_student_submission_approx_8_9.uxf',
    scoreBand: { min: 8, max: 9 },
    split: 'validation',
    keyIssues: ['strong class coverage', 'minor relationship issue'],
  },
  {
    sampleId: 'event-001',
    teacherFile: 'event_teacher_solution.uxf',
    studentFile: 'event_student_submission_expected_6_to_7.uxf',
    scoreBand: { min: 6, max: 7 },
    split: 'test',
    keyIssues: ['missing concepts', 'relationship coverage incomplete'],
  },
];

const records = fixturePairs.map((pair) => ({
  sampleId: pair.sampleId,
  assignmentType: 'uxf',
  input: {
    teacherReference: readFileSync(join(FIXTURE_DIR, pair.teacherFile), 'utf8'),
    studentSubmission: readFileSync(join(FIXTURE_DIR, pair.studentFile), 'utf8'),
    maxScore: 10,
    synonymsMap: {},
  },
  expectedOutput: {
    scoreBand: pair.scoreBand,
    keyIssues: pair.keyIssues,
    feedbackSummary:
      'Teacher-reviewed benchmark sample for UML semantic grading.',
    manualReviewRecommended: pair.scoreBand.min < 7,
  },
  metadata: {
    source: 'docs/test-fixtures',
    createdBy: 'project-team',
    reviewedByTeacher: true,
    split: pair.split,
  },
}));

writeFileSync(
  OUTPUT_PATH,
  `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
);

console.log(`Wrote ${records.length} training records to ${OUTPUT_PATH}`);


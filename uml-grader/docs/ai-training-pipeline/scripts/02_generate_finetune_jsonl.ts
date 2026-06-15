/// <reference types="node" />
// @ts-nocheck
/**
 * Converts normalized UML grading samples into chat-style JSONL records.
 *
 * This is the format commonly used by supervised fine-tuning pipelines: a
 * system instruction, a user grading request, and an assistant answer in the
 * strict JSON schema expected by the app.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_PATH = join(__dirname, '..', 'training-samples.example.jsonl');
const OUTPUT_PATH = join(__dirname, '..', 'finetune-chat.generated.jsonl');

const systemPrompt = [
  'You are a UML grading assistant.',
  'Grade semantic equivalence, not visual layout.',
  'Return only JSON with score, maxScore, summary, rubricBreakdown, discrepancies, confidence, manualReviewRecommended, and notes.',
  'Never exceed the provided maxScore.',
].join(' ');

const lines = readFileSync(INPUT_PATH, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const output = lines.map((line) => {
  const sample = JSON.parse(line);
  const min = sample.expectedOutput.scoreBand.min;
  const max = sample.expectedOutput.scoreBand.max;
  const score = Number(((min + max) / 2).toFixed(2));

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: JSON.stringify({
          teacherReference: sample.input.teacherReference,
          studentSubmission: sample.input.studentSubmission,
          deterministicEvidence: sample.input.deterministicEvidence,
          maxScore: sample.input.maxScore,
        }),
      },
      {
        role: 'assistant',
        content: JSON.stringify({
          score,
          maxScore: sample.input.maxScore,
          summary: sample.expectedOutput.feedbackSummary,
          rubricBreakdown: sample.expectedOutput.rubricBreakdown ?? [],
          discrepancies: sample.expectedOutput.keyIssues.map(
            (issue: string) => ({
              category: 'teacher_labelled_issue',
              severity: 'major',
              message: issue,
            }),
          ),
          confidence: 0.82,
          manualReviewRecommended:
            sample.expectedOutput.manualReviewRecommended,
          notes: [
            `Expected score band: ${min}-${max}.`,
            'Generated from teacher-reviewed benchmark fixture.',
          ],
        }),
      },
    ],
  };
});

writeFileSync(
  OUTPUT_PATH,
  `${output.map((record) => JSON.stringify(record)).join('\n')}\n`,
);

console.log(`Wrote ${output.length} fine-tuning records to ${OUTPUT_PATH}`);


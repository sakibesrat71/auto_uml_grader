# Benchmark Plan

## Evaluation Questions

1. Does the model score a submission inside the teacher-approved score band?
2. Does the feedback identify the same UML issues a teacher would notice?
3. Does the model avoid penalising harmless layout differences?
4. Does the model recommend manual review when evidence is ambiguous?
5. Does the output follow the strict JSON schema used by the app?

## Benchmark Metrics

| Metric | Meaning |
| --- | --- |
| Score-band accuracy | Percentage of examples where the model score lands inside the expected teacher range |
| Discrepancy recall | Percentage of teacher-labelled issues mentioned by the model |
| Rubric consistency | Whether rubric awarded marks add up to the final score |
| Manual-review precision | Whether manual review is recommended only for uncertain or low-confidence cases |
| Schema validity | Whether model output can be parsed by the backend without repair |
| Latency | Time from submission to completed grade |

## Current Fixture Set

| Fixture | Expected Band | Purpose |
| --- | --- | --- |
| `shop_student_submission_expected_7_to_8.uxf` | 7-8/10 | Partial correctness with some relationship/member issues |
| `library_student_submission_approx_8_9.uxf` | 8-9/10 | Strong submission with minor issues |
| `event_student_submission_expected_6_to_7.uxf` | 6-7/10 | Medium submission with missing concepts |

## Demo-Friendly Explanation

"We benchmarked the AI grader against labelled UML pairs. The teacher solution
and student submission are compared structurally first, then the LLM is judged
on whether its score falls in the expected score range and whether its feedback
matches the known UML issues."

## Future Improvements

- Add at least 50 teacher-reviewed examples per assignment type.
- Keep 20% of samples as a held-out test set.
- Track PNG/JPEG image grading separately from UXF/XML grading.
- Add timing benchmarks for local CPU/GPU environments.
- Add calibration curves for confidence vs grading accuracy.


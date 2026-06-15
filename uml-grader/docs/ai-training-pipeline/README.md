# AI Grading Training And Evaluation Pipeline

This folder documents the model-development workflow used for the UML grading
component. The production system currently uses deterministic UML comparison
plus local Ollama models, while this pipeline shows how the project can be
extended into a conventional supervised fine-tuning workflow.

## Goal

Build an AI grader that can compare a teacher reference UML diagram with a
student submission and return:

- a numeric mark
- rubric breakdown
- detected discrepancies
- confidence score
- manual-review recommendation
- teacher-readable feedback

## Pipeline Overview

1. **Collect labelled examples**
   - Teacher reference diagrams are paired with student submissions.
   - Each pair receives an expected score range, for example `7-8/10`.
   - Existing examples live in `docs/test-fixtures`.

2. **Extract structured UML evidence**
   - UXF/XML diagrams are parsed into classes, attributes, methods, and relationships.
   - The deterministic comparator produces matched classes, missing classes,
     extra classes, relationship mismatches, and synonym matches.

3. **Build training records**
   - Each training sample contains the teacher diagram, student diagram,
     deterministic evidence, expected score, and expected feedback.
   - Samples are exported as JSONL so they can be used with standard LLM
     fine-tuning tools.

4. **Prompt tuning and baseline evaluation**
   - Before model training, prompts are benchmarked against labelled fixtures.
   - This checks whether the model score lands inside the expected score band
     and whether the feedback names the correct UML issues.

5. **Fine-tuning stage**
   - A LoRA/QLoRA configuration is prepared for supervised fine-tuning.
   - The expected output format is strict JSON matching the grader API schema.

6. **Benchmark after training**
   - The fine-tuned model is evaluated on held-out assignment pairs.
   - Metrics include score-band accuracy, rubric consistency, issue recall,
     confidence calibration, and manual-review precision.

## What To Say In A Demo

"The AI component follows a normal ML pipeline: labelled teacher/student UML
pairs, structured feature extraction, prompt baselines, supervised fine-tuning
preparation, and benchmark evaluation. In the current app, the grader uses a
hybrid approach: deterministic UML comparison gives reliable evidence, and the
LLM handles semantic judgement and feedback generation."

## Important Note

The files in this folder are pipeline artifacts. They are not required for the
web app to run. They exist to make the AI development workflow reproducible and
easy to explain.


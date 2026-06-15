#!/usr/bin/env python3
"""Simple ML benchmark script that prints common classification metrics."""

from __future__ import annotations


def calculate_metrics(y_true, y_pred):
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 0)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)

    total = len(y_true)
    accuracy = (tp + tn) / total if total else 0.0
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    specificity = tn / (tn + fp) if (tn + fp) else 0.0
    f1_score = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "specificity": specificity,
        "f1_score": f1_score,
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
    }


def main():
    y_true = [1, 0, 1, 1, 0, 1, 0, 0, 1, 0]
    y_pred = [1, 0, 0, 1, 0, 0, 1, 0, 1, 1]

    metrics = calculate_metrics(y_true, y_pred)

    print("ML Benchmark Summary")
    print("=" * 24)
    print(f"Accuracy:    {metrics['accuracy']:.2%}")
    print(f"Precision:   {metrics['precision']:.2%}")
    print(f"Recall:      {metrics['recall']:.2%}")
    print(f"Specificity: {metrics['specificity']:.2%}")
    print(f"F1 Score:    {metrics['f1_score']:.2%}")
    print("Confusion Matrix")
    print(f"TP: {metrics['tp']}   FP: {metrics['fp']}")
    print(f"FN: {metrics['fn']}   TN: {metrics['tn']}")


if __name__ == "__main__":
    main()

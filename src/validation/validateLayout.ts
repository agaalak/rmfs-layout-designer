import type { WarehouseLayout } from "../models/layout";
import { validateConnectivity } from "./validateConnectivity";
import { validateObjects, type ValidationIssue } from "./validateObjects";
import { validateOrientation } from "./validateOrientation";

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  issueByObjectId: Map<string, ValidationIssue[]>;
  issueCells: Set<string>;
}

export function validateLayout(layout: WarehouseLayout): ValidationResult {
  const issues = [...validateObjects(layout), ...validateConnectivity(layout), ...validateOrientation(layout)];
  const issueByObjectId = new Map<string, ValidationIssue[]>();
  const issueCells = new Set<string>();
  for (const issue of issues) {
    if (issue.objectId) {
      const existing = issueByObjectId.get(issue.objectId) ?? [];
      existing.push(issue);
      issueByObjectId.set(issue.objectId, existing);
    }
    if (issue.cell) {
      issueCells.add(`${issue.cell.row}:${issue.cell.col}`);
    }
  }
  return {
    isValid: !issues.some((issue) => issue.severity === "error"),
    issues,
    issueByObjectId,
    issueCells
  };
}

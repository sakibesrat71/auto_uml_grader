import { Injectable } from '@nestjs/common';
import {
  ClassMatch,
  DiagramComparison,
  ExtraClass,
  MissingClass,
  RelationshipMatch,
  RelationshipIssue,
  RelationshipSummary,
} from '../contracts/comparison.contract';
import {
  ParsedUxfDiagram,
  UmlAttribute,
  UmlClass,
  UmlMethod,
  UmlRelationship,
} from '../contracts/uml.contract';

interface MatchCandidate {
  solutionClass: UmlClass;
  submissionClass: UmlClass;
  matchType: ClassMatch['matchType'];
}

const DEFAULT_SYNONYM_GROUPS: Record<string, string[]> = {
  Customer: ['Client', 'Buyer', 'Purchaser'],
  User: ['Account', 'AccountHolder'],
  Student: ['Learner', 'Pupil'],
  Teacher: ['Instructor', 'Lecturer', 'Tutor'],
  Staff: ['Employee', 'Worker'],
  Librarian: ['LibraryStaff', 'StaffMember'],
  Product: ['Item', 'StockItem', 'CatalogItem'],
  Order: ['Purchase', 'Transaction', 'Sale'],
  Payment: ['TransactionPayment'],
  Loan: ['Borrowing', 'Borrow', 'Checkout'],
  Book: ['Publication', 'Title'],
  customerId: ['clientId', 'buyerId', 'purchaserId'],
  customerName: ['clientName', 'buyerName'],
  userId: ['accountId', 'accountHolderId'],
  studentId: ['learnerId', 'pupilId'],
  teacherId: ['instructorId', 'lecturerId', 'tutorId'],
  productId: ['itemId', 'stockItemId'],
  productName: ['itemName'],
  orderId: ['purchaseId', 'transactionId'],
  stock: ['quantity', 'stockQuantity', 'availableQuantity', 'copiesAvailable'],
  price: ['cost', 'amount'],
};

@Injectable()
export class DiagramComparisonService {
  compare(
    solution: ParsedUxfDiagram,
    submission: ParsedUxfDiagram,
    synonymsMap: Record<string, string[]> = {},
  ): DiagramComparison {
    const synonymGroups = this.buildSynonymGroups(synonymsMap);
    const classMatches = this.matchClasses(
      solution.classes,
      submission.classes,
      synonymGroups,
    );
    const matchedSolutionNames = new Set(
      classMatches.map((item) => item.solutionClass),
    );
    const matchedSubmissionNames = new Set(
      classMatches.map((item) => item.submissionClass),
    );
    const missingClasses = solution.classes
      .filter((item) => !matchedSolutionNames.has(item.name))
      .map((item) => this.toMissingClass(item));
    const extraClasses = submission.classes
      .filter((item) => !matchedSubmissionNames.has(item.name))
      .map((item) => this.toExtraClass(item));
    const relationshipComparison = this.compareRelationships(
      solution.relationships,
      submission.relationships,
      classMatches,
    );

    return {
      solution,
      submission,
      classMatches,
      missingClasses,
      extraClasses,
      relationshipMatches: relationshipComparison.matches,
      missingRelationships: relationshipComparison.missing,
      extraRelationships: relationshipComparison.extra,
      summary: {
        solutionClassCount: solution.classes.length,
        submissionClassCount: submission.classes.length,
        matchedClassCount: classMatches.length,
        missingClassCount: missingClasses.length,
        extraClassCount: extraClasses.length,
        solutionRelationshipCount: solution.relationships.length,
        submissionRelationshipCount: submission.relationships.length,
        matchedRelationshipCount: relationshipComparison.matches.length,
        missingRelationshipCount: relationshipComparison.missing.length,
        extraRelationshipCount: relationshipComparison.extra.length,
        attributeMatchCount: classMatches.reduce(
          (sum, item) => sum + item.matchedAttributes.length,
          0,
        ),
        missingAttributeCount: classMatches.reduce(
          (sum, item) => sum + item.missingAttributes.length,
          0,
        ),
        extraAttributeCount: classMatches.reduce(
          (sum, item) => sum + item.extraAttributes.length,
          0,
        ),
        methodMatchCount: classMatches.reduce(
          (sum, item) => sum + item.matchedMethods.length,
          0,
        ),
        missingMethodCount: classMatches.reduce(
          (sum, item) => sum + item.missingMethods.length,
          0,
        ),
        extraMethodCount: classMatches.reduce(
          (sum, item) => sum + item.extraMethods.length,
          0,
        ),
      },
    };
  }

  private matchClasses(
    solutionClasses: UmlClass[],
    submissionClasses: UmlClass[],
    synonymGroups: Map<string, Set<string>>,
  ): ClassMatch[] {
    const candidates = solutionClasses.flatMap((solutionClass) =>
      submissionClasses.flatMap((submissionClass) => {
        const matchType = this.getNameMatchType(
          solutionClass.name,
          submissionClass.name,
          synonymGroups,
        );

        return matchType ? [{ solutionClass, submissionClass, matchType }] : [];
      }),
    );

    const rankedCandidates = candidates.sort((left, right) => {
      const typeDelta =
        this.matchTypeRank(left.matchType) -
        this.matchTypeRank(right.matchType);
      if (typeDelta !== 0) {
        return typeDelta;
      }

      return (
        this.memberOverlapScore(
          right.solutionClass,
          right.submissionClass,
          synonymGroups,
        ) -
        this.memberOverlapScore(
          left.solutionClass,
          left.submissionClass,
          synonymGroups,
        )
      );
    });
    const usedSolutionNames = new Set<string>();
    const usedSubmissionNames = new Set<string>();
    const matches: ClassMatch[] = [];

    for (const candidate of rankedCandidates) {
      if (
        usedSolutionNames.has(candidate.solutionClass.name) ||
        usedSubmissionNames.has(candidate.submissionClass.name)
      ) {
        continue;
      }

      usedSolutionNames.add(candidate.solutionClass.name);
      usedSubmissionNames.add(candidate.submissionClass.name);
      matches.push(this.buildClassMatch(candidate, synonymGroups));
    }

    return matches.sort((left, right) =>
      left.solutionClass.localeCompare(right.solutionClass),
    );
  }

  private buildClassMatch(
    candidate: MatchCandidate,
    synonymGroups: Map<string, Set<string>>,
  ): ClassMatch {
    const attributeComparison = this.compareNamedMembers(
      candidate.solutionClass.attributes,
      candidate.submissionClass.attributes,
      synonymGroups,
    );
    const methodComparison = this.compareNamedMembers(
      candidate.solutionClass.methods,
      candidate.submissionClass.methods,
      synonymGroups,
    );

    return {
      solutionClass: candidate.solutionClass.name,
      submissionClass: candidate.submissionClass.name,
      matchType: candidate.matchType,
      missingAttributes: attributeComparison.missing,
      extraAttributes: attributeComparison.extra,
      matchedAttributes: attributeComparison.matched,
      missingMethods: methodComparison.missing,
      extraMethods: methodComparison.extra,
      matchedMethods: methodComparison.matched,
    };
  }

  private compareNamedMembers(
    solutionMembers: Array<UmlAttribute | UmlMethod>,
    submissionMembers: Array<UmlAttribute | UmlMethod>,
    synonymGroups: Map<string, Set<string>>,
  ) {
    const usedSubmission = new Set<string>();
    const matched: string[] = [];
    const missing: string[] = [];

    for (const solutionMember of solutionMembers) {
      const matchingSubmission = submissionMembers.find(
        (submissionMember) =>
          !usedSubmission.has(submissionMember.name) &&
          this.getNameMatchType(
            solutionMember.name,
            submissionMember.name,
            synonymGroups,
          ),
      );

      if (matchingSubmission) {
        usedSubmission.add(matchingSubmission.name);
        matched.push(solutionMember.name);
      } else {
        missing.push(solutionMember.name);
      }
    }

    const extra = submissionMembers
      .filter((item) => !usedSubmission.has(item.name))
      .map((item) => item.name);

    return { matched, missing, extra };
  }

  private compareRelationships(
    solutionRelationships: UmlRelationship[],
    submissionRelationships: UmlRelationship[],
    classMatches: ClassMatch[],
  ) {
    const classNameMap = new Map(
      classMatches.map((item) => [item.solutionClass, item.submissionClass]),
    );
    const usedSubmissionRelationships = new Set<number>();
    const matches: RelationshipMatch[] = [];
    const missing: RelationshipIssue[] = [];

    for (const solutionRelationship of solutionRelationships) {
      const mappedSolution = this.mapRelationshipToSubmissionNames(
        solutionRelationship,
        classNameMap,
      );
      const matchIndex = submissionRelationships.findIndex(
        (submissionRelationship, index) =>
          !usedSubmissionRelationships.has(index) &&
          this.sameRelationshipEndpoints(
            mappedSolution,
            submissionRelationship,
          ),
      );

      if (matchIndex === -1) {
        missing.push({
          relationship: this.toRelationshipSummary(solutionRelationship),
          reason: 'No submission relationship connected the matched classes.',
        });
        continue;
      }

      usedSubmissionRelationships.add(matchIndex);
      const submissionRelationship = submissionRelationships[matchIndex];
      matches.push({
        solutionRelationship: this.toRelationshipSummary(solutionRelationship),
        submissionRelationship: this.toRelationshipSummary(
          submissionRelationship,
        ),
        matchType:
          mappedSolution.type === submissionRelationship.type
            ? 'exact'
            : 'type-mismatch',
      });
    }

    const extra = submissionRelationships
      .map((relationship, index) => ({ relationship, index }))
      .filter((item) => !usedSubmissionRelationships.has(item.index))
      .map((item) => ({
        relationship: this.toRelationshipSummary(item.relationship),
        reason: 'No matching solution relationship used these classes.',
      }));

    return { matches, missing, extra };
  }

  private mapRelationshipToSubmissionNames(
    relationship: UmlRelationship,
    classNameMap: Map<string, string>,
  ): UmlRelationship {
    return {
      ...relationship,
      source: classNameMap.get(relationship.source) ?? relationship.source,
      target: classNameMap.get(relationship.target) ?? relationship.target,
    };
  }

  private sameRelationshipEndpoints(
    left: UmlRelationship,
    right: UmlRelationship,
  ) {
    return left.source === right.source && left.target === right.target;
  }

  private toMissingClass(item: UmlClass): MissingClass {
    return {
      name: item.name,
      attributes: item.attributes.map((attribute) => attribute.name),
      methods: item.methods.map((method) => method.name),
    };
  }

  private toExtraClass(item: UmlClass): ExtraClass {
    return {
      name: item.name,
      attributes: item.attributes.map((attribute) => attribute.name),
      methods: item.methods.map((method) => method.name),
    };
  }

  private toRelationshipSummary(
    relationship: UmlRelationship,
  ): RelationshipSummary {
    return {
      source: relationship.source,
      target: relationship.target,
      type: relationship.type,
      label: relationship.label,
    };
  }

  private getNameMatchType(
    solutionName: string,
    submissionName: string,
    synonymGroups: Map<string, Set<string>>,
  ): ClassMatch['matchType'] | null {
    if (solutionName === submissionName) {
      return 'exact';
    }

    const normalizedSolution = this.normalizeName(solutionName);
    const normalizedSubmission = this.normalizeName(submissionName);
    if (normalizedSolution === normalizedSubmission) {
      return 'normalized';
    }

    const group = synonymGroups.get(normalizedSolution);
    if (group?.has(normalizedSubmission)) {
      return 'synonym';
    }

    return null;
  }

  private buildSynonymGroups(synonymsMap: Record<string, string[]>) {
    const groups = new Map<string, Set<string>>();
    const combinedSynonyms = new Map<string, string[]>();

    for (const [term, aliases] of Object.entries(DEFAULT_SYNONYM_GROUPS)) {
      combinedSynonyms.set(term, aliases);
    }

    for (const [term, aliases] of Object.entries(synonymsMap)) {
      combinedSynonyms.set(term, [
        ...(combinedSynonyms.get(term) ?? []),
        ...aliases,
      ]);
    }

    for (const [term, aliases] of combinedSynonyms.entries()) {
      const normalizedValues = [
        this.normalizeName(term),
        ...aliases.map((alias) => this.normalizeName(alias)),
      ].filter(Boolean);
      const group = new Set(normalizedValues);

      for (const value of group) {
        const existingGroup = groups.get(value);
        if (existingGroup) {
          for (const item of group) {
            existingGroup.add(item);
          }
        } else {
          groups.set(value, group);
        }
      }
    }

    return groups;
  }

  private memberOverlapScore(
    left: UmlClass,
    right: UmlClass,
    synonymGroups: Map<string, Set<string>>,
  ) {
    const rightAttributes = right.attributes.map((item) => item.name);
    const rightMethods = right.methods.map((item) => item.name);

    return (
      left.attributes.filter((item) =>
        rightAttributes.some((rightName) =>
          this.getNameMatchType(item.name, rightName, synonymGroups),
        ),
      ).length +
      left.methods.filter((item) =>
        rightMethods.some((rightName) =>
          this.getNameMatchType(item.name, rightName, synonymGroups),
        ),
      ).length
    );
  }

  private matchTypeRank(matchType: ClassMatch['matchType']) {
    switch (matchType) {
      case 'exact':
        return 0;
      case 'normalized':
        return 1;
      case 'synonym':
        return 2;
      default:
        return 3;
    }
  }

  private normalizeName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}

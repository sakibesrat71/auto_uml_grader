import { DiagramComparisonService } from './diagram-comparison.service';
import type { ParsedUxfDiagram } from '../contracts/uml.contract';

describe('DiagramComparisonService', () => {
  const service = new DiagramComparisonService();

  it('matches synonym class names and reports member differences', () => {
    const solution = makeDiagram({
      classes: [
        {
          name: 'Customer',
          attributes: ['customerId', 'email'],
          methods: ['placeOrder'],
        },
      ],
      relationships: [],
    });
    const submission = makeDiagram({
      classes: [
        {
          name: 'Client',
          attributes: ['clientId', 'email', 'phone'],
          methods: [],
        },
      ],
      relationships: [],
    });

    const comparison = service.compare(solution, submission, {
      Customer: ['Client'],
      customerId: ['clientId'],
    });

    expect(comparison.classMatches).toEqual([
      expect.objectContaining({
        solutionClass: 'Customer',
        submissionClass: 'Client',
        matchType: 'synonym',
        matchedAttributes: ['customerId', 'email'],
        missingAttributes: [],
        extraAttributes: ['phone'],
        missingMethods: ['placeOrder'],
      }),
    ]);
    expect(comparison.summary).toMatchObject({
      matchedClassCount: 1,
      missingClassCount: 0,
      extraClassCount: 0,
      attributeMatchCount: 2,
      missingMethodCount: 1,
    });
  });

  it('compares relationships through matched class names', () => {
    const solution = makeDiagram({
      classes: [
        { name: 'Customer', attributes: [], methods: [] },
        { name: 'Order', attributes: [], methods: [] },
      ],
      relationships: [
        { source: 'Customer', target: 'Order', type: 'association' },
      ],
    });
    const submission = makeDiagram({
      classes: [
        { name: 'Client', attributes: [], methods: [] },
        { name: 'Order', attributes: [], methods: [] },
      ],
      relationships: [
        { source: 'Client', target: 'Order', type: 'dependency' },
      ],
    });

    const comparison = service.compare(solution, submission, {
      Customer: ['Client'],
    });

    expect(comparison.relationshipMatches).toEqual([
      expect.objectContaining({
        matchType: 'type-mismatch',
      }),
    ]);
    expect(comparison.summary).toMatchObject({
      matchedRelationshipCount: 1,
      missingRelationshipCount: 0,
      extraRelationshipCount: 0,
    });
  });
});

function makeDiagram(input: {
  classes: { name: string; attributes: string[]; methods: string[] }[];
  relationships: { source: string; target: string; type: string }[];
}): ParsedUxfDiagram {
  return {
    classes: input.classes.map((item) => ({
      name: item.name,
      kind: 'class',
      attributes: item.attributes.map((name) => ({
        name,
        isStatic: false,
        notes: [],
      })),
      methods: item.methods.map((name) => ({
        name,
        parameters: [],
        isStatic: false,
      })),
      rawText: item.name,
      bounds: { x: 0, y: 0, w: 100, h: 100 },
    })),
    relationships: input.relationships.map((item) => ({
      source: item.source,
      target: item.target,
      type: item.type,
      rawText: item.type,
      points: [],
    })),
    notes: [],
    metadata: {
      classCount: input.classes.length,
      relationshipCount: input.relationships.length,
      unlinkedRelationshipCount: 0,
    },
  };
}

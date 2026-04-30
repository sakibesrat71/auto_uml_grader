import { BadRequestException, Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import {
  ParsedUxfDiagram,
  UmlAttribute,
  UmlBounds,
  UmlClass,
  UmlMethod,
  UmlMethodParameter,
  UmlPoint,
  UmlRelationship,
} from '../contracts/uml.contract';

interface UxfElement {
  id?: string;
  coordinates?: {
    x?: number | string;
    y?: number | string;
    w?: number | string;
    h?: number | string;
  };
  panel_attributes?: string;
  additional_attributes?: string;
}

interface UxfDocument {
  diagram?: {
    '@_program'?: string;
    '@_version'?: string;
    zoom_level?: number | string;
    element?: UxfElement | UxfElement[];
  };
}

interface ParsedRelationLine {
  type: string;
  label?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}

@Injectable()
export class UxfParserService {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: false,
    parseTagValue: true,
  });

  parse(uxf: string): ParsedUxfDiagram {
    if (!uxf?.trim()) {
      throw new BadRequestException('UXF content is required.');
    }

    const document = this.parseXml(uxf);
    const diagram = document.diagram;
    if (!diagram) {
      throw new BadRequestException('UXF content must contain a diagram root.');
    }

    const elements = this.asArray(diagram.element);
    const classElements = elements.filter((item) => item.id === 'UMLClass');
    const relationElements = elements.filter((item) => item.id === 'Relation');
    const classes = classElements
      .map((element) => this.parseClassElement(element))
      .filter((item): item is UmlClass => Boolean(item));
    const relationships = relationElements.map((element) =>
      this.parseRelationshipElement(element, classes),
    );

    return {
      classes: classes.sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
      relationships: relationships.sort((left, right) =>
        `${left.source}:${left.target}:${left.type}`.localeCompare(
          `${right.source}:${right.target}:${right.type}`,
        ),
      ),
      notes: [],
      metadata: {
        program: diagram['@_program'],
        version: diagram['@_version'],
        zoomLevel: this.toNumber(diagram.zoom_level),
        classCount: classes.length,
        relationshipCount: relationships.length,
        unlinkedRelationshipCount: relationships.filter(
          (item) => item.source === 'Unknown' || item.target === 'Unknown',
        ).length,
      },
    };
  }

  private parseXml(uxf: string): UxfDocument {
    try {
      return this.parser.parse(uxf) as UxfDocument;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'UXF XML could not be parsed.',
      );
    }
  }

  private parseClassElement(element: UxfElement): UmlClass | null {
    const rawText = this.normalizeRawPanelText(element.panel_attributes);
    const lines = this.splitPanelLines(rawText);
    const nameLine = lines.find((line) => line !== '--');
    if (!nameLine) {
      return null;
    }

    const sections = this.splitClassSections(lines);
    const name = this.cleanClassName(nameLine);

    return {
      name,
      kind: this.detectClassKind(lines),
      attributes: sections.attributes.map((line) => this.parseAttribute(line)),
      methods: sections.methods.map((line) => this.parseMethod(line)),
      rawText,
      bounds: this.parseBounds(element.coordinates),
    };
  }

  private parseRelationshipElement(
    element: UxfElement,
    classes: UmlClass[],
  ): UmlRelationship {
    const rawText = this.normalizeRawPanelText(element.panel_attributes);
    const relation = this.parseRelationPanel(rawText);
    const bounds = this.parseBounds(element.coordinates);
    const points = this.parseRelationPoints(
      bounds,
      element.additional_attributes,
    );
    const source = this.findNearestClassName(points[0], classes);
    const target = this.findNearestClassName(
      points[points.length - 1],
      classes,
    );

    return {
      source,
      target,
      type: relation.type,
      label: relation.label,
      sourceMultiplicity: relation.sourceMultiplicity,
      targetMultiplicity: relation.targetMultiplicity,
      direction: this.detectDirection(rawText),
      rawText,
      points,
    };
  }

  private splitClassSections(lines: string[]) {
    const bodyLines = lines.slice(1);
    const sections: string[][] = [[]];
    for (const line of bodyLines) {
      if (line === '--') {
        sections.push([]);
      } else {
        sections[sections.length - 1].push(line);
      }
    }

    const first = sections[0] ?? [];
    const second = sections[1] ?? [];
    const third = sections[2] ?? [];
    const mixedMembers = sections.length === 1 ? first : second;

    return {
      attributes: [...mixedMembers, ...third].filter(
        (line) => !this.looksLikeMethod(line),
      ),
      methods: [...mixedMembers, ...third].filter((line) =>
        this.looksLikeMethod(line),
      ),
    };
  }

  private parseAttribute(line: string): UmlAttribute {
    const normalized = line.trim();
    const withoutVisibility = this.stripVisibility(normalized);
    const keyHintMatch = withoutVisibility.match(/\(([^)]*)\)\s*$/);
    const withoutNotes = withoutVisibility.replace(/\s*\([^)]*\)\s*$/, '');
    const [namePart, typePart] = withoutNotes
      .split(':')
      .map((part) => part.trim());

    return {
      name: this.cleanMemberName(namePart),
      type: typePart || undefined,
      visibility: this.getVisibility(normalized),
      isStatic: this.isStaticMember(normalized),
      notes: keyHintMatch?.[1]
        ? keyHintMatch[1].split(',').map((item) => item.trim())
        : [],
    };
  }

  private parseMethod(line: string): UmlMethod {
    const normalized = line.trim();
    const withoutVisibility = this.stripVisibility(normalized);
    const match = withoutVisibility.match(/^([^(:]+)\(([^)]*)\)\s*:?\s*(.*)$/);
    if (!match) {
      return {
        name: this.cleanMemberName(withoutVisibility),
        parameters: [],
        visibility: this.getVisibility(normalized),
        isStatic: this.isStaticMember(normalized),
      };
    }

    return {
      name: this.cleanMemberName(match[1]),
      parameters: this.parseParameters(match[2]),
      returnType: match[3]?.trim() || undefined,
      visibility: this.getVisibility(normalized),
      isStatic: this.isStaticMember(normalized),
    };
  }

  private parseParameters(value: string): UmlMethodParameter[] {
    if (!value.trim()) {
      return [];
    }

    return value.split(',').map((parameter) => {
      const [name, type] = parameter.split(':').map((part) => part.trim());
      return {
        name: this.cleanMemberName(name),
        type: type || undefined,
      };
    });
  }

  private parseRelationPanel(rawText: string): ParsedRelationLine {
    const lines = this.splitPanelLines(rawText);
    const typeLine = lines.find((line) => line.startsWith('lt=')) ?? '';
    const labels = lines.filter((line) => !line.startsWith('lt='));
    const multiplicities = labels.filter((line) =>
      /^(\d+|\*|0\.\.1|0\.\*|1\.\*|1\.\.1|many)$/i.test(line),
    );
    const freeLabels = labels.filter((line) => !multiplicities.includes(line));

    return {
      type: this.mapRelationType(typeLine),
      label: freeLabels.join(' ').trim() || undefined,
      sourceMultiplicity: multiplicities[0],
      targetMultiplicity: multiplicities[1],
    };
  }

  private parseRelationPoints(
    bounds: UmlBounds,
    additionalAttributes?: string,
  ): UmlPoint[] {
    const numbers = (additionalAttributes ?? '')
      .split(';')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));

    if (numbers.length < 4) {
      return [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      ];
    }

    const points: UmlPoint[] = [];
    for (let index = 0; index < numbers.length; index += 2) {
      points.push({
        x: bounds.x + numbers[index],
        y: bounds.y + numbers[index + 1],
      });
    }
    return points;
  }

  private findNearestClassName(
    point: UmlPoint | undefined,
    classes: UmlClass[],
  ) {
    if (!point || classes.length === 0) {
      return 'Unknown';
    }

    const ranked = classes
      .map((item) => ({
        name: item.name,
        distance: this.distanceToBounds(point, item.bounds),
      }))
      .sort((left, right) => left.distance - right.distance);

    return ranked[0]?.distance <= 40 ? ranked[0].name : 'Unknown';
  }

  private distanceToBounds(point: UmlPoint, bounds: UmlBounds) {
    const nearestX = Math.max(bounds.x, Math.min(point.x, bounds.x + bounds.w));
    const nearestY = Math.max(bounds.y, Math.min(point.y, bounds.y + bounds.h));
    return Math.hypot(point.x - nearestX, point.y - nearestY);
  }

  private mapRelationType(typeLine: string) {
    if (typeLine.includes('<<<<-') || typeLine.includes('<<<<')) {
      return 'inheritance';
    }
    if (typeLine.includes('<<-') || typeLine.includes('<<')) {
      return 'dependency';
    }
    if (typeLine.includes('<>')) {
      return 'aggregation';
    }
    if (typeLine.includes('*')) {
      return 'composition';
    }
    if (typeLine.includes('->')) {
      return 'directed-association';
    }
    return 'association';
  }

  private detectDirection(rawText: string) {
    if (rawText.includes('->')) {
      return 'source-to-target';
    }
    if (rawText.includes('<-')) {
      return 'target-to-source';
    }
    return undefined;
  }

  private parseBounds(coordinates?: UxfElement['coordinates']): UmlBounds {
    return {
      x: this.toNumber(coordinates?.x) ?? 0,
      y: this.toNumber(coordinates?.y) ?? 0,
      w: this.toNumber(coordinates?.w) ?? 0,
      h: this.toNumber(coordinates?.h) ?? 0,
    };
  }

  private splitPanelLines(value: string) {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private normalizeRawPanelText(value?: string) {
    return String(value ?? '')
      .replace(/\r\n/g, '\n')
      .trim();
  }

  private cleanClassName(value: string) {
    return value
      .replace(/^<<\s*interface\s*>>/i, '')
      .replace(/[{}]/g, '')
      .trim();
  }

  private cleanMemberName(value: string) {
    return value.replace(/^\/+/, '').replace(/_+/g, '').trim();
  }

  private detectClassKind(lines: string[]): UmlClass['kind'] {
    const text = lines.join(' ').toLowerCase();
    if (text.includes('<<interface>>') || text.includes('interface')) {
      return 'interface';
    }
    if (text.includes('{abstract}') || text.includes('abstract')) {
      return 'abstract';
    }
    return 'class';
  }

  private looksLikeMethod(line: string) {
    return /^[+\-#~]?\s*\/?[A-Za-z_][\w$]*\([^)]*\)/.test(line.trim());
  }

  private getVisibility(value: string) {
    const marker = value.trim()[0];
    if (marker === '+') {
      return 'public';
    }
    if (marker === '-') {
      return 'private';
    }
    if (marker === '#') {
      return 'protected';
    }
    if (marker === '~') {
      return 'package';
    }
    return undefined;
  }

  private stripVisibility(value: string) {
    return value.replace(/^[+\-#~]\s*/, '').trim();
  }

  private isStaticMember(value: string) {
    return (
      /^_.*_$/.test(value.trim()) || value.toLowerCase().includes('{static}')
    );
  }

  private asArray<T>(value?: T | T[]) {
    if (!value) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  private toNumber(value?: number | string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class UmlAttribute {
  @Prop({ required: true })
  name!: string;

  @Prop()
  type?: string;

  @Prop()
  visibility?: string;

  @Prop({ default: false })
  isStatic!: boolean;
}

export const UmlAttributeSchema = SchemaFactory.createForClass(UmlAttribute);

@Schema({ _id: false })
export class UmlMethodParameter {
  @Prop({ required: true })
  name!: string;

  @Prop()
  type?: string;
}

export const UmlMethodParameterSchema =
  SchemaFactory.createForClass(UmlMethodParameter);

@Schema({ _id: false })
export class UmlMethod {
  @Prop({ required: true })
  name!: string;

  @Prop()
  returnType?: string;

  @Prop()
  visibility?: string;

  @Prop({ type: [UmlMethodParameterSchema], default: [] })
  parameters!: UmlMethodParameter[];

  @Prop({ default: false })
  isStatic!: boolean;
}

export const UmlMethodSchema = SchemaFactory.createForClass(UmlMethod);

@Schema({ _id: false })
export class UmlClass {
  @Prop({ required: true })
  name!: string;

  @Prop()
  kind?: string;

  @Prop({ type: [UmlAttributeSchema], default: [] })
  attributes!: UmlAttribute[];

  @Prop({ type: [UmlMethodSchema], default: [] })
  methods!: UmlMethod[];
}

export const UmlClassSchema = SchemaFactory.createForClass(UmlClass);

@Schema({ _id: false })
export class UmlRelationship {
  @Prop({ required: true })
  source!: string;

  @Prop({ required: true })
  target!: string;

  @Prop({ required: true })
  type!: string;

  @Prop()
  label?: string;

  @Prop()
  sourceMultiplicity?: string;

  @Prop()
  targetMultiplicity?: string;

  @Prop()
  direction?: string;
}

export const UmlRelationshipSchema =
  SchemaFactory.createForClass(UmlRelationship);

@Schema({ _id: false })
export class ExtractionMeta {
  @Prop()
  modelName?: string;

  @Prop()
  promptVersion?: string;

  @Prop()
  extractionVersion?: string;

  @Prop()
  temperature?: number;

  @Prop()
  rawResponse?: string;

  @Prop()
  confidence?: number;

  @Prop({ default: false })
  hadJsonRepair!: boolean;

  @Prop()
  extractedAt?: Date;
}

export const ExtractionMetaSchema = SchemaFactory.createForClass(ExtractionMeta);

@Schema({ _id: false })
export class ExtractedUmlJson {
  @Prop({ type: [UmlClassSchema], default: [] })
  classes!: UmlClass[];

  @Prop({ type: [UmlRelationshipSchema], default: [] })
  relationships!: UmlRelationship[];

  @Prop({ type: [String], default: [] })
  notes!: string[];

  @Prop({ type: ExtractionMetaSchema })
  extractionMeta?: ExtractionMeta;
}

export const ExtractedUmlJsonSchema =
  SchemaFactory.createForClass(ExtractedUmlJson);

@Schema({ _id: false })
export class RubricBreakdownItem {
  @Prop({ required: true })
  criterionKey!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  maxMarks!: number;

  @Prop({ required: true })
  awardedMarks!: number;

  @Prop()
  reason?: string;
}

export const RubricBreakdownItemSchema =
  SchemaFactory.createForClass(RubricBreakdownItem);

@Schema({ _id: false })
export class DiscrepancyItem {
  @Prop({ required: true })
  category!: string;

  @Prop({ required: true })
  severity!: string;

  @Prop({ required: true })
  message!: string;

  @Prop()
  expected?: string;

  @Prop()
  actual?: string;

  @Prop()
  entityRef?: string;
}

export const DiscrepancyItemSchema =
  SchemaFactory.createForClass(DiscrepancyItem);

@Schema({ _id: false })
export class Flags {
  @Prop({ default: false })
  lowConfidence!: boolean;

  @Prop({ default: false })
  extractionIssues!: boolean;

  @Prop({ default: false })
  invalidJsonRecovered!: boolean;

  @Prop({ default: false })
  manualReviewRecommended!: boolean;

  @Prop({ type: [String], default: [] })
  notes!: string[];
}

export const FlagsSchema = SchemaFactory.createForClass(Flags);

@Schema({ _id: false })
export class TeacherOverride {
  @Prop({ default: false })
  isOverridden!: boolean;

  @Prop()
  overriddenBy?: string;

  @Prop()
  overriddenAt?: Date;

  @Prop()
  originalScore?: number;

  @Prop()
  finalScore?: number;

  @Prop()
  comment?: string;
}

export const TeacherOverrideSchema =
  SchemaFactory.createForClass(TeacherOverride);

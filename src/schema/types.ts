export interface PropertyDefinition {
  name: string;
  dataType: string;
  unit?: string;
  allowedValues?: string[];
}

export interface PropertySetDefinition {
  name: string;
  properties: PropertyDefinition[];
}

export interface QuantitySetDefinition {
  name: string;
  quantities: PropertyDefinition[];
}

export interface PsetAssignment {
  name: string;
  /** If set, this Pset/Qto is only available for this specific PredefinedType */
  forPredefinedType?: string;
}

export interface AttributeDefinition {
  name: string;
  dataType: string;
  isOptional: boolean;
}

export interface SchemaEntity {
  name: string;
  attributes: AttributeDefinition[];
  standardPsets: PsetAssignment[];
  standardQtoSets: PsetAssignment[];
  predefinedTypeValues: string[];
}

export interface SchemaIndex {
  entities: Record<string, SchemaEntity>;
  psets: Record<string, PropertySetDefinition>;
  qtos: Record<string, QuantitySetDefinition>;
  dataTypes: string[];
}

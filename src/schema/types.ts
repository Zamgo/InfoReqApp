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
  /** Allowed values for enum-type attributes (e.g. IfcDoorTypeOperationEnum) */
  allowedValues?: string[];
}

export interface SchemaEntity {
  name: string;
  attributes: AttributeDefinition[];
  standardPsets: PsetAssignment[];
  standardQtoSets: PsetAssignment[];
  predefinedTypeValues: string[];
  /** Direct parent in IFC hierarchy (from XSD base). */
  parent?: string;
  /** True if entity is abstract and cannot be instantiated. */
  abstract?: boolean;
}

export interface SchemaIndex {
  entities: Record<string, SchemaEntity>;
  psets: Record<string, PropertySetDefinition>;
  qtos: Record<string, QuantitySetDefinition>;
  dataTypes: string[];
  /** Entity names in tree order (pre-order) for hierarchical dropdown. */
  entityListOrder?: string[];
}

/** Výstup skriptu build_deprecated_ifc – deprecated entity a hodnoty PredefinedType po enum typu. */
export interface DeprecatedIfcData {
  deprecatedEntities: string[];
  deprecatedPredefinedTypesByEnum: Record<string, string[]>;
}

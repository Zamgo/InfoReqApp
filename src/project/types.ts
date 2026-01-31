import type { ClassificationData, ClassificationNode, ClassificationSystem } from "../classification/types";

export type PredefinedMode = "NONE" | "ENUM" | "USERDEFINED";

export interface PredefinedTypeSelection {
  mode: PredefinedMode;
  value?: string;
}

export interface Phase {
  id: string;
  code: string;
  name: string;
  description?: string;
}

export interface RequirementBase {
  id: string;
  extensions: Record<string, unknown>;
  phases?: string[];
}

export interface AttributeRequirement extends RequirementBase {
  attribute: string;
  required: boolean;
  dataType?: string;
  occurrence?: "required" | "prohibited" | "optional";
  constraint: "FILLED" | "ENUM" | "PATTERN" | "RANGE" | "LENGTH";
  value?: string;
  allowedValues?: string[];
  unit?: string;
  note?: string;
  /** If true, this attribute is used in applicability section (not requirements) */
  isApplicability?: boolean;
}

export interface PropertyRequirement extends RequirementBase {
  source: "PSET" | "QTO" | "CUSTOM";
  psetName: string;
  propertyName: string;
  dataType: string;
  required: boolean;
  occurrence?: "required" | "prohibited" | "optional";
  constraint?: "FILLED" | "ENUM" | "PATTERN" | "RANGE" | "LENGTH";
  value?: string;
  unit?: string;
  note?: string;
  /** If true, this property is used in applicability section (not requirements) */
  isApplicability?: boolean;
}

export interface RelationRequirement extends RequirementBase {
  relationType:
    | "IFCRELAGGREGATES"
    | "IFCRELASSIGNSTOGROUP"
    | "IFCRELCONTAINEDINSPATIALSTRUCTURE"
    | "IFCRELNESTS"
    | "IFCRELVOIDSELEMENT"
    | "IFCRELFILLSELEMENT";
  /** @deprecated Use entityType instead */
  targetType?: string;
  /** Occurrence of the relation requirement */
  occurrence?: "required" | "prohibited" | "optional";
  /** IFC entity type for the related element */
  entityType?: string;
  /** PredefinedType of the related entity */
  entityPredefinedType?: string;
  minCardinality?: number;
  maxCardinality?: number;
  note?: string;
  /** If true, this relation (partOf) is used in applicability section (not requirements) */
  isApplicability?: boolean;
}

export interface ClassificationRequirement extends RequirementBase {
  classificationId: string;
  /** ID of the selected classification system entry */
  systemEntryId?: string;
  system: string;
  identification: string;
  /** Value - the classification value/code */
  value?: string;
  name: string;
  /** URI reference for this classification item */
  uri?: string;
  description?: string;
  location?: string;
  sort?: string;
  readOnly?: boolean;
  code?: string;
  /** Constraint type for classification value */
  constraint?: "FILLED" | "ENUM" | "PATTERN";
  /** Occurrence: required / prohibited / optional. Primární klasifikace je vždy required. */
  occurrence?: "required" | "prohibited" | "optional";
  /** If true, this classification is used in applicability section (not requirements) */
  isApplicability?: boolean;
}

export interface MaterialRequirement extends RequirementBase {
  /** Occurrence of the material requirement */
  occurrence?: "required" | "prohibited" | "optional";
  /** Category mode - how the category value is defined */
  categoryMode?: "NONE" | "SIMPLE" | "ENUM";
  /** Category - can be custom value or selected from codelist */
  category?: string;
  /** URI reference for the material */
  uri?: string;
  /** Constraint type for material value */
  constraint?: "FILLED" | "ENUM" | "PATTERN" | "RANGE" | "LENGTH";
  /** Value based on constraint type */
  value?: string;
  /** @deprecated Use occurrence instead */
  required: boolean;
  /** @deprecated Use category instead */
  materialType?: "SINGLE" | "LAYER" | "PROFILE" | "CONSTITUENT";
  note?: string;
  /** If true, this material is used in applicability section (not requirements) */
  isApplicability?: boolean;
}

export interface ObjectRequirements {
  attributes: AttributeRequirement[];
  properties: PropertyRequirement[];
  relations: RelationRequirement[];
  classifications: ClassificationRequirement[];
  materials: MaterialRequirement[];
}

export interface ProjectObject {
  code: string;
  description: string;
  ifcEntity: string;
  predefinedType: PredefinedTypeSelection;
  /** Phases for which the IfcEntity requirement applies. At least one required. */
  ifcEntityPhases?: string[];
  /** Phases for which the PredefinedType requirement applies. At least one required when PredefinedType is set. */
  predefinedTypePhases?: string[];
  /** @deprecated Use ifcEntityPhases and predefinedTypePhases instead. */
  entityPhases?: string[];
  requirements: ObjectRequirements;
}

export interface CodeList {
  /** Unique identifier */
  id: string;
  /** Human-readable name shown in UI */
  name: string;
  /** Allowed values (enumeration entries) */
  values: string[];
  /** Optional note/description */
  note?: string;
}

/** Entry in the classification systems list (for dropdown selection in classification requirements) */
export interface ClassificationSystemEntry {
  /** Unique identifier */
  id: string;
  /** Name of the classification system (e.g., "CCI-CZ", "Uniclass 2015") */
  name: string;
  /** Optional URI/link to the classification system specification */
  uri?: string;
  /** Optional description */
  description?: string;
  /** Hierarchical structure of classification items */
  nodes?: ClassificationNode[];
  /** Original source file name */
  sourceName?: string;
  /** Hash for change detection */
  hash?: string;
  /** Whether this is the primary classification for object structure */
  isPrimary?: boolean;
}

export interface Project {
  projectId: string;
  name: string;
  /** Author of the project */
  author?: string;
  /** Project description */
  description?: string;
  createdAt: string;
  updatedAt: string;
  ifcSchemaVersion: "IFC4X3";
  /** Display version of IFC schema (e.g., "IFC 4.3 ADD2 TC1") */
  ifcSchemaVersionDisplay?: string;
  classification: ClassificationData;
  classifications: ClassificationSystem[];
  primaryClassificationId: string;
  phases: Phase[];
  objects: Record<string, ProjectObject>;
  /** User-managed code lists for ENUM (výčet) restrictions */
  codeLists?: CodeList[];
  /** User-managed list of classification systems for dropdown selection */
  classificationSystemEntries?: ClassificationSystemEntry[];
}

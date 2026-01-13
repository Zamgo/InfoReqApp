import type { ClassificationData, ClassificationSystem } from "../classification/types";

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
  constraint: "EXISTS" | "EQUALS" | "PATTERN" | "ENUM";
  value?: string;
  allowedValues?: string[];
  note?: string;
}

export interface PropertyRequirement extends RequirementBase {
  source: "PSET" | "QTO" | "CUSTOM";
  psetName: string;
  propertyName: string;
  dataType: string;
  required: boolean;
  constraint?: "EXISTS" | "EQUALS" | "PATTERN" | "RANGE";
  value?: string;
  unit?: string;
  note?: string;
}

export interface RelationRequirement extends RequirementBase {
  relationType:
    | "IFCRELAGGREGATES"
    | "IFCRELASSIGNSTOGROUP"
    | "IFCRELCONTAINEDINSPATIALSTRUCTURE"
    | "IFCRELNESTS"
    | "IFCRELVOIDSELEMENT"
    | "IFCRELFILLSELEMENT";
  targetType?: string;
  minCardinality?: number;
  maxCardinality?: number;
  note?: string;
}

export interface ClassificationRequirement extends RequirementBase {
  classificationId: string;
  system: string;
  identification: string;
  name: string;
  description?: string;
  location?: string;
  sort?: string;
  readOnly?: boolean;
  code?: string;
}

export interface MaterialRequirement extends RequirementBase {
  required: boolean;
  materialType?: "SINGLE" | "LAYER" | "PROFILE" | "CONSTITUENT";
  note?: string;
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
  requirements: ObjectRequirements;
}

export interface Project {
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  ifcSchemaVersion: "IFC4X3";
  classification: ClassificationData;
  classifications: ClassificationSystem[];
  primaryClassificationId: string;
  phases: Phase[];
  objects: Record<string, ProjectObject>;
}

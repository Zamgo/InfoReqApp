export interface ClassificationNode {
  code: string;
  description: string;
  level: number;
  category?: string;
  ifcEntity?: string;
  predefinedType?: string;
  /** Mapped values from other classification systems (systemEntryId -> code) */
  mappedValues?: Record<string, string>;
  children: ClassificationNode[];
}

/**
 * IfcClassification entity attributes according to IFC 4x3 schema
 * @see https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcClassification.htm
 */
export interface IfcClassification {
  /** Name of the classification system (required) */
  Name: string;
  /** Source/publisher of the classification system */
  Source?: string;
  /** Edition or version identifier */
  Edition?: string;
  /** Date of the edition */
  EditionDate?: string;
  /** Description of the classification */
  Description?: string;
  /** URI to the classification specification/documentation */
  Specification?: string;
  /** Tokens used for parsing classification references */
  ReferenceTokens?: string[];
}

/**
 * Represents a classification system with its hierarchy and IFC metadata
 */
export interface ClassificationSystem {
  /** Unique identifier for this classification in the project */
  id: string;
  /** IFC classification metadata */
  ifcClassification: IfcClassification;
  /** Hierarchical structure of classification items */
  nodes: ClassificationNode[];
  /** Original source file name */
  sourceName: string;
  /** Hash for change detection */
  hash?: string;
  /** Whether this is the primary classification for object structure */
  isPrimary: boolean;
  /** Creation timestamp */
  createdAt: string;
}

/** Legacy support - ClassificationData maps to a single ClassificationSystem */
export interface ClassificationData {
  nodes: ClassificationNode[];
  sourceName: string;
  hash?: string;
}

import type {
  Project,
  ProjectObject,
  AttributeRequirement,
  PropertyRequirement,
  ClassificationRequirement,
  MaterialRequirement,
} from "../project/types";

const IDS_NAMESPACE = "http://standards.buildingsmart.org/IDS";
const XS_NAMESPACE = "http://www.w3.org/2001/XMLSchema";
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";
const IDS_SCHEMA_LOCATION = "http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd";

interface IDSExportOptions {
  project: Project;
  phaseId: string;
  /** If provided, only export these object codes */
  objectCodes?: string[];
}

/**
 * Escape special XML characters
 */
const escapeXml = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

/**
 * Generate idsValue content (either simpleValue or restriction)
 */
const generateIdsValueContent = (value: string, constraint?: string, indent = ""): string => {
  if (!value) return "";
  
  if (constraint === "ENUM" && value.includes("|")) {
    // Multiple values - use xs:restriction with enumeration
    const values = value.split("|").map((v) => v.trim()).filter(Boolean);
    const enumerations = values.map((v) => `${indent}  <xs:enumeration value="${escapeXml(v)}"/>`).join("\n");
    return `${indent}<xs:restriction base="xs:string">\n${enumerations}\n${indent}</xs:restriction>`;
  } else if (constraint === "PATTERN") {
    return `${indent}<xs:restriction base="xs:string">\n${indent}  <xs:pattern value="${escapeXml(value)}"/>\n${indent}</xs:restriction>`;
  }
  
  // Simple value
  return `${indent}<ids:simpleValue>${escapeXml(value)}</ids:simpleValue>`;
};

/**
 * Convert occurrence to IDS cardinality
 */
const getCardinality = (occurrence?: "required" | "prohibited" | "optional"): string => {
  switch (occurrence) {
    case "prohibited":
      return "prohibited";
    case "optional":
      return "optional";
    default:
      return "required";
  }
};

/**
 * Generate attribute element for requirements
 */
const generateAttribute = (attr: AttributeRequirement, indent: string): string => {
  const cardinality = getCardinality(attr.occurrence);
  const instructions = attr.note ? ` instructions="${escapeXml(attr.note)}"` : "";
  
  const lines: string[] = [];
  lines.push(`${indent}<ids:attribute cardinality="${cardinality}"${instructions}>`);
  lines.push(`${indent}  <ids:name>`);
  lines.push(`${indent}    <ids:simpleValue>${escapeXml(attr.attribute)}</ids:simpleValue>`);
  lines.push(`${indent}  </ids:name>`);
  
  if (attr.value) {
    lines.push(`${indent}  <ids:value>`);
    lines.push(generateIdsValueContent(attr.value, attr.constraint, `${indent}    `));
    lines.push(`${indent}  </ids:value>`);
  }
  
  lines.push(`${indent}</ids:attribute>`);
  return lines.join("\n");
};

/**
 * Generate property element for requirements
 */
const generateProperty = (prop: PropertyRequirement, indent: string): string => {
  const cardinality = getCardinality(prop.occurrence);
  const instructions = prop.note ? ` instructions="${escapeXml(prop.note)}"` : "";
  const dataType = prop.dataType ? ` dataType="${escapeXml(prop.dataType.toUpperCase())}"` : "";
  
  const lines: string[] = [];
  lines.push(`${indent}<ids:property cardinality="${cardinality}"${dataType}${instructions}>`);
  lines.push(`${indent}  <ids:propertySet>`);
  lines.push(`${indent}    <ids:simpleValue>${escapeXml(prop.psetName)}</ids:simpleValue>`);
  lines.push(`${indent}  </ids:propertySet>`);
  lines.push(`${indent}  <ids:baseName>`);
  lines.push(`${indent}    <ids:simpleValue>${escapeXml(prop.propertyName)}</ids:simpleValue>`);
  lines.push(`${indent}  </ids:baseName>`);
  
  if (prop.value) {
    lines.push(`${indent}  <ids:value>`);
    lines.push(generateIdsValueContent(prop.value, prop.constraint, `${indent}    `));
    lines.push(`${indent}  </ids:value>`);
  }
  
  lines.push(`${indent}</ids:property>`);
  return lines.join("\n");
};

/**
 * Generate classification element
 */
const generateClassification = (cls: ClassificationRequirement, isApplicability: boolean, indent: string): string => {
  const cardinality = isApplicability ? "" : ` cardinality="required"`;
  const uri = cls.uri ? ` uri="${escapeXml(cls.uri)}"` : "";
  
  const lines: string[] = [];
  lines.push(`${indent}<ids:classification${cardinality}${uri}>`);
  
  // Value comes before system according to IDS schema
  if (cls.value || cls.identification) {
    const value = cls.value || cls.identification;
    lines.push(`${indent}  <ids:value>`);
    lines.push(generateIdsValueContent(value, cls.constraint, `${indent}    `));
    lines.push(`${indent}  </ids:value>`);
  }
  
  lines.push(`${indent}  <ids:system>`);
  lines.push(`${indent}    <ids:simpleValue>${escapeXml(cls.system)}</ids:simpleValue>`);
  lines.push(`${indent}  </ids:system>`);
  lines.push(`${indent}</ids:classification>`);
  
  return lines.join("\n");
};

/**
 * Generate material element for requirements
 */
const generateMaterial = (mat: MaterialRequirement, indent: string): string => {
  const cardinality = getCardinality(mat.occurrence);
  const uri = mat.uri ? ` uri="${escapeXml(mat.uri)}"` : "";
  const instructions = mat.note ? ` instructions="${escapeXml(mat.note)}"` : "";
  
  const lines: string[] = [];
  lines.push(`${indent}<ids:material cardinality="${cardinality}"${uri}${instructions}>`);
  
  if (mat.value) {
    lines.push(`${indent}  <ids:value>`);
    lines.push(generateIdsValueContent(mat.value, mat.constraint, `${indent}    `));
    lines.push(`${indent}  </ids:value>`);
  }
  
  lines.push(`${indent}</ids:material>`);
  return lines.join("\n");
};

/**
 * Check if a requirement applies to a given phase
 */
const requirementAppliesToPhase = (req: { phases?: string[] }, phaseId: string): boolean => {
  // If no phases specified, requirement does NOT apply to any specific phase
  if (!req.phases || req.phases.length === 0) return false;
  return req.phases.includes(phaseId);
};

/**
 * Check if property is valid (has proper pset name and property name, not temporary)
 */
const isValidProperty = (prop: PropertyRequirement): boolean => {
  // Filter out properties with temporary pset names or empty names
  if (!prop.psetName || prop.psetName.startsWith("_NEW_")) return false;
  if (!prop.propertyName || prop.propertyName.trim() === "") return false;
  return true;
};

/**
 * Generate a specification element for a single object
 */
const generateSpecification = (obj: ProjectObject, phaseId: string, phaseName: string): string | null => {
  // Filter requirements for this phase, and filter out invalid/incomplete requirements
  const attributes = obj.requirements.attributes.filter((r) => requirementAppliesToPhase(r, phaseId) && r.attribute);
  const properties = obj.requirements.properties.filter((r) => requirementAppliesToPhase(r, phaseId) && isValidProperty(r));
  const classifications = obj.requirements.classifications.filter((r) => requirementAppliesToPhase(r, phaseId));
  const materials = obj.requirements.materials.filter((r) => requirementAppliesToPhase(r, phaseId));
  
  // Find applicability classification (primary/readOnly)
  const applicabilityClassifications = classifications.filter((c) => c.isApplicability || c.readOnly);
  const requirementClassifications = classifications.filter((c) => !c.isApplicability && !c.readOnly);
  
  // If no entity, skip this specification (entity is required for applicability)
  if (!obj.ifcEntity) {
    return null;
  }
  
  // If no requirements for this phase, skip
  const hasRequirements = attributes.length > 0 || properties.length > 0 || 
    requirementClassifications.length > 0 || materials.length > 0;
  
  if (!hasRequirements) {
    return null;
  }
  
  const specName = `${obj.code} - ${obj.description}`;
  const specDescription = `Požadavky pro fázi ${phaseName}`;
  
  const lines: string[] = [];
  lines.push(`    <ids:specification name="${escapeXml(specName)}" ifcVersion="IFC4X3_ADD2" description="${escapeXml(specDescription)}">`);
  
  // Applicability section - minOccurs="1" means at least one matching element must exist
  lines.push(`      <ids:applicability minOccurs="1" maxOccurs="unbounded">`);
  
  // Entity (required) - must be UPPERCASE for IDS validity
  lines.push(`        <ids:entity>`);
  lines.push(`          <ids:name>`);
  lines.push(`            <ids:simpleValue>${escapeXml(obj.ifcEntity.toUpperCase())}</ids:simpleValue>`);
  lines.push(`          </ids:name>`);
  if (obj.predefinedType.mode === "ENUM" && obj.predefinedType.value) {
    lines.push(`          <ids:predefinedType>`);
    lines.push(`            <ids:simpleValue>${escapeXml(obj.predefinedType.value.toUpperCase())}</ids:simpleValue>`);
    lines.push(`          </ids:predefinedType>`);
  }
  lines.push(`        </ids:entity>`);
  
  // Applicability classifications
  applicabilityClassifications.forEach((cls) => {
    lines.push(generateClassification(cls, true, "        "));
  });
  
  lines.push(`      </ids:applicability>`);
  
  // Requirements section
  if (hasRequirements) {
    lines.push(`      <ids:requirements>`);
    
    attributes.forEach((attr) => {
      lines.push(generateAttribute(attr, "        "));
    });
    
    properties.forEach((prop) => {
      lines.push(generateProperty(prop, "        "));
    });
    
    requirementClassifications.forEach((cls) => {
      lines.push(generateClassification(cls, false, "        "));
    });
    
    materials.forEach((mat) => {
      lines.push(generateMaterial(mat, "        "));
    });
    
    lines.push(`      </ids:requirements>`);
  }
  
  lines.push(`    </ids:specification>`);
  
  return lines.join("\n");
};

/**
 * Generate complete IDS XML document
 */
export const generateIDS = (options: IDSExportOptions): string => {
  const { project, phaseId, objectCodes } = options;
  
  const phase = project.phases.find((p) => p.id === phaseId);
  if (!phase) {
    throw new Error(`Phase ${phaseId} not found`);
  }
  
  // Get objects to export
  let objectsToExport = Object.values(project.objects);
  if (objectCodes && objectCodes.length > 0) {
    objectsToExport = objectsToExport.filter((obj) => objectCodes.includes(obj.code));
  }
  
  // Generate specifications
  const specifications = objectsToExport
    .map((obj) => generateSpecification(obj, phaseId, phase.name))
    .filter((spec): spec is string => spec !== null);
  
  if (specifications.length === 0) {
    throw new Error(`Žádné požadavky pro fázi "${phase.name}"`);
  }
  
  // Format date
  const today = new Date().toISOString().split("T")[0];
  
  // Build IDS document with proper namespace declarations
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<ids:ids xmlns:ids="${IDS_NAMESPACE}" xmlns:xs="${XS_NAMESPACE}" xmlns:xsi="${XSI_NAMESPACE}" xsi:schemaLocation="${IDS_SCHEMA_LOCATION}">`);
  lines.push(`  <ids:info>`);
  lines.push(`    <ids:title>${escapeXml(project.name)} - ${escapeXml(phase.name)}</ids:title>`);
  if (project.description) {
    lines.push(`    <ids:description>${escapeXml(project.description)}</ids:description>`);
  }
  if (project.author) {
    lines.push(`    <ids:author>${escapeXml(project.author)}</ids:author>`);
  }
  lines.push(`    <ids:date>${today}</ids:date>`);
  lines.push(`    <ids:purpose>Informační požadavky pro BIM model</ids:purpose>`);
  lines.push(`    <ids:milestone>${escapeXml(phase.code)}</ids:milestone>`);
  lines.push(`  </ids:info>`);
  lines.push(`  <ids:specifications>`);
  
  specifications.forEach((spec) => {
    lines.push(spec);
  });
  
  lines.push(`  </ids:specifications>`);
  lines.push(`</ids:ids>`);
  
  return lines.join("\n");
};

/**
 * Export IDS to file
 */
export const exportIDSFile = (ids: string, filename: string): void => {
  const blob = new Blob([ids], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".ids") ? filename : `${filename}.ids`;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Export multiple IDS files as ZIP
 */
export const exportIDSZip = async (
  files: Array<{ filename: string; content: string }>,
  zipFilename: string
): Promise<void> => {
  // Dynamic import of JSZip
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  
  files.forEach(({ filename, content }) => {
    zip.file(filename, content);
  });
  
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = zipFilename.endsWith(".zip") ? zipFilename : `${zipFilename}.zip`;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Get objects that have requirements for a given phase
 */
export const getObjectsWithRequirementsForPhase = (
  project: Project,
  phaseId: string
): ProjectObject[] => {
  return Object.values(project.objects).filter((obj) => {
    if (!obj.ifcEntity) return false; // Skip objects without IFC entity
    const { requirements } = obj;
    const hasReqs = 
      requirements.attributes.some((r) => requirementAppliesToPhase(r, phaseId) && r.attribute) ||
      requirements.properties.some((r) => requirementAppliesToPhase(r, phaseId) && isValidProperty(r)) ||
      requirements.classifications.some((r) => requirementAppliesToPhase(r, phaseId) && !r.isApplicability && !r.readOnly) ||
      requirements.materials.some((r) => requirementAppliesToPhase(r, phaseId));
    return hasReqs;
  });
};

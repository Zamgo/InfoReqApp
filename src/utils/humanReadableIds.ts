import type { ProjectObject, Phase, ClassificationSystemEntry } from "../project/types";

const requirementMatchesPhase = (phases: string[] | undefined, phaseId: string | null): boolean => {
  if (phaseId === null) return true;
  if (!phases || phases.length === 0) return true;
  return phases.includes(phaseId);
};

export const filterObjectByPhase = (
  obj: ProjectObject,
  phaseId: string | null
): ProjectObject => {
  if (phaseId === null) return obj;
  return {
    ...obj,
    requirements: {
      attributes: obj.requirements.attributes.filter((a) => requirementMatchesPhase(a.phases, phaseId)),
      properties: obj.requirements.properties.filter((p) => requirementMatchesPhase(p.phases, phaseId)),
      relations: obj.requirements.relations.filter((r) => requirementMatchesPhase(r.phases, phaseId)),
      classifications: obj.requirements.classifications.filter((c) => requirementMatchesPhase(c.phases, phaseId)),
      materials: obj.requirements.materials.filter((m) => requirementMatchesPhase(m.phases, phaseId)),
    },
  };
};

const translateConstraint = (constraint?: string, value?: string, allowedValues?: string[]): string => {
  const c = (constraint ?? "FILLED").toUpperCase();
  const val = value ?? "";
  if (c === "ENUM") {
    const values = (allowedValues && allowedValues.length > 0) ? allowedValues : val.split("|").map((v) => v.trim()).filter(Boolean);
    if (values.length === 0) return "s libovolnou hodnotou";
    if (values.length === 1) return `s hodnotou **${values[0]}**`;
    return `s hodnotou jednou z: ${values.join(", ")}`;
  }
  if (!val) return "s libovolnou hodnotou";
  if (c === "FILLED") return `s hodnotou **${val}**`;
  if (c === "PATTERN") return `s hodnotou odpovídající vzoru ${val}`;
  if (c === "RANGE") {
    const conditions: string[] = [];
    const rangeParts = val.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
    for (const part of rangeParts) {
      if (part.startsWith("min:")) {
        const rest = part.slice(4).trim();
        const [num, kind] = rest.split(":").map((s) => s.trim());
        if (num !== undefined && num !== "") {
          const inclusive = (kind ?? "inclusive").toLowerCase() !== "exclusive";
          conditions.push(inclusive ? `větší nebo rovno **${num}**` : `větší než **${num}**`);
        }
      } else if (part.startsWith("max:")) {
        const rest = part.slice(4).trim();
        const [num, kind] = rest.split(":").map((s) => s.trim());
        if (num !== undefined && num !== "") {
          const inclusive = (kind ?? "inclusive").toLowerCase() !== "exclusive";
          conditions.push(inclusive ? `menší nebo rovno **${num}**` : `menší než **${num}**`);
        }
      } else {
        const trimmed = part.trim();
        if (trimmed.startsWith(">=")) conditions.push(`větší nebo rovno **${trimmed.slice(2).trim()}**`);
        else if (trimmed.startsWith(">")) conditions.push(`větší než **${trimmed.slice(1).trim()}**`);
        else if (trimmed.startsWith("<=")) conditions.push(`menší nebo rovno **${trimmed.slice(2).trim()}**`);
        else if (trimmed.startsWith("<")) conditions.push(`menší než **${trimmed.slice(1).trim()}**`);
      }
    }
    if (conditions.length > 0) return `s hodnotou ${conditions.join(" a ")}`;
    return `s hodnotou v rozmezí ${val}`;
  }
  if (c === "LENGTH") return `s délkou ${val}`;
  return `s hodnotou "${val}"`;
};

export const matchesOccurrenceFilter = (
  occurrence: "required" | "prohibited" | "optional" | undefined,
  filter: "all" | "required" | "prohibited" | "optional"
): boolean => {
  if (filter === "all") return true;
  const actualOccurrence = occurrence || "required";
  return actualOccurrence === filter;
};

export const generateHumanReadable = (
  obj: ProjectObject,
  _phases: Phase[],
  classificationSystemEntries: ClassificationSystemEntry[],
  phaseId: string | null = null,
  occurrenceFilter: "all" | "required" | "prohibited" | "optional" = "all"
): { applicability: string[]; requirements: string[] } => {
  const filteredObj = filterObjectByPhase(obj, phaseId);
  const applicability: string[] = [];
  const requirements: string[] = [];

  if (filteredObj.ifcEntity) {
    applicability.push(`IFC třídu **${filteredObj.ifcEntity}**`);
  }
  const predefinedTypePhasesReadable = obj.predefinedTypePhases ?? obj.entityPhases ?? (phaseId === null ? [] : [phaseId]);
  const predefinedTypeAppliesReadable = phaseId === null ? predefinedTypePhasesReadable.length > 0 : predefinedTypePhasesReadable.length === 0 || predefinedTypePhasesReadable.includes(phaseId);
  if (filteredObj.predefinedType.mode !== "NONE" && filteredObj.predefinedType.value && predefinedTypeAppliesReadable) {
    applicability.push(`s předdefinovaným typem **${filteredObj.predefinedType.value}**`);
  }

  filteredObj.requirements.attributes.forEach((attr) => {
    if (attr.attribute === "PredefinedType") return;
    if (!matchesOccurrenceFilter(attr.occurrence, occurrenceFilter)) return;
    const occurrence = attr.occurrence === "prohibited" ? "NESMÍ" : attr.occurrence === "optional" ? "MŮŽE" : "MUSÍ";
    const constraintText = translateConstraint(attr.constraint, attr.value, attr.allowedValues);
    const line = `atribut **${attr.attribute}** ${constraintText}${attr.dataType ? ` *(${attr.dataType})*` : ""}`;
    if (attr.isApplicability && occurrenceFilter === "all") {
      applicability.push(line);
    } else {
      requirements.push(`**${occurrence}** mít ${line}`);
    }
  });

  filteredObj.requirements.properties.forEach((prop) => {
    if (!prop.psetName || prop.psetName.startsWith("_NEW_") || !prop.propertyName) return;
    if (!matchesOccurrenceFilter(prop.occurrence, occurrenceFilter)) return;
    const occurrence = prop.occurrence === "prohibited" ? "NESMÍ" : prop.occurrence === "optional" ? "MŮŽE" : "MUSÍ";
    const constraintText = translateConstraint(prop.constraint, prop.value, prop.allowedValues);
    const psetType = prop.source === "PSET" ? "property setu" : prop.source === "QTO" ? "quantity setu" : "vlastní sady";
    const line = `vlastnost **${prop.propertyName}** ${psetType} **${prop.psetName}** ${constraintText}${prop.dataType ? ` *(${prop.dataType})*` : ""}`;
    if (prop.isApplicability && occurrenceFilter === "all") {
      applicability.push(line);
    } else {
      requirements.push(`**${occurrence}** mít ${line}`);
    }
  });

  filteredObj.requirements.relations.forEach((rel) => {
    if (!matchesOccurrenceFilter(rel.occurrence, occurrenceFilter)) return;
    const occurrence = rel.occurrence === "prohibited" ? "NESMÍ" : rel.occurrence === "optional" ? "MŮŽE" : "MUSÍ";
    const entityText = rel.entityType ? `IFC třídou **${rel.entityType}**` : "prvkem";
    const predefinedText = rel.entityPredefinedType ? ` s typem **${rel.entityPredefinedType}**` : "";
    const line = `relaci **${rel.relationType}** s ${entityText}${predefinedText}`;
    if (rel.isApplicability && occurrenceFilter === "all") {
      applicability.push(line);
    } else {
      requirements.push(`**${occurrence}** mít ${line}`);
    }
  });

  filteredObj.requirements.classifications.forEach((cls) => {
    if (!cls.system && !cls.value && !cls.name && !cls.systemEntryId) return;
    const entry = cls.systemEntryId ? classificationSystemEntries.find((e) => e.id === cls.systemEntryId) : undefined;
    if (entry?.isIfcSystem) return;
    const systemName = entry?.name || cls.system || cls.name;
    if (cls.isApplicability || cls.readOnly) {
      if (cls.value) {
        applicability.push(`klasifikaci **${cls.value}** ze systému **${systemName}**`);
      } else {
        applicability.push(`klasifikaci ze systému **${systemName}**`);
      }
    } else {
      const occurrence = cls.occurrence === "prohibited" ? "NESMÍ" : cls.occurrence === "optional" ? "MŮŽE" : "MUSÍ";
      if (matchesOccurrenceFilter(cls.occurrence ?? "required", occurrenceFilter)) {
        if (cls.value) {
          requirements.push(`**${occurrence}** mít klasifikaci **${cls.value}** ze systému **${systemName}**`);
        } else {
          requirements.push(`**${occurrence}** mít klasifikaci ze systému **${systemName}**`);
        }
      }
    }
  });

  filteredObj.requirements.materials.forEach((mat) => {
    if (!matchesOccurrenceFilter(mat.occurrence, occurrenceFilter)) return;
    const occurrence = mat.occurrence === "prohibited" ? "NESMÍ" : mat.occurrence === "optional" ? "MŮŽE" : "MUSÍ";
    const matVal = mat.value ?? (mat.category && mat.categoryMode !== "NONE" ? mat.category : "");
    const categoryText = matVal
      ? ` ${translateConstraint(mat.constraint ?? "FILLED", matVal)}`
      : (mat.category && mat.categoryMode !== "NONE" ? ` s kategorií **${mat.category}**` : "");
    const line = `materiál${categoryText}`;
    if (mat.isApplicability && occurrenceFilter === "all") {
      applicability.push(line);
    } else {
      requirements.push(`**${occurrence}** mít ${line}`);
    }
  });

  return { applicability, requirements };
};

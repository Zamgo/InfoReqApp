import type { ClassificationNode } from "../classification/types";
import type { IdsProjectSpecification, ProjectObject } from "../project/types";
import { specificationReferencesEntity } from "./specifications";

function objectPredefinedType(object: ProjectObject): string | undefined {
  if (
    object.predefinedType.mode !== "ENUM" &&
    object.predefinedType.mode !== "USERDEFINED"
  ) {
    return undefined;
  }
  const value = object.predefinedType.value?.trim();
  return value && value !== "NOTDEFINED" ? value : undefined;
}

/** Object codes whose IFC identification matches the entity applicability of a specification. */
export function getIdsSpecificationObjectCodes(
  specification: IdsProjectSpecification,
  objects: Record<string, ProjectObject>,
): Set<string> {
  return new Set(
    Object.entries(objects)
      .filter(([, object]) =>
        specificationReferencesEntity(
          specification,
          object.ifcEntity,
          objectPredefinedType(object),
        ),
      )
      .map(([code]) => code),
  );
}

/**
 * Keeps hierarchy branches that contain at least one addressed object.
 * Parent/grouping nodes are retained, but only matching object leaves remain.
 */
export function filterHierarchyByObjectCodes(
  nodes: ClassificationNode[],
  objectCodes: ReadonlySet<string>,
): ClassificationNode[] {
  const filterNode = (node: ClassificationNode): ClassificationNode | null => {
    const filteredChildren = node.children
      .map(filterNode)
      .filter((child): child is ClassificationNode => child !== null);

    if (filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    if (node.children.length === 0 && objectCodes.has(node.code)) {
      return { ...node, children: [] };
    }
    return null;
  };

  return nodes
    .map(filterNode)
    .filter((node): node is ClassificationNode => node !== null);
}

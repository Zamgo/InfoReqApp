import type { ClassificationData, ClassificationNode } from "./types";

const hashString = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
};

interface ParsedRow {
  code: string;
  description: string;
  level: number;
  category?: string;
  ifcEntity?: string;
}

export const parseClassificationTsv = (
  content: string,
  sourceName: string,
): ClassificationData => {
  const rows: ParsedRow[] = [];
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [codeRaw, descriptionRaw, levelRaw, categoryRaw, ifcEntityRaw] = parts;
    const code = (codeRaw ?? "").trim();
    const description = (descriptionRaw ?? "").trim();
    if (!code && !description) continue;
    const level = Number(levelRaw?.trim());
    const ifcVal = (ifcEntityRaw?.trim() ?? "").trim();
    rows.push({
      code,
      description,
      level: Number.isFinite(level) ? level : rows.length,
      category: categoryRaw?.trim() || undefined,
      ifcEntity: ifcVal || undefined,
    });
  }

  const roots: ClassificationNode[] = [];
  const stack: ClassificationNode[] = [];

  rows.forEach((row) => {
    const node: ClassificationNode = {
      code: row.code,
      description: row.description,
      level: row.level,
      category: row.category,
      ifcEntity: row.ifcEntity,
      children: [],
    };

    while (stack.length && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  });

  return {
    nodes: roots,
    sourceName,
    hash: hashString(content),
  };
};

/**
 * Parse simple list format (e.g. Kategorie RVT): first line = name, rest = one item per line.
 * Produces flat list with level 1, code = description.
 */
export const parseClassificationSimpleList = (
  content: string,
  sourceName: string,
): ClassificationData => {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const nameLine = lines[0] ?? "";
  const itemLines = lines.slice(1);

  const nodes: ClassificationNode[] = itemLines.map((line) => ({
    code: line,
    description: line,
    level: 1,
    children: [],
  }));

  return {
    nodes,
    sourceName: nameLine || sourceName,
    hash: hashString(content),
  };
};

/** Detect format: TSV has tabs in first non-empty line; otherwise simple list */
export const detectClassificationFormat = (content: string): "tsv" | "simple" => {
  const firstLine = content.split(/\r?\n/).find((l) => l.trim().length > 0);
  return firstLine && firstLine.includes("\t") ? "tsv" : "simple";
};

export const findNodeByCode = (
  nodes: ClassificationNode[],
  code: string,
): ClassificationNode | undefined => {
  for (const node of nodes) {
    if (node.code === code) return node;
    const child = findNodeByCode(node.children, code);
    if (child) return child;
  }
  return undefined;
};

/** Vrátí cestu od kořene k uzlu se zadaným kódem (včetně uzlu). */
export const getPathToNode = (
  nodes: ClassificationNode[],
  code: string,
  path: ClassificationNode[] = []
): ClassificationNode[] | null => {
  for (const node of nodes) {
    const currentPath = [...path, node];
    if (node.code === code) return currentPath;
    const found = getPathToNode(node.children, code, currentPath);
    if (found) return found;
  }
  return null;
};

export const filterTree = (
  nodes: ClassificationNode[],
  query: string,
): ClassificationNode[] => {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  const matches = (node: ClassificationNode) =>
    node.code.toLowerCase().includes(q) ||
    node.description.toLowerCase().includes(q);

  const recurse = (current: ClassificationNode[]): ClassificationNode[] =>
    current
      .map((node) => {
        const filteredChildren = recurse(node.children);
        if (matches(node) || filteredChildren.length) {
          return { ...node, children: filteredChildren };
        }
        return matches(node) ? { ...node, children: [] } : null;
      })
      .filter(Boolean) as ClassificationNode[];

  return recurse(nodes);
};

export const collectLeaves = (nodes: ClassificationNode[]): ClassificationNode[] =>
  nodes.flatMap((node) =>
    node.children.length ? collectLeaves(node.children) : [node],
  );

/** Zploští strom uzlů na pole řádků (pořadí pre-order, včetně úrovně). */
export const flattenNodesToRows = (nodes: ClassificationNode[]): ClassificationNode[] => {
  const result: ClassificationNode[] = [];
  const traverse = (list: ClassificationNode[]) => {
    for (const node of list) {
      result.push(node);
      if (node.children.length) traverse(node.children);
    }
  };
  traverse(nodes);
  return result;
};

/** Přidá nový list jako sourozence uzlu se zadaným code; vrací nový strom (imutabilně). */
export const addNodeAsSibling = (
  nodes: ClassificationNode[],
  siblingCode: string,
  newNode: ClassificationNode,
): ClassificationNode[] => {
  const idx = nodes.findIndex((n) => n.code === siblingCode);
  if (idx >= 0) {
    const result = [...nodes];
    result.splice(idx + 1, 0, newNode);
    return result;
  }
  return nodes.map((node) => {
    if (node.children.length > 0) {
      const childIdx = node.children.findIndex((c) => c.code === siblingCode);
      if (childIdx >= 0) {
        const newChildren = [...node.children];
        newChildren.splice(childIdx + 1, 0, newNode);
        return { ...node, children: newChildren };
      }
      return { ...node, children: addNodeAsSibling(node.children, siblingCode, newNode) };
    }
    return node;
  });
};

/** Odstraní list (uzel bez dětí) se zadaným code ze stromu; vrací nový strom (imutabilně). Prázdné větve se odstraňují. */
export const removeNodeByCode = (
  nodes: ClassificationNode[],
  code: string,
): ClassificationNode[] => {
  return nodes
    .map((node) => {
      if (node.children.length > 0) {
        const filtered = removeNodeByCode(node.children, code);
        if (filtered.length === 0) return null;
        return { ...node, children: filtered };
      }
      if (node.code === code) return null;
      return node;
    })
    .filter(Boolean) as ClassificationNode[];
};

/** Aktualizuje mappedValues u uzlu se zadaným code (listu i vnitřního); vrací nový strom (imutabilně). */
export const updateLeafMappedValue = (
  nodes: ClassificationNode[],
  code: string,
  systemId: string,
  value: string,
): ClassificationNode[] =>
  nodes.map((node) => {
    if (node.code === code) {
      return { ...node, mappedValues: { ...(node.mappedValues ?? {}), [systemId]: value } };
    }
    if (node.children.length) {
      return { ...node, children: updateLeafMappedValue(node.children, code, systemId, value) };
    }
    return node;
  });

/** Aktualizuje ifcEntity a predefinedType u uzlu se zadaným code; vrací nový strom (imutabilně). */
export const updateLeafIfcEntityPredefinedType = (
  nodes: ClassificationNode[],
  code: string,
  ifcEntity: string,
  predefinedType: string,
): ClassificationNode[] =>
  nodes.map((node) => {
    if (node.code === code) {
      return {
        ...node,
        ifcEntity: ifcEntity || undefined,
        predefinedType: predefinedType || undefined,
      };
    }
    if (node.children.length) {
      return {
        ...node,
        children: updateLeafIfcEntityPredefinedType(node.children, code, ifcEntity, predefinedType),
      };
    }
    return node;
  });

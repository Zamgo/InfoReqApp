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

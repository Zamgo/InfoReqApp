import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeIdsClassificationImport,
  idsValueAlternatives,
  mergeIdsIntoProjectWithReport,
  type IdsParsed,
} from "../src/import/ids.ts";
import { collectLeaves } from "../src/classification/parser.ts";
import { buildClassificationFromSchemaFiltered } from "../src/classification/ifcTree.ts";
import { generateIDS } from "../src/export/ids.ts";
import type { ClassificationSystemEntry } from "../src/project/types.ts";
import type { SchemaIndex } from "../src/schema/types.ts";
import {
  isIdsProjectedRequirement,
  projectIdsRequirementsForEntity,
  withoutIdsProjectedRequirements,
} from "../src/ids/requirementProjection.ts";
import {
  filterHierarchyByObjectCodes,
  getIdsSpecificationObjectCodes,
} from "../src/ids/hierarchyContext.ts";
import { buildIdsSpecificationOrdinalIndex } from "../src/ids/specifications.ts";

const schema: SchemaIndex = {
  entities: {
    IfcWall: {
      name: "IfcWall",
      attributes: [],
      standardPsets: [],
      standardQtoSets: [],
      predefinedTypeValues: [],
      abstract: false,
    },
    IfcDoor: {
      name: "IfcDoor",
      attributes: [],
      standardPsets: [],
      standardQtoSets: [],
      predefinedTypeValues: ["USERDEFINED"],
      abstract: false,
    },
  },
  psets: {},
  qtos: {},
  dataTypes: [],
};

test("IDS specification ordinals remain tied to the original project order after filtering", () => {
  const ordinals = buildIdsSpecificationOrdinalIndex([
    { id: "spec-a" },
    { id: "spec-b" },
    { id: "spec-c" },
  ]);
  const filteredIds = ["spec-c"];

  assert.equal(ordinals.get(filteredIds[0]!), 3);
  assert.equal(ordinals.get("spec-a"), 1);
});

const parsed: IdsParsed = {
  info: { title: "Test IDS" },
  specifications: [
    {
      name: "Dva IFC typy se dvěma aspekty",
      identifier: "spec-1",
      ifcVersion: "IFC4X3_ADD2",
      applicability: {
        entity: {
          name: "IFCWALL",
          nameAlternatives: ["IFCWALL", "IFCDOOR"],
        },
        partOf: [],
        classification: [
          {
            system: "RDS - Zóna",
            value: "^DB08.*",
            valueRestriction: { pattern: "^DB08.*" },
          },
          {
            system: "RDS - Funkční systém",
            value: "^F09.*",
            valueRestriction: { pattern: "^F09.*" },
          },
        ],
        attribute: [],
        property: [],
        material: [],
      },
      requirements: {
        entity: [],
        partOf: [],
        classification: [],
        attribute: [],
        property: [],
        material: [],
      },
    },
  ],
};

test("entity enumerations remain logical alternatives", () => {
  assert.deepEqual(
    idsValueAlternatives({ enumerations: ["IFCWALL", "IFCDOOR"] }),
    ["IFCWALL", "IFCDOOR"],
  );
});

test("IFC tree keeps a generic entity beside its typed alternative", () => {
  const tree = buildClassificationFromSchemaFiltered(
    schema,
    new Set(["IfcDoor", "IfcDoor::USERDEFINED"]),
  );
  assert.deepEqual(
    collectLeaves(tree.nodes).map((node) => node.code).sort(),
    ["IfcDoor", "IfcDoor::USERDEFINED"],
  );
});

test("catalog analysis distinguishes exact, probable and unavailable matches", () => {
  const withUri: IdsParsed = structuredClone(parsed);
  withUri.specifications[0]!.applicability.classification[0]!.uri = "https://example.test/rds-zone";

  const catalogs: ClassificationSystemEntry[] = [
    {
      id: "uri-catalog",
      name: "Jiný zobrazovaný název",
      uri: "https://example.test/rds-zone/",
      nodes: [],
      systemKind: "classification",
    },
    {
      id: "name-catalog",
      name: "RDS - Funkční systém",
      nodes: [],
      systemKind: "classification",
    },
  ];
  const analysis = analyzeIdsClassificationImport(withUri, catalogs);
  const zone = analysis.systems.find((system) => system.name === "RDS - Zóna");
  const functional = analysis.systems.find((system) => system.name === "RDS - Funkční systém");

  assert.equal(zone?.status, "exact");
  assert.equal(zone?.matchedEntryId, "uri-catalog");
  assert.equal(functional?.status, "probable");
  assert.equal(functional?.matchedEntryId, "name-catalog");

  const unavailable = analyzeIdsClassificationImport(parsed, []);
  assert.ok(unavailable.systems.every((system) => system.status === "unavailable"));
});

test("import expands IFC alternatives and preserves auxiliary aspect rules with AND grouping", () => {
  const analysis = analyzeIdsClassificationImport(parsed, []);
  const resolutions = analysis.systems.map((system) => ({
    usageKey: system.key,
    mode: "auxiliary" as const,
  }));
  const result = mergeIdsIntoProjectWithReport(parsed, null, schema, {
    catalogResolutions: resolutions,
    addImportedIfcEntitiesToHierarchy: true,
  });

  assert.deepEqual(Object.keys(result.project.objects).sort(), ["IfcDoor", "IfcWall"]);
  assert.ok(!Object.keys(result.project.objects).some((code) => code.includes("|")));
  assert.deepEqual(
    collectLeaves(result.project.classification.nodes).map((node) => node.code).sort(),
    ["IfcDoor", "IfcWall"],
  );

  const auxiliary = result.project.classificationSystemEntries?.find(
    (entry) => entry.isAuxiliaryAspectSystem,
  );
  assert.ok(auxiliary);
  assert.equal(auxiliary.nodes?.length, 1);
  assert.equal(auxiliary.nodes?.[0]?.description, "RDS (organizační skupina aspektů)");
  assert.deepEqual(
    auxiliary.nodes?.[0]?.children.map((node) => node.description).sort(),
    ["Funkční systém", "Zóna"],
  );
  assert.deepEqual(
    collectLeaves(auxiliary.nodes ?? []).map((node) => node.description).sort(),
    ["^DB08.*", "^F09.*"],
  );

  const importedClassifications = result.project.objects.IfcWall!.requirements.classifications.filter(
    (item) => typeof item.extensions.idsSpecificationGroupId === "string",
  );
  assert.equal(importedClassifications.length, 0);
  assert.equal(result.project.objects.IfcWall!.importedIdsSpecificationGroups, undefined);
  assert.equal(result.project.idsSpecifications?.length, 1);
  const canonical = result.project.idsSpecifications?.[0];
  assert.equal(canonical?.minOccurs, 0);
  assert.equal(canonical?.maxOccurs, "unbounded");
  const canonicalEntity = canonical?.applicability.find((facet) => facet.kind === "entity");
  assert.deepEqual(
    canonicalEntity?.kind === "entity" ? canonicalEntity.name.enumerations : undefined,
    ["IFCWALL", "IFCDOOR"],
  );
  const canonicalClassifications = canonical?.applicability.filter(
    (facet) => facet.kind === "classification",
  ) ?? [];
  assert.deepEqual(
    canonicalClassifications.map((facet) => facet.kind === "classification" ? facet.value?.pattern : undefined),
    ["^DB08.*", "^F09.*"],
  );
  assert.ok(canonicalClassifications.every(
    (facet) => facet.kind === "classification" && facet.unresolved,
  ));
  const projected = projectIdsRequirementsForEntity(result.project, "IfcWall", undefined, schema);
  assert.equal(projected.classifications.length, 2);
  assert.deepEqual(
    projected.classifications.map((item) => item.value),
    ["^DB08.*", "^F09.*"],
  );
  assert.ok(projected.classifications.every(isIdsProjectedRequirement));
  assert.equal(
    withoutIdsProjectedRequirements(projected).classifications.length,
    0,
  );
  const exported = generateIDS({
    project: result.project,
    phaseId: result.project.phases[0]!.id,
  });
  assert.equal((exported.match(/<ids:specification /g) ?? []).length, 1);
  assert.match(exported, /<ids:applicability minOccurs="0" maxOccurs="unbounded">/);
  assert.match(exported, /<xs:enumeration value="IFCWALL"\/>/);
  assert.match(exported, /<xs:enumeration value="IFCDOOR"\/>/);
  assert.match(exported, /<xs:pattern value="\^DB08\.\*"\/>/);
  assert.doesNotMatch(exported, /Pomocné klasifikační aspekty/);
  assert.equal(result.report.preservedClassificationRules, 2);
  assert.deepEqual(result.report.auxiliarySystems.sort(), ["RDS - Funkční systém", "RDS - Zóna"]);
});

test("reimport replaces canonical specification and does not rematerialize entity requirements", () => {
  const first = mergeIdsIntoProjectWithReport(parsed, null, schema);
  const second = mergeIdsIntoProjectWithReport(parsed, first.project, schema);
  const wall = second.project.objects.IfcWall!;
  const importedClassifications = wall.requirements.classifications.filter(
    (item) => item.isApplicability && !item.readOnly,
  );

  assert.equal(wall.importedIdsSpecificationGroups, undefined);
  assert.equal(importedClassifications.length, 0);
  assert.equal(second.project.idsSpecifications?.length, 1);
});

test("focused IDS specification filters every hierarchy view through addressed object codes", () => {
  const result = mergeIdsIntoProjectWithReport(parsed, null, schema);
  const specification = result.project.idsSpecifications?.[0]!;
  const addressedCodes = getIdsSpecificationObjectCodes(
    specification,
    result.project.objects,
  );

  assert.deepEqual([...addressedCodes].sort(), ["IfcDoor", "IfcWall"]);

  const onlyWall = filterHierarchyByObjectCodes(
    result.project.classification.nodes,
    new Set(["IfcWall"]),
  );
  assert.deepEqual(
    collectLeaves(onlyWall).map((node) => node.code),
    ["IfcWall"],
  );
});

test("canonical import preserves occurrence, name patterns and partOf alternatives", () => {
  const regression: IdsParsed = {
    info: { title: "Regression" },
    specifications: [{
      name: "Zakaz a patterny",
      ifcVersion: "IFC4X3_ADD2",
      minOccurs: 0,
      maxOccurs: 0,
      applicability: {
        entity: {
          name: "IFCSPACE",
          nameAlternatives: ["IFCSPACE", "IFCBUILDINGSTOREY"],
          nameRestriction: { enumerations: ["IFCSPACE", "IFCBUILDINGSTOREY"] },
        },
        classification: [{
          system: "RDS - (Funkcni|Technicky) system",
          systemRestriction: { pattern: "RDS - (Funkcni|Technicky) system" },
          value: "^DB08.*",
          valueRestriction: { pattern: "^DB08.*" },
        }],
        property: [{
          propertySet: ".*",
          propertySetRestriction: { pattern: ".*" },
          baseName: "Name",
          baseNameRestriction: { simpleValue: "Name" },
          dataType: "IfcLabel",
        }],
        partOf: [],
        attribute: [],
        material: [],
      },
      requirements: {
        entity: [],
        partOf: [{
          relation: "IFCRELAGGREGATES",
          cardinality: "required",
          entity: {
            name: "IFCSPACE",
            nameAlternatives: ["IFCSPACE", "IFCBUILDINGSTOREY"],
            nameRestriction: { enumerations: ["IFCSPACE", "IFCBUILDINGSTOREY"] },
          },
        }],
        classification: [],
        attribute: [],
        property: [],
        material: [],
      },
    }],
  };
  const result = mergeIdsIntoProjectWithReport(regression, null, null);
  const specification = result.project.idsSpecifications?.[0]!;
  const classification = specification.applicability.find((facet) => facet.kind === "classification");
  const property = specification.applicability.find((facet) => facet.kind === "property");
  const partOf = specification.requirements.find((facet) => facet.kind === "partOf");

  assert.equal(specification.minOccurs, 0);
  assert.equal(specification.maxOccurs, 0);
  assert.equal(
    classification?.kind === "classification" ? classification.system.pattern : undefined,
    "RDS - (Funkcni|Technicky) system",
  );
  assert.equal(
    property?.kind === "property" ? property.propertySet.pattern : undefined,
    ".*",
  );
  assert.deepEqual(
    partOf?.kind === "partOf" ? partOf.entity.name.enumerations : undefined,
    ["IFCSPACE", "IFCBUILDINGSTOREY"],
  );
  const projected = projectIdsRequirementsForEntity(
    result.project,
    "IfcSpace",
    undefined,
    null,
  );
  assert.equal(projected.properties[0]?.psetName, "vzor .*");
  assert.equal(projected.properties[0]?.isApplicability, true);
  assert.equal(projected.classifications[0]?.constraint, "PATTERN");
  assert.equal(projected.classifications[0]?.value, "^DB08.*");
  assert.deepEqual(
    projected.relations[0]?.extensions.idsEntityAlternatives,
    ["IFCSPACE", "IFCBUILDINGSTOREY"],
  );
  const exported = generateIDS({
    project: result.project,
    phaseId: result.project.phases[0]!.id,
  });
  assert.match(exported, /<ids:applicability minOccurs="0" maxOccurs="0">/);
  assert.match(exported, /<xs:pattern value="\.\*"\/>/);
  assert.match(exported, /relation="IFCRELAGGREGATES"/);
});

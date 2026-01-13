import React, { useMemo, useState } from "react";
import type { ClassificationNode } from "../../classification/types";
import type { SchemaIndex } from "../../schema/types";
import { makeId } from "../../utils/id";
import type { Phase, ProjectObject, PropertyRequirement, RelationRequirement } from "../../project/types";

type TabKey = "attributes" | "properties" | "partOf" | "material" | "ids";

const IFC_DOC_BASE = "https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical";
const getIfcDocUrl = (identifier: string | undefined) => (identifier ? `${IFC_DOC_BASE}/${identifier}.htm` : undefined);

const DocLink: React.FC<{ href?: string; label: string }> = ({ href, label }) => {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center text-slate-500 hover:text-indigo-600" title={`Otevřít dokumentaci pro ${label}`}>
      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h5v2H7v10h10v-3h2v5H5V5Z" />
      </svg>
    </a>
  );
};

const PhaseSelector: React.FC<{ phases: Phase[]; value?: string[]; onChange: (ids: string[]) => void }> = ({ phases, value, onChange }) => {
  const selected = new Set(value ?? []);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {phases.map((phase) => (
        <label key={phase.id} className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs">
          <input type="checkbox" className="h-4 w-4" checked={selected.has(phase.id)} onChange={() => toggle(phase.id)} />
          <span className="font-semibold">{phase.code}</span>
        </label>
      ))}
    </div>
  );
};

interface Props {
  node: ClassificationNode;
  object: ProjectObject;
  schema: SchemaIndex | null;
  onChange: (obj: ProjectObject) => void;
  phases: Phase[];
}

const TAB_LABELS: Record<TabKey, string> = {
  attributes: "Atributy",
  properties: "Vlastnosti",
  partOf: "Součástí (PartOf)",
  material: "Materiál",
  ids: "IDS náhled",
};

const relationTypeOptions: RelationRequirement["relationType"][] = [
  "IFCRELAGGREGATES",
  "IFCRELASSIGNSTOGROUP",
  "IFCRELCONTAINEDINSPATIALSTRUCTURE",
  "IFCRELNESTS",
  "IFCRELVOIDSELEMENT",
  "IFCRELFILLSELEMENT",
];

export const ObjectDetail: React.FC<Props> = ({ node, object, schema, onChange, phases }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("properties");

  const entities = useMemo(() => (schema ? Object.keys(schema.entities).sort() : []), [schema]);
  const selectedEntity = object.ifcEntity ? schema?.entities[object.ifcEntity] : undefined;
  const selectedPredefinedValue =
    object.predefinedType.mode === "ENUM" || object.predefinedType.mode === "USERDEFINED"
      ? object.predefinedType.value ?? ""
      : undefined;
  const predefinedOptions = useMemo(() => {
    const values = selectedEntity?.predefinedTypeValues ?? [];
    const ensureUserDefined = values.includes("USERDEFINED") ? values : [...values, "USERDEFINED"];
    return ensureUserDefined.length ? ensureUserDefined : ["USERDEFINED"];
  }, [selectedEntity]);

  const allowedPsets = useMemo(() => {
    if (!selectedEntity) return [];
    return selectedEntity.standardPsets.filter(
      (p) => !p.forPredefinedType || (selectedPredefinedValue && p.forPredefinedType === selectedPredefinedValue),
    );
  }, [selectedEntity, selectedPredefinedValue]);

  const allowedQtos = useMemo(() => {
    if (!selectedEntity) return [];
    return selectedEntity.standardQtoSets.filter(
      (q) => !q.forPredefinedType || (selectedPredefinedValue && q.forPredefinedType === selectedPredefinedValue),
    );
  }, [selectedEntity, selectedPredefinedValue]);

  const updateObject = (partial: Partial<ProjectObject>) => onChange({ ...object, ...partial });

  const updateRequirements = (updater: (requirements: ProjectObject["requirements"]) => void) => {
    const next = {
      ...object.requirements,
      attributes: [...object.requirements.attributes],
      properties: [...object.requirements.properties],
      relations: [...object.requirements.relations],
      classifications: [...object.requirements.classifications],
      materials: [...object.requirements.materials],
    };
    updater(next);
    onChange({ ...object, requirements: next });
  };

  const handlePredefinedChange = (value: string) => {
    if (!value) {
      updateObject({ predefinedType: { mode: "NONE" } });
      return;
    }
    if (value === "USERDEFINED") {
      updateObject({ predefinedType: { mode: "USERDEFINED", value: "" } });
    } else {
      updateObject({ predefinedType: { mode: "ENUM", value } });
    }
  };

  const addAttribute = () => {
    updateRequirements((reqs) => {
      reqs.attributes.push({
        id: makeId(),
        attribute: "Name",
        required: true,
        constraint: "EXISTS",
        value: "",
        extensions: {},
        phases: [],
      });
    });
  };

  const addProperty = (source: PropertyRequirement["source"]) => {
    const initialPset =
      source === "PSET" ? allowedPsets[0]?.name ?? "" : source === "QTO" ? allowedQtos[0]?.name ?? "" : "";
    const defs =
      source === "PSET"
        ? schema?.psets[initialPset]?.properties ?? []
        : source === "QTO"
          ? schema?.qtos[initialPset]?.quantities ?? []
          : [];
    const firstDef = defs[0];
    updateRequirements((reqs) => {
      reqs.properties.push({
        id: makeId(),
        source,
        psetName: initialPset,
        propertyName: firstDef?.name ?? "",
        dataType: firstDef?.dataType ?? schema?.dataTypes?.[0] ?? "IfcText",
        required: true,
        constraint: "EXISTS",
        value: "",
        unit: firstDef?.unit ?? "",
        extensions: {},
        phases: [],
      });
    });
  };

  const addRelation = () => {
    updateRequirements((reqs) => {
      reqs.relations.push({
        id: makeId(),
        relationType: "IFCRELAGGREGATES",
        targetType: "",
        minCardinality: 0,
        maxCardinality: 1,
        note: "",
        extensions: {},
        phases: [],
      });
    });
  };

  const addClassification = () => {
    updateRequirements((reqs) => {
      reqs.classifications.push({
        id: makeId(),
        classificationId: "",
        system: "",
        identification: "",
        name: "",
        readOnly: false,
        description: "",
        extensions: {},
        phases: [],
      });
    });
  };

  const addMaterial = () => {
    updateRequirements((reqs) => {
      reqs.materials.push({
        id: makeId(),
        required: false,
        materialType: undefined,
        note: "",
        extensions: {},
        phases: [],
      });
    });
  };

  const updatePropertyField = (id: string, patch: Partial<PropertyRequirement>) => {
    updateRequirements((reqs) => {
      const idx = reqs.properties.findIndex((p) => p.id === id);
      if (idx >= 0) {
        let next = { ...reqs.properties[idx], ...patch };
        const isSchemaBound = next.source === "PSET" || next.source === "QTO";
        if (schema && isSchemaBound) {
          const defs =
            next.source === "PSET"
              ? schema.psets[next.psetName]?.properties ?? []
              : schema.qtos[next.psetName]?.quantities ?? [];
          if (patch.psetName !== undefined) {
            const first = defs[0];
            const stillValid = defs.some((d) => d.name === next.propertyName);
            if (!stillValid) {
              next = { ...next, propertyName: first?.name ?? "", dataType: first?.dataType ?? next.dataType, unit: first?.unit ?? next.unit };
            }
          }
          if (patch.propertyName !== undefined) {
            const def = defs.find((d) => d.name === patch.propertyName);
            if (def) {
              next = { ...next, dataType: def.dataType, unit: def.unit ?? "" };
            }
          }
        }
        reqs.properties[idx] = next;
      }
    });
  };

  const updateRelationField = (id: string, patch: Partial<RelationRequirement>) => {
    updateRequirements((reqs) => {
      const idx = reqs.relations.findIndex((p) => p.id === id);
      if (idx >= 0) reqs.relations[idx] = { ...reqs.relations[idx], ...patch };
    });
  };

  const removeRequirement = (type: keyof ProjectObject["requirements"], id: string) => {
    updateRequirements((reqs) => {
      reqs[type] = reqs[type].filter((item) => item.id !== id) as any;
    });
  };

  const dataTypeOptions =
    schema?.dataTypes ?? ["IfcLabel", "IfcText", "IfcIdentifier", "IfcBoolean", "IfcInteger", "IfcReal", "IfcDate", "IfcDateTime", "IfcTime", "IfcDuration"];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mb-2 text-lg font-semibold text-slate-800">Identifikační údaje</div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Entita</div>
              <DocLink href={getIfcDocUrl(object.ifcEntity)} label={object.ifcEntity ?? ""} />
            </div>
            <div className="mb-2 text-xs text-slate-500">{node.description || node.code}</div>
            <div className="flex flex-col gap-2">
              <div>
                <label className="text-xs text-slate-600">IfcEntity</label>
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={object.ifcEntity} onChange={(e) => updateObject({ ifcEntity: e.target.value })}>
                  <option value="">-- Vyberte entitu --</option>
                  {entities.map((ent) => (
                    <option key={ent} value={ent}>
                      {ent}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600">PredefinedType</label>
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={object.predefinedType.mode === "NONE" ? "" : object.predefinedType.value ?? ""} onChange={(e) => handlePredefinedChange(e.target.value)}>
                  <option value="">-- Není definováno --</option>
                  {predefinedOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {object.predefinedType.mode === "USERDEFINED" && (
                  <input
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    placeholder="Zadejte vlastní typ"
                    value={object.predefinedType.value ?? ""}
                    onChange={(e) => updateObject({ predefinedType: { mode: "USERDEFINED", value: e.target.value } })}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Klasifikace</div>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Záznamy IfcClassificationReference</span>
              <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100" onClick={addClassification}>
                Přidat klasifikaci
              </button>
            </div>
            <div className="mt-2 max-h-40 overflow-auto rounded border border-slate-200 bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-1">Systém</th>
                    <th className="px-2 py-1">Identifikace</th>
                    <th className="px-2 py-1">Název</th>
                    <th className="px-2 py-1">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {object.requirements.classifications.map((cls) => (
                    <tr key={cls.id} className="border-t border-slate-200">
                      <td className="px-2 py-1">
                        <input
                          className="w-full rounded border border-slate-200 px-2 py-1"
                          value={cls.system}
                          onChange={(e) =>
                            updateRequirements((reqs) => {
                              reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, system: e.target.value } : c));
                            })
                          }
                          disabled={cls.readOnly}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full rounded border border-slate-200 px-2 py-1"
                          value={cls.identification ?? cls.code ?? ""}
                          onChange={(e) =>
                            updateRequirements((reqs) => {
                              reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, identification: e.target.value, code: e.target.value } : c));
                            })
                          }
                          disabled={cls.readOnly}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full rounded border border-slate-200 px-2 py-1"
                          value={cls.name}
                          onChange={(e) =>
                            updateRequirements((reqs) => {
                              reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, name: e.target.value } : c));
                            })
                          }
                          disabled={cls.readOnly}
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        {!cls.readOnly && (
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("classifications", cls.id)}>
                            Odebrat
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!object.requirements.classifications.length && (
                    <tr>
                      <td className="px-2 py-2 text-slate-500" colSpan={4}>
                        Žádné klasifikace.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex items-center border-b border-slate-200 bg-white px-4">
          {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
            <button
              key={key}
              className={`px-3 py-2 text-sm ${activeTab === key ? "border-b-2 border-indigo-600 font-semibold text-indigo-700" : "text-slate-600 hover:text-slate-800"}`}
              onClick={() => setActiveTab(key)}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="h-full overflow-auto p-4">
          {activeTab === "attributes" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">Atributy</div>
                  <div className="text-xs text-slate-500">Ifc attributes (Name, Description, Tag ...)</div>
                </div>
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addAttribute}>
                  Přidat atribut
                </button>
              </div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Atribut</th>
                      <th className="px-2 py-2">Podmínka</th>
                      <th className="px-2 py-2">Hodnota</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {object.requirements.attributes.map((attr) => (
                      <tr key={attr.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={attr.attribute}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.attributes = reqs.attributes.map((a) => (a.id === attr.id ? { ...a, attribute: e.target.value } : a));
                              })
                            }
                          >
                            {["Name", "Description", "Tag", "ObjectType", "GlobalId"].map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={attr.constraint}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.attributes = reqs.attributes.map((a) => (a.id === attr.id ? { ...a, constraint: e.target.value as any } : a));
                              })
                            }
                          >
                            {["EXISTS", "EQUALS", "PATTERN", "ENUM"].map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={attr.value ?? ""}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.attributes = reqs.attributes.map((a) => (a.id === attr.id ? { ...a, value: e.target.value } : a));
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <PhaseSelector
                            phases={phases}
                            value={attr.phases}
                            onChange={(ids) =>
                              updateRequirements((reqs) => {
                                reqs.attributes = reqs.attributes.map((a) => (a.id === attr.id ? { ...a, phases: ids } : a));
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("attributes", attr.id)}>
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!object.requirements.attributes.length && (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-500" colSpan={5}>
                          Žádné atributy nejsou definovány.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "properties" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-slate-800">Vlastnosti (Pset i Qto)</div>
                <button className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100" onClick={() => addProperty("PSET")}>
                  Přidat Pset
                </button>
                <button className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100" onClick={() => addProperty("QTO")}>
                  Přidat Qto
                </button>
                <button className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100" onClick={() => addProperty("CUSTOM")}>
                  Přidat vlastní
                </button>
              </div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Zdroj</th>
                      <th className="px-2 py-2">Pset/Qto</th>
                      <th className="px-2 py-2">Vlastnost</th>
                      <th className="px-2 py-2">Typ</th>
                      <th className="px-2 py-2">Podmínka</th>
                      <th className="px-2 py-2">Hodnota</th>
                      <th className="px-2 py-2">Jednotka</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {object.requirements.properties.map((prop) => (
                      <tr key={prop.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={prop.source}
                            onChange={(e) =>
                              updatePropertyField(prop.id, {
                                source: e.target.value as PropertyRequirement["source"],
                                psetName: "",
                                propertyName: "",
                                dataType: schema?.dataTypes?.[0] ?? "IfcText",
                                unit: "",
                              })
                            }
                          >
                            {["PSET", "QTO", "CUSTOM"].map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          {prop.source === "CUSTOM" ? (
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                              value={prop.psetName}
                              onChange={(e) => updatePropertyField(prop.id, { psetName: e.target.value })}
                              placeholder="Název skupiny"
                            />
                          ) : (
                            <select
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                              value={prop.psetName}
                              onChange={(e) => updatePropertyField(prop.id, { psetName: e.target.value })}
                            >
                              <option value="">— vybrat —</option>
                              {(prop.source === "PSET" ? allowedPsets : allowedQtos).map((item) => (
                                <option key={item.name} value={item.name}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {prop.source === "CUSTOM" ? (
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                              value={prop.propertyName}
                              onChange={(e) => updatePropertyField(prop.id, { propertyName: e.target.value })}
                              placeholder="Vlastnost"
                            />
                          ) : (
                            <select
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                              value={prop.propertyName}
                              onChange={(e) => updatePropertyField(prop.id, { propertyName: e.target.value })}
                              disabled={!prop.psetName}
                            >
                              <option value="">— vybrat —</option>
                              {(prop.source === "PSET"
                                ? schema?.psets[prop.psetName]?.properties ?? []
                                : schema?.qtos[prop.psetName]?.quantities ?? []
                              ).map((pdef) => (
                                <option key={pdef.name} value={pdef.name}>
                                  {pdef.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={prop.dataType}
                            onChange={(e) => updatePropertyField(prop.id, { dataType: e.target.value })}
                            disabled={prop.source !== "CUSTOM"}
                          >
                            {dataTypeOptions.map((dt) => (
                              <option key={dt} value={dt}>
                                {dt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={prop.constraint ?? "EXISTS"} onChange={(e) => updatePropertyField(prop.id, { constraint: e.target.value as any })}>
                            {["EXISTS", "EQUALS", "PATTERN", "RANGE"].map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={prop.value ?? ""} onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={prop.unit ?? ""} onChange={(e) => updatePropertyField(prop.id, { unit: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          <PhaseSelector phases={phases} value={prop.phases} onChange={(ids) => updatePropertyField(prop.id, { phases: ids })} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("properties", prop.id)}>
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!object.requirements.properties.length && (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-500" colSpan={9}>
                          Žádné vlastnosti.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "partOf" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">Součástí (PartOf)</div>
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addRelation}>
                  Přidat vztah
                </button>
              </div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Typ relace</th>
                      <th className="px-2 py-2">Cílový typ</th>
                      <th className="px-2 py-2">Min</th>
                      <th className="px-2 py-2">Max</th>
                      <th className="px-2 py-2">Poznámka</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {object.requirements.relations.map((rel) => (
                      <tr key={rel.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={rel.relationType}
                            onChange={(e) => updateRelationField(rel.id, { relationType: e.target.value as any })}
                          >
                            {relationTypeOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={rel.targetType ?? ""} onChange={(e) => updateRelationField(rel.id, { targetType: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={rel.minCardinality ?? 0} onChange={(e) => updateRelationField(rel.id, { minCardinality: Number(e.target.value) })} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={rel.maxCardinality ?? 1} onChange={(e) => updateRelationField(rel.id, { maxCardinality: Number(e.target.value) })} />
                        </td>
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={rel.note ?? ""} onChange={(e) => updateRelationField(rel.id, { note: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          <PhaseSelector phases={phases} value={rel.phases} onChange={(ids) => updateRelationField(rel.id, { phases: ids })} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("relations", rel.id)}>
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!object.requirements.relations.length && (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-500" colSpan={7}>
                          Žádné vztahy.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "material" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">Materiál</div>
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addMaterial}>
                  Přidat materiál
                </button>
              </div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Požadováno</th>
                      <th className="px-2 py-2">Typ</th>
                      <th className="px-2 py-2">Poznámka</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {object.requirements.materials.map((mat) => (
                      <tr key={mat.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={mat.required}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.materials = reqs.materials.map((m) => (m.id === mat.id ? { ...m, required: e.target.checked } : m));
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={mat.materialType ?? ""}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.materials = reqs.materials.map((m) => (m.id === mat.id ? { ...m, materialType: e.target.value as any } : m));
                              })
                            }
                          >
                            <option value="">--</option>
                            {["SINGLE", "LAYER", "PROFILE", "CONSTITUENT"].map((mt) => (
                              <option key={mt} value={mt}>
                                {mt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={mat.note ?? ""}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.materials = reqs.materials.map((m) => (m.id === mat.id ? { ...m, note: e.target.value } : m));
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <PhaseSelector
                            phases={phases}
                            value={mat.phases}
                            onChange={(ids) =>
                              updateRequirements((reqs) => {
                                reqs.materials = reqs.materials.map((m) => (m.id === mat.id ? { ...m, phases: ids } : m));
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("materials", mat.id)}>
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!object.requirements.materials.length && (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-500" colSpan={5}>
                          Žádné materiálové požadavky.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "ids" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-800">IDS náhled</div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="font-semibold">Shrnutí facet</div>
                <ul className="list-disc pl-5">
                  <li>Entity: {object.ifcEntity || "není vybrána"}</li>
                  <li>PredefinedType: {object.predefinedType.value ?? "není vybrán"}</li>
                  <li>Atributy: {object.requirements.attributes.length}</li>
                  <li>Vlastnosti: {object.requirements.properties.length}</li>
                  <li>Součástí (PartOf): {object.requirements.relations.length}</li>
                  <li>Materiál: {object.requirements.materials.length}</li>
                  <li>Klasifikace: {object.requirements.classifications.length}</li>
                </ul>
                <div className="mt-3 text-xs text-slate-500">
                  Základní validace: Vyberte IfcEntity pro plnou kompatibilitu s IDS. Typy relací jsou omezeny dle IDS schématu.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

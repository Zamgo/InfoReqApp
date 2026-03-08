import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SchemaIndex } from "../../schema/types";

const INDENT_PX = 12;
const PANEL_OFFSET = 4;

export interface EntitySelectProps {
  schemaIndex: SchemaIndex | null;
  value: string;
  onChange: (entity: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function getDepth(entities: Record<string, { parent?: string }>, name: string): number {
  const parent = entities[name]?.parent;
  if (!parent) return 0;
  return 1 + getDepth(entities, parent);
}

export const EntitySelect: React.FC<EntitySelectProps> = ({
  schemaIndex,
  value,
  onChange,
  placeholder = "-- Vyberte entitu --",
  disabled = false,
  className = "",
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelAnchor, setPanelAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  const entityOrder = useMemo(() => {
    if (!schemaIndex) return [];
    return schemaIndex.entityListOrder ?? Object.keys(schemaIndex.entities).sort();
  }, [schemaIndex]);

  const filteredOrder = useMemo(() => {
    if (!search.trim()) return entityOrder;
    const q = search.trim().toLowerCase();
    return entityOrder.filter((name) => name.toLowerCase().includes(q));
  }, [entityOrder, search]);

  const depthMap = useMemo(() => {
    if (!schemaIndex) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const name of entityOrder) {
      m.set(name, getDepth(schemaIndex.entities, name));
    }
    return m;
  }, [schemaIndex, entityOrder]);

  const displayLabel = value && schemaIndex?.entities[value] ? value : "";

  const handleSelect = useCallback(
    (name: string) => {
      const entity = schemaIndex?.entities[name];
      if (entity?.abstract) return;
      onChange(name);
      setOpen(false);
      setSearch("");
    },
    [onChange, schemaIndex],
  );

  const updatePanelAnchor = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPanelAnchor({
      top: rect.bottom + PANEL_OFFSET,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setPanelAnchor(null);
      return;
    }
    updatePanelAnchor();
    const onScrollOrResize = () => updatePanelAnchor();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePanelAnchor]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!schemaIndex) {
    return (
      <select
        id={id}
        className={className || "min-w-[140px] max-w-[220px] rounded border border-slate-300 px-2 py-1 text-sm"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
      </select>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={
          className ||
          "min-w-[140px] max-w-[220px] rounded border border-slate-300 bg-white px-2 py-1 text-left text-sm hover:border-slate-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
        }
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
      >
        <span className={!displayLabel ? "text-slate-400" : ""}>
          {displayLabel || placeholder}
        </span>
      </button>
      {open &&
        panelAnchor &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            className="min-w-[220px] max-w-[320px] rounded-lg border-2 border-slate-300 bg-white shadow-xl ring-2 ring-slate-200/60"
            style={{
              position: "fixed",
              top: panelAnchor.top,
              left: panelAnchor.left,
              zIndex: 9999,
            }}
          >
            <div className="border-b border-slate-200 p-1.5">
              <input
                type="text"
                className="w-full rounded border border-slate-200 px-2 py-1 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="Vyhledat..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>
            <div className="max-h-[280px] overflow-auto py-1">
              {filteredOrder.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">Žádná entita</div>
              ) : (
                filteredOrder.map((name) => {
                  const entity = schemaIndex.entities[name];
                  const isAbstract = entity?.abstract ?? false;
                  const depth = depthMap.get(name) ?? 0;
                  return (
                    <button
                      key={name}
                      type="button"
                      role="option"
                      aria-selected={value === name}
                      className={`w-full px-3 py-1.5 text-left text-sm ${
                        isAbstract
                          ? "cursor-not-allowed text-slate-400"
                          : "hover:bg-slate-100 text-slate-800"
                      } ${value === name ? "bg-red-50 text-red-800" : ""}`}
                      style={{ paddingLeft: 12 + depth * INDENT_PX }}
                      onClick={() => handleSelect(name)}
                      disabled={isAbstract}
                      title={isAbstract ? "Abstraktní entita – nelze vybrat" : undefined}
                    >
                      {name}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

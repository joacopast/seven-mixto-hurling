"use client";

import { useState, type ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

/** Tabs para no tener que scrollear: cada sección se muestra sola, sin desmontar las demás. */
export function TorneoTabs({ tabs, defaultTab }: { tabs: Tab[]; defaultTab: string }) {
  const [active, setActive] = useState(defaultTab);

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-line-soft">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`shrink-0 border-b-2 px-3 py-2 font-display text-sm font-semibold uppercase tracking-tight sm:text-base ${
              active === t.id
                ? "border-accent text-paper"
                : "border-transparent text-ink-soft hover:border-line hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} hidden={active !== t.id} className="mt-6">
          {t.content}
        </div>
      ))}
    </div>
  );
}

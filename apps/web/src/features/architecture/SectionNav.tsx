"use client";

import { useEffect, useState } from "react";

export interface SectionDef {
  id: string;
  title: string;
}

/**
 * The page's table of contents. It highlights the section currently in view,
 * so the nav doubles as a progress indicator while reading. It is the only
 * part of the architecture document that needs JavaScript to run.
 */
export function SectionNav({ sections }: { sections: SectionDef[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Sections" className="top-6 hidden h-fit lg:sticky lg:block">
      <ol className="space-y-0.5 border-l border-border">
        {sections.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? "location" : undefined}
              className={`-ml-px flex items-baseline gap-2 border-l-2 py-1.5 pl-3 text-xs transition-colors ${
                active === s.id
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="text-muted-foreground tabular-nums">{i + 1}</span>
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

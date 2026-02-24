"use client";

import { useMemo, useState } from "react";

type Props = {
  label?: string;
  expandedHeight?: number; // px
  collapsedHeight?: number; // px
};

export function TopSlideAd({
  label = "Sponsored",
  expandedHeight = 166,
  collapsedHeight = 45,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const height = expanded ? expandedHeight : collapsedHeight;

  const style = useMemo(
    () =>
      ({
        height: `${height}px`,
      }) as React.CSSProperties,
    [height]
  );

  return (
    <div className="tl-top-ad" style={style} aria-label="Advertisement">
      <div className="tl-top-ad__inner">
        <div className="tl-top-ad__left">
          <div className="tl-top-ad__label">{label}</div>
          {expanded ? (
            <div className="tl-top-ad__box">
              <div className="tl-top-ad__placeholder">Top slide ad (e.g., 728×90 / 320×100)</div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="tl-top-ad__toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse ad" : "Expand ad"}
          title={expanded ? "접기" : "펼치기"}
        >
          {expanded ? "▴" : "▾"}
        </button>
      </div>
    </div>
  );
}

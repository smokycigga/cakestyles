import { LOGO_W, LOGO_H, LOGO_FILLED, LOGO_STROKED } from "../../lib/logo";

// Renders the shared wordmark data (lib/logo.js) as an inline SVG. The invoice
// renderer rasterizes the same data, so the site header and the invoice header
// can never drift apart.
export default function CakeStylesLogo({ className = "h-8 w-auto", color = "currentColor" }) {
  return (
    <svg
      viewBox={`0 0 ${LOGO_W} ${LOGO_H}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {LOGO_FILLED.map((d, i) => (
        <path key={`f${i}`} d={d} fill={color} />
      ))}
      {LOGO_STROKED.map((s, i) =>
        s.line ? (
          <line
            key={`s${i}`}
            x1={s.line.x1}
            y1={s.line.y1}
            x2={s.line.x2}
            y2={s.line.y2}
            stroke={color}
            strokeWidth={s.width}
          />
        ) : (
          <path key={`s${i}`} d={s.d} stroke={color} strokeWidth={s.width} />
        )
      )}
    </svg>
  );
}

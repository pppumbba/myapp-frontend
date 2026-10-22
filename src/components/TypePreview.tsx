/**
 * Each meta type gets its own colour and a tiny drawing of what that screen looks like,
 * so a datagrid card reads differently from a form card at a glance.
 */
export interface TypeLook {
  ink: string;
  tint: string;
  /** What one row of a meta of this type is called. */
  rowNoun: string;
}

const looks: Record<string, TypeLook> = {
  app: { ink: '#4F46E5', tint: '#EEF2FF', rowNoun: 'menu item' },
  datagrid: { ink: '#0D9488', tint: '#F0FDFA', rowNoun: 'column' },
  form: { ink: '#7C3AED', tint: '#F5F3FF', rowNoun: 'field' },
  calendar: { ink: '#D97706', tint: '#FFFBEB', rowNoun: 'event field' },
  gantt: { ink: '#0284C7', tint: '#F0F9FF', rowNoun: 'task field' },
  tabs: { ink: '#DB2777', tint: '#FDF2F8', rowNoun: 'tab' },
  get: { ink: '#059669', tint: '#ECFDF5', rowNoun: 'parameter' },
  workflow: { ink: '#EA580C', tint: '#FFF7ED', rowNoun: 'status' },
  dashboard: { ink: '#2563EB', tint: '#EFF6FF', rowNoun: 'chart' },
  chart: { ink: '#0891B2', tint: '#ECFEFF', rowNoun: 'setting' },
  statement: { ink: '#4D7C0F', tint: '#F7FEE7', rowNoun: 'column' },
  report: { ink: '#9333EA', tint: '#FAF5FF', rowNoun: 'field' },
  excel_import: { ink: '#15803D', tint: '#F0FDF4', rowNoun: 'column' },
  page: { ink: '#C026D3', tint: '#FDF4FF', rowNoun: 'widget' },
  widget: { ink: '#7C3AED', tint: '#F5F3FF', rowNoun: 'setting' },
  widget_template: { ink: '#7C3AED', tint: '#F5F3FF', rowNoun: 'part' },
  notification: { ink: '#E11D48', tint: '#FFF1F2', rowNoun: 'recipient' },
  workspace: { ink: '#0E7490', tint: '#ECFEFF', rowNoun: 'section' },
  matrix: { ink: '#4D7C0F', tint: '#F7FEE7', rowNoun: 'row' },
  stage_query: { ink: '#B45309', tint: '#FFFBEB', rowNoun: 'parameter' },
};

const fallback: TypeLook = { ink: '#64748B', tint: '#F1F5F9', rowNoun: 'row' };

export function typeLook(code?: string | null): TypeLook {
  return (code && looks[code]) || fallback;
}

export function TypePreview({ code, className = '' }: { code?: string | null; className?: string }) {
  const { ink } = typeLook(code);
  return (
    <svg viewBox="0 0 120 72" className={className} aria-hidden="true" style={{ color: ink }}>
      <Drawing code={code} />
    </svg>
  );
}

function Drawing({ code }: { code?: string | null }) {
  const soft = { fill: 'currentColor', opacity: 0.18 };
  const mid = { fill: 'currentColor', opacity: 0.4 };
  const strong = { fill: 'currentColor', opacity: 0.85 };

  switch (code) {
    case 'app':
      // Sidebar menu, header, content blocks.
      return (
        <>
          <rect x="6" y="6" width="28" height="60" rx="5" {...soft} />
          <rect x="11" y="13" width="18" height="4" rx="2" {...strong} />
          <rect x="11" y="23" width="14" height="3" rx="1.5" {...mid} />
          <rect x="11" y="31" width="16" height="3" rx="1.5" {...mid} />
          <rect x="11" y="39" width="12" height="3" rx="1.5" {...mid} />
          <rect x="40" y="6" width="74" height="10" rx="4" {...soft} />
          <rect x="40" y="22" width="35" height="20" rx="4" {...mid} />
          <rect x="79" y="22" width="35" height="20" rx="4" {...soft} />
          <rect x="40" y="46" width="74" height="20" rx="4" {...soft} />
        </>
      );
    case 'datagrid':
      return (
        <>
          <rect x="6" y="8" width="108" height="10" rx="3" {...mid} />
          {[24, 36, 48, 60].map((y) => (
            <g key={y}>
              <rect x="6" y={y} width="30" height="6" rx="2" {...soft} />
              <rect x="42" y={y} width="40" height="6" rx="2" {...soft} />
              <rect x="88" y={y} width="26" height="6" rx="2" {...(y === 36 ? strong : soft)} />
            </g>
          ))}
        </>
      );
    case 'form':
      return (
        <>
          {[8, 26].map((y) => (
            <g key={y}>
              <rect x="10" y={y} width="26" height="3" rx="1.5" {...mid} />
              <rect x="10" y={y + 6} width="100" height="9" rx="3" {...soft} />
            </g>
          ))}
          <rect x="10" y="44" width="40" height="3" rx="1.5" {...mid} />
          <rect x="10" y="50" width="48" height="9" rx="3" {...soft} />
          <rect x="80" y="52" width="30" height="12" rx="4" {...strong} />
        </>
      );
    case 'calendar':
      return (
        <>
          <rect x="8" y="6" width="104" height="9" rx="3" {...mid} />
          {Array.from({ length: 28 }, (_, i) => {
            const col = i % 7;
            const row = Math.floor(i / 7);
            return (
              <rect
                key={i}
                x={8 + col * 15}
                y={20 + row * 12.5}
                width="13"
                height="10"
                rx="2"
                {...(i === 10 ? strong : soft)}
              />
            );
          })}
        </>
      );
    case 'gantt':
      // Task labels on the left, staggered bars on a timeline.
      return (
        <>
          {[
            [10, 30, 34],
            [24, 50, 40],
            [38, 64, 30],
            [52, 82, 30],
          ].map(([y, x, w], i) => (
            <g key={y}>
              <rect x="6" y={y} width="20" height="6" rx="2" {...soft} />
              <rect x={x} y={y - 1} width={w} height="8" rx="3" {...(i === 1 ? strong : mid)} />
            </g>
          ))}
          <rect x="30" y="6" width="1" height="60" {...soft} />
        </>
      );
    case 'workflow':
      // Status boxes joined by arrows, one branching off.
      return (
        <>
          <circle cx="12" cy="24" r="5" {...strong} />
          <rect x="24" y="18" width="24" height="12" rx="3" {...mid} />
          <rect x="60" y="18" width="24" height="12" rx="3" {...strong} />
          <rect x="96" y="18" width="18" height="12" rx="3" {...mid} />
          <rect x="60" y="46" width="24" height="12" rx="3" {...soft} />
          <path d="M17 24h6M48 24h11M84 24h11M72 30v15" stroke="currentColor" strokeWidth="2" opacity="0.6" fill="none" />
        </>
      );
    case 'dashboard':
      // Figure tiles on top, a column chart and a donut below.
      return (
        <>
          {[8, 46, 84].map((x) => (
            <rect key={x} x={x} y="6" width="28" height="16" rx="4" {...soft} />
          ))}
          {[12, 50, 88].map((x) => (
            <rect key={x} x={x} y="12" width="14" height="4" rx="2" {...strong} />
          ))}
          <rect x="8" y="28" width="66" height="38" rx="4" {...soft} />
          {[[14, 18], [24, 26], [34, 14], [44, 30], [54, 22], [64, 10]].map(([x, h]) => (
            <rect key={x} x={x} y={60 - h} width="6" height={h} rx="1.5" {...mid} />
          ))}
          <rect x="80" y="28" width="32" height="38" rx="4" {...soft} />
          <circle cx="96" cy="47" r="10" fill="none" stroke="currentColor" strokeWidth="5" opacity="0.85" strokeDasharray="40 63" />
          <circle cx="96" cy="47" r="10" fill="none" stroke="currentColor" strokeWidth="5" opacity="0.3" strokeDasharray="23 63" strokeDashoffset="-40" />
        </>
      );
    case 'chart':
      // Columns rising over hairline gridlines.
      return (
        <>
          {[18, 34, 50].map((y) => (
            <rect key={y} x="10" y={y} width="100" height="1" {...soft} />
          ))}
          {[[18, 22], [34, 34], [50, 18], [66, 44], [82, 30], [98, 52]].map(([x, h], i) => (
            <rect key={x} x={x} y={62 - h} width="9" height={h} rx="2" {...(i === 5 ? strong : mid)} />
          ))}
          <rect x="10" y="62" width="100" height="2" rx="1" {...mid} />
        </>
      );
    case 'statement':
      // Group headings, their rows indented, a subtotal line and a heavy grand total rule.
      return (
        <>
          {[8, 36].map((y) => (
            <g key={y}>
              <rect x="8" y={y} width="104" height="7" rx="2" {...mid} />
              <rect x="18" y={y + 10} width="54" height="3" rx="1.5" {...soft} />
              <rect x="92" y={y + 10} width="20" height="3" rx="1.5" {...soft} />
              <rect x="18" y={y + 16} width="46" height="3" rx="1.5" {...soft} />
              <rect x="92" y={y + 16} width="20" height="3" rx="1.5" {...soft} />
            </g>
          ))}
          <rect x="8" y="62" width="104" height="2" rx="1" {...strong} />
          <rect x="88" y="66" width="24" height="3" rx="1.5" {...strong} />
        </>
      );
    case 'report':
      // A sheet of paper: heading, fields, a lines table and signature lines.
      return (
        <>
          <rect x="26" y="4" width="68" height="64" rx="3" {...soft} />
          <rect x="32" y="10" width="30" height="5" rx="2" {...strong} />
          <rect x="74" y="10" width="14" height="5" rx="2" {...mid} />
          {[22, 27].map((y) => (
            <g key={y}>
              <rect x="32" y={y} width="22" height="2.5" rx="1" {...mid} />
              <rect x="62" y={y} width="22" height="2.5" rx="1" {...mid} />
            </g>
          ))}
          {[35, 40, 45].map((y) => (
            <rect key={y} x="32" y={y} width="56" height="3" rx="1" {...(y === 35 ? strong : soft)} />
          ))}
          <rect x="32" y="60" width="20" height="1.5" {...strong} />
          <rect x="66" y="60" width="22" height="1.5" {...strong} />
        </>
      );
    case 'notification':
      // A bell with a badge, and the message cards it sends.
      return (
        <>
          <path d="M30 44V32a12 12 0 0 1 24 0v12l4 6H26l4-6Z" {...mid} />
          <rect x="37" y="52" width="10" height="5" rx="2.5" {...mid} />
          <circle cx="53" cy="22" r="6" {...strong} />
          {[14, 32, 50].map((y) => (
            <g key={y}>
              <rect x="68" y={y} width="44" height="12" rx="3" {...soft} />
              <rect x="72" y={y + 4} width={y === 14 ? 26 : 20} height="4" rx="2" {...(y === 14 ? strong : mid)} />
            </g>
          ))}
        </>
      );
    case 'page':
    case 'widget_template':
      // A banner, a row of tiles and a block of text: a page made of widgets.
      return (
        <>
          <rect x="8" y="6" width="104" height="20" rx="4" {...mid} />
          <rect x="14" y="12" width="40" height="4" rx="2" {...strong} />
          {[8, 44, 80].map((x) => (
            <rect key={x} x={x} y="31" width="32" height="16" rx="3" {...soft} />
          ))}
          <rect x="8" y="52" width="70" height="4" rx="2" {...mid} />
          <rect x="8" y="60" width="54" height="4" rx="2" {...soft} />
        </>
      );
    case 'workspace':
      // One record's header, then tabs and the section under them.
      return (
        <>
          <rect x="8" y="6" width="104" height="18" rx="4" {...mid} />
          <rect x="14" y="12" width="44" height="6" rx="3" {...strong} />
          {[8, 34, 60].map((x) => (
            <rect key={x} x={x} y="30" width="22" height="5" rx="2" {...(x === 8 ? strong : soft)} />
          ))}
          <rect x="8" y="40" width="104" height="24" rx="4" {...soft} />
          <rect x="14" y="46" width="60" height="4" rx="2" {...mid} />
          <rect x="14" y="54" width="44" height="4" rx="2" {...mid} />
        </>
      );
    case 'matrix':
      // Rows down the side, columns across, a value where they meet; one marked best.
      return (
        <>
          {[20, 34, 48].map((y) => (
            <rect key={y} x="8" y={y} width="28" height="8" rx="2" {...mid} />
          ))}
          {[44, 68, 92].map((x) => (
            <rect key={x} x={x} y="8" width="20" height="6" rx="2" {...mid} />
          ))}
          {[20, 34, 48].flatMap((y) =>
            [44, 68, 92].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="20" height="8" rx="2" {...(x === 68 && y === 34 ? strong : soft)} />),
          )}
        </>
      );
    case 'widget':
      // One block lifted out of a page, with its settings beside it.
      return (
        <>
          <rect x="8" y="10" width="64" height="52" rx="6" {...soft} />
          <rect x="16" y="20" width="36" height="6" rx="3" {...strong} />
          <rect x="16" y="32" width="48" height="4" rx="2" {...mid} />
          <rect x="16" y="40" width="40" height="4" rx="2" {...mid} />
          {[14, 30, 46].map((y) => (
            <rect key={y} x="80" y={y} width="32" height="10" rx="3" {...(y === 14 ? strong : soft)} />
          ))}
        </>
      );
    case 'excel_import':
      // A spreadsheet's cells flowing into a table.
      return (
        <>
          <rect x="6" y="10" width="48" height="52" rx="4" {...soft} />
          <rect x="6" y="10" width="48" height="10" rx="4" {...mid} />
          {[24, 34, 44, 54].map((y) => (
            <g key={y}>
              <rect x="10" y={y} width="18" height="5" rx="1" {...mid} />
              <rect x="32" y={y} width="18" height="5" rx="1" {...mid} />
            </g>
          ))}
          <path d="M60 36h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
          <rect x="78" y="14" width="36" height="44" rx="4" {...soft} />
          {[22, 32, 42].map((y) => (
            <rect key={y} x="83" y={y} width="26" height="5" rx="2" {...(y === 42 ? strong : mid)} />
          ))}
        </>
      );
    case 'get':
      // A query on the left pouring values into form fields on the right.
      return (
        <>
          <rect x="8" y="10" width="44" height="52" rx="5" {...soft} />
          {[18, 28, 38, 48].map((y, i) => (
            <rect key={y} x="14" y={y} width={[30, 22, 26, 18][i]} height="4" rx="2" {...mid} />
          ))}
          <path d="M58 36h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
          {[16, 32, 48].map((y) => (
            <rect key={y} x="76" y={y} width="36" height="9" rx="3" {...(y === 32 ? strong : soft)} />
          ))}
        </>
      );
    case 'stage_query':
      // Values going into SQL that changes the rows of a table.
      return (
        <>
          {[14, 30, 46].map((y) => (
            <rect key={y} x="8" y={y} width="26" height="10" rx="3" {...(y === 30 ? strong : soft)} />
          ))}
          <path d="M40 36h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
          <rect x="58" y="10" width="54" height="52" rx="5" {...soft} />
          {[18, 28, 38, 48].map((y, i) => (
            <rect key={y} x="64" y={y} width={[40, 30, 36, 24][i]} height="5" rx="2" {...(i === 1 ? strong : mid)} />
          ))}
        </>
      );
    case 'tabs':
      return (
        <>
          <rect x="8" y="8" width="30" height="11" rx="4" {...strong} />
          <rect x="42" y="8" width="30" height="11" rx="4" {...soft} />
          <rect x="76" y="8" width="30" height="11" rx="4" {...soft} />
          <rect x="8" y="23" width="104" height="43" rx="5" {...soft} />
          <rect x="16" y="32" width="50" height="4" rx="2" {...mid} />
          <rect x="16" y="41" width="70" height="4" rx="2" {...mid} />
        </>
      );
    default:
      return (
        <>
          <rect x="10" y="10" width="100" height="14" rx="4" {...mid} />
          <rect x="10" y="30" width="48" height="32" rx="4" {...soft} />
          <rect x="62" y="30" width="48" height="32" rx="4" {...soft} />
        </>
      );
  }
}

import type { FC, SVGProps } from 'react';
import {
  AlignLeft01, BarChartSquare02, Bell01, Briefcase01, Calendar, Cube01, Database01, Database02, Dataflow03, File04, FileCheck02,
  FileSearch02, Folder, Globe01, Grid03, LayoutAlt02, LayoutGrid01, LineChartUp01, Monitor01, Palette, PuzzlePiece01,
  PuzzlePiece02, Rows03, Table, TerminalSquare, Upload04,
} from '@untitledui/icons';
import { typeColors } from './TypePreview';

type Icon = FC<SVGProps<SVGSVGElement>>;

const icons: Record<string, Icon> = {
  app: LayoutGrid01,
  calendar: Calendar,
  chart: LineChartUp01,
  dashboard: BarChartSquare02,
  datagrid: Table,
  excel_import: Upload04,
  form: File04,
  gantt: AlignLeft01,
  get: Database01,
  matrix: Grid03,
  notification: Bell01,
  page: LayoutAlt02,
  query: FileSearch02,
  report: FileCheck02,
  screen: Monitor01,
  stage_query: TerminalSquare,
  statement: Rows03,
  structure: Database02,
  tabs: Folder,
  theme: Palette,
  website: Globe01,
  widget: PuzzlePiece01,
  widget_template: PuzzlePiece02,
  workflow: Dataflow03,
  workspace: Briefcase01,
};

/** fill takes its parent's size, the icon scaling with it. */
const sizes = {
  sm: 'size-8 rounded-lg [&>svg]:size-4',
  md: 'size-10 rounded-lg [&>svg]:size-5',
  lg: 'size-12 rounded-xl [&>svg]:size-6',
  xl: 'size-16 rounded-2xl [&>svg]:size-8',
  fill: 'size-full rounded-lg [&>svg]:size-[40%]',
};

/** A meta type's icon on a tile in the type's colours. */
export function TypeIcon({ code, size = 'md' }: { code?: string | null; size?: keyof typeof sizes }) {
  const colors = typeColors(code);
  const Glyph = (code && icons[code]) || Cube01;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${sizes[size]} ${colors.className}`} style={colors.style} aria-hidden="true">
      <Glyph />
    </span>
  );
}

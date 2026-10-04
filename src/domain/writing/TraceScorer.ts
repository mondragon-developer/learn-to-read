/**
 * Scores a traced or written word against the model glyphs. Pure grid math: the UI rasterizes the
 * model text and the child's strokes into same-size boolean grids, this decides "good enough".
 * Florida ELA.1.C.1.1 (print letters) and ELA.1.F.1.3.c (encode words).
 */
export interface Grid {
  width: number;
  height: number;
  /** Row-major, true = ink. */
  cells: boolean[];
}

export interface TraceScore {
  /** Share of the model's ink that the child went over (within tolerance). */
  coverage: number;
  /** Share of the child's ink that stays on the model (within tolerance). */
  precision: number;
  pass: boolean;
}

/** Generous thresholds: six-year-old hands, finger on glass. */
export const TRACE_PASS = { coverage: 0.7, precision: 0.55 };

export function emptyGrid(width: number, height: number): Grid {
  return { width, height, cells: new Array<boolean>(width * height).fill(false) };
}

/** Grows ink by `radius` cells (square neighborhood) so "near the line" counts as on it. */
export function dilate(grid: Grid, radius: number): Grid {
  const out = emptyGrid(grid.width, grid.height);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!grid.cells[y * grid.width + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < grid.width && ny < grid.height) out.cells[ny * grid.width + nx] = true;
        }
      }
    }
  }
  return out;
}

export function scoreTrace(model: Grid, child: Grid, tolerance = 2, pass = TRACE_PASS): TraceScore {
  if (model.width !== child.width || model.height !== child.height) throw new Error('Grids must be the same size');
  const nearChild = dilate(child, tolerance);
  const nearModel = dilate(model, tolerance);
  let modelInk = 0;
  let covered = 0;
  let childInk = 0;
  let onModel = 0;
  for (let i = 0; i < model.cells.length; i++) {
    if (model.cells[i]) { modelInk++; if (nearChild.cells[i]) covered++; }
    if (child.cells[i]) { childInk++; if (nearModel.cells[i]) onModel++; }
  }
  const coverage = modelInk ? covered / modelInk : 0;
  const precision = childInk ? onModel / childInk : 0;
  return { coverage, precision, pass: coverage >= pass.coverage && precision >= pass.precision };
}

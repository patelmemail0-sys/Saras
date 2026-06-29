/**
 * Shared grid model for the circuit builder. Node ids are grid cells (`n<col>_<row>`);
 * the 2D editor and the 3D view import the SAME mapping so a circuit built on the
 * grid lines up exactly in both surfaces.
 */

export const GRID = { cols: 9, rows: 6, pitch: 64 } as const;
export const PAD = 40; // 2D viewBox padding (px)
export const NODE_R = 4.5; // 2D node dot radius (px)

export const VIEW_W = PAD * 2 + (GRID.cols - 1) * GRID.pitch;
export const VIEW_H = PAD * 2 + (GRID.rows - 1) * GRID.pitch;

export function nodeId(col: number, row: number): string {
  return `n${col}_${row}`;
}

export function parseNode(id: string): { col: number; row: number } | null {
  const m = id.match(/^n(\d+)_(\d+)$/);
  return m ? { col: Number(m[1]), row: Number(m[2]) } : null;
}

/** Stable human label for a node (grid column letter + row number), e.g. "C2". */
export function nodeLabel(id: string): string {
  const p = parseNode(id);
  if (!p) return id;
  return `${String.fromCharCode(65 + p.col)}${p.row + 1}`;
}

/** 2D pixel position of a node within the editor viewBox. */
export function nodeXY(id: string): { x: number; y: number } {
  const p = parseNode(id);
  if (!p) return { x: 0, y: 0 };
  return { x: PAD + p.col * GRID.pitch, y: PAD + p.row * GRID.pitch };
}

/** Snap a pixel point to the nearest grid node, or null if none within ½ pitch. */
export function nearestNode(x: number, y: number): string | null {
  const col = Math.round((x - PAD) / GRID.pitch);
  const row = Math.round((y - PAD) / GRID.pitch);
  if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return null;
  const nx = PAD + col * GRID.pitch;
  const ny = PAD + row * GRID.pitch;
  if (Math.hypot(x - nx, y - ny) > GRID.pitch * 0.5) return null;
  return nodeId(col, row);
}

// --- 3D world mapping (XZ plane, centered at the origin) ---------------------
export const LY = 0.06; // height above the ground grid
const WORLD_PITCH = 0.62;

export function nodeWorld(id: string): [number, number, number] {
  const p = parseNode(id);
  if (!p) return [0, LY, 0];
  const x = (p.col - (GRID.cols - 1) / 2) * WORLD_PITCH;
  const z = (p.row - (GRID.rows - 1) / 2) * WORLD_PITCH;
  return [x, LY, z];
}

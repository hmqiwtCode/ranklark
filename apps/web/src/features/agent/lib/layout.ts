/**
 * Deterministic positions for the run graph. Pure and client-safe (no React Flow import), so it is unit-tested.
 *
 * One horizontal lane per iteration, stacked top to bottom:
 *   lane "setup"   iteration 0 (the app profile), nodes left to right in start order
 *   lane 1…n       columns by role: planner → workers (stacked, wrapped into sub-columns) → analyst → checker
 *   lane "answer"  composer / validator (and a repair round), left to right in start order
 *
 * Edges inside a lane run left → right. Edges between lanes leave the bottom of the source, cross in the gap just
 * above the target's lane and enter the target from the top, so the loop back to the next planner never cuts
 * through a stack of workers.
 */
import type { AgentRole, NodeStatus } from "./contract";

export const NODE_W = 220;
export const NODE_H = 72;
export const COL_GAP = 56;
export const ROW_GAP = 14;
export const LANE_GAP = 44;
/** Space at the top of a lane for its label. */
export const LANE_PAD_TOP = 34;
export const LANE_PAD_BOTTOM = 18;
/** Lane bands extend this far left and right of the outermost nodes. */
export const LANE_PAD_X = 20;
/** Most workers stacked in one column before they wrap into another one. */
export const MAX_STACK = 6;

export type LayoutNode = { id: string; role: AgentRole; iteration: number; parents: string[]; status: NodeStatus };

export type LaneKey = "setup" | "answer" | `iteration-${number}`;

export type Lane = {
  key: LaneKey;
  label: string;
  /** The iteration this lane draws, null for the answer lane. */
  iteration: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Layout = {
  positions: Record<string, { x: number; y: number }>;
  /** Which lane each node is in. */
  laneOf: Record<string, LaneKey>;
  lanes: Lane[];
  width: number;
  height: number;
};

const SEQUENTIAL_ROLES: AgentRole[] = ["composer", "validator"];

export function laneKeyOf(n: Pick<LayoutNode, "role" | "iteration">): LaneKey {
  if (SEQUENTIAL_ROLES.includes(n.role)) return "answer";
  const it = Math.max(0, Math.floor(n.iteration));
  return it === 0 ? "setup" : `iteration-${it}`;
}

const laneOrder = (k: LaneKey) => (k === "setup" ? 0 : k === "answer" ? Number.POSITIVE_INFINITY : Number(k.slice(10)));

const colX = (col: number) => col * (NODE_W + COL_GAP);
const stackHeight = (rows: number) => rows * NODE_H + Math.max(0, rows - 1) * ROW_GAP;

/** Rows per sub-column when n nodes share one role column. */
function wrap(n: number) {
  const cols = Math.max(1, Math.ceil(n / MAX_STACK));
  return { cols, rows: Math.max(1, Math.ceil(n / cols)) };
}

export function layoutRun(nodes: LayoutNode[]): Layout {
  // group by lane, keeping start order
  const byLane = new Map<LaneKey, LayoutNode[]>();
  const laneOf: Record<string, LaneKey> = {};
  for (const n of nodes) {
    const k = laneKeyOf(n);
    laneOf[n.id] = k;
    const list = byLane.get(k);
    if (list) list.push(n);
    else byLane.set(k, [n]);
  }
  const keys = [...byLane.keys()].sort((a, b) => laneOrder(a) - laneOrder(b));

  // Worker sub-columns are aligned across iteration lanes, so analysts and checkers line up.
  let workerCols = 1;
  for (const k of keys) {
    if (k === "setup" || k === "answer") continue;
    const w = byLane.get(k)!.filter((n) => n.role === "worker").length;
    workerCols = Math.max(workerCols, wrap(w).cols);
  }
  const roleCol: Record<AgentRole, number> = {
    planner: 0,
    worker: 1,
    analyst: 1 + workerCols,
    checker: 2 + workerCols,
    composer: 0,
    validator: 0,
  };

  // Place each lane's nodes on a (col, row) grid first, then convert to pixels.
  type Cell = { id: string; col: number; row: number; colRows: number };
  const grids = new Map<LaneKey, { cells: Cell[]; rows: number; cols: number }>();
  for (const k of keys) {
    const list = byLane.get(k)!;
    const cells: Cell[] = [];
    if (k === "setup" || k === "answer") {
      list.forEach((n, i) => {
        cells.push({ id: n.id, col: i, row: 0, colRows: 1 });
      });
      grids.set(k, { cells, rows: 1, cols: list.length });
      continue;
    }
    let rows = 1;
    let cols = 0;
    for (const role of ["planner", "worker", "analyst", "checker"] as const) {
      const group = list.filter((n) => n.role === role);
      if (!group.length) continue;
      if (role === "worker") {
        const w = wrap(group.length);
        group.forEach((n, i) => {
          const sub = Math.floor(i / w.rows);
          const inCol = Math.min(w.rows, group.length - sub * w.rows);
          cells.push({ id: n.id, col: roleCol.worker + sub, row: i % w.rows, colRows: inCol });
        });
        rows = Math.max(rows, w.rows);
      } else {
        // planners, analysts and checkers stack in their own column (a retry adds a second one)
        group.forEach((n, i) => {
          cells.push({ id: n.id, col: roleCol[role], row: i, colRows: group.length });
        });
        rows = Math.max(rows, group.length);
      }
    }
    for (const c of cells) cols = Math.max(cols, c.col + 1);
    grids.set(k, { cells, rows, cols });
  }

  const totalCols = Math.max(1, ...[...grids.values()].map((g) => g.cols));
  const contentW = colX(totalCols - 1) + NODE_W;
  const positions: Record<string, { x: number; y: number }> = {};
  const lanes: Lane[] = [];
  let y = 0;
  for (const k of keys) {
    const g = grids.get(k)!;
    const height = LANE_PAD_TOP + stackHeight(g.rows) + LANE_PAD_BOTTOM;
    const inner = stackHeight(g.rows);
    for (const c of g.cells) {
      // centre each column's stack vertically in the lane
      const top = y + LANE_PAD_TOP + (inner - stackHeight(c.colRows)) / 2;
      positions[c.id] = { x: colX(c.col), y: top + c.row * (NODE_H + ROW_GAP) };
    }
    const iteration = k === "answer" ? null : k === "setup" ? 0 : Number(k.slice(10));
    lanes.push({
      key: k,
      label: k === "setup" ? "Setup" : k === "answer" ? "Answer" : `Iteration ${iteration}`,
      iteration,
      x: -LANE_PAD_X,
      y,
      width: contentW + 2 * LANE_PAD_X,
      height,
    });
    y += height + LANE_GAP;
  }

  return { positions, laneOf, lanes, width: contentW, height: Math.max(0, y - LANE_GAP) };
}

export type LayoutEdge = {
  id: string;
  source: string;
  target: string;
  /** "flow" = same lane, left → right. "lane" = between lanes, routed through the gap above the target lane. */
  kind: "flow" | "lane";
  sourceHandle: "r" | "b";
  targetHandle: "l" | "t";
  /** For "lane" edges: the y of the horizontal run (middle of the gap above the target's lane). */
  centerY?: number;
  /** The target is still working: draw the edge animated. */
  animated: boolean;
  /** Status of the node the edge feeds. */
  status: NodeStatus;
};

/** One edge per (parent → node) pair whose parent exists. Unknown parents are skipped. */
export function edgesFor(nodes: LayoutNode[], layout: Layout): LayoutEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const laneY = new Map(layout.lanes.map((l) => [l.key, l.y]));
  const out: LayoutEdge[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    for (const p of n.parents) {
      if (!ids.has(p) || p === n.id) continue;
      const id = `${p}->${n.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const sl = layout.laneOf[p];
      const tl = layout.laneOf[n.id];
      const down = sl !== tl && laneOrder(sl) < laneOrder(tl);
      out.push({
        id,
        source: p,
        target: n.id,
        kind: down ? "lane" : "flow",
        sourceHandle: down ? "b" : "r",
        targetHandle: down ? "t" : "l",
        centerY: down ? (laneY.get(tl) ?? 0) - LANE_GAP / 2 : undefined,
        animated: n.status === "running",
        status: n.status,
      });
    }
  }
  return out;
}

"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  type Edge,
  type EdgeProps,
  getSmoothStepPath,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type NodeStatus, TOOL_INFO } from "../lib/contract";
import { edgesFor, LANE_PAD_X, type Layout, layoutRun, NODE_H, NODE_W } from "../lib/layout";
import type { GraphNode, IterationView } from "../lib/reduce";
import { fmtClock, fmtDuration, NODE_STATUS, NodeStatusIcon, parseTime, ROLE } from "./bits";

// ---------------------------------------------------------------- node + edge types (defined once, outside components)

type AgentNodeData = { node: GraphNode; selected: boolean; highlighted: boolean; onSelect: (id: string) => void };
type AgentFlowNode = Node<AgentNodeData, "agent">;
type LaneNodeData = { label: string; note: string | null; tone: "good" | "warn" | "muted"; width: number; height: number };
type LaneFlowNode = Node<LaneNodeData, "lane">;
type FlowNode = AgentFlowNode | LaneFlowNode;
type LaneEdgeData = { centerY?: number };
type LaneFlowEdge = Edge<LaneEdgeData, "lane">;

const HIDDEN_HANDLE = { opacity: 0, width: 6, height: 6, minWidth: 0, minHeight: 0, border: 0, pointerEvents: "none" as const };

function RunningFor({ since }: { since: string }) {
  const start = parseTime(since);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{start == null ? "" : fmtClock(now - start)}</>;
}

function detailLine(n: GraphNode): string {
  if (n.status === "failed") return n.error ?? "Failed";
  const parts: string[] = [];
  if (n.tool) parts.push(TOOL_INFO[n.tool]?.label ?? n.tool);
  if (n.factIds.length) parts.push(`${n.factIds.length} fact${n.factIds.length === 1 ? "" : "s"}`);
  if (n.findingIds.length) parts.push(`${n.findingIds.length} finding${n.findingIds.length === 1 ? "" : "s"}`);
  if (parts.length) return parts.join(" · ");
  if (n.summary) return n.summary;
  if (n.status === "running") return "Working…";
  if (n.status === "skipped") return "Didn't finish";
  return "";
}

function AgentNodeCard({ data }: NodeProps<AgentFlowNode>) {
  const n = data.node;
  const role = ROLE[n.role];
  const st = NODE_STATUS[n.status];
  const Icon = role.icon;
  const ring = data.highlighted ? "ring-2 ring-sky shadow-[0_0_0_6px_rgba(141,205,255,0.12)]" : data.selected ? "ring-2 ring-ink/70" : "";
  return (
    <div className="relative" style={{ width: NODE_W, height: NODE_H }}>
      <Handle type="target" position={Position.Left} id="l" isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle type="target" position={Position.Top} id="t" isConnectable={false} style={HIDDEN_HANDLE} />
      {n.status === "running" && (
        <span aria-hidden className="pointer-events-none absolute -inset-[4px] animate-pulse rounded-[15px] border-2 border-primary/45" />
      )}
      <button
        type="button"
        onClick={() => data.onSelect(n.id)}
        aria-label={`${role.label}: ${n.label}. ${st.label}. Open details`}
        className={`nodrag pointer-events-auto flex h-full w-full cursor-pointer flex-col justify-between rounded-xl border bg-card px-3 py-2 text-left transition hover:bg-[oklch(29%_0_0)] ${st.border} ${ring} ${n.status === "skipped" ? "opacity-60" : ""}`}
      >
        <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
          <span
            className={`grid h-5 w-5 place-items-center rounded-md bg-white/[0.06] ${n.status === "running" ? "text-primary" : "text-ink-2"}`}
          >
            <Icon className="h-3 w-3" />
          </span>
          {role.label}
          <span className={`ml-auto flex items-center gap-1 font-medium normal-case tracking-normal tabular ${st.text}`}>
            {n.status === "running" ? <RunningFor since={n.startedAt} /> : n.durationMs != null ? fmtDuration(n.durationMs) : null}
            <NodeStatusIcon status={n.status} className="h-3.5 w-3.5" />
          </span>
        </span>
        <span className="truncate text-[13px] font-semibold leading-tight text-ink">{n.label}</span>
        <span className={`truncate text-[11px] leading-tight ${n.status === "failed" ? "text-bad" : "text-ink-3"}`}>
          {detailLine(n) || " "}
        </span>
      </button>
      <Handle type="source" position={Position.Right} id="r" isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Bottom} id="b" isConnectable={false} style={HIDDEN_HANDLE} />
    </div>
  );
}

function LaneBand({ data }: NodeProps<LaneFlowNode>) {
  const tone = data.tone === "good" ? "text-good" : data.tone === "warn" ? "text-warn" : "text-ink-3";
  return (
    <div style={{ width: data.width, height: data.height }} className="rounded-2xl border border-white/[0.05] bg-white/[0.018]">
      <div className="flex items-center gap-2 px-4 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {data.label}
        {data.note && <span className={`truncate font-medium normal-case tracking-normal ${tone}`}>· {data.note}</span>}
      </div>
    </div>
  );
}

function LaneEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<LaneFlowEdge>) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14,
    centerY: data?.centerY,
  });
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
}

const nodeTypes = { agent: AgentNodeCard, lane: LaneBand };
const edgeTypes = { lane: LaneEdge };

const EDGE_COLOR: Record<NodeStatus, string> = {
  running: "var(--color-primary)",
  done: "oklch(46% 0 0)",
  failed: "var(--color-bad)",
  skipped: "oklch(40% 0 0)",
};
// SVG markers can't read CSS variables, so the arrowheads use the token values directly.
const MARKER_COLOR: Record<NodeStatus, string> = {
  running: "#e16540",
  done: "#5e5e5e",
  failed: "#e5484d",
  skipped: "#4f4f4f",
};

const MINIMAP_COLOR: Record<NodeStatus, string> = {
  running: "#e16540",
  done: "#3f6b52",
  failed: "#8a3a36",
  skipped: "#3a3a3a",
};

// ---------------------------------------------------------------- the graph

function laneNote(it: IterationView | undefined): { note: string | null; tone: LaneNodeData["tone"] } {
  if (!it || it.converged == null) return { note: null, tone: "muted" };
  return it.converged ? { note: "evidence good enough", tone: "good" } : { note: "needs more evidence", tone: "warn" };
}

/** Phones get a readable fixed zoom that follows the running step instead of a tiny fit-everything view. */
const COMPACT_ZOOM = 0.55;
const compactViewport = { x: 12 + LANE_PAD_X * COMPACT_ZOOM, y: 12, zoom: COMPACT_ZOOM };

type GraphProps = {
  nodes: GraphNode[];
  iterations: IterationView[];
  selectedId: string | null;
  highlightId: string | null;
  /** Bumped on every highlight request, so the same node can be jumped to twice. */
  highlightKey?: number;
  onSelect: (id: string) => void;
};

function Flow({
  nodes,
  iterations,
  selectedId,
  highlightId,
  highlightKey,
  onSelect,
  layout,
  compact,
}: GraphProps & { layout: Layout; compact: boolean }) {
  const rf = useReactFlow<FlowNode, Edge>();
  const userMoved = useRef(false);

  const flowNodes = useMemo<FlowNode[]>(() => {
    const lanes: LaneFlowNode[] = layout.lanes.map((l) => {
      const { note, tone } = l.iteration ? laneNote(iterations.find((i) => i.n === l.iteration)) : { note: null, tone: "muted" as const };
      return {
        id: `lane:${l.key}`,
        type: "lane",
        position: { x: l.x, y: l.y },
        data: { label: l.label, note, tone, width: l.width, height: l.height },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
        className: "rf-lane",
        // explicit size: controlled nodes never get `measured`, and the minimap needs dimensions
        width: l.width,
        height: l.height,
      };
    });
    const agents: AgentFlowNode[] = nodes.map((n) => ({
      id: n.id,
      type: "agent",
      position: layout.positions[n.id] ?? { x: 0, y: 0 },
      data: { node: n, selected: n.id === selectedId, highlighted: n.id === highlightId, onSelect },
      draggable: false,
      selectable: false,
      focusable: false,
      width: NODE_W,
      height: NODE_H,
    }));
    return [...lanes, ...agents];
  }, [layout, nodes, iterations, selectedId, highlightId, onSelect]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      edgesFor(nodes, layout).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: e.kind === "lane" ? "lane" : "default",
        data: { centerY: e.centerY },
        animated: e.animated,
        focusable: false,
        selectable: false,
        style: {
          stroke: EDGE_COLOR[e.status],
          strokeWidth: e.status === "running" ? 1.8 : 1.3,
          strokeDasharray: e.status === "skipped" ? "4 4" : undefined,
          opacity: e.status === "skipped" ? 0.6 : 1,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: MARKER_COLOR[e.status], width: 14, height: 14 },
      })),
    [nodes, layout],
  );

  // Follow the run as nodes stream in (whole graph on desktop, the running step on phones), until the person
  // pans or zooms themselves.
  const count = nodes.length;
  const runningId = [...nodes].reverse().find((n) => n.status === "running")?.id ?? null;
  const runningPos = runningId ? layout.positions[runningId] : null;
  useEffect(() => {
    if (userMoved.current || !count) return;
    const t = setTimeout(() => {
      if (!compact) rf.fitView({ padding: 0.08, maxZoom: 1, duration: 300 });
      else if (runningPos) rf.setCenter(runningPos.x + NODE_W / 2, runningPos.y + NODE_H / 2, { zoom: COMPACT_ZOOM, duration: 300 });
      else rf.setViewport(compactViewport, { duration: 300 });
    }, 60);
    return () => clearTimeout(t);
  }, [count, rf, compact, runningPos]);

  // Jump to a node highlighted from a fact chip or the Evidence table.
  // biome-ignore lint/correctness/useExhaustiveDependencies: highlightKey re-runs the jump for a repeated request
  useEffect(() => {
    if (!highlightId) return;
    const p = layout.positions[highlightId];
    if (!p) return;
    userMoved.current = true;
    rf.setCenter(p.x + NODE_W / 2, p.y + NODE_H / 2, { zoom: Math.max(rf.getZoom(), 0.85), duration: 400 });
  }, [highlightId, highlightKey, layout, rf]);

  return (
    <ReactFlow<FlowNode, Edge>
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode="dark"
      fitView={!compact}
      fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
      defaultViewport={compactViewport}
      minZoom={0.15}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      zoomOnScroll={false}
      preventScrolling={false}
      zoomOnDoubleClick={false}
      onMoveStart={(e) => {
        if (e) userMoved.current = true;
      }}
      className="rl-flow"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
      <Controls showInteractive={false} position="bottom-left" />
      {!compact && (
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          style={{ width: 168, height: 112 }}
          nodeColor={(n) => (n.type === "lane" ? "rgba(255,255,255,0.035)" : MINIMAP_COLOR[(n as AgentFlowNode).data.node.status])}
          nodeStrokeWidth={0}
          nodeBorderRadius={6}
          ariaLabel="Mini map of the run graph"
        />
      )}
    </ReactFlow>
  );
}

const PAD = 48;

/** Height that shows the whole graph at a readable zoom on wide screens; phones pan inside a fixed box. */
function graphHeight(layout: Layout, width: number, compact: boolean) {
  if (compact) return 460;
  const zoom = Math.min(1, (width - PAD) / (layout.width + 2 * LANE_PAD_X));
  return Math.round(Math.min(780, Math.max(380, layout.height * zoom + PAD)));
}

export function RunGraph(props: GraphProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const layout = useMemo(() => layoutRun(props.nodes), [props.nodes]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const compact = width > 0 && width < 640;
  return (
    <div ref={box} className="w-full" style={{ height: width ? graphHeight(layout, width, compact) : 460 }}>
      {width > 0 && (
        <ReactFlowProvider>
          <Flow {...props} layout={layout} compact={compact} />
        </ReactFlowProvider>
      )}
    </div>
  );
}

import { describe, expect, it } from "vitest";
import type { AgentRole, NodeStatus } from "./contract";
import { COL_GAP, edgesFor, LANE_GAP, type LayoutNode, laneKeyOf, layoutRun, MAX_STACK, NODE_H, NODE_W } from "./layout";

const node = (id: string, role: AgentRole, iteration: number, parents: string[] = [], status: NodeStatus = "done"): LayoutNode => ({
  id,
  role,
  iteration,
  parents,
  status,
});

/** profile → (planner → 3 workers → analyst → checker) × 2 → composer → validator */
function twoIterationRun(): LayoutNode[] {
  return [
    node("profile", "worker", 0),
    node("p1", "planner", 1, ["profile"]),
    node("w1a", "worker", 1, ["p1"]),
    node("w1b", "worker", 1, ["p1"]),
    node("w1c", "worker", 1, ["p1"]),
    node("a1", "analyst", 1, ["w1a", "w1b", "w1c"]),
    node("c1", "checker", 1, ["a1"]),
    node("p2", "planner", 2, ["c1", "profile"]),
    node("w2a", "worker", 2, ["p2"]),
    node("a2", "analyst", 2, ["w2a"]),
    node("c2", "checker", 2, ["a2"], "running"),
    node("comp", "composer", 2, ["c2"]),
    node("val", "validator", 2, ["comp"]),
  ];
}

describe("laneKeyOf", () => {
  it("puts composer and validator in the answer lane whatever their iteration", () => {
    expect(laneKeyOf({ role: "composer", iteration: 3 })).toBe("answer");
    expect(laneKeyOf({ role: "validator", iteration: 0 })).toBe("answer");
  });
  it("puts iteration 0 (the profile) in the setup lane and clamps bad iterations", () => {
    expect(laneKeyOf({ role: "worker", iteration: 0 })).toBe("setup");
    expect(laneKeyOf({ role: "worker", iteration: -2 })).toBe("setup");
    expect(laneKeyOf({ role: "planner", iteration: 2 })).toBe("iteration-2");
  });
});

describe("layoutRun", () => {
  it("is deterministic", () => {
    expect(layoutRun(twoIterationRun())).toEqual(layoutRun(twoIterationRun()));
  });

  it("orders lanes setup → iterations → answer, top to bottom", () => {
    const l = layoutRun(twoIterationRun());
    expect(l.lanes.map((x) => x.key)).toEqual(["setup", "iteration-1", "iteration-2", "answer"]);
    expect(l.lanes.map((x) => x.label)).toEqual(["Setup", "Iteration 1", "Iteration 2", "Answer"]);
    for (let i = 1; i < l.lanes.length; i++) {
      expect(l.lanes[i].y).toBe(l.lanes[i - 1].y + l.lanes[i - 1].height + LANE_GAP);
    }
    // every node sits inside its lane's band
    for (const [id, p] of Object.entries(l.positions)) {
      const lane = l.lanes.find((x) => x.key === l.laneOf[id])!;
      expect(p.y).toBeGreaterThanOrEqual(lane.y);
      expect(p.y + NODE_H).toBeLessThanOrEqual(lane.y + lane.height);
      expect(p.x).toBeGreaterThanOrEqual(lane.x);
      expect(p.x + NODE_W).toBeLessThanOrEqual(lane.x + lane.width);
    }
  });

  it("uses role columns: planner → workers → analyst → checker", () => {
    const { positions: p } = layoutRun(twoIterationRun());
    expect(p.p1.x).toBeLessThan(p.w1a.x);
    expect(p.w1a.x).toBeLessThan(p.a1.x);
    expect(p.a1.x).toBeLessThan(p.c1.x);
    // the same role lines up across iterations
    expect(p.p2.x).toBe(p.p1.x);
    expect(p.a2.x).toBe(p.a1.x);
    expect(p.c2.x).toBe(p.c1.x);
  });

  it("stacks workers vertically in one column and centres single nodes against the stack", () => {
    const { positions: p } = layoutRun(twoIterationRun());
    expect(new Set([p.w1a.x, p.w1b.x, p.w1c.x]).size).toBe(1);
    expect(p.w1b.y).toBe(p.w1a.y + NODE_H + 14);
    expect(p.w1c.y).toBeGreaterThan(p.w1b.y);
    expect(p.p1.y).toBe(p.w1b.y); // middle of three
    expect(p.a1.y).toBe(p.w1b.y);
  });

  it("lays the setup and answer lanes out left to right in start order", () => {
    const { positions: p } = layoutRun(twoIterationRun());
    expect(p.profile.x).toBe(0);
    expect(p.comp.x).toBe(0);
    expect(p.val.x).toBe(NODE_W + COL_GAP);
    expect(p.val.y).toBe(p.comp.y);
  });

  it("wraps long worker stacks into extra sub-columns and keeps later roles aligned", () => {
    const workers = Array.from({ length: MAX_STACK + 2 }, (_, i) => node(`w${i}`, "worker", 1, ["p1"]));
    const nodes = [node("p1", "planner", 1), ...workers, node("a1", "analyst", 1), node("p2", "planner", 2), node("a2", "analyst", 2)];
    const { positions: p, lanes } = layoutRun(nodes);
    const xs = [...new Set(workers.map((w) => p[w.id].x))];
    expect(xs).toHaveLength(2);
    // evenly split (4 + 4), not 6 + 2
    expect(workers.filter((w) => p[w.id].x === xs[0])).toHaveLength(4);
    expect(p.a1.x).toBeGreaterThan(Math.max(...xs));
    expect(p.a2.x).toBe(p.a1.x);
    expect(lanes.find((l) => l.key === "iteration-1")!.height).toBeGreaterThan(lanes.find((l) => l.key === "iteration-2")!.height);
  });

  it("handles an empty run", () => {
    expect(layoutRun([])).toEqual({ positions: {}, laneOf: {}, lanes: [], width: NODE_W, height: 0 });
  });

  it("keeps ~40 nodes inside a sane box", () => {
    const nodes: LayoutNode[] = [node("profile", "worker", 0)];
    for (let it = 1; it <= 5; it++) {
      nodes.push(node(`p${it}`, "planner", it));
      for (let w = 0; w < 6; w++) nodes.push(node(`w${it}-${w}`, "worker", it, [`p${it}`]));
      nodes.push(node(`a${it}`, "analyst", it), node(`c${it}`, "checker", it));
    }
    nodes.push(node("comp", "composer", 5), node("val", "validator", 5));
    const l = layoutRun(nodes);
    expect(Object.keys(l.positions)).toHaveLength(nodes.length);
    expect(l.width).toBe(4 * (NODE_W + COL_GAP) - COL_GAP);
    // no two nodes overlap
    const pts = Object.values(l.positions);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const overlap = Math.abs(pts[i].x - pts[j].x) < NODE_W && Math.abs(pts[i].y - pts[j].y) < NODE_H;
        expect(overlap).toBe(false);
      }
  });
});

describe("edgesFor", () => {
  it("draws one edge per known parent and skips unknown or self parents", () => {
    const nodes = [node("a", "planner", 1), node("b", "worker", 1, ["a", "ghost", "b", "a"])];
    const edges = edgesFor(nodes, layoutRun(nodes));
    expect(edges.map((e) => e.id)).toEqual(["a->b"]);
  });

  it("routes same-lane edges left → right and cross-lane edges through the gap above the target lane", () => {
    const nodes = twoIterationRun();
    const l = layoutRun(nodes);
    const edges = edgesFor(nodes, l);
    const flow = edges.find((e) => e.id === "p1->w1a")!;
    expect(flow).toMatchObject({ kind: "flow", sourceHandle: "r", targetHandle: "l" });
    expect(flow.centerY).toBeUndefined();
    const loop = edges.find((e) => e.id === "c1->p2")!;
    const lane2 = l.lanes.find((x) => x.key === "iteration-2")!;
    expect(loop).toMatchObject({ kind: "lane", sourceHandle: "b", targetHandle: "t", centerY: lane2.y - LANE_GAP / 2 });
    expect(edges.find((e) => e.id === "c2->comp")?.kind).toBe("lane");
  });

  it("animates edges into running nodes only", () => {
    const nodes = twoIterationRun();
    const edges = edgesFor(nodes, layoutRun(nodes));
    expect(edges.filter((e) => e.animated).map((e) => e.id)).toEqual(["a2->c2"]);
    expect(edges.find((e) => e.id === "a2->c2")?.status).toBe("running");
  });
});

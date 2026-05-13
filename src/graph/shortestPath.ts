import type { GraphNode, RoadGraph } from "./graphBuilder";

export interface PathResult {
  distance: number;
  path: GraphNode[];
}

export function dijkstraFromSources(graph: RoadGraph, sources: GraphNode[]): Map<GraphNode, number> {
  const distances = new Map<GraphNode, number>();
  const queue: Array<[GraphNode, number]> = [];
  for (const source of sources) {
    if (!graph.nodes.has(source)) continue;
    distances.set(source, 0);
    queue.push([source, 0]);
  }
  while (queue.length > 0) {
    queue.sort((a, b) => a[1] - b[1]);
    const [node, distance] = queue.shift()!;
    if (distance > (distances.get(node) ?? Infinity)) continue;
    for (const edge of graph.adjacency.get(node) ?? []) {
      const nextDistance = distance + edge.weight;
      if (nextDistance < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, nextDistance);
        queue.push([edge.to, nextDistance]);
      }
    }
  }
  return distances;
}

export function shortestPathBetweenSets(
  graph: RoadGraph,
  sources: GraphNode[],
  targets: GraphNode[]
): PathResult | undefined {
  const targetSet = new Set(targets);
  const distances = new Map<GraphNode, number>();
  const previous = new Map<GraphNode, GraphNode>();
  const queue: Array<[GraphNode, number]> = [];
  for (const source of sources) {
    if (!graph.nodes.has(source)) continue;
    distances.set(source, 0);
    queue.push([source, 0]);
  }
  while (queue.length > 0) {
    queue.sort((a, b) => a[1] - b[1]);
    const [node, distance] = queue.shift()!;
    if (distance > (distances.get(node) ?? Infinity)) continue;
    if (targetSet.has(node)) {
      const path = [node];
      let cursor = node;
      while (previous.has(cursor)) {
        cursor = previous.get(cursor)!;
        path.push(cursor);
      }
      return { distance, path: path.reverse() };
    }
    for (const edge of graph.adjacency.get(node) ?? []) {
      const nextDistance = distance + edge.weight;
      if (nextDistance < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, node);
        queue.push([edge.to, nextDistance]);
      }
    }
  }
  return undefined;
}

export function reachableFrom(graph: RoadGraph, sources: GraphNode[]): Set<GraphNode> {
  return new Set(dijkstraFromSources(graph, sources).keys());
}

export function reverseGraph(graph: RoadGraph): RoadGraph {
  const adjacency = new Map<GraphNode, Array<{ from: GraphNode; to: GraphNode; weight: number }>>();
  for (const node of graph.nodes) adjacency.set(node, []);
  for (const edges of graph.adjacency.values()) {
    for (const edge of edges) {
      adjacency.get(edge.to)?.push({ from: edge.to, to: edge.from, weight: edge.weight });
    }
  }
  return { nodes: new Set(graph.nodes), adjacency };
}

export function pathEdges(path: GraphNode[]): string[] {
  const edges: string[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    edges.push(`${path[i]}>${path[i + 1]}`);
  }
  return edges;
}

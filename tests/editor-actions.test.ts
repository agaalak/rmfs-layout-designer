import { describe, expect, it } from "vitest";
import { useLayoutStore } from "../src/store/layoutStore";

describe("editor actions", () => {
  it("adds, moves, rotates, deletes, and undoes a rack", () => {
    const store = useLayoutStore.getState();
    store.newLayout({ rows: 8, columns: 8 });
    useLayoutStore.getState().addRack({ row: 2, col: 2 });
    let layout = useLayoutStore.getState().history.present;
    const rack = layout.racks.at(-1)!;
    expect(rack.homeCell).toEqual({ row: 2, col: 2 });

    useLayoutStore.getState().moveObject({ kind: "rack", id: rack.id }, { row: 3, col: 4 });
    layout = useLayoutStore.getState().history.present;
    expect(layout.racks.find((item) => item.id === rack.id)?.homeCell).toEqual({ row: 3, col: 4 });

    useLayoutStore.getState().setSelection([{ kind: "rack", id: rack.id }]);
    useLayoutStore.getState().rotateSelected();
    expect(useLayoutStore.getState().history.present.racks.find((item) => item.id === rack.id)?.currentOrientationDeg).toBe(90);

    useLayoutStore.getState().deleteSelected();
    expect(useLayoutStore.getState().history.present.racks.some((item) => item.id === rack.id)).toBe(false);

    useLayoutStore.getState().undo();
    expect(useLayoutStore.getState().history.present.racks.some((item) => item.id === rack.id)).toBe(true);
  });

  it("uses 1.5 m default cells and 1.2 m rack footprints for new manual racks", () => {
    useLayoutStore.getState().newLayout({ rows: 8, columns: 8 });
    const layout = useLayoutStore.getState().history.present;
    expect(layout.grid.cellWidthM).toBe(1.5);
    expect(layout.grid.cellDepthM).toBe(1.5);

    useLayoutStore.getState().addRack({ row: 2, col: 2 });
    const rack = useLayoutStore.getState().history.present.racks.at(-1)!;
    expect(rack.footprintWidthM).toBe(1.2);
    expect(rack.footprintDepthM).toBe(1.2);
  });

  it("does not create queue cells when adding a station manually", () => {
    useLayoutStore.getState().newLayout({ rows: 8, columns: 8 });
    useLayoutStore.getState().addStation({ row: 3, col: 3 });
    const layout = useLayoutStore.getState().history.present;

    expect(layout.stations).toHaveLength(1);
    expect(layout.stations[0].queueLaneIds).toEqual([]);
    expect(layout.queueLanes).toHaveLength(0);
    expect(layout.cells.filter((cell) => cell.cellType === "QUEUE")).toHaveLength(0);
  });

  it("uses the last edited rack geometry for subsequently added racks", () => {
    useLayoutStore.getState().newLayout({ rows: 8, columns: 8 });
    useLayoutStore.getState().addRack({ row: 2, col: 2 });
    const first = useLayoutStore.getState().history.present.racks.at(-1)!;

    useLayoutStore.getState().updateRack(first.id, { footprintWidthM: 1.2, footprintDepthM: 2.4, currentOrientationDeg: 90 });
    useLayoutStore.getState().addRack({ row: 4, col: 4 });
    const second = useLayoutStore.getState().history.present.racks.at(-1)!;

    expect(second.footprintWidthM).toBe(1.2);
    expect(second.footprintDepthM).toBe(2.4);
    expect(second.currentOrientationDeg).toBe(90);
  });

  it("selects a traffic cell and creates directed road directions", () => {
    useLayoutStore.getState().newLayout({ rows: 4, columns: 4 });
    useLayoutStore.getState().selectCell({ row: 1, col: 1 });
    expect(useLayoutStore.getState().selectedCell).toEqual({ row: 1, col: 1 });

    useLayoutStore.getState().setCellDirections({ row: 1, col: 1 }, ["east"]);
    const cell = useLayoutStore.getState().history.present.cells.find((item) => item.row === 1 && item.col === 1);

    expect(cell?.cellType).toBe("ROAD");
    expect(cell?.allowedDirections).toEqual(["east"]);
  });

  it("uses the last edited road traffic properties for subsequently drawn road cells", () => {
    useLayoutStore.getState().newLayout({ rows: 4, columns: 4 });
    useLayoutStore.getState().setCellDirections({ row: 1, col: 1 }, ["east"]);
    useLayoutStore.getState().updateCell({ row: 1, col: 1 }, { allowRotation: true, supportedRotationOrientationsDeg: [90, 180], rotationTimeSec: 9, rotationCapacity: 2 });

    useLayoutStore.getState().drawCell({ row: 1, col: 2 }, "ROAD");
    const cell = useLayoutStore.getState().history.present.cells.find((item) => item.row === 1 && item.col === 2);

    expect(cell?.allowedDirections).toEqual(["east"]);
    expect(cell?.allowRotation).toBe(true);
    expect(cell?.supportedRotationOrientationsDeg).toEqual([90, 180]);
    expect(cell?.rotationTimeSec).toBe(9);
    expect(cell?.rotationCapacity).toBe(2);
  });
});

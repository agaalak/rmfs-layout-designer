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

  it("selects a traffic cell and creates directed road directions", () => {
    useLayoutStore.getState().newLayout({ rows: 4, columns: 4 });
    useLayoutStore.getState().selectCell({ row: 1, col: 1 });
    expect(useLayoutStore.getState().selectedCell).toEqual({ row: 1, col: 1 });

    useLayoutStore.getState().setCellDirections({ row: 1, col: 1 }, ["east"]);
    const cell = useLayoutStore.getState().history.present.cells.find((item) => item.row === 1 && item.col === 1);

    expect(cell?.cellType).toBe("ROAD");
    expect(cell?.allowedDirections).toEqual(["east"]);
  });
});

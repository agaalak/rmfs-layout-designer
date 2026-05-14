# Order And Inventory Quickstart

Simulation Mode needs rack-bin SKU inventory before it can create inventory-backed RMFS work.

## Small Demo

Small Demo includes sample SKU inventory on rack bins and can initialize simulation and generate tasks immediately.

## Empty Or Manual Layouts

An empty layout is allowed to remain truly empty. If you create a manual layout and switch to Simulate Experimental, the Readiness card explains what is missing.

Common readiness issues:

- no rack SKU inventory
- no orders
- no rack/storage locations
- no stations or queue/service cells
- no parking/charger/perimeter spawn cells
- invalid layout connectivity

## One-Click Actions

In Simulate Experimental -> Orders & Inventory:

- Populate Inventory: fills rack bins with sample SKUs and positive quantities.
- Refresh Inventory: refreshes the simulation inventory snapshot from current rack bins.
- Generate Orders: creates sample orders from available inventory.
- Clear Orders: removes generated orders.
- Clear Inventory: clears generated rack-bin SKUs/quantities and the simulation snapshot.
- Auto-fix Readiness: populates rack inventory, refreshes the snapshot, and generates sample orders where safe.

If no SKU inventory exists, order generation reports a clear warning instead of silently failing.

## Notes

- Sample orders are synthetic and intended for local simulation demos.
- Pick station service decrements inventory when service completes.
- Replenishment helpers exist, but the current UI remains pick-order focused.
- This does not import real customer order waves yet.

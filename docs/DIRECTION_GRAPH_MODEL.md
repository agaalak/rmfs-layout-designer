# Direction Graph Model

Date: 2026-05-23

Direction is now modeled as center-to-center directed links between orthogonally adjacent traversable cells. A one-way aisle is one enabled `DirectedNeighborLink`; a two-way aisle is two opposite links.

## Runtime Rule

The graph builder prefers persisted `layout.directedLinks`. When older layouts only have cell-local `allowedDirections`, import normalization derives links from those cells. This keeps old files loadable while making runtime path planning use one canonical link set.

Station cells, pod service cells, chargers, parking cells, and queue pre-points are graph nodes with controlled entry. They are not incidental shortcuts for unrelated routes.

## Current UI State

The existing Direction/Traffic tool still exposes cell direction controls, but every edit now synchronizes the underlying directed links. The canvas arrow layer renders those links center-to-center, including offset arrows for bidirectional edges.

## Limitations

This is not full RAWSim-O path management or MAPF. It is the deterministic graph foundation needed before adding WHCA-style rolling reservations.

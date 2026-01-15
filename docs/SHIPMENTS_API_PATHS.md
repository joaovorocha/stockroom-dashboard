# Shipments API Routes — Quick Reference

This file documents the main `shipments` API endpoints implemented in `routes/shipments.js` for future reference.

Base path: `/api/shipments`

- `GET /api/shipments` : List shipments. Supports query filters: `status`, `customer_email`, `order_number`, `tracking_number`. Use `all=true` to return full dataset or `since=<ISO>` to set a start date. Returns `{ shipments: [...] }` with camelCased keys.

	- Server-side behavior: by default the endpoint returns only shipments whose tracking number starts with `1Z`. To override (development use only) include `allow_non_1z=true` in the query string.

- `GET /api/shipments/:id` : Get a single shipment by internal ID. Returns shipment plus `items` and `scans` arrays.

- `POST /api/shipments` : Create a new shipment. Accepts manual payload or a PredictSpring fulfillment payload via `ps_fulfillment`. If `items` present they will be created alongside the shipment. Returns the created `shipment`.

- `PATCH /api/shipments/:id` : Update shipment fields (status, address, estimated delivery, etc.). Performs DB update and returns the updated `shipment`.

- `POST /api/shipments/:id/items` : Add an item to a shipment. Body becomes the item record (DB `shipment_items`). Returns created `item`.

- `PATCH /api/shipments/items/:itemId` : Update an existing shipment item. Returns updated `item`.

- `POST /api/shipments/:id/scan` : Record an RFID scan event for a shipment. Body should include scan metadata; returns the created `event`.

- `POST /api/shipments/:id/validate-address` : Validate the shipment's address using UPS address validation. Returns UPS validation result.

- `POST /api/shipments/:id/label` : Generate UPS shipping label (ZPL). Contacts UPS, saves label info to shipment (`tracking_number`, `label_file_path`, `ups_raw_response`), and returns the label payload.

- `POST /api/shipments/:id/print-label` : Send the generated ZPL label to a Zebra printer. Expects `printerIp` and optional `printerPort` in body.

- `PATCH /api/shipments/:id/status` : Update shipment status for BOH workflow (PICKING, PACKING, PACKED, IN_TRANSIT, etc.). Automatically sets timestamp fields and broadcasts real-time updates when available.

- `PATCH /api/shipments/:id/assign-picker` : Assign a picker and transition to `PICKING`. Sets `assigned_picker_id` and `picking_started_at`.

- `POST /api/shipments/:id/items/:itemId/pick` : Mark an item as picked. If all items are picked, auto-transitions shipment to `READY_TO_PACK` and broadcasts update.

- `POST /api/shipments/:id/generate-label` : Alias for `/label`, creates a UPS label and sets `status: 'LABEL_CREATED'`.

Notes:
- Responses generally return JSON with camelCased keys (server converts snake_case DB rows).
- Authentication/middleware is applied at `server.js` level — use `X-Dev-User` only in development scenarios.
- Real-time broadcasts use an app-level `broadcastUpdate` function when present.

File: `routes/shipments.js`

Keep this file in sync with route logic when adding new endpoints or changing payload shapes.

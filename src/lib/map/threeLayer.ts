/**
 * The public entry for every three.js layer. The layers live in
 * `src/lib/map/three/` and draw through ONE WebGLRenderer per MapLibre GL
 * context (`sharedRenderer` in three/core.ts). Only that folder, this file and
 * streetSigns.ts may import three.js. Layers only repaint when their content
 * changes.
 */
export { sharedRenderer } from "./three/core";
export * from "./three/vehicles";
export * from "./three/hydrants";
export * from "./three/streetSigns";
export * from "./three/furniture";
export * from "./three/storefronts";
export * from "./three/landmarks";
export * from "./three/overpasses";

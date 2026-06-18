import "server-only";

// Re-export everything from the core module with the server-only guard applied.
// Route Handlers (app/api/**) import from here.
// Scripts import directly from lib/blizzard-core.ts to avoid the guard.
export * from "./blizzard-core";

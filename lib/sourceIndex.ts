import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

export type SourceEntry = {
  instanceId:    number;
  instanceName:  string;
  encounterId:   number;
  encounterName: string;
  type: "raid" | "dungeon";
};
export type SourceIndex = Record<string, { sources: SourceEntry[] }>;

let _sourceIndex: SourceIndex | null = null;

export function getSourceIndex(): SourceIndex {
  if (!_sourceIndex) {
    _sourceIndex = JSON.parse(
      readFileSync(join(process.cwd(), "data", "source-index.json"), "utf-8")
    ) as SourceIndex;
  }
  return _sourceIndex;
}

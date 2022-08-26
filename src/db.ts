import type { db } from "./internal-types";

export function lookupByName(db: db, pkg: string) {
  return db[pkg];
} 

export function getAllPackages(db: db) {
  return Object.keys(db);
}

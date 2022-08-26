"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllPackages = exports.lookupByName = void 0;
function lookupByName(db, pkg) {
    return db[pkg];
}
exports.lookupByName = lookupByName;
function getAllPackages(db) {
    return Object.keys(db);
}
exports.getAllPackages = getAllPackages;

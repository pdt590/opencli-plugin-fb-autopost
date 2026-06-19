import fs from 'node:fs';
import path from 'node:path';
import { parseGroupUrl } from './validate.js';
import { normalizeGroups, readOptionalJson } from './local-config.js';

export class GroupStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GroupStoreError';
  }
}

export function createGroupStore({ repoRoot = process.cwd() } = {}) {
  const configDir = path.resolve(repoRoot, 'config');
  return {
    repoRoot,
    configDir,
    groupsPath: path.join(configDir, 'groups.json'),
  };
}

export function readGroupsFile(store) {
  const value = readOptionalJson(store.groupsPath) || { groups: [] };
  return {
    groups: normalizeGroups(value.groups || []),
  };
}

export function writeGroupsFile(store, value) {
  fs.mkdirSync(store.configDir, { recursive: true });
  const normalized = {
    groups: normalizeGroups(value.groups || []),
  };
  const tempPath = `${store.groupsPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`);
  fs.renameSync(tempPath, store.groupsPath);
  return normalized;
}

export function listGroups(store) {
  return readGroupsFile(store).groups;
}

export function findGroup(store, alias) {
  return listGroups(store).find((group) => group.alias === alias) || null;
}

export function addGroup(store, { alias, url, label, approvedForPosting = false }) {
  const normalizedAlias = normalizeAlias(alias);
  const groupUrl = parseGroupUrl(url);
  const file = readGroupsFile(store);
  if (file.groups.some((group) => group.alias === normalizedAlias)) {
    throw new GroupStoreError(`duplicate group alias: ${normalizedAlias}`);
  }

  const group = {
    alias: normalizedAlias,
    label: label || normalizedAlias,
    url: groupUrl,
    approvedForPosting: approvedForPosting === true,
  };
  file.groups.push(group);
  writeGroupsFile(store, file);
  return group;
}

export function approveGroup(store, alias) {
  return updateGroup(store, alias, (group) => ({
    ...group,
    approvedForPosting: true,
  }));
}

export function removeGroup(store, alias) {
  const normalizedAlias = normalizeAlias(alias);
  const file = readGroupsFile(store);
  const nextGroups = file.groups.filter((group) => group.alias !== normalizedAlias);
  if (nextGroups.length === file.groups.length) throw new GroupStoreError(`Unknown group alias: ${normalizedAlias}`);
  writeGroupsFile(store, { groups: nextGroups });
  return true;
}

export function renameGroup(store, oldAlias, newAlias) {
  const normalizedOld = normalizeAlias(oldAlias);
  const normalizedNew = normalizeAlias(newAlias);
  const file = readGroupsFile(store);
  if (file.groups.some((group) => group.alias === normalizedNew)) {
    throw new GroupStoreError(`duplicate group alias: ${normalizedNew}`);
  }

  const index = file.groups.findIndex((group) => group.alias === normalizedOld);
  if (index < 0) throw new GroupStoreError(`Unknown group alias: ${normalizedOld}`);
  const group = {
    ...file.groups[index],
    alias: normalizedNew,
  };
  file.groups[index] = group;
  writeGroupsFile(store, file);
  return group;
}

export function updateGroup(store, alias, updater) {
  const normalizedAlias = normalizeAlias(alias);
  const file = readGroupsFile(store);
  const index = file.groups.findIndex((group) => group.alias === normalizedAlias);
  if (index < 0) throw new GroupStoreError(`Unknown group alias: ${normalizedAlias}`);
  const next = updater(file.groups[index]);
  file.groups[index] = {
    ...next,
    alias: normalizedAlias,
    url: parseGroupUrl(next.url),
    approvedForPosting: next.approvedForPosting === true,
  };
  writeGroupsFile(store, file);
  return file.groups[index];
}

export function normalizeAlias(alias) {
  if (!alias || typeof alias !== 'string') throw new GroupStoreError('Group alias is required');
  const normalized = alias.trim().toLowerCase().replace(/\s+/g, '-');
  if (!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(normalized)) {
    throw new GroupStoreError('Group alias must start with a letter or number and use letters, numbers, dot, underscore, or dash');
  }
  return normalized;
}

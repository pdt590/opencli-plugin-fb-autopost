import fs from 'node:fs';
import path from 'node:path';
import { parseGroupUrl } from './validate.js';

export const DEFAULT_SETTINGS = {
  artifactsDir: './artifacts/facebook-group-post',
};

export function loadLocalConfig(repoRoot = process.cwd()) {
  const configDir = path.join(repoRoot, 'config');
  const settingsPath = path.join(configDir, 'settings.json');
  const groupsPath = path.join(configDir, 'groups.json');
  const settings = readOptionalJson(settingsPath) || {};
  const groupsConfig = readOptionalJson(groupsPath) || { groups: [] };

  return {
    repoRoot,
    paths: {
      settings: settingsPath,
      groups: groupsPath,
    },
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
    },
    groups: normalizeGroups(groupsConfig.groups || []),
  };
}

export function resolveGroupAlias(config, alias) {
  const group = config.groups.find((candidate) => candidate.alias === alias);
  if (!group) {
    throw new Error(`Unknown group alias "${alias}". Add it with: npm run setup -- --group-url "https://www.facebook.com/groups/<GROUP_ID>" --group-alias ${alias}`);
  }
  if (group.approvedForPosting !== true) {
    throw new Error(`Group alias "${alias}" is not approved for posting`);
  }
  return group.url;
}

export function normalizeGroups(groups) {
  if (!Array.isArray(groups)) {
    throw new Error('config/groups.json must contain a groups array');
  }

  const aliases = new Set();
  return groups.map((group) => {
    if (!group || typeof group !== 'object') throw new Error('each group config entry must be an object');
    if (!group.alias || typeof group.alias !== 'string') throw new Error('each group config entry needs an alias');
    if (aliases.has(group.alias)) throw new Error(`duplicate group alias: ${group.alias}`);
    aliases.add(group.alias);
    return {
      ...group,
      url: parseGroupUrl(group.url),
      approvedForPosting: group.approvedForPosting === true,
    };
  });
}

export function readOptionalJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

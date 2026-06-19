import {
  buildListMessage,
  buildReplyButtonMessage,
  buildTextMessage,
} from './send-message.js';

export const ACTION_PREFIX = 'fb_autopost:action:';
export const MENU_THRESHOLD_FOR_LIST = 4;

export const MENUS = {
  main: {
    title: 'Main Menu',
    body: 'Choose what you want to do.',
    type: 'list',
    sectionTitle: 'Facebook Autopost',
    items: [
      { action: 'new_post', title: 'New Post', description: 'Create a Facebook group draft' },
      { action: 'drafts', title: 'Drafts', description: 'View draft status' },
      { action: 'groups', title: 'Groups', description: 'Manage approved groups' },
      { action: 'settings', title: 'Settings', description: 'Show local readiness and safety mode' },
      { action: 'help', title: 'Help', description: 'How this bot works safely' },
    ],
  },
  new_post: {
    title: 'New Post',
    body: 'Choose how to select the Facebook group.',
    type: 'buttons',
    items: [
      { action: 'use_existing_group', title: 'Use Existing Group' },
      { action: 'add_group_url', title: 'Add New Group URL' },
      { action: 'cancel', title: 'Cancel' },
    ],
  },
  drafts: {
    title: 'Drafts',
    body: 'View the recent local draft statuses for this WhatsApp conversation.',
    type: 'buttons',
    items: [
      { action: 'main_menu', title: 'Main Menu' },
      { action: 'help', title: 'Help' },
    ],
  },
  groups: {
    title: 'Groups',
    body: 'View locally approved Facebook group aliases.',
    type: 'buttons',
    items: [
      { action: 'main_menu', title: 'Main Menu' },
      { action: 'help', title: 'Help' },
    ],
  },
  settings: {
    title: 'Settings',
    body: 'Settings status checks are not built yet. Safe mode is dry-run first.',
    type: 'buttons',
    items: [
      { action: 'main_menu', title: 'Main Menu' },
      { action: 'help', title: 'Help' },
    ],
  },
  help: {
    title: 'Help',
    body: [
      'This bot prepares Facebook group post drafts through the local office/laptop machine.',
      'It cannot publish from the first message.',
      'Facebook automation stays in the local OpenCLI plugin and browser session.',
    ].join('\n'),
    type: 'buttons',
    items: [
      { action: 'main_menu', title: 'Main Menu' },
      { action: 'cancel', title: 'Cancel' },
    ],
  },
};

export const VALID_ACTIONS = new Set(
  Object.values(MENUS)
    .flatMap((menu) => menu.items)
    .map((item) => item.action)
    .concat(['dry_run', 'post', 'done', 'no_images', 'approve_group']),
);

export function renderMenu(menuName = 'main', { to } = {}) {
  const menu = MENUS[menuName] || MENUS.help;
  const body = `${menu.title}\n${menu.body}\n\n${buildTextFallback(menuName)}`;
  const items = menu.items.map((item) => ({
    ...item,
    id: encodeActionId(item.action),
  }));

  if (menu.type === 'list' || items.length >= MENU_THRESHOLD_FOR_LIST) {
    return buildListMessage({
      to,
      body,
      sectionTitle: menu.sectionTitle || menu.title,
      rows: items,
    });
  }

  return buildReplyButtonMessage({
    to,
    body,
    buttons: items,
  });
}

export function renderTextFallback(menuName = 'main', { to } = {}) {
  const menu = MENUS[menuName] || MENUS.help;
  return buildTextMessage({
    to,
    text: `${menu.title}\n${menu.body}\n\n${buildTextFallback(menuName)}`,
  });
}

export function buildTextFallback(menuName = 'main') {
  const menu = MENUS[menuName] || MENUS.help;
  const choices = menu.items
    .map((item, index) => `${index + 1}=${item.title}`)
    .join(', ');
  return `Reply ${choices}.`;
}

export function encodeActionId(action) {
  return `${ACTION_PREFIX}${action}`;
}

export function decodeActionId(rawId) {
  if (!rawId || typeof rawId !== 'string') return null;
  const value = rawId.trim();
  if (value.startsWith(ACTION_PREFIX)) return normalizeAction(value.slice(ACTION_PREFIX.length));
  if (value.startsWith('action:')) return normalizeAction(value.slice('action:'.length));
  return normalizeAction(value);
}

export function parseTextFallback(text, menuName = 'main') {
  if (typeof text !== 'string') return null;
  const value = text.trim();
  const lower = value.toLowerCase();
  const menu = MENUS[menuName] || MENUS.main;
  const numericMatch = /^([1-9]\d*)$/.exec(value);

  if (numericMatch) {
    const item = menu.items[Number(numericMatch[1]) - 1];
    return item ? item.action : null;
  }

  if (lower === 'menu') return 'main_menu';
  if (lower === 'help') return 'help';
  if (lower === 'cancel') return 'cancel';
  if (lower === 'dry run' || lower === 'dry-run' || lower === 'dry_run') return 'dry_run';
  if (lower === 'post') return 'post';
  if (lower === 'done') return 'done';
  if (lower === 'no images' || lower === 'no-images' || lower === 'no_images') return 'no_images';
  if (lower === 'approve group' || lower === 'approve-group' || lower === 'approve_group') return 'approve_group';
  if (lower === 'new post' || lower === 'new-post' || lower === 'new_post') return 'new_post';

  return null;
}

function normalizeAction(action) {
  if (!action || typeof action !== 'string') return null;
  const normalized = action.trim().toLowerCase().replaceAll('-', '_');
  return VALID_ACTIONS.has(normalized) ? normalized : null;
}

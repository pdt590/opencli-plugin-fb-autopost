export function chooseProfile(profile, command, runCommand, cwd = process.cwd()) {
  if (profile) return profile;
  const result = runCommand(command, ['profile', 'list'], { cwd });
  let inventory;
  try { inventory = JSON.parse(result.output); } catch { throw new Error('Could not read OpenCLI profile inventory'); }
  if (result.status !== 0 || inventory.ok === false) throw new Error('OpenCLI profile discovery failed');
  const profiles = inventory.data?.profiles ?? inventory.profiles;
  if (!Array.isArray(profiles)) throw new Error('Invalid OpenCLI profile inventory');
  const connected = profiles.filter(item => item.connected === true);
  if (!connected.length) throw new Error('No connected browser profile. Open Browser Bridge and retry.');
  if (connected.length > 1) throw new Error('Multiple connected profiles. Set job.profile explicitly using opencli profile list.');
  // With one available context, let OpenCLI/Browser Bridge use its default routing.
  return undefined;
}

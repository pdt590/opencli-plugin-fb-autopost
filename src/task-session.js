// Shared lifecycle for post-person, post-group and all post-clone commands.
// Browser Bridge owns the session; this never launches or terminates Chrome.
export async function closeTaskSession(page, ownedTab) {
  if (typeof page?.closeWindow !== 'function') {
    if (ownedTab) await page.closeTab(ownedTab);
    return;
  }
  const previous = process.env.OPENCLI_CLOSE_OWNED_TAB;
  process.env.OPENCLI_CLOSE_OWNED_TAB = '1';
  try {
    await page.closeWindow();
    // OpenCLI also releases the lease after the adapter returns; release only once.
    page.closeWindow = async () => {};
  } finally {
    if (previous === undefined) delete process.env.OPENCLI_CLOSE_OWNED_TAB;
    else process.env.OPENCLI_CLOSE_OWNED_TAB = previous;
  }
}

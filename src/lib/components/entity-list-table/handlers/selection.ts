export function createSelectionHandlers(
  getSelectedKeys: () => string[],
  getOnSelectedKeysChange: () => (keys: string[]) => void,
  getPageKeys: () => string[],
  getAllOnPageSelected: () => boolean
) {
  function toggleRowSelect(key: string) {
    const selectedKeys = getSelectedKeys();
    const onSelectedKeysChange = getOnSelectedKeysChange();
    if (selectedKeys.includes(key)) {
      onSelectedKeysChange(selectedKeys.filter((k) => k !== key));
    } else {
      onSelectedKeysChange([...selectedKeys, key]);
    }
  }

  function toggleAllOnPage() {
    const selectedKeys = getSelectedKeys();
    const pageKeys = getPageKeys();
    const allOnPageSelected = getAllOnPageSelected();
    const onSelectedKeysChange = getOnSelectedKeysChange();

    if (allOnPageSelected) {
      const remove = new Set(pageKeys);
      onSelectedKeysChange(selectedKeys.filter((k) => !remove.has(k)));
      return;
    }
    const next = new Set(selectedKeys);
    for (const k of pageKeys) next.add(k);
    onSelectedKeysChange([...next]);
  }

  return {
    toggleRowSelect,
    toggleAllOnPage
  };
}

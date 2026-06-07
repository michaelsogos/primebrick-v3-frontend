export function createSelectionHandlers(
  selectedKeys: string[],
  onSelectedKeysChange: (keys: string[]) => void,
  pageKeys: string[],
  allOnPageSelected: boolean
) {
  function toggleRowSelect(key: string) {
    if (selectedKeys.includes(key)) {
      onSelectedKeysChange(selectedKeys.filter((k) => k !== key));
    } else {
      onSelectedKeysChange([...selectedKeys, key]);
    }
  }

  function toggleAllOnPage() {
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

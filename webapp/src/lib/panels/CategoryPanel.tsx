'use client';

import { useMemo } from 'react';
import type { CategoryResponse } from '../types';
import { categoryColor } from '../map/layers';

export interface CategoryPanelProps {
  categories: CategoryResponse[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
}

interface CategoryNode {
  category: CategoryResponse;
  children: CategoryResponse[];
}

/**
 * Build a one-level nesting tree from the flat category list. Top-level
 * categories are those with no parentId (or whose parent is absent from the
 * list). Each top-level node carries its direct children, both sorted by
 * sortOrder then name for stable display.
 */
function buildTree(categories: CategoryResponse[]): CategoryNode[] {
  const byId = new Map<number, CategoryResponse>();
  for (const c of categories) byId.set(c.id, c);

  const sortFn = (a: CategoryResponse, b: CategoryResponse): number =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

  const roots: CategoryResponse[] = [];
  const childrenOf = new Map<number, CategoryResponse[]>();

  for (const c of categories) {
    const isRoot = c.parentId === null || !byId.has(c.parentId);
    if (isRoot) {
      roots.push(c);
    } else {
      const list = childrenOf.get(c.parentId as number) ?? [];
      list.push(c);
      childrenOf.set(c.parentId as number, list);
    }
  }

  roots.sort(sortFn);
  return roots.map((category) => ({
    category,
    children: (childrenOf.get(category.id) ?? []).sort(sortFn),
  }));
}

/**
 * Category filter list. Convention: an EMPTY selection means "show ALL".
 * The "All" toggle clears the selection (back to showing everything).
 */
export const CategoryPanel: React.FC<CategoryPanelProps> = ({
  categories,
  selected,
  onToggle,
  onToggleAll,
}) => {
  const tree = useMemo(() => buildTree(categories), [categories]);
  const allActive = selected.size === 0;

  if (categories.length === 0) {
    return (
      <div className="rm-panel rm-category-panel">
        <div className="rm-panel-title">Categories</div>
        <div className="rm-empty">No categories for this map.</div>
      </div>
    );
  }

  // React.JSX (not the global JSX namespace, which React 19 types removed).
  const renderRow = (
    category: CategoryResponse,
    nested: boolean,
  ): React.JSX.Element => {
    const isSelected = selected.has(category.id);
    return (
      <label
        key={category.id}
        className={`rm-cat-row${nested ? ' rm-cat-nested' : ''}${
          isSelected ? ' rm-cat-selected' : ''
        }`}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(category.id)}
        />
        <span
          className="rm-swatch"
          style={{ background: categoryColor(category.id) }}
          aria-hidden="true"
        />
        <span className="rm-cat-name">{category.name}</span>
      </label>
    );
  };

  return (
    <div className="rm-panel rm-category-panel">
      <div className="rm-panel-title">Categories</div>
      <label className={`rm-cat-row rm-cat-all${allActive ? ' rm-cat-selected' : ''}`}>
        <input type="checkbox" checked={allActive} onChange={onToggleAll} />
        <span className="rm-cat-name">All</span>
      </label>
      <div className="rm-cat-list">
        {tree.map((node) => (
          <div key={node.category.id} className="rm-cat-group">
            {renderRow(node.category, false)}
            {node.children.map((child) => renderRow(child, true))}
          </div>
        ))}
      </div>
    </div>
  );
};

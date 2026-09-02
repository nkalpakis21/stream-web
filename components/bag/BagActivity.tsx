'use client';

import { useState } from 'react';

type ActivityTab = 'all' | 'buys' | 'sells';

const TABS: { id: ActivityTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'buys', label: 'Buys' },
  { id: 'sells', label: 'Sells' },
];

/**
 * No real trade log exists yet. Keep the tabs and empty copy;
 * never invent fills, swaps, or timestamps.
 */
export function BagActivity() {
  const [tab, setTab] = useState<ActivityTab>('all');

  return (
    <aside className="bag-side">
      <div className="bag-section-head">
        <h2 className="bag-section-title">Activity</h2>
      </div>
      <div className="bag-tabs" role="tablist" aria-label="Activity">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`bag-tab${tab === item.id ? ' is-on' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="bag-activity-empty">No activity yet.</p>
    </aside>
  );
}

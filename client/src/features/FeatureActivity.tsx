import React, { createContext, useContext, useRef, useEffect, type ReactNode } from 'react';

const ActiveFeature = createContext(true);

/** Retain feature editors without running hidden-page subscriptions or focus traps. */
export function FeatureActivity({ active, children }: { active: boolean; children: ReactNode }) {
  const parentActive = useContext(ActiveFeature);
  return <ActiveFeature.Provider value={parentActive && active}>{children}</ActiveFeature.Provider>;
}

export function useFeatureActive() { return useContext(ActiveFeature); }

/** Mount on first visit, retain editor state, suspend work through activity context. */
export function RetainedFeature({ name, activeTab, children }: { name: string; activeTab: string; children: ReactNode }) {
  const active = name === activeTab;
  const section = useRef<HTMLElement>(null);
  const visited = useRef(active);
  useEffect(() => {
    if (!active) section.current?.querySelectorAll('video,audio').forEach(media => (media as HTMLMediaElement).pause());
  }, [active]);
  if (active) visited.current = true;
  if (!visited.current) return null;
  return <FeatureActivity active={active}><section ref={section} data-feature={name} hidden={!active} inert={!active} onPlayCapture={event => { if (!active) (event.target as HTMLMediaElement).pause(); }}>{children}</section></FeatureActivity>;
}

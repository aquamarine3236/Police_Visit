import { SettingsSkeleton } from './settings-skeleton';

/**
 * Route-level loading UI for the scheduling-settings screen. Reuses the same
 * skeleton the page shows while fetching, so navigation and data-load states
 * look identical and there is no blank frame when switching to this tab.
 */
export default function SettingsLoading() {
  return <SettingsSkeleton />;
}

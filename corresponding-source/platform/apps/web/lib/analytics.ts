import { EventName, EventProperties } from '@genvr/contracts';
import posthog from 'posthog-js';

/**
 * The only way the web app sends analytics events. Names come from the shared catalog in
 * @genvr/contracts; free-text properties (chat, voice, messages) are rejected.
 */
export function track(event: EventName, properties: EventProperties = {}): void {
  const name = EventName.parse(event);
  const props = EventProperties.parse(properties);
  if (!posthog.__loaded) return;
  posthog.capture(name, props);
}

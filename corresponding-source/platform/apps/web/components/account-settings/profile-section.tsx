'use client';

import type { Me } from '../../lib/use-me';
import { Badge, Card } from '../ui';

/**
 * Profile in Settings (owner N-125). The name is shown but not editable yet: name changes follow the owner's limit
 * (N-126: two changes, the third after 14 days, then one every 60 days), which the server must enforce first
 * (task SETTINGS-02-name-changes).
 */
export function ProfileSection({ me }: { me: Me }) {
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-bold">Name</p>
          <p className="text-lg text-ink">{me.user.name}</p>
          <p className="text-xs text-ink/50">Changing the name comes soon.</p>
        </div>
        <div>
          <p className="text-sm font-bold">Email</p>
          <p className="break-all text-ink/70">{me.user.email}</p>
        </div>
        <div>
          <p className="text-sm font-bold">Country</p>
          <p className="text-ink/70">{me.profile.country ?? '—'}</p>
        </div>
        <div>
          <p className="text-sm font-bold">Account</p>
          <Badge>{me.profile.role}</Badge>
        </div>
      </div>
    </Card>
  );
}

'use client';

import { Copy, Crown, Hammer, Link2, Trash, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';

type Member = { userId: string; name: string; role: 'owner' | 'builder' | 'player' };

const ROLE_ICON = { owner: Crown, builder: Hammer, player: User } as const;

/**
 * Place settings, Collaborators (P3-22): who can build with the owner. Builders join with a
 * builder link the owner shares (no searching strangers on a kids platform; friends come with
 * P8-12). The owner switches people between builder and player or removes them; open rooms apply
 * it at once.
 */
export function PlaceCollaborators({ placeId }: { placeId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: failed } = await api.GET('/v1/experiences/{id}/members', {
      params: { path: { id: placeId } },
    });
    if (data) setMembers(data.items);
    else setError(errorMessage(failed));
  }, [placeId]);
  useEffect(() => {
    void load();
  }, [load]);

  const createLink = async () => {
    setError(null);
    const { data, error: failed } = await api.POST('/v1/experiences/{id}/invites', {
      params: { path: { id: placeId } },
      body: { role: 'builder', expiresInHours: 24 * 7 },
    });
    if (data) {
      setLink(`${window.location.origin}/places/${placeId}?invite=${data.token}`);
      setCopied(false);
    } else setError(errorMessage(failed));
  };

  const setRole = async (member: Member, role: 'builder' | 'player') => {
    const { error: failed } = await api.PUT('/v1/experiences/{id}/members/{userId}', {
      params: { path: { id: placeId, userId: member.userId } },
      body: { role },
    });
    if (failed) setError(errorMessage(failed));
    await load();
  };

  const remove = async (member: Member) => {
    if (!window.confirm(`Remove ${member.name} from this place?`)) return;
    const { error: failed } = await api.DELETE('/v1/experiences/{id}/members/{userId}', {
      params: { path: { id: placeId, userId: member.userId } },
    });
    if (failed) setError(errorMessage(failed));
    await load();
  };

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm font-bold text-coral">{error}</p>
      ) : null}
      <section className="flex flex-col gap-2 rounded-2xl bg-paper p-4">
        <p className="text-sm font-bold">Invite a builder</p>
        <p className="text-xs text-ink/60">
          Send the link to a friend you know. Whoever opens it while signed in can build here with you. It
          works for 7 days.
        </p>
        {link ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 text-xs">{link}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(() => setCopied(true));
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-on-brand"
            >
              <Copy className="size-3.5" aria-hidden />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void createLink()}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-ink px-3 py-2 text-sm font-bold text-on-brand"
          >
            <Link2 className="size-4" aria-hidden />
            Create builder link
          </button>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-black tracking-wide text-ink/50 uppercase">People in this place</h4>
        <ul className="flex flex-col gap-1.5">
          {members.map((member) => {
            const Icon = ROLE_ICON[member.role];
            return (
              <li
                key={member.userId}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-paper px-3 py-2"
              >
                <Icon className="size-4 shrink-0 text-ink/60" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{member.name}</span>
                {member.role === 'owner' ? (
                  <span className="text-xs font-bold text-ink/50">Owner</span>
                ) : (
                  <>
                    <div
                      className="flex rounded-lg bg-surface p-0.5"
                      role="group"
                      aria-label={`Role of ${member.name}`}
                    >
                      {(['builder', 'player'] as const).map((role) => (
                        <button
                          key={role}
                          type="button"
                          aria-pressed={member.role === role}
                          onClick={() => member.role !== role && void setRole(member, role)}
                          className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                            member.role === role ? 'bg-ink text-on-brand' : 'text-ink/60 hover:text-ink'
                          }`}
                        >
                          {role === 'builder' ? 'Builder' : 'Player'}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(member)}
                      aria-label={`Remove ${member.name}`}
                      title="Remove from this place"
                      className="rounded-lg p-1.5 text-coral hover:bg-coral/10"
                    >
                      <Trash className="size-4" aria-hidden />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-ink/50">
          Builders can change the place with you. Players can only play it once it is published. Changes apply
          at once, even while they are inside.
        </p>
      </section>
    </div>
  );
}

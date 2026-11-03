import assert from 'node:assert/strict';
import { messageVisibility } from './message-visibility';

// Evaluate the actual generated Prisma predicate against representative rows.
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((v: any) => matches(row, v));
    if (key === 'AND') return value.every((v: any) => matches(row, v));
    if (value && typeof value === 'object') {
      if ('has' in value) return row[key].includes(value.has);
      if ('hasSome' in value) return value.hasSome.some((v: any) => row[key].includes(v));
      if ('in' in value) return value.in.includes(row[key]);
    }
    return row[key] === value;
  });
}
const base = { deletedAt: null, senderId: 'sender', senderRole: 'MICRO', mentions: ['MICRO'], isDirect: true, mentionedUserIds: ['A'] };
for (const role of ['CLIENT', 'MICRO', 'CHEMISTRY', 'MC', 'FRONTDESK'] as const) {
  assert(matches(base, messageVisibility(role, 'A')), `${role}: selected recipient`);
  assert(matches(base, messageVisibility(role, 'sender')), `${role}: sender`);
  for (const id of ['B', 'C', 'D']) assert(!matches(base, messageVisibility(role, id)), `${role}: exclude ${id}`);
}
for (const role of ['ADMIN', 'SYSTEMADMIN', 'QA'] as const) assert(matches(base, messageVisibility(role, role)), role);
assert(!matches({ ...base, deletedAt: new Date() }, messageVisibility('ADMIN', 'admin')));
assert(!matches({ ...base, senderRole: 'ADMIN' }, messageVisibility('MICRO', 'B')), 'admin sender must not turn private message into broadcast');
assert(matches({ ...base, isDirect: false }, messageVisibility('CLIENT', 'B')), 'legacy broadcast preserved');
assert(matches({ ...base, isDirect: false }, messageVisibility('MICRO', 'B')), 'department broadcast preserved');
assert(!matches({ ...base, isDirect: false }, messageVisibility('CHEMISTRY', 'B')), 'department routing preserved');
console.log('Visibility checks passed for client/lab recipients, sender, oversight, excluded peers, deleted messages and broadcasts.');

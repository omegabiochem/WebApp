import type { Prisma, UserRole } from '@prisma/client';

export const OVERSIGHT: UserRole[] = ['ADMIN', 'SYSTEMADMIN', 'QA'];
export const LAB_ROLES: UserRole[] = [
  'MICRO',
  'CHEMISTRY',
  'MC',
  'QA',
  'FRONTDESK',
  'ADMIN',
  'SYSTEMADMIN',
];

// For named ordinary lab users, their IDs grant access; only escalation roles go here.
export function clientEscalationRoles(
  selectedRoles: readonly UserRole[],
): UserRole[] {
  const result = new Set<UserRole>();
  for (const role of selectedRoles.length
    ? selectedRoles
    : (['QA'] as UserRole[])) {
    if (role === 'SYSTEMADMIN') result.add('SYSTEMADMIN');
    else if (role === 'ADMIN') {
      result.add('ADMIN');
      result.add('SYSTEMADMIN');
    } else {
      result.add('QA');
      result.add('ADMIN');
      result.add('SYSTEMADMIN');
    }
  }
  return [...result];
}

export function labSenderAudience(senderRole: UserRole): UserRole[] {
  if (senderRole === 'SYSTEMADMIN' || senderRole === 'ADMIN')
    return ['SYSTEMADMIN', 'ADMIN'];
  if (senderRole === 'QA') return ['SYSTEMADMIN', 'ADMIN', 'QA'];
  if (senderRole === 'MICRO') return ['MICRO', 'QA', 'ADMIN', 'SYSTEMADMIN'];
  return [...LAB_ROLES];
}

export function messageVisibility(
  role: UserRole,
  id: string,
): Prisma.MessageWhereInput {
  if (!id) throw new Error('Viewer identity required');
  if (role === 'CLIENT')
    return {
      deletedAt: null,
      OR: [
        { senderId: id },
        { isDirect: true, mentionedUserIds: { has: id } },
        { isDirect: false, forwardedFromMessageId: null },
      ],
    };
  if (!LAB_ROLES.includes(role)) return { id: { in: [] } };
  const labSenders = LAB_ROLES.filter((sender) =>
    labSenderAudience(sender).includes(role),
  );
  return {
    deletedAt: null,
    OR: [
      { senderId: id },
      {
        forwardedFromMessageId: null,
        senderRole: 'CLIENT',
        OR: [{ mentionedUserIds: { has: id } }, { mentions: { has: role } }],
      },
      { forwardedFromMessageId: null, senderRole: { in: labSenders } },
      {
        forwardedFromMessageId: { not: null },
        OR: [{ mentionedUserIds: { has: id } }, { mentions: { has: role } }],
      },
    ],
  };
}

export function mentionUserWhere(
  role: UserRole,
  clientCode: string,
): Prisma.UserWhereInput {
  if (!clientCode.trim()) throw new Error('Client scope required');
  return {
    active: true,
    ...(role === 'CLIENT'
      ? { role: { in: LAB_ROLES } }
      : { clientCode, role: 'CLIENT' as const }),
  };
}

export function forwardLabAudience(roles: readonly UserRole[]): UserRole[] {
  if (!roles.length || roles.some((role) => !LAB_ROLES.includes(role)))
    throw new Error('Select valid lab roles');
  return [...new Set([...roles, ...clientEscalationRoles(roles)])];
}

export function forwardUserWhere(clientCode: string): Prisma.UserWhereInput {
  if (!clientCode.trim()) throw new Error('Client scope required');
  return {
    active: true,
    OR: [{ role: 'CLIENT', clientCode }, { role: { in: LAB_ROLES } }],
  };
}

export function forwardAudience(
  senderRole: UserRole,
  users: readonly { role: UserRole }[],
  roles: readonly UserRole[],
): UserRole[] {
  if (roles.some((role) => !LAB_ROLES.includes(role)))
    throw new Error('Invalid lab role');
  const selectedLabRoles = [
    ...users.filter((user) => user.role !== 'CLIENT').map((user) => user.role),
    ...roles,
  ];
  const copies = selectedLabRoles.length
    ? clientEscalationRoles(selectedLabRoles)
    : senderRole === 'CLIENT'
      ? clientEscalationRoles([])
      : labSenderAudience(senderRole);
  const senderCopies =
    senderRole !== 'CLIENT' && users.some((user) => user.role === 'CLIENT')
      ? labSenderAudience(senderRole)
      : [];
  return [...new Set([...roles, ...copies, ...senderCopies])];
}

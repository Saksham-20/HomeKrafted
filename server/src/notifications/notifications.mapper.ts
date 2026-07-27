import { Notification, NotificationPreference } from '@prisma/client';

export function mapNotification(n: Notification) {
  return {
    id: n.id,
    userId: n.userId,
    channel: n.channel,
    category: n.category,
    title: n.title,
    body: n.body,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
    refType: n.refType ?? undefined,
    refId: n.refId ?? undefined,
  };
}

export function mapNotificationPreference(p: NotificationPreference) {
  return {
    userId: p.userId,
    category: p.category,
    sms: p.sms,
    whatsapp: p.whatsapp,
    email: p.email,
    inapp: p.inapp,
  };
}

import { Globe, Mail, Smartphone } from "lucide-react";
import type { Channel } from "@/data/types";

export const CHANNEL_LABEL: Record<Channel, string> = { sms: "SMS", email: "Email", web: "Web chat" };

const ICONS = { sms: Smartphone, email: Mail, web: Globe };

export default function ChannelIcon({ channel, className = "h-3.5 w-3.5" }: { channel: Channel; className?: string }) {
  const Icon = ICONS[channel];
  return <Icon className={className} aria-label={CHANNEL_LABEL[channel]} />;
}

"use client";

import { useState } from "react";
import { Building2, Clock, Globe, Phone, User } from "lucide-react";
import { ROLES, TIMEZONES } from "@/lib/onboarding/constants";
import { useOnboarding } from "@/lib/onboarding/context";
import type { ChurchProfile } from "@/lib/onboarding/types";
import { formatPhone, phoneError, websiteError } from "@/lib/onboarding/validation";
import Card from "../ui/Card";
import SectionHeader from "../ui/SectionHeader";
import Select from "../ui/Select";
import TextField from "../ui/TextField";

export default function Step1Church() {
  const { state, update } = useOnboarding();
  const church = state.church;
  const set = (field: keyof ChurchProfile) => (value: string) =>
    update((s) => ({ church: { ...s.church, [field]: value } }));

  // Errors show once a field has been left, so they don't flash up mid-typing. Saved values
  // that are already invalid show straight away, since they're what's blocking Continue.
  const [touched, setTouched] = useState(() => ({
    phone: church.phone.trim() !== "",
    website: church.website.trim() !== "",
  }));
  const touch = (field: keyof typeof touched) => setTouched((t) => ({ ...t, [field]: true }));
  const phoneMsg = touched.phone ? phoneError(church.phone) : null;
  const websiteMsg = touched.website ? websiteError(church.website) : null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Your Church"
        description="Tell us about your church so 1Stayz can personalize every conversation."
      />
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Church name"
            icon={Building2}
            value={church.name}
            onChange={set("name")}
            placeholder="Grace Community Church"
            autoComplete="organization"
            required
          />
          <TextField
            label="Your name"
            icon={User}
            value={church.yourName}
            onChange={set("yourName")}
            placeholder="Pastor Ray"
            autoComplete="name"
            required
          />
          <Select
            label="Your role"
            value={church.yourRole}
            onChange={set("yourRole")}
            options={ROLES}
            placeholder="Select your role…"
            required
          />
          <TextField
            label="Church phone"
            icon={Phone}
            type="tel"
            value={church.phone}
            onChange={set("phone")}
            onBlur={() => {
              touch("phone");
              const formatted = formatPhone(church.phone);
              if (formatted !== church.phone) set("phone")(formatted);
            }}
            error={phoneMsg}
            placeholder="(555) 123-4567"
            autoComplete="tel"
            inputMode="tel"
          />
          <TextField
            label="Website"
            icon={Globe}
            value={church.website}
            onChange={set("website")}
            onBlur={() => {
              touch("website");
              const trimmed = church.website.trim();
              if (trimmed !== church.website) set("website")(trimmed);
            }}
            error={websiteMsg}
            placeholder="gracecommunity.org"
            autoComplete="url"
            inputMode="url"
          />
          <Select label="Time zone" icon={Clock} value={church.timezone} onChange={set("timezone")} options={TIMEZONES} />
          <TextField
            label="Church address"
            className="sm:col-span-2"
            value={church.address}
            onChange={set("address")}
            placeholder="123 Main St, Springfield, IL 62701"
            autoComplete="street-address"
          />
        </div>
      </Card>
    </div>
  );
}

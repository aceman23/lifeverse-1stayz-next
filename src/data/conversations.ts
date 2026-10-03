import { daysAgo, hoursAgo } from "./clock";
import type { Conversation } from "./types";

export const CONVERSATIONS: Conversation[] = [
  {
    id: "c-brooks",
    personId: "p-brooks",
    channel: "sms",
    status: "paused",
    outcome: "escalated",
    unread: 1,
    summary: "Hannah shared that her mother passed recently. The assistant detected grief and paused; Mark Ochoa has been notified for a personal call.",
    messages: [
      { id: "m1", from: "assistant", at: daysAgo(4, 14), body: "Hi Hannah, it's Grace Community. Thank you for joining us Sunday! We're really glad you came. Is there anything we can be praying about for you this week?" },
      { id: "m2", from: "guest", at: daysAgo(1, 20), body: "Thank you. Honestly it's been a hard month. My mom passed three weeks ago and Sunday was the first time I didn't feel alone.", flagged: true },
      { id: "m3", from: "assistant", at: daysAgo(1, 20), body: "Hannah, I'm so sorry about your mom. Thank you for trusting us with that. Mark Ochoa, our care pastor, would love to reach out personally. Would a call tomorrow be okay?" },
      { id: "m4", from: "guest", at: hoursAgo(1), body: "Yes, that would be nice. Afternoons are best." },
    ],
  },
  {
    id: "c-whitfield",
    personId: "p-whitfield",
    channel: "sms",
    status: "active",
    outcome: "follow_up",
    unread: 1,
    summary: "Danielle is looking for a weekday moms' group. Draft reply is waiting for approval.",
    messages: [
      { id: "m1", from: "assistant", at: daysAgo(4, 14), body: "Hi Marcus! Thanks for bringing the family to Grace on Sunday. We hope Ava and Eli had fun in Grace Kids. 😊" },
      { id: "m2", from: "guest", at: daysAgo(4, 16), body: "Thanks! The kids had a great time. Eli was a little shy at check-in but he warmed up." },
      { id: "m3", from: "assistant", at: daysAgo(4, 16), body: "So glad to hear it. Our check-in team will remember him next time and walk him in. Anything we can help with as you settle into Springfield?" },
      { id: "m4", from: "guest", at: hoursAgo(2), body: "Actually, Danielle was wondering if there's a moms' group that meets during the week? She's home with Eli most days." },
    ],
  },
  {
    id: "c-ellis",
    personId: "p-ellis",
    channel: "web",
    status: "taken_over",
    outcome: "escalated",
    unread: 0,
    summary: "Asked about the church's view on remarriage. Pastor Ray took over the chat.",
    messages: [
      { id: "m1", from: "guest", at: daysAgo(2, 21), body: "Hi, I visited a couple weeks ago. Can I ask something kind of personal?" },
      { id: "m2", from: "assistant", at: daysAgo(2, 21), body: "Of course, Jordan. I'm the assistant for Grace Community, and I'm glad you reached out. What's on your mind?" },
      { id: "m3", from: "guest", at: hoursAgo(16), body: "I'm divorced. Would I be welcome there, and what does the church believe about remarriage?" },
      { id: "m4", from: "assistant", at: hoursAgo(16), body: "You're absolutely welcome here. That's an important question and it deserves a real conversation, so I've asked Pastor Ray to reply to you personally." },
      { id: "m5", from: "staff", authorId: "s-ray", at: hoursAgo(15), body: "Hi Jordan, Ray here. First: you belong at Grace, full stop. I'd love to talk through your question over coffee if you're up for it. No pressure either way." },
    ],
  },
  {
    id: "c-thompson",
    personId: "p-thompson",
    channel: "sms",
    status: "active",
    outcome: null,
    unread: 0,
    summary: "Asked about midweek childcare. Assistant answered from the Groups handbook.",
    messages: [
      { id: "m1", from: "assistant", at: daysAgo(9, 12), body: "Hi Maya! Checking in after Sunday. How did Leo like the 3s room?" },
      { id: "m2", from: "guest", at: daysAgo(9, 12), body: "He loved it!! He's been singing the song all week lol" },
      { id: "m3", from: "guest", at: hoursAgo(20), body: "Is there childcare for any of the midweek groups? I work nights so mornings are my only option." },
      { id: "m4", from: "assistant", at: hoursAgo(20), body: "Yes! The Tuesday 9:30 AM women's study has free childcare for kids under 5. Want me to let the leader, Carol, know you might come?" },
    ],
  },
  {
    id: "c-okafor",
    personId: "p-okafor",
    channel: "email",
    status: "active",
    outcome: "resolved",
    unread: 0,
    summary: "Booked coffee with Pastor Ray for Saturday at Ironwood Coffee.",
    messages: [
      { id: "m1", from: "assistant", at: daysAgo(3, 10), body: "Hi Chinedu and Grace,\n\nIt was great to see you back on Sunday! Pastor Ray would love to buy you both a coffee and hear your story. Would Saturday morning work?\n\nWarmly,\nGrace Community Church" },
      { id: "m2", from: "guest", at: daysAgo(1, 12), body: "Saturday works for us. 9am? We'll bring the kids if that's okay." },
      { id: "m3", from: "assistant", at: daysAgo(1, 13), body: "Perfect, you're booked for Saturday at 9:00 AM at Ironwood Coffee on 5th St. The kids are more than welcome. Pastor Ray says the hot chocolate is on him." },
    ],
  },
  {
    id: "c-nguyen",
    personId: "p-nguyen",
    channel: "sms",
    status: "paused",
    outcome: "follow_up",
    unread: 0,
    summary: "No reply after three touches. Sequence paused before the next step.",
    messages: [
      { id: "m1", from: "assistant", at: daysAgo(11, 13), body: "Hey Tyler! Thanks for coming to Grace on Sunday. Hope you and your roommate felt welcome." },
      { id: "m2", from: "assistant", at: daysAgo(9, 11), body: "Hi Tyler, just checking in. Any questions about Grace I can answer?" },
      { id: "m3", from: "assistant", at: daysAgo(6, 11), body: "Our college group meets Thursdays at 7 in the Commons. Free pizza, zero pressure. Would love to see you there!" },
    ],
  },
  {
    id: "c-kowalski",
    personId: "p-kowalski",
    channel: "email",
    status: "ended",
    outcome: "resolved",
    unread: 0,
    summary: "Connected Beth and Sam with the hospitality team lead.",
    messages: [
      { id: "m1", from: "guest", at: daysAgo(15, 18), body: "We'd love to help out somewhere. Sam and I are both early risers!" },
      { id: "m2", from: "assistant", at: daysAgo(15, 18), body: "Early risers are the hospitality team's favorite people. I've introduced you to Linda Park, who leads the 8:15 setup crew. She'll reach out this week." },
      { id: "m3", from: "guest", at: daysAgo(3, 15), body: "Linda called. We start next Sunday. Thank you!" },
    ],
  },
  {
    id: "c-sato",
    personId: "p-sato",
    channel: "sms",
    status: "active",
    outcome: "no_action",
    unread: 0,
    summary: "Thank-you delivered. No reply yet; the next step is in 2 days.",
    messages: [
      { id: "m1", from: "assistant", at: daysAgo(4, 13), body: "Hi Emily! Thanks for visiting Grace Community this morning. If you ever have questions, just text back. A real person is always nearby. 🙂" },
    ],
  },
];

export function getConversation(id: string) {
  return CONVERSATIONS.find((c) => c.id === id);
}

export function conversationForPerson(personId: string) {
  return CONVERSATIONS.find((c) => c.personId === personId);
}

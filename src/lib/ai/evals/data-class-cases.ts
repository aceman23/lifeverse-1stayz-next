import type { MessageClass } from "../data-class";

// AI-05: a labelled set for the data-class tagger (guidelines §3). Made-up guest messages, so they
// aren't guest data. `cls` is the right class (stricter wins: C3 over C1 over C2). `rules: true`
// marks messages the rules alone must settle (checked in CI without a model); the rest need the
// model, measured by `npm run eval`.
//
// Bar (pilot plan AI-05): every C3 message tagged C3 (a missed sensitive message is a privacy
// failure), and ≥ 95% precision on C1 and C3.

export interface DataClassCase {
  id: string;
  text: string;
  cls: MessageClass;
  /** The guest's and household's names, as the tagger gets them from the server. */
  names?: string[];
  /** The rules alone settle it (C3 by topic, or C1 by phone/email/address/name). */
  rules?: boolean;
}

export const DATA_CLASS_CASES: DataClassCase[] = [
  // ---------------------------------------------------------------- C3: sensitive (rules)
  { id: "c3-pray", text: "Could you pray for my sister? She's having a rough week.", cls: "C3", rules: true },
  { id: "c3-hospital", text: "My dad is in the hospital, not sure we'll make it Sunday", cls: "C3", rules: true },
  { id: "c3-grief", text: "My mom passed away last month and I've been looking for a church", cls: "C3", rules: true },
  { id: "c3-crisis", text: "honestly i don't want to be here anymore", cls: "C3", rules: true },
  { id: "c3-divorce", text: "Going through a divorce and my kids are struggling. Do you have anything for them?", cls: "C3", rules: true },
  { id: "c3-jobloss", text: "I lost my job and can't pay rent this month. Does the church help with that?", cls: "C3", rules: true },
  { id: "c3-anxiety", text: "I've had a lot of anxiety lately and the service really helped", cls: "C3", rules: true },
  { id: "c3-sober", text: "I'm 90 days sober and looking for a recovery program", cls: "C3", rules: true },
  { id: "c3-saved", text: "How do I get saved? I want to know more about Jesus", cls: "C3", rules: true },
  { id: "c3-cancer", text: "My wife was just diagnosed with cancer", cls: "C3", rules: true },
  { id: "c3-abuse", text: "My boyfriend hit me again and I don't know who to talk to", cls: "C3", rules: true },
  { id: "c3-miscarriage", text: "We had a miscarriage in the spring and Sunday was the first time back in church", cls: "C3", rules: true },
  { id: "c3-baptized", text: "I'd like to be baptized. What do I need to do?", cls: "C3", rules: true },
  { id: "c3-therapy", text: "My son has been in therapy and we're looking for a supportive community", cls: "C3", rules: true },
  { id: "c3-named-pray", text: "Please pray for my husband Mark, he's having surgery Tuesday", cls: "C3", names: ["Mark"], rules: true },
  // ---------------------------------------------------------------- C3: sensitive (model needed)
  { id: "c3-low", text: "Been feeling really low and alone since the move", cls: "C3" },
  { id: "c3-gone", text: "Things have been really hard since Dad's been gone", cls: "C3" },
  { id: "c3-right-with-god", text: "Can someone talk to me about getting right with God?", cls: "C3" },
  { id: "c3-drinking", text: "I think my drinking is getting out of hand", cls: "C3" },
  { id: "c3-scared", text: "I'm scared to go home tonight", cls: "C3" },
  { id: "c3-marriage", text: "My marriage is falling apart and I didn't know where else to go", cls: "C3" },
  { id: "c3-chemo", text: "Mom starts treatment next week, could the prayer team remember her", cls: "C3", rules: true },
  { id: "c3-groceries", text: "Is there anywhere we could get groceries this week? Money is really tight", cls: "C3" },
  { id: "c3-doubt", text: "I stopped believing years ago but something on Sunday got to me. I have a lot of questions", cls: "C3" },

  // ---------------------------------------------------------------- C1: identifying
  { id: "c1-phone", text: "Text my wife instead, her number is 970-555-0123", cls: "C1", rules: true },
  { id: "c1-email", text: "Best way to reach me is jordan.p@example.com", cls: "C1", rules: true },
  { id: "c1-address", text: "We live at 412 Oak Street if anyone wants to drop off info", cls: "C1", rules: true },
  { id: "c1-name", text: "This is Priya, I came with my daughter Anika", cls: "C1", names: ["Priya", "Anika"], rules: true },
  { id: "c1-phone-paren", text: "You can call me at (217) 555-0142 after 5", cls: "C1", rules: true },
  { id: "c1-name-guest", text: "Hi it's Marcus from the 11am service", cls: "C1", names: ["Marcus"], rules: true },
  { id: "c1-other-name", text: "My neighbor Dolores Jimenez said I should come", cls: "C1" },
  { id: "c1-full-name", text: "Please update my name, it's Elizabeth Okafor not Liz", cls: "C1", names: ["Liz"] },
  { id: "c1-work", text: "I'm the new principal at Lincoln Elementary, would love to connect", cls: "C1" },
  { id: "c1-handle", text: "Find me on Instagram @sarahmakesbread", cls: "C1" },
  { id: "c1-kids-names", text: "Our kids are Eli and June, they're 6 and 4", cls: "C1" },
  { id: "c1-apt", text: "We're in apartment 12B at the Pinecrest complex on Maple Ave", cls: "C1" },

  // ---------------------------------------------------------------- C2: ordinary
  { id: "c2-times", text: "What time are services on Sunday?", cls: "C2", rules: true },
  { id: "c2-parking", text: "Is there parking near the main entrance?", cls: "C2", rules: true },
  { id: "c2-youth", text: "Do you have a youth group for middle schoolers?", cls: "C2", rules: true },
  { id: "c2-thanks", text: "Thanks! We loved the music", cls: "C2", rules: true },
  { id: "c2-wear", text: "What should I wear? Is it casual?", cls: "C2", rules: true },
  { id: "c2-kids", text: "How does check-in work for the kids program?", cls: "C2", rules: true },
  { id: "c2-groups", text: "Are there small groups that meet on weeknights?", cls: "C2", rules: true },
  { id: "c2-volunteer", text: "I'd love to help with the welcome team", cls: "C2", rules: true },
  { id: "c2-back", text: "See you next Sunday!", cls: "C2", rules: true },
  { id: "c2-coffee", text: "Is the coffee free? Asking for my husband lol", cls: "C2", rules: true },
  { id: "c2-livestream", text: "Do you livestream the service? We're traveling next weekend", cls: "C2", rules: true },
  { id: "c2-denomination", text: "What denomination is the church?", cls: "C2", rules: true },
  { id: "c2-wifi", text: "Loved the sermon on patience. Where can I find past sermons?", cls: "C2", rules: true },
  { id: "c2-stop-ish", text: "Not right now, maybe later. Thanks for reaching out", cls: "C2", rules: true },
  { id: "c2-ok", text: "ok sounds good", cls: "C2", rules: true },
  { id: "c2-church-name", text: "Is Grace Community connected to the one downtown?", cls: "C2", rules: true },
  { id: "c2-music", text: "Can anyone join the choir or do you audition?", cls: "C2", rules: true },
  { id: "c2-time-number", text: "Does the 10:30 service end by 11:45?", cls: "C2", rules: true },
  { id: "c2-hard-question", text: "This might be a hard question but do you have a Wednesday service?", cls: "C2" },
  { id: "c2-moved", text: "We just moved to town and are looking for a church home", cls: "C2", rules: true },
];

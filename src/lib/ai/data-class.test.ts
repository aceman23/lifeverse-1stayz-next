import { describe, expect, it } from "vitest";
import { applyRules, classFromRules, combineClass } from "./data-class";

describe("applyRules", () => {
  it.each([
    ["Can you pray for my dad?", "prayer"],
    ["My mom passed away last month", "grief"],
    ["She's in the hospital for surgery", "health"],
    ["I don't want to be here anymore, I want to die", "crisis"],
    ["We're going through a divorce", "family_conflict"],
    ["I've been sober 90 days", "addiction"],
    ["I lost my job and can't pay rent", "hardship"],
    ["How do I get saved?", "faith_journey"],
    ["It's been a hard month", "hard_season"],
  ])("%s -> sensitive (%s)", (text, id) => {
    const r = applyRules(text);
    expect(r.sensitive).toContain(id);
    expect(classFromRules(r)).toBe("C3");
  });

  it.each([
    "What time is the 11am service?",
    "Is there parking on site?",
    "Do you have anything for middle schoolers?",
    "Thanks! See you Sunday",
  ])("%s -> nothing sensitive", (text) => {
    const r = applyRules(text);
    expect(r.sensitive).toEqual([]);
    expect(classFromRules(r)).toBeNull();
  });

  it("finds identifiers", () => {
    expect(applyRules("Call me at (217) 555-0142").identifiers).toContain("phone");
    expect(applyRules("my email is jo.smith+church@example.com").identifiers).toContain("email");
    expect(applyRules("We live at 1204 Oak Ridge Dr").identifiers).toContain("address");
    expect(applyRules("This is Hannah's husband", ["Hannah", "Brooks"]).identifiers).toContain("name");
    expect(applyRules("Is there a kids program?", ["Hannah", "Brooks"]).identifiers).toEqual([]);
  });

  it("matches names as whole words only", () => {
    expect(applyRules("Eli loved it", ["Eli"]).identifiers).toContain("name");
    expect(applyRules("Delivery was fine", ["Eli"]).identifiers).toEqual([]);
    expect(applyRules("A", ["A"]).identifiers).toEqual([]); // one-letter names are ignored
  });
});

describe("combineClass: the stricter wins", () => {
  const none = { sensitive: [], identifiers: [] };
  it("model says sensitive -> C3 even with no rule", () => expect(combineClass(none, ["sensitive"])).toBe("C3"));
  it("a sensitive rule beats an 'ordinary' model answer", () => expect(combineClass({ sensitive: ["prayer"], identifiers: [] }, ["ordinary"])).toBe("C3"));
  it("identifiers from either side -> C1", () => {
    expect(combineClass({ sensitive: [], identifiers: ["phone"] }, ["ordinary"])).toBe("C1");
    expect(combineClass(none, ["identifying"])).toBe("C1");
    expect(combineClass(none, ["identifying", "sensitive"])).toBe("C3");
  });
  it("nothing found -> C2", () => expect(combineClass(none, ["ordinary"])).toBe("C2"));
});

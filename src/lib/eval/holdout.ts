/**
 * Held-out evaluation set. Written after the scrubber was tuned on the development set (dataset.ts)
 * and never used to change any rule, so its numbers show how the tiers behave on unseen notes.
 * Same conventions: fictional people, 555 phone numbers, example.org emails.
 */
import type { EvalNote } from "./dataset";

export const HOLDOUT_NOTES: EvalNote[] = [
  {
    id: "H01",
    subCounty: "Riverside",
    text: "Saw little Imani today with her granny Nafula. Imani is 3, purging watery stool since dawn, vomiting twice, eyes look sunken. Granny's line 0555 011 864.",
    pii: ["Imani", "Nafula", "0555 011 864"],
    truth: { ageBand: "2-4", sex: "female", symptoms: ["watery_diarrhoea", "vomiting"], dangerSigns: ["sunken_eyes"], householdContact: false, householdDeath: false },
  },
  {
    id: "H02",
    subCounty: "North Bay",
    text: "Fisherman Ochieng Were (approx 42) brought by boat crew. Profuse rice water diarrhoea, can't drink, pulse weak, cold hands. Boat reg LK-20931.",
    pii: ["Ochieng Were", "LK-20931"],
    truth: { ageBand: "15-49", sex: "male", symptoms: ["watery_diarrhoea"], dangerSigns: ["unable_to_drink", "rapid_weak_pulse"], householdContact: false, householdDeath: false },
  },
  {
    id: "H03",
    subCounty: "Market Hill",
    text: "16 month old boy, mother is Agnes. Watery diarrhoea 2 days, fever, still breastfeeding well, alert. Neighbour's child had same last week.",
    pii: ["Agnes"],
    truth: { ageBand: "0-1", sex: "male", symptoms: ["watery_diarrhoea", "fever"], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "H04",
    subCounty: "Old Town",
    text: "Lady of about 65 years, lives alone near the old mosque. Loose watery stools x8, cramps in legs, very weak, skin pinch slow. Son Daudi can be reached on 0555 015 309 or daudi@example.org.",
    pii: ["Daudi", "0555 015 309", "daudi@example.org"],
    truth: { ageBand: "50+", sex: "female", symptoms: ["watery_diarrhoea", "leg_cramps"], dangerSigns: ["slow_skin_pinch"], householdContact: false, householdDeath: false },
  },
  {
    id: "H05",
    subCounty: "Kilima",
    text: "Two siblings seen, recording the younger: girl 8y, watery diarrhoea and vomiting since last night. Elder sister Akoth has same. Both drinking ok. Home is plot 115.",
    pii: ["Akoth", "plot 115"],
    truth: { ageBand: "5-14", sex: "female", symptoms: ["watery_diarrhoea", "vomiting"], dangerSigns: [], householdContact: true, householdDeath: false },
  },
  {
    id: "H06",
    subCounty: "Riverside",
    text: "Man 28, unconscious, watery diarrhoea all day per wife Zuhura. Their baby died of diarrhoea on Tuesday. GPS 3.21456, 12.65432.",
    pii: ["Zuhura", "3.21456, 12.65432"],
    truth: { ageBand: "15-49", sex: "male", symptoms: ["watery_diarrhoea"], dangerSigns: ["lethargic_or_unconscious"], householdContact: true, householdDeath: true },
  },
  {
    id: "H07",
    subCounty: "North Bay",
    text: "Kiptoo, 11, at the beach school. Stomach cramps and fever, no diarrhoea, no vomiting. Headteacher Mrs Chepkoech informed.",
    pii: ["Kiptoo", "Chepkoech"],
    truth: { ageBand: "5-14", sex: "unknown", symptoms: ["abdominal_cramps", "fever"], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "H08",
    subCounty: "Market Hill",
    text: "Pregnant woman 23yrs, watery stool 4 times, thirsty, no danger signs. Husband Musa Juma, ID 31275568, phone +1 555 0163.",
    pii: ["Musa Juma", "31275568", "+1 555 0163"],
    truth: { ageBand: "15-49", sex: "female", symptoms: ["watery_diarrhoea", "intense_thirst"], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "H09",
    subCounty: "Kilima",
    text: "Elderly man (Mzee Tobiko) collapsed at the borehole, AWD with vomiting, eyes deeply sunken, not able to drink, convulsing on arrival.",
    pii: ["Tobiko"],
    truth: { ageBand: "50+", sex: "male", symptoms: ["watery_diarrhoea", "vomiting"], dangerSigns: ["sunken_eyes", "unable_to_drink", "convulsions"], householdContact: false, householdDeath: false },
  },
  {
    id: "H10",
    subCounty: "Old Town",
    text: "Child aged 5, blood in stool and fever for 2 days, eats well. Dob 04/07/2021. Mother: Rose Wanjala.",
    pii: ["04/07/2021", "Rose Wanjala"],
    truth: { ageBand: "5-14", sex: "unknown", symptoms: ["bloody_diarrhoea", "fever"], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "H11",
    subCounty: "Riverside",
    text: "Young man 19 yrs, watery diarrhoea since morning after eating at a wedding in the village. Vomited 3 times. Friend Brian also sick. Cell 0555-010-428.",
    pii: ["Brian", "0555-010-428"],
    truth: { ageBand: "15-49", sex: "male", symptoms: ["watery_diarrhoea", "vomiting"], dangerSigns: [], householdContact: true, householdDeath: false },
  },
  {
    id: "H12",
    subCounty: "North Bay",
    text: "Baby 5 months, very floppy and sleepy, watery stools 10 today, sunken fontanelle and eyes. Parents Halima and Yusuf Abdalla, house 9.",
    pii: ["Halima", "Yusuf Abdalla", "house 9"],
    truth: { ageBand: "0-1", sex: "unknown", symptoms: ["watery_diarrhoea"], dangerSigns: ["lethargic_or_unconscious", "sunken_eyes"], householdContact: false, householdDeath: false },
  },
];

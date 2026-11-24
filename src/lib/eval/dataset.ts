/**
 * Evaluation set: fictional field notes with planted identifiers and hand-labelled ground truth.
 * Names, numbers and places are invented. Phone numbers use the 555 range reserved for fiction,
 * emails use example.org, and GPS points are arbitrary.
 *
 * The notes are written the way health workers write under pressure: abbreviations, misspellings,
 * local words, negations ("no vomiting") and identifiers in many shapes. Each note describes one patient.
 *
 * This set was written by the project team and is used to measure each tier. It is small and not
 * a clinical validation; it shows where each tier helps and where it fails.
 */
import type { ExtractedFields } from "@/lib/triage/extract";
import type { SubCounty } from "@/lib/triage/vocabulary";

export type TruthFields = Pick<
  ExtractedFields,
  "ageBand" | "sex" | "symptoms" | "dangerSigns" | "householdContact" | "householdDeath"
>;

export interface EvalNote {
  id: string;
  subCounty: SubCounty;
  text: string;
  /** Every identifying string planted in the note, exactly as written. */
  pii: string[];
  truth: TruthFields;
}

export const EVAL_NOTES: EvalNote[] = [
  {
    id: "E01",
    subCounty: "Riverside",
    text: "Visited Juma Odhiambo at plot 22. 45 years, man. Watery diarrhoea since 2 days, many times, vomiting. Eyes sunken, skin pinch goes back slowly. Wife Achieng also has diarrhoea. Phone 0555 014 220.",
    pii: ["Juma Odhiambo", "plot 22", "Achieng", "0555 014 220"],
    truth: { ageBand: "15-49", sex: "male", symptoms: ["watery_diarrhoea", "vomiting"], dangerSigns: ["sunken_eyes", "slow_skin_pinch"], householdContact: true, householdDeath: false },
  },
  {
    id: "E02",
    subCounty: "Riverside",
    text: "Grace Atieno 18 months girl, kuhara (watery) x6 today, not breastfeeding well, very sleepy, unable to drink. Mother on +1 555 0142.",
    pii: ["Grace Atieno", "+1 555 0142"],
    truth: { ageBand: "0-1", sex: "female", symptoms: ["watery_diarrhoea"], dangerSigns: ["lethargic_or_unconscious", "unable_to_drink"], householdContact: false, householdDeath: false },
  },
  {
    id: "E03",
    subCounty: "Riverside",
    text: "Old man ~70yrs, rice water stools all night, leg cramps, weak pulse. His son died of the same running stomach two days ago. ID 27719034.",
    pii: ["27719034"],
    truth: { ageBand: "50+", sex: "male", symptoms: ["watery_diarrhoea", "leg_cramps"], dangerSigns: ["rapid_weak_pulse"], householdContact: true, householdDeath: true },
  },
  {
    id: "E04",
    subCounty: "Market Hill",
    text: "Pt: Halima, F, 26y, pregnant. 3 loose stools since morning, no vomit, drinking ok. tel 0555-019-877",
    pii: ["Halima", "0555-019-877"],
    truth: { ageBand: "15-49", sex: "female", symptoms: ["watery_diarrhoea"], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "E05",
    subCounty: "Kilima",
    text: "Boy 9 yrs at the primary school, bloody diarrhoea and fever 3 days, abdominal pain. No sunken eyes. Teacher Mr Wekesa called it in, wekesa.k@example.org",
    pii: ["Wekesa", "wekesa.k@example.org"],
    truth: { ageBand: "5-14", sex: "male", symptoms: ["bloody_diarrhoea", "fever", "abdominal_cramps"], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "E06",
    subCounty: "Riverside",
    text: "Mama Rehema's son Baraka, 2 yrs, watery diarrhoea and vomiting since yesterday, drinks eagerly. Drowsy and sunken eyes. His sister is sick too. House no 7.",
    pii: ["Rehema", "Baraka", "House no 7"],
    truth: { ageBand: "2-4", sex: "male", symptoms: ["watery_diarrhoea", "vomiting", "intense_thirst"], dangerSigns: ["lethargic_or_unconscious", "sunken_eyes"], householdContact: true, householdDeath: false },
  },
  {
    id: "E07",
    subCounty: "Old Town",
    text: "fever, headache, no diarrhoea. 30 yr old woman. referred for malaria test. Contact Faith 0555 017 300",
    pii: ["Faith", "0555 017 300"],
    truth: { ageBand: "15-49", sex: "female", symptoms: ["fever"], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "E08",
    subCounty: "North Bay",
    text: "AWD case, adult female ~40, 10+ watery stools, cannot drink, unconscious on arrival, carried in by husband Peter Mwangi. GPS -12.34567, 45.67890",
    pii: ["Peter Mwangi", "-12.34567, 45.67890"],
    truth: { ageBand: "15-49", sex: "female", symptoms: ["watery_diarrhoea"], dangerSigns: ["unable_to_drink", "lethargic_or_unconscious"], householdContact: false, householdDeath: false },
  },
  {
    id: "E09",
    subCounty: "Riverside",
    text: "Child 4 yrs, diarrhoea watery, vomiting, convulsions this morning. born 12/03/2022. father is Samuel Kiprono.",
    pii: ["12/03/2022", "Samuel Kiprono"],
    truth: { ageBand: "2-4", sex: "unknown", symptoms: ["watery_diarrhoea", "vomiting"], dangerSigns: ["convulsions"], householdContact: false, householdDeath: false },
  },
  {
    id: "E10",
    subCounty: "Kilima",
    text: "Elderly woman, 3 days of running stomach, leg cramps, little urine. Pinch slow. Lives with 5 others, 2 also sick with the same.",
    pii: [],
    truth: { ageBand: "50+", sex: "female", symptoms: ["watery_diarrhoea", "leg_cramps", "reduced_urine"], dangerSigns: ["slow_skin_pinch"], householdContact: true, householdDeath: false },
  },
  {
    id: "E11",
    subCounty: "North Bay",
    text: "Kevin, 16, male student. Watery diarrhoea after the funeral feast, 5 times since last night, vomiting, thirsty. No danger signs. Mob 0555 012 991.",
    pii: ["Kevin", "0555 012 991"],
    truth: { ageBand: "15-49", sex: "male", symptoms: ["watery_diarrhoea", "vomiting", "intense_thirst"], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "E12",
    subCounty: "Market Hill",
    text: "Infant 7 months, diarrhoea with water, sunken eyes, drinks poorly. Caregiver Auntie Joy. Nat ID of mother: KX-4471902",
    pii: ["Joy", "KX-4471902"],
    truth: { ageBand: "0-1", sex: "unknown", symptoms: ["watery_diarrhoea"], dangerSigns: ["sunken_eyes", "unable_to_drink"], householdContact: false, householdDeath: false },
  },
  {
    id: "E13",
    subCounty: "Old Town",
    text: "Woman 55y, vomiting only, no diarrhoea, abdominal cramps after eating fish. Name: Esther Nyambura",
    pii: ["Esther Nyambura"],
    truth: { ageBand: "50+", sex: "female", symptoms: ["vomiting", "abdominal_cramps"], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "E14",
    subCounty: "Riverside",
    text: "Rice-water diarrhoea in man aged 31, started 1 day ago, very weak and not responding well, pulse fast and weak. Two of his kids died this week with the same.",
    pii: [],
    truth: { ageBand: "15-49", sex: "male", symptoms: ["watery_diarrhoea"], dangerSigns: ["lethargic_or_unconscious", "rapid_weak_pulse"], householdContact: true, householdDeath: true },
  },
  {
    id: "E15",
    subCounty: "Market Hill",
    text: "Toddler girl 2y, mild watery diarrhoea x3, playing, drinking well. Grandmother Wanjiku brings her, number 0555 018 450.",
    pii: ["Wanjiku", "0555 018 450"],
    truth: { ageBand: "2-4", sex: "female", symptoms: ["watery_diarrhoea"], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "E16",
    subCounty: "Riverside",
    text: "Patient Abdi Hassan, 38M, watery stool 6x, vomiting, intense thirst, eyes sunken. Wife and brother also sick. Phone +1 555 0191.",
    pii: ["Abdi Hassan", "+1 555 0191"],
    truth: { ageBand: "15-49", sex: "male", symptoms: ["watery_diarrhoea", "vomiting", "intense_thirst"], dangerSigns: ["sunken_eyes"], householdContact: true, householdDeath: false },
  },
  {
    id: "E17",
    subCounty: "Kilima",
    text: "12 yr old girl, loose stools and fever, no vomiting. Her younger brother has the same since Sunday. Contact nurse Ms Lila Obura.",
    pii: ["Lila Obura"],
    truth: { ageBand: "5-14", sex: "female", symptoms: ["watery_diarrhoea", "fever"], dangerSigns: [], householdContact: true, householdDeath: false },
  },
  {
    id: "E18",
    subCounty: "North Bay",
    text: "Man found collapsed at the fish landing, AWD, no pulse felt at wrist, unable to drink. Approx 50 years. Fishers union card no 55120-B.",
    pii: ["55120-B"],
    truth: { ageBand: "50+", sex: "male", symptoms: ["watery_diarrhoea"], dangerSigns: ["lethargic_or_unconscious", "rapid_weak_pulse", "unable_to_drink"], householdContact: false, householdDeath: false },
  },
  {
    id: "E19",
    subCounty: "Market Hill",
    text: "Follow-up: Neema 3 yrs now better, stools formed, drinking well, no danger signs.",
    pii: ["Neema"],
    truth: { ageBand: "2-4", sex: "unknown", symptoms: [], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "E20",
    subCounty: "Riverside",
    text: "Diarhea watery 2 days + vomiting in 25yo male, sunken eyez, cant drink much. Mother Josephine Akinyi at 0555 013 002.",
    pii: ["Josephine Akinyi", "0555 013 002"],
    truth: { ageBand: "15-49", sex: "male", symptoms: ["watery_diarrhoea", "vomiting"], dangerSigns: ["sunken_eyes", "unable_to_drink"], householdContact: false, householdDeath: false },
  },
  {
    id: "E21",
    subCounty: "Old Town",
    text: "Woman ~60, watery diarrhoea and vomiting 1 day, convulsion at home per family. Home: 31 Lakeview Road.",
    pii: ["31 Lakeview Road"],
    truth: { ageBand: "50+", sex: "female", symptoms: ["watery_diarrhoea", "vomiting"], dangerSigns: ["convulsions"], householdContact: false, householdDeath: false },
  },
  {
    id: "E22",
    subCounty: "Riverside",
    text: "Baby boy 10 months, watery diarrhoea, fever, sleepy and floppy, very sunken eyes. Dad: Omondi, 0555 016 777.",
    pii: ["Omondi", "0555 016 777"],
    truth: { ageBand: "0-1", sex: "male", symptoms: ["watery_diarrhoea", "fever"], dangerSigns: ["lethargic_or_unconscious", "sunken_eyes"], householdContact: false, householdDeath: false },
  },
  {
    id: "E23",
    subCounty: "Old Town",
    text: "Adult man, diarrhoea not watery, some mucus, 4 days, no fever. Works at the bus park. ID no A1234567",
    pii: ["A1234567"],
    truth: { ageBand: "unknown", sex: "male", symptoms: [], dangerSigns: [], householdContact: false, householdDeath: false },
  },
  {
    id: "E24",
    subCounty: "Riverside",
    text: "Girl 6 yrs, watery diarrhoea and vomiting, rapid pulse, lethargic. Her mother died yesterday of the same illness. Caregiver: Aunt Mary Chebet, mary.chebet@example.org",
    pii: ["Mary Chebet", "mary.chebet@example.org"],
    truth: { ageBand: "5-14", sex: "female", symptoms: ["watery_diarrhoea", "vomiting"], dangerSigns: ["rapid_weak_pulse", "lethargic_or_unconscious"], householdContact: true, householdDeath: true },
  },
];

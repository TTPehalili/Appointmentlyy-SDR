export type JobSignalCategory = 
  | 'b2b_appointment_setter'
  | 'ai_automation_specialist'
  | 'ai_sales_enablement';

export type JobSignalCountry = 'US' | 'AU' | 'ALL';

export interface DecisionMakerContact {
  name: string;
  title: string;
  linkedinUrl: string;
  phone?: string;
  email?: string;
  enriched?: boolean;
}

export interface JobSignalRecord {
  id: string;
  companyName: string;
  website: string;
  country: 'US' | 'AU';
  location: string;
  workType: 'Remote' | 'Hybrid / Remote';
  category: JobSignalCategory;
  categoryLabel: string;
  jobTitle: string;
  postingDate: string;
  sourcePlatform: string;
  budgetRange: {
    baseSalary: string;
    oteOrBonus?: string;
    ratePerHour?: string;
    currency: 'USD' | 'AUD';
    contractType: 'Full-time' | 'Contract (1099)' | 'Agency / Contractor' | 'Part-time';
    confidence: 'Explicitly Stated' | 'Market Estimate';
  };
  jobSummary: string;
  keyRequirements: string[];
  techStack: string[];
  whyTheyNeedUs: string;
  decisionMaker: DecisionMakerContact;
  pushedToLeads?: boolean;
}

export interface PredictionRequest {
  features: CustomerFeatures;
  threshold: number;
}
export interface EDAInfo {
  total_customers: number;
  churn_rate: number;
  churn_count: number;
  retain_count: number;

  by_contract: {
    Contract: string;
    churn_rate: number;
  }[];
}

export interface DatasetInfo {
  total_rows: number;
  train_size: number;
  test_size: number;
  n_features: number;
  churn_rate: number;
}

export interface PipelineResults {
  models: ModelMetric[];

  best_model: string;
  best_threshold: number;

  cost_fn: number;
  cost_fp: number;

  shap_global: {
    feature: string;
    importance: number;
  }[];

  customer_shap: any[];

  dataset_info: DatasetInfo;

  eda: EDAInfo; // ✅ ADD THIS (THIS FIXES EVERYTHING)
}

export interface PredictionResponse {
  probability: number;
  prediction: number;
  label: string;
  shap_values?: ShapContribution[];
}

export interface ShapContribution {
  feature: string;
  contribution: number;
  value: string | number;
}

export interface CustomerFeatures {
  gender: string;
  SeniorCitizen: number;
  Partner: string;
  Dependents: string;
  tenure: number;
  PhoneService: string;
  MultipleLines: string;
  InternetService: string;
  OnlineSecurity: string;
  OnlineBackup: string;
  DeviceProtection: string;
  TechSupport: string;
  StreamingTV: string;
  StreamingMovies: string;
  Contract: string;
  PaperlessBilling: string;
  PaymentMethod: string;
  MonthlyCharges: number;
  TotalCharges: number;
}

export interface PipelineStatusResponse {
  status: 'pending' | 'running' | 'completed' | 'error';
  current_step: number;
  total_steps: number;
  log_messages: string[];
  error?: string;
}

export interface ModelMetric {
  name: string;

  // core metrics (match backend exactly)
  accuracy: number;
  roc_auc: number;
  pr_auc?: number | null;
  cost?: number | null;

  // ranking / selection
  status: "Selected" | "Runner-up" | "Baseline" | string;
  rank?: number;

  // confusion matrix
  confusion_matrix: number[][];

  // threshold
  threshold?: number;

  // cross-validation
  cv_scores: number[];
  cv_mean: number;
  cv_std: number;
}

export interface ShapGlobalResponse {
  features: Array<{ feature: string; shap: number; direction: string }>;
}

export const DEFAULT_CUSTOMER_FEATURES: CustomerFeatures = {
  gender: 'Female',
  SeniorCitizen: 0,
  Partner: 'Yes',
  Dependents: 'No',
  tenure: 12,
  PhoneService: 'Yes',
  MultipleLines: 'No',
  InternetService: 'Fiber optic',
  OnlineSecurity: 'No',
  OnlineBackup: 'No',
  DeviceProtection: 'No',
  TechSupport: 'No',
  StreamingTV: 'No',
  StreamingMovies: 'No',
  Contract: 'Month-to-month',
  PaperlessBilling: 'Yes',
  PaymentMethod: 'Electronic check',
  MonthlyCharges: 70.35,
  TotalCharges: 844.20,
};

export const FEATURE_OPTIONS: Record<string, string[]> = {
  gender: ['Male', 'Female'],
  Partner: ['Yes', 'No'],
  Dependents: ['Yes', 'No'],
  PhoneService: ['Yes', 'No'],
  MultipleLines: ['Yes', 'No', 'No phone service'],
  InternetService: ['DSL', 'Fiber optic', 'No'],
  OnlineSecurity: ['Yes', 'No', 'No internet service'],
  OnlineBackup: ['Yes', 'No', 'No internet service'],
  DeviceProtection: ['Yes', 'No', 'No internet service'],
  TechSupport: ['Yes', 'No', 'No internet service'],
  StreamingTV: ['Yes', 'No', 'No internet service'],
  StreamingMovies: ['Yes', 'No', 'No internet service'],
  Contract: ['Month-to-month', 'One year', 'Two year'],
  PaperlessBilling: ['Yes', 'No'],
  PaymentMethod: ['Electronic check', 'Mailed check', 'Bank transfer (automatic)', 'Credit card (automatic)'],
};

export const NUMERIC_FEATURES = ['tenure', 'MonthlyCharges', 'TotalCharges'] as const;

export const FEATURE_EXPLANATIONS: Record<string, string> = {
  'Contract_Month-to-month': 'Month-to-month contracts have no lock-in, making it easy to leave. Customers with annual or biennial contracts churn 3-5× less.',
  'tenure': 'Longer tenure = stronger relationship. Customers who survive the first 6 months are significantly less likely to churn.',
  'MonthlyCharges': 'Higher bills create price sensitivity. Customers paying >$80/month churn at nearly double the rate.',
  'InternetService_Fiber optic': 'Fiber users churn more — likely due to higher prices and service quality expectations, not the technology itself.',
  'TechSupport_No': 'Customers without tech support feel unsupported when issues arise, leading to frustration and churn.',
  'OnlineSecurity_No': 'Lack of security services signals low engagement with the provider\'s ecosystem.',
  'TotalCharges': 'Higher lifetime spend indicates long relationships and sunk-cost loyalty. Low TotalCharges = new, vulnerable customers.',
  'PaymentMethod_Electronic check': 'Electronic check users churn 2× more — this payment method correlates with less commitment than auto-pay.',
  'Tenure_to_Charges': 'Ratio of tenure to monthly charges. Low ratio = paying a lot relative to loyalty.',
  'IsMonthToMonth': 'Binary flag for month-to-month contracts. The #1 churn predictor across all models.',
  'ServiceCount': 'More subscribed services = deeper integration = harder to leave.',
  'FiberUser': 'Fiber optic users experience higher bills and potentially more outages.',
  'LowEngagement': '≤2 services — minimal platform engagement, easy to replace.',
  'OnlineBackup_No': 'Not using backup = not storing data with provider = lower switching cost.',
  'HighSpender': 'Paying >$80/month — high price sensitivity risk.',
};

export const BUSINESS_TRANSLATIONS: Record<string, string> = {
  'ROC-AUC': 'Model ranking performance — how well the model distinguishes churners from non-churners (1.0 = perfect)',
  'PR-AUC': 'Precision-Recall balance — how well we find churners without too many false alarms',
  'Accuracy': 'Overall correctness — % of all predictions that were right',
  'Recall': 'Churner catch rate — % of actual churners we correctly identified',
  'Precision': 'Flag accuracy — % of flagged customers who actually churned',
  'F1-Score': 'Balance between Precision and Recall — harmonic mean of both',
  'Threshold': 'Decision boundary — probability above which we flag a customer as at-risk',
  'FN Cost': 'Cost of missing a churner — the revenue lost when we fail to intervene',
  'FP Cost': 'Cost of a false alarm — the discount/offer cost wasted on a non-churner',
};

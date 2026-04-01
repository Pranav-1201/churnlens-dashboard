export const SECTION_NAMES = [
  "System Setup & Hardware Check", "Imports & Config", "Data Loading", "EDA",
  "Data Cleaning", "Feature Engineering", "Encoding", "Split & Scaling",
  "Evaluation Utils", "Logistic Regression", "Decision Tree", "Random Forest",
  "XGBoost", "LightGBM", "CatBoost", "Stacking", "Model Comparison",
  "Threshold Optimization", "Final CV Check", "Optuna Tuning", "Tuned Logistic",
  "Threshold (Tuned)", "SHAP", "ANN Training", "ANN Evaluation", "Final Summary",
  "Business Analysis", "Model Saving", "SHAP Single", "SHAP Global"
];

export const CHART_COLORS = ["#6366F1","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899"];

export const MODEL_RESULTS = [
  { name: "Logistic Regression", accuracy: 0.7367, rocAuc: 0.8451, prAuc: 0.6557, cost: 392500, rank: 1, status: "Selected" },
  { name: "Tuned Logistic Regression", accuracy: 0.7388, rocAuc: 0.8454, prAuc: 0.6559, cost: 393000, rank: 2, status: "Runner-up" },
  { name: "Stacked Model", accuracy: 0.7537, rocAuc: 0.8465, prAuc: 0.6610, cost: 400500, rank: 3, status: "Evaluated" },
  { name: "CatBoost", accuracy: 0.7488, rocAuc: 0.8433, prAuc: 0.6604, cost: 400500, rank: 4, status: "Evaluated" },
  { name: "LightGBM", accuracy: 0.7722, rocAuc: 0.8312, prAuc: 0.6341, cost: 415500, rank: 5, status: "Evaluated" },
  { name: "XGBoost (Calibrated)", accuracy: 0.7935, rocAuc: 0.8397, prAuc: 0.6501, cost: 423500, rank: 6, status: "Evaluated" },
  { name: "Random Forest", accuracy: 0.7800, rocAuc: 0.8360, prAuc: 0.6420, cost: 448000, rank: 7, status: "Evaluated" },
  { name: "Decision Tree", accuracy: 0.7260, rocAuc: 0.8279, prAuc: 0.6305, cost: null, rank: 8, status: "Evaluated" },
];

export const CONFUSION_MATRICES = {
  "Logistic Regression": [[744, 291], [80, 294]],
  "Tuned Logistic Regression": [[747, 288], [80, 294]],
  "Stacked Model": [[766, 269], [78, 296]],
  "CatBoost": [[758, 277], [77, 297]],
  "LightGBM": [[818, 217], [104, 270]],
  "XGBoost (Calibrated)": [[918, 117], [174, 200]],
  "Random Forest": [[865, 170], [140, 234]],
  "Decision Tree": [[728, 307], [79, 295]],
};

export const CV_SCORES = {
  "Logistic Regression": [0.8601, 0.8448, 0.8577, 0.8311, 0.8404],
  "Random Forest": [0.8533, 0.8314, 0.8468, 0.8242, 0.8374],
  "XGBoost (Calibrated)": [0.8527, 0.8369, 0.8527, 0.8261, 0.8370],
  "LightGBM": [0.8413, 0.8285, 0.8442, 0.8203, 0.8304],
  "CatBoost": [0.8559, 0.8394, 0.8539, 0.8313, 0.8348],
  "Decision Tree": [0.8390, 0.8074, 0.8255, 0.8022, 0.8129],
  "Stacked Model": [0.8624, 0.8449, 0.8592, 0.8319, 0.8429],
  "Tuned Logistic Regression": [0.8601, 0.8448, 0.8577, 0.8311, 0.8404],
};

export const FEATURE_IMPORTANCE = [
  { feature: "Contract_Month-to-month", importance: 0.142 },
  { feature: "tenure", importance: 0.128 },
  { feature: "MonthlyCharges", importance: 0.095 },
  { feature: "TotalCharges", importance: 0.088 },
  { feature: "InternetService_Fiber optic", importance: 0.076 },
  { feature: "TechSupport_No", importance: 0.065 },
  { feature: "OnlineSecurity_No", importance: 0.058 },
  { feature: "PaymentMethod_Electronic check", importance: 0.052 },
  { feature: "Tenure_to_Charges", importance: 0.048 },
  { feature: "IsMonthToMonth", importance: 0.045 },
  { feature: "ServiceCount", importance: 0.040 },
  { feature: "FiberUser", importance: 0.038 },
  { feature: "OnlineBackup_No", importance: 0.032 },
  { feature: "DeviceProtection_No", importance: 0.028 },
  { feature: "StreamingTV_No", importance: 0.024 },
];

export const SHAP_VALUES = [
  { feature: "Contract_Month-to-month", shap: 0.185, direction: "increases" },
  { feature: "tenure", shap: 0.156, direction: "decreases" },
  { feature: "MonthlyCharges", shap: 0.112, direction: "increases" },
  { feature: "InternetService_Fiber optic", shap: 0.098, direction: "increases" },
  { feature: "TechSupport_No", shap: 0.082, direction: "increases" },
  { feature: "OnlineSecurity_No", shap: 0.074, direction: "increases" },
  { feature: "TotalCharges", shap: 0.068, direction: "decreases" },
  { feature: "PaymentMethod_Electronic check", shap: 0.059, direction: "increases" },
  { feature: "Tenure_to_Charges", shap: 0.053, direction: "decreases" },
  { feature: "IsMonthToMonth", shap: 0.048, direction: "increases" },
  { feature: "ServiceCount", shap: 0.041, direction: "decreases" },
  { feature: "FiberUser", shap: 0.036, direction: "increases" },
  { feature: "LowEngagement", shap: 0.032, direction: "increases" },
  { feature: "OnlineBackup_No", shap: 0.028, direction: "increases" },
  { feature: "HighSpender", shap: 0.024, direction: "increases" },
  { feature: "StreamingTV_No", shap: 0.019, direction: "increases" },
  { feature: "PaperlessBilling_Yes", shap: 0.016, direction: "increases" },
  { feature: "DeviceProtection_No", shap: 0.014, direction: "increases" },
  { feature: "Dependents_No", shap: 0.011, direction: "increases" },
  { feature: "Partner_No", shap: 0.009, direction: "increases" },
];

export const THRESHOLD_DATA = Array.from({ length: 16 }, (_, i) => {
  const t = 0.10 + i * 0.05;
  const recall = Math.max(0, 1 - 0.8 * t);
  const precision = 0.25 + 0.6 * t;
  const cost = 383500 + (t - 0.13) ** 2 * 8000000;
  const f1 = 2 * precision * recall / (precision + recall || 1);
  return { threshold: +t.toFixed(2), precision: +precision.toFixed(3), recall: +recall.toFixed(3), cost: Math.round(cost), f1: +f1.toFixed(3) };
});

export const ROC_CURVE_DATA = Array.from({ length: 50 }, (_, i) => {
  const fpr = i / 49;
  return {
    fpr: +fpr.toFixed(3),
    "Logistic Regression": +Math.min(1, fpr * 0.3 + Math.sqrt(fpr) * 0.85).toFixed(3),
    "Random Forest": +Math.min(1, fpr * 0.25 + Math.sqrt(fpr) * 0.83).toFixed(3),
    "XGBoost": +Math.min(1, fpr * 0.28 + Math.sqrt(fpr) * 0.84).toFixed(3),
    "LightGBM": +Math.min(1, fpr * 0.22 + Math.sqrt(fpr) * 0.82).toFixed(3),
    "CatBoost": +Math.min(1, fpr * 0.29 + Math.sqrt(fpr) * 0.84).toFixed(3),
    "Stacked": +Math.min(1, fpr * 0.31 + Math.sqrt(fpr) * 0.85).toFixed(3),
  };
});

export const ANN_TRAINING_CURVE = Array.from({ length: 25 }, (_, i) => ({
  epoch: i + 1,
  trainLoss: +(0.65 * Math.exp(-0.08 * i) + 0.32).toFixed(4),
  valLoss: +(0.60 * Math.exp(-0.06 * i) + 0.38 + (i > 18 ? 0.02 * (i - 18) : 0)).toFixed(4),
}));

export const OPTUNA_TRIALS = Array.from({ length: 30 }, (_, i) => ({
  trial: i + 1,
  rocAuc: +(0.82 + Math.random() * 0.03 + (i > 20 ? 0.005 : 0)).toFixed(4),
  isBest: i === 24,
}));

export const SAMPLE_CUSTOMERS = [
  { index: 0, gender: "Female", SeniorCitizen: 0, Partner: "Yes", Dependents: "No", tenure: 1, PhoneService: "No", InternetService: "DSL", Contract: "Month-to-month", MonthlyCharges: 29.85, TotalCharges: 29.85, Churn: 0, probability: 0.32 },
  { index: 42, gender: "Male", SeniorCitizen: 0, Partner: "No", Dependents: "No", tenure: 2, PhoneService: "Yes", InternetService: "Fiber optic", Contract: "Month-to-month", MonthlyCharges: 70.70, TotalCharges: 151.65, Churn: 1, probability: 0.87 },
  { index: 100, gender: "Female", SeniorCitizen: 1, Partner: "No", Dependents: "No", tenure: 8, PhoneService: "Yes", InternetService: "Fiber optic", Contract: "Month-to-month", MonthlyCharges: 99.65, TotalCharges: 820.50, Churn: 1, probability: 0.91 },
  { index: 500, gender: "Male", SeniorCitizen: 0, Partner: "Yes", Dependents: "Yes", tenure: 56, PhoneService: "Yes", InternetService: "DSL", Contract: "Two year", MonthlyCharges: 42.30, TotalCharges: 2340.75, Churn: 0, probability: 0.05 },
];

export const DATASET_PREVIEW = [
  { customerID: "7590-VHVEG", gender: "Female", SeniorCitizen: 0, Partner: "Yes", Dependents: "No", tenure: 1, PhoneService: "No", MultipleLines: "No phone service", InternetService: "DSL", OnlineSecurity: "No", OnlineBackup: "Yes", DeviceProtection: "No", TechSupport: "No", StreamingTV: "No", StreamingMovies: "No", Contract: "Month-to-month", PaperlessBilling: "Yes", PaymentMethod: "Electronic check", MonthlyCharges: 29.85, TotalCharges: "29.85", Churn: "No" },
  { customerID: "5575-GNVDE", gender: "Male", SeniorCitizen: 0, Partner: "No", Dependents: "No", tenure: 34, PhoneService: "Yes", MultipleLines: "No", InternetService: "DSL", OnlineSecurity: "Yes", OnlineBackup: "No", DeviceProtection: "Yes", TechSupport: "No", StreamingTV: "No", StreamingMovies: "No", Contract: "One year", PaperlessBilling: "No", PaymentMethod: "Mailed check", MonthlyCharges: 56.95, TotalCharges: "1889.5", Churn: "No" },
  { customerID: "3668-QPYBK", gender: "Male", SeniorCitizen: 0, Partner: "No", Dependents: "No", tenure: 2, PhoneService: "Yes", MultipleLines: "No", InternetService: "DSL", OnlineSecurity: "Yes", OnlineBackup: "Yes", DeviceProtection: "No", TechSupport: "No", StreamingTV: "No", StreamingMovies: "No", Contract: "Month-to-month", PaperlessBilling: "Yes", PaymentMethod: "Mailed check", MonthlyCharges: 53.85, TotalCharges: "108.15", Churn: "Yes" },
  { customerID: "7795-CFOCW", gender: "Male", SeniorCitizen: 0, Partner: "No", Dependents: "No", tenure: 45, PhoneService: "No", MultipleLines: "No phone service", InternetService: "DSL", OnlineSecurity: "Yes", OnlineBackup: "No", DeviceProtection: "Yes", TechSupport: "Yes", StreamingTV: "No", StreamingMovies: "No", Contract: "One year", PaperlessBilling: "No", PaymentMethod: "Bank transfer (automatic)", MonthlyCharges: 42.30, TotalCharges: "1840.75", Churn: "No" },
  { customerID: "9237-HQITU", gender: "Female", SeniorCitizen: 0, Partner: "No", Dependents: "No", tenure: 2, PhoneService: "Yes", MultipleLines: "No", InternetService: "Fiber optic", OnlineSecurity: "No", OnlineBackup: "No", DeviceProtection: "No", TechSupport: "No", StreamingTV: "No", StreamingMovies: "No", Contract: "Month-to-month", PaperlessBilling: "Yes", PaymentMethod: "Electronic check", MonthlyCharges: 70.70, TotalCharges: "151.65", Churn: "Yes" },
];

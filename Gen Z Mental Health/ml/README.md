# Final models for the existing dashboard

This ML service and the trained artifacts belong to the existing `Gen Z Mental Health` app. The dashboard's existing `/simulator` route calls `/ml/predict`; no parallel dashboard is needed.

## Models and saved files

- `addiction_level`: `RandomForestClassifier`
- `mental_health_score`: `LinearRegression`
- Source: MySQL `data_genz.genz_social_media_usage_1m` (1,000,000 rows)
- Stratified split: 800,000 training rows and 200,000 testing rows (`random_state=42`)
- Both targets are excluded from the input features. Imputation, one-hot encoding, and numeric scaling are fit inside sklearn pipelines on training rows only.

Saved output:

- `artifacts/model_bundle.joblib` — both fitted model/preprocessing pipelines and metadata.
- `results/evaluation_metrics.json` — split details and classifier/regression test metrics.
- `results/testing_predictions.csv` — actual and predicted targets for test rows.
- `results/split_indices.npz` — exact training/testing row indices.

## Train or reproduce the models

From PowerShell:

```powershell
cd "E:\SEMESTER 5\BIG DATA\PROJEK-BIG-DATA\Gen Z Mental Health\ml"
python -m pip install -r requirements.txt
python train_model.py
```

Set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, and `MYSQL_TABLE` in the same shell if they differ from the defaults in `train_model.py`. The trainer requires exactly 1,000,000 rows and exits with an explicit error if the source does not match.

Install test dependencies and run focused tests:

```powershell
python -m pip install -r requirements-test.txt
python -m pytest -q
```

## Run the existing app with final models

Start the model service in one terminal:

```powershell
cd "E:\SEMESTER 5\BIG DATA\PROJEK-BIG-DATA\Gen Z Mental Health\ml"
python -m uvicorn model_service:app --host 127.0.0.1 --port 8000
```

Keep the existing dashboard API and Vite dashboard running as usual. The Vite `/ml` proxy forwards simulator predictions to this service. If the Vite server was already running when its config changed, restart that process once so it loads the new proxy rule.

The source `addiction_level` labels fall into non-overlapping `daily_usage_hours` ranges. Therefore, the observed 100% classifier accuracy may reflect how the dataset labels were constructed; it is not evidence of clinical prediction performance. The simulator displays this caveat.

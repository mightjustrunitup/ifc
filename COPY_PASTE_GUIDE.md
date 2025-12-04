# 🚀 COPY-PASTE GUIDE

## 3 Simple Steps

---

## STEP 1: SUPABASE DATABASE

**File**: `supabase/migrations/20251121_create_multi_agent_schema.sql`

**What to do**:
1. Open: https://app.supabase.com → Your Project → SQL Editor
2. Click "New Query"
3. **Copy-paste entire SQL file** from: `supabase/migrations/20251121_create_multi_agent_schema.sql`
4. Click "Run"
5. Wait for success ✅

**Result**: 5 tables created (projects, design_intents, code_versions, execution_logs, ifc_files)

---

## STEP 2: RAILWAY BACKEND

**File**: `blenderbim-backend/main.py`

**What to do**:
1. In your Railway project, open `blenderbim-backend/main.py`
2. **Delete entire content**
3. **Copy-paste entire file** from: `blenderbim-backend/main.py`
4. Commit & push
5. Railway auto-deploys ✅

**Result**: Updated Blender worker with better error handling

---

## STEP 3: FRONTEND

**File**: `src/components/IfcChat.tsx`

**What to do**:
1. In your local repo, open `src/components/IfcChat.tsx`
2. **Delete entire content**
3. **Copy-paste entire file** from: `src/components/IfcChat.tsx`
4. Save
5. Rebuild: `npm run build`
6. Deploy ✅

**Result**: Frontend now calls `/orchestrate` endpoint

---

## STEP 4: EDGE FUNCTIONS (Supabase)

**Folder**: `supabase/functions/orchestrate/`

**What to do**:

### Part A: Main Function
1. Create folder: `supabase/functions/orchestrate/` (if doesn't exist)
2. Create file: `index.ts`
3. **Copy-paste entire file** from: `supabase/functions/orchestrate/index.ts`
4. Save

### Part B: Prompts Folder
1. Create folder: `supabase/functions/orchestrate/prompts/`
2. Create 5 files with exact names:
   - `product-owner.txt` ← copy from `supabase/functions/orchestrate/prompts/product-owner.txt`
   - `architect.txt` ← copy from `supabase/functions/orchestrate/prompts/architect.txt`
   - `programmer.txt` ← copy from `supabase/functions/orchestrate/prompts/programmer.txt`
   - `validator.txt` ← copy from `supabase/functions/orchestrate/prompts/validator.txt`
   - `reviewer.txt` ← copy from `supabase/functions/orchestrate/prompts/reviewer.txt`

### Part C: Deploy
```bash
supabase functions deploy orchestrate
```

**Result**: `/orchestrate` endpoint live and ready

---

## STEP 5: SET ENVIRONMENT VARIABLES

**In Supabase Dashboard**:

1. Go to: Settings → Edge Functions → Environment Variables
2. Add:
   - `LOVABLE_API_KEY` = your Lovable API key
   - `PYTHON_BACKEND_URL` = your Railway backend URL (e.g., `https://my-backend.railway.app`)

3. Save

---

## ✅ DONE!

Your system is now live with:
- ✅ 5-table database (projects, logs, etc.)
- ✅ Updated Blender worker (better errors)
- ✅ Updated frontend (calls /orchestrate)
- ✅ 5-stage orchestrator (Product Owner → Architect → Programmer → Validator → Executor)

**Ready to test**: Describe a building and watch it generate! 🎉

---

## 📍 Quick File Locations

```
supabase/migrations/20251121_create_multi_agent_schema.sql    ← Copy to Supabase SQL
blenderbim-backend/main.py                                    ← Copy to Railway
src/components/IfcChat.tsx                                    ← Copy locally
supabase/functions/orchestrate/index.ts                       ← Copy to Supabase
supabase/functions/orchestrate/prompts/                       ← Copy all 5 .txt files
```

---

## 🆘 If Something Breaks

**Database error?**
- Check: All 5 tables exist
- Fix: Re-run SQL, ignore "already exists" errors

**Backend error?**
- Check: Railway logs show no Python errors
- Fix: Ensure `blenderbim-backend/requirements.txt` has all deps

**Frontend error?**
- Check: Browser console for errors
- Fix: Ensure `orchestrate` function deployed successfully

**Missing endpoint?**
- Check: `supabase functions deploy orchestrate` completed
- Fix: Environment variables set correctly

---

Done! You're ready. 🚀

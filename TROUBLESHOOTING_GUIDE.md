# Troubleshooting Guide - Dashboard Not Loading

## Problem
Charts and data are not loading in the dashboard.

## Root Cause
The improved JavaScript code expected Python controller routes to exist, but they need to be installed together. If the controller isn't set up, the RPC calls fail silently.

## Solution Options

### Option 1: Use the Fixed Version (RECOMMENDED - EASIEST)

Use `project_dashboard_fixed.js` which:
- ✅ Works WITHOUT the Python controller
- ✅ Uses direct ORM calls (like your original code)
- ✅ Has better organization and error handling
- ✅ Includes console logging for debugging
- ✅ Will load data immediately

**Installation:**
```bash
# Just replace your JavaScript file
cp project_dashboard_fixed.js /path/to/your_module/static/src/js/project_dashboard.js

# Restart Odoo
sudo systemctl restart odoo

# Clear browser cache (Ctrl+Shift+Delete)
# Reload the page
```

### Option 2: Install Both Files Together

If you want the full improved version with Python controller:

**Step 1: Install Python Controller**
```bash
cp project_dashboard_controller_improved.py /path/to/your_module/controllers/main.py
```

**Step 2: Update `__init__.py` in controllers folder**
```python
from . import main
```

**Step 3: Install JavaScript**
```bash
cp project_dashboard_improved.js /path/to/your_module/static/src/js/project_dashboard.js
```

**Step 4: Restart and Update**
```bash
sudo systemctl restart odoo
odoo-bin -u your_module_name -d your_database
```

### Option 3: Use Your Original Code

If you want to keep your original working code:
```bash
# Restore from backup
cp your_module_backup/static/src/js/project_dashboard.js your_module/static/src/js/
sudo systemctl restart odoo
```

## Debugging Steps

### 1. Check Browser Console

Open browser console (F12 → Console tab) and look for:

```
[Dashboard] Starting to load data...
[Dashboard] Loading dashboard data...
[Dashboard] Fetching projects with domain: []
[Dashboard] Loaded projects: XX
[Dashboard] Calculating statistics...
[Dashboard] Stats calculated: {...}
[Dashboard] Component mounted, initializing charts...
[Dashboard] Loading ECharts library...
[Dashboard] ECharts loaded, rendering charts...
[Dashboard] Rendering horizontal bar chart...
```

### 2. Check for Errors

Look for RED error messages:
- `ReferenceError` → Missing function/variable
- `TypeError` → Trying to call something that's not a function
- `Failed to fetch` → Network/RPC error
- `404 Not Found` → Controller route doesn't exist

### 3. Check Network Tab

1. Open F12 → Network tab
2. Filter by "XHR" or "Fetch"
3. Look for failed requests (red)
4. Check if `/project/dashboard/` routes return 404

### 4. Check Odoo Server Log

```bash
tail -f /var/log/odoo/odoo-server.log
```

Look for:
- Python errors
- "File not found" errors
- Import errors

## Common Issues and Fixes

### Issue 1: "ECharts is not defined"

**Symptom:** Charts are empty or don't appear

**Fix:**
1. Check internet connection (CDN needs to load)
2. Check if CDN is blocked by firewall
3. Try alternative CDN:

```javascript
// In JavaScript file, change CDN URL to:
script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
```

### Issue 2: "Element not found" warnings

**Symptom:** Stats show 0 or blank

**Fix:** Check your XML template has these IDs:
- `totalProjects`
- `newProjects`
- `completedProjects`
- `cancelledProjects`
- `totalBudget`
- `totalExpenses`

### Issue 3: Charts render but no data

**Symptom:** Charts show but are empty

**Fix:**
1. Check you have projects in database
2. Check user has access rights to view projects
3. Add test data:

```sql
-- Check project count
SELECT COUNT(*) FROM project_project;

-- Check if current user can see projects
SELECT COUNT(*) FROM project_project WHERE id IN (
    SELECT res_id FROM ir_model_access WHERE model_id = 
    (SELECT id FROM ir_model WHERE model = 'project.project')
);
```

### Issue 4: Module won't update

**Symptom:** Changes don't appear after update

**Fix:**
```bash
# Clear Python cache
find /path/to/your_module -type f -name "*.pyc" -delete
find /path/to/your_module -type d -name "__pycache__" -exec rm -r {} +

# Clear Odoo assets
psql -d your_database -c "DELETE FROM ir_attachment WHERE name LIKE '%assets_%';"

# Force update
odoo-bin -u your_module_name -d your_database --stop-after-init

# Restart
sudo systemctl start odoo
```

### Issue 5: "Failed to fetch" or RPC errors

**Symptom:** Network errors in console

**Fix:**
1. Check controller file is in correct location
2. Check `__init__.py` imports controller
3. Verify route paths match:

```python
# In controller file:
@http.route('/project/dashboard/data', type='json', auth='user')

# In JavaScript:
await this.rpc("/project/dashboard/data", {...})
```

## Quick Fix Checklist

Run through this checklist:

- [ ] Browser console open (F12)
- [ ] Clear browser cache (Ctrl+Shift+Delete)
- [ ] File is in correct location: `module/static/src/js/project_dashboard.js`
- [ ] File permissions are correct: `chmod 644 project_dashboard.js`
- [ ] Odoo restarted: `sudo systemctl restart odoo`
- [ ] Assets cleared in database
- [ ] Internet connection working (for ECharts CDN)
- [ ] User logged in with proper access rights
- [ ] Projects exist in database
- [ ] No errors in Odoo log
- [ ] No errors in browser console

## Testing the Fixed Version

After installing `project_dashboard_fixed.js`:

### 1. Open Browser Console
```
F12 → Console tab
```

### 2. Navigate to Dashboard
```
Odoo → Projects → Dashboard
```

### 3. Check Console Output
You should see:
```
[Dashboard] Starting to load data...
[Dashboard] Loading dashboard data...
[Dashboard] Fetching projects with domain: []
[Dashboard] Loaded projects: 10
[Dashboard] Calculating statistics...
[Dashboard] Stats calculated: {total: 10, new: 2, ...}
[Dashboard] Component mounted, initializing charts...
[Dashboard] Initializing charts...
[Dashboard] Loading ECharts library...
[Dashboard] ECharts loaded, rendering charts...
[Dashboard] Rendering all charts...
[Dashboard] Rendering horizontal bar chart...
[Dashboard] Rendering line chart...
[Dashboard] Rendering bar chart...
[Dashboard] Rendering radar chart...
[Dashboard] Rendering scatter chart...
[Dashboard] Rendering stacked bar chart...
[Dashboard] All charts rendered successfully!
[Dashboard] Data loading complete!
```

### 4. Verify Visually
- [ ] Statistics cards show numbers (not 0 or blank)
- [ ] All 6 charts are visible
- [ ] Charts have data (not empty)
- [ ] Time updates every minute
- [ ] Filters populate with data
- [ ] No error messages

## If Still Not Working

### Collect Debug Information

Run these commands and share output:

```bash
# 1. Check file exists
ls -lah /path/to/your_module/static/src/js/project_dashboard.js

# 2. Check Odoo is running
sudo systemctl status odoo

# 3. Check recent errors
tail -50 /var/log/odoo/odoo-server.log

# 4. Check module is installed
# In Odoo UI: Apps → search for your module → should show "Installed"

# 5. Check database
psql -d your_database -c "SELECT COUNT(*) FROM project_project;"
```

### Browser Console Screenshot

Take a screenshot of:
1. Browser console (F12 → Console)
2. Network tab (F12 → Network → XHR filter)
3. The dashboard page itself

## Comparison: Original vs Fixed vs Full

| Feature | Your Original | project_dashboard_fixed.js | Both Improved Files |
|---------|--------------|---------------------------|---------------------|
| Works out of box | ✅ | ✅ | ⚠️ Needs both files |
| Console logging | ❌ | ✅ | ✅ |
| Error handling | Basic | ✅ Good | ✅ Excellent |
| Code organization | Mixed | ✅ Better | ✅ Best |
| Performance | OK | ✅ Good | ✅ Best |
| Real data | ✅ | ✅ | ✅ |
| Server-side calc | ❌ | ❌ | ✅ |
| Easy to debug | ❌ | ✅ | ✅ |

## Recommendation

**For immediate fix:** Use `project_dashboard_fixed.js`

This gives you:
- ✅ Works immediately without Python changes
- ✅ Better organized code
- ✅ Console logging for debugging
- ✅ Better error handling
- ✅ All data loads correctly

**For long-term:** Install both improved files
- Better performance
- Server-side calculations
- More maintainable
- Better for large datasets

## Support Commands

```bash
# Restart Odoo
sudo systemctl restart odoo

# Check Odoo status
sudo systemctl status odoo

# Watch live logs
tail -f /var/log/odoo/odoo-server.log | grep -i error

# Clear assets
psql -d your_db -c "DELETE FROM ir_attachment WHERE name LIKE '%assets_%';"

# Update module
odoo-bin -u your_module -d your_db

# Check file permissions
chmod 644 static/src/js/*.js
chmod 644 controllers/*.py
```

---

**Still having issues? Check:**
1. Browser console for errors (F12)
2. Odoo log for Python errors
3. Network tab for failed requests
4. Database has projects to display

# Migration Checklist - Old to New Dashboard

## Pre-Migration

- [ ] **Backup your database**
  ```bash
  pg_dump your_database > backup_$(date +%Y%m%d).sql
  ```

- [ ] **Backup your module files**
  ```bash
  cp -r /path/to/sh_project_dashboard /path/to/sh_project_dashboard_backup
  ```

- [ ] **Document current customizations**
  - List any custom fields added
  - Note any custom methods or views
  - Record any custom CSS/JS modifications

- [ ] **Test in development environment first**
  - Never migrate directly in production
  - Clone your database for testing

## File Updates

- [ ] **Update JavaScript file**
  ```bash
  cp project_dashboard_improved.js /path/to/sh_project_dashboard/static/src/js/project_dashboard.js
  ```

- [ ] **Update Python controller**
  ```bash
  cp project_dashboard_controller_improved.py /path/to/sh_project_dashboard/controllers/project_dashboard_controller.py
  ```

- [ ] **Verify file permissions**
  ```bash
  chmod 644 static/src/js/project_dashboard.js
  chmod 644 controllers/project_dashboard_controller.py
  ```

## Database Updates

- [ ] **Add required fields (if not present)**

### Option 1: Using XML data file
Create `data/project_project_fields.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <data>
        <!-- Add fields via XML if needed -->
    </data>
</odoo>
```

### Option 2: Using Python model inheritance
Create `models/project_project.py`:
```python
from odoo import models, fields

class ProjectProject(models.Model):
    _inherit = 'project.project'
    
    # Only add if not present
    department_id = fields.Many2one('hr.department', 'Department')
    budget_expenses = fields.Monetary('Actual Expenses', currency_field='currency_id')
    analytic_account_id = fields.Many2one('account.analytic.account', 'Analytic Account')
```

- [ ] **Update module manifest**
  - Add 'hr' to depends (if using departments)
  - Add 'account' to depends (if using analytic accounts)

## Module Update

- [ ] **Stop Odoo service**
  ```bash
  sudo systemctl stop odoo
  # OR
  sudo service odoo stop
  ```

- [ ] **Update Python dependencies** (if any new ones)
  ```bash
  pip3 install -r requirements.txt
  ```

- [ ] **Start Odoo in update mode**
  ```bash
  /path/to/odoo-bin -u sh_project_dashboard -d your_database --http-port=8069
  ```

- [ ] **Check for errors in log**
  ```bash
  tail -f /var/log/odoo/odoo-server.log
  ```

## Post-Migration Verification

### Functional Tests

- [ ] **Dashboard loads**
  - Navigate to Projects > Dashboard
  - Verify no console errors (F12)

- [ ] **Statistics display correctly**
  - Total projects count matches
  - Stage counts are accurate
  - Budget totals are correct

- [ ] **Charts render**
  - [ ] Horizontal bar chart (Project stats)
  - [ ] Line chart (Creation trend)
  - [ ] Bar chart (Progress)
  - [ ] Radar chart (Budget)
  - [ ] Scatter chart (Risk)
  - [ ] Stacked bar chart (Department)

- [ ] **Filters work**
  - [ ] Manager filter
  - [ ] Project filter
  - [ ] Time filter (7/30/90 days)

- [ ] **Real-time updates**
  - Date/time updates every minute
  - Filters trigger data reload

- [ ] **Actions work**
  - [ ] Create New Project
  - [ ] Create New Task
  - [ ] Create New User

### Data Accuracy Tests

- [ ] **Progress Calculation**
  ```sql
  -- Verify progress calculation
  SELECT p.name, p.task_count,
         COUNT(CASE WHEN t.stage_id IN (SELECT id FROM project_task_type WHERE fold = true) THEN 1 END) as completed
  FROM project_project p
  LEFT JOIN project_task t ON t.project_id = p.id
  GROUP BY p.id, p.name, p.task_count;
  ```

- [ ] **Budget Data**
  ```sql
  -- Verify budget data
  SELECT name, planned_revenue, budget_expenses
  FROM project_project
  WHERE planned_revenue > 0;
  ```

- [ ] **Risk Calculation**
  - Check projects near deadline have higher risk
  - Overdue projects show risk > 90
  - Projects on track have lower risk

### Performance Tests

- [ ] **Load Time**
  - Dashboard loads in < 3 seconds
  - Charts render in < 2 seconds

- [ ] **Filter Response Time**
  - Filter changes reflect in < 1 second

- [ ] **Large Dataset** (if you have 100+ projects)
  - No timeout errors
  - Charts still render correctly

## Rollback Plan (If Needed)

If something goes wrong:

- [ ] **Restore database**
  ```bash
  sudo systemctl stop odoo
  dropdb your_database
  createdb your_database
  psql your_database < backup_YYYYMMDD.sql
  ```

- [ ] **Restore old files**
  ```bash
  rm -rf /path/to/sh_project_dashboard
  cp -r /path/to/sh_project_dashboard_backup /path/to/sh_project_dashboard
  ```

- [ ] **Restart Odoo**
  ```bash
  sudo systemctl start odoo
  ```

## Common Issues & Solutions

### Issue: Module won't update
**Solution:**
```bash
# Clear Python cache
find /path/to/sh_project_dashboard -type f -name "*.pyc" -delete
find /path/to/sh_project_dashboard -type d -name "__pycache__" -exec rm -r {} +

# Update again
/path/to/odoo-bin -u sh_project_dashboard -d your_database --stop-after-init
```

### Issue: JavaScript not loading
**Solution:**
```bash
# Clear Odoo assets
psql -d your_database -c "DELETE FROM ir_attachment WHERE name LIKE '%assets_%';"

# Clear browser cache (Ctrl+Shift+Delete)
# Restart Odoo
sudo systemctl restart odoo
```

### Issue: Charts not displaying
**Solution:**
1. Check browser console (F12)
2. Verify ECharts CDN is accessible
3. Check network tab for 404 errors
4. Verify static files are being served

### Issue: "Field doesn't exist" errors
**Solution:**
```python
# Add missing fields to your model
# Then update module with -u flag
```

### Issue: Performance is slow
**Solution:**
```sql
-- Add database indexes
CREATE INDEX idx_project_create_date ON project_project(create_date);
CREATE INDEX idx_project_date_start ON project_project(date_start);
CREATE INDEX idx_task_project_id ON project_task(project_id);
CREATE INDEX idx_task_stage_fold ON project_task_type(fold);
```

## Final Checklist

- [ ] All tests passing
- [ ] No errors in Odoo log
- [ ] No errors in browser console
- [ ] Performance acceptable
- [ ] Users can access dashboard
- [ ] Data is accurate
- [ ] Charts display correctly
- [ ] Filters work as expected
- [ ] Actions (create new) work
- [ ] Documentation updated
- [ ] Backup verified and stored safely

## Post-Migration Tasks

- [ ] **Monitor for first 24 hours**
  - Watch for errors in logs
  - Get user feedback
  - Monitor performance

- [ ] **User Training** (if needed)
  - New features overview
  - Filter usage
  - Report generation

- [ ] **Documentation**
  - Update internal wiki
  - Create user guide
  - Document any customizations

## Sign-off

Migration completed by: _______________
Date: _______________
Verified by: _______________
Date: _______________

Notes:
_________________________________________________
_________________________________________________
_________________________________________________

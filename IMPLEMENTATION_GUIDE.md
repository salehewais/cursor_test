# Project Dashboard - Implementation Guide

## Overview
This guide provides detailed instructions for implementing the improved project dashboard with real Odoo data integration.

## What's Improved? ✨

### JavaScript (Frontend) Improvements:
1. **Better Code Organization**
   - Separated concerns into logical sections (Data Loading, UI Updates, Event Handlers, Charts, Utilities)
   - Used `useState` for reactive state management
   - Added constants for colors, time filters, and chart configurations
   - Reduced code duplication

2. **Real Data Integration**
   - Uses Python controller routes via `this.rpc()` instead of direct ORM calls
   - Better performance with server-side data processing
   - Proper error handling with try-catch blocks

3. **Improved Data Flow**
   - Parallel data loading with `Promise.all()`
   - Centralized data loading methods
   - Better state management

4. **Better UX**
   - Loading states
   - Notification system hooks
   - Proper cleanup on unmount

### Python (Backend) Improvements:
1. **Real Data Calculations**
   - `_calculate_project_progress()`: Real progress based on completed tasks
   - `_calculate_project_risk()`: Intelligent risk assessment based on deadlines, progress, and budget
   - `_calculate_budget_stats()`: Integration with analytic accounts for real expense tracking

2. **Better Code Structure**
   - Helper methods for common operations
   - Domain building logic centralized
   - Proper error handling and logging

3. **Enhanced Features**
   - Stage categorization for consistent statistics
   - Comprehensive risk analysis
   - Department-wise budget tracking
   - Export functionality

## Installation Steps

### Step 1: Update Your Module Files

Replace your existing files with the improved versions:

```bash
# In your Odoo addon directory
# Example: /odoo/addons/sh_project_dashboard/

# Replace JavaScript file
cp project_dashboard_improved.js static/src/js/project_dashboard.js

# Replace Python controller
cp project_dashboard_controller_improved.py controllers/project_dashboard_controller.py
```

### Step 2: Update `__manifest__.py`

Ensure your manifest includes the necessary dependencies:

```python
{
    'name': 'Project Dashboard',
    'version': '1.0',
    'category': 'Project',
    'depends': [
        'base',
        'web',
        'project',
        'hr',  # For department tracking
        'account',  # For analytic account expense tracking (optional)
    ],
    'data': [
        # Your XML files
    ],
    'assets': {
        'web.assets_backend': [
            'sh_project_dashboard/static/src/js/project_dashboard.js',
            'sh_project_dashboard/static/src/xml/project_dashboard.xml',
            'sh_project_dashboard/static/src/css/project_dashboard.css',
        ],
    },
    'installable': True,
    'application': True,
}
```

### Step 3: Add Expense Tracking (Optional but Recommended)

To get real expense data, you have two options:

#### Option A: Use Analytic Accounts (Recommended)
The controller already integrates with analytic accounts. Just ensure your projects have analytic accounts linked:

```python
# In project.project model (if not already present)
analytic_account_id = fields.Many2one('account.analytic.account', 'Analytic Account')
```

#### Option B: Add Custom Expense Field
Add a custom field to track expenses:

```python
# In your project.project model extension
budget_expenses = fields.Monetary('Actual Expenses', currency_field='currency_id')
```

### Step 4: Update Database Schema

After updating the code:

```bash
# Restart Odoo
systemctl restart odoo

# Update the module
odoo-bin -u sh_project_dashboard -d your_database
```

## Configuration

### 1. Project Stages Configuration

Ensure your project stages are properly configured. The system recognizes:

- **New**: Keywords: new, draft, pending
- **In Progress**: Keywords: progress, development, active, doing
- **Completed**: Keywords: done, complete, finish, closed
- **Cancelled**: Keywords: cancel, abandon, reject

### 2. Task Stages Configuration

For progress calculation, ensure task stages have the `fold` attribute set correctly:
- Completed stages should have `fold = True`
- Active stages should have `fold = False`

### 3. Department Setup

If using department-wise budget tracking:

```xml
<!-- In hr.department form view -->
<field name="name"/>
<field name="manager_id"/>
```

Link projects to departments:

```xml
<!-- In project.project form view -->
<field name="department_id"/>
```

## API Endpoints Reference

All endpoints return JSON and require authentication.

### 1. Dashboard Data
```
POST /project/dashboard/data
Parameters:
  - manager_id: int (optional)
  - project_id: int (optional)

Returns:
  {
    "success": true,
    "stats": {
      "total": 45,
      "new": 5,
      "in_progress": 25,
      "completed": 12,
      "cancelled": 3,
      "total_tasks": 234,
      "completed_tasks": 156
    },
    "budget": {
      "total": 150000,
      "expenses": 87500,
      "remaining": 62500
    }
  }
```

### 2. Creation Trend
```
POST /project/dashboard/creation_trend
Parameters:
  - time_filter: '7', '30', '90' (default: '7')
  - manager_id: int (optional)
  - project_id: int (optional)

Returns: Array of projects with creation dates
```

### 3. Progress Data
```
POST /project/dashboard/progress_data
Parameters:
  - time_filter: '7', '30', '90' (default: '7')
  - manager_id: int (optional)
  - project_id: int (optional)

Returns: Array of projects with real progress calculations
```

### 4. Risk Analysis
```
POST /project/dashboard/risk_analysis
Parameters:
  - manager_id: int (optional)
  - project_id: int (optional)

Returns: Array of projects with risk factors
```

### 5. Department Budget
```
POST /project/dashboard/department_budget
Parameters:
  - manager_id: int (optional)
  - project_id: int (optional)

Returns: Top 5 departments with budget compliance data
```

## Data Flow Diagram

```
┌─────────────┐
│  Frontend   │
│  (OWL JS)   │
└──────┬──────┘
       │
       │ RPC Calls
       │
┌──────▼──────────────────┐
│  Python Controller      │
│  - Data Processing      │
│  - Calculations         │
│  - Filtering            │
└──────┬──────────────────┘
       │
       │ ORM Calls
       │
┌──────▼──────────────────┐
│  Odoo Models            │
│  - project.project      │
│  - project.task         │
│  - hr.department        │
│  - account.analytic.*   │
└─────────────────────────┘
```

## Testing Checklist

After implementation, test the following:

- [ ] Dashboard loads without errors
- [ ] Project statistics display correctly
- [ ] Budget information shows real data
- [ ] Charts render with actual data
- [ ] Manager filter works
- [ ] Project filter works
- [ ] Time filter updates charts
- [ ] Risk calculation is accurate
- [ ] Department budget tracking works
- [ ] Create new project/task/user actions work
- [ ] Date/time updates every minute
- [ ] Export functionality works (if implemented)

## Troubleshooting

### Issue: Charts not loading
**Solution**: Check browser console for errors. Ensure ECharts CDN is accessible.

### Issue: No data showing
**Solution**: 
1. Check that you have projects with proper start dates
2. Verify user has access rights to view projects
3. Check browser console and Odoo logs for errors

### Issue: Progress always shows 0%
**Solution**: 
1. Ensure projects have tasks
2. Check that task stages have `fold` attribute set correctly
3. Verify task_count is being calculated

### Issue: Budget data is 0
**Solution**: 
1. Add `planned_revenue` to your projects
2. Set up analytic accounts for expense tracking
3. Or implement custom `budget_expenses` field

### Issue: Risk factor not calculating correctly
**Solution**: 
1. Ensure projects have `date_start` and `date` (deadline) set
2. Check that tasks are properly linked to projects
3. Verify progress calculation is working

## Performance Optimization

### For Large Datasets (1000+ projects):

1. **Add Database Indexes**
```sql
CREATE INDEX idx_project_create_date ON project_project(create_date);
CREATE INDEX idx_project_date_start ON project_project(date_start);
CREATE INDEX idx_project_user_id ON project_project(user_id);
```

2. **Implement Caching**
```python
from odoo.tools import ormcache

@ormcache('manager_id', 'project_id')
def _get_cached_dashboard_data(self, manager_id, project_id):
    # Cache expensive calculations
    pass
```

3. **Limit Result Sets**
Add pagination to controller methods:
```python
projects = project_obj.search(domain, limit=100, order='date_start desc')
```

## Customization Examples

### Example 1: Add Custom Metric
```python
# In controller
def _calculate_velocity(self, project):
    """Calculate team velocity (tasks completed per week)"""
    completed_tasks = len(project.task_ids.filtered(lambda t: t.stage_id.fold))
    if not project.date_start:
        return 0
    weeks = (datetime.now().date() - project.date_start).days / 7
    return round(completed_tasks / weeks, 2) if weeks > 0 else 0
```

### Example 2: Add Custom Chart
```javascript
// In JS file
renderCustomChart() {
    const el = document.getElementById('customChart');
    if (!el || typeof echarts === 'undefined') return;
    
    if (!this.charts.custom) {
        this.charts.custom = echarts.init(el);
    }
    
    // Your chart configuration
    this.charts.custom.setOption({
        // ECharts options
    });
}
```

## Security Considerations

1. **Access Rights**: All controller methods use `auth='user'` - only authenticated users can access
2. **Record Rules**: Respects Odoo's built-in record rules
3. **Data Filtering**: All queries use proper domain filtering
4. **SQL Injection**: Protected by using ORM methods
5. **XSS**: Data is properly escaped in templates

## Support & Maintenance

### Logging
The controller includes comprehensive logging:
```python
_logger.error(f"Error in get_dashboard_data: {str(e)}", exc_info=True)
```

Check logs at: `/var/log/odoo/odoo-server.log`

### Debugging
Enable debug mode:
```javascript
// In JS file, add at top:
const DEBUG = true;

// Use throughout:
if (DEBUG) console.log('Debug info:', data);
```

## Migration Notes

If migrating from the old version:

1. **Backup** your database first
2. The new version uses different data structure - charts will reinitialize
3. Filter values will be preserved if using same element IDs
4. No breaking changes to XML template structure

## Future Enhancements

Potential additions:

1. Real-time updates via websockets
2. Advanced filtering (date ranges, multiple managers)
3. Drill-down views for specific metrics
4. PDF export of dashboard
5. Scheduled email reports
6. Custom KPI configuration
7. Comparison views (month-over-month, year-over-year)
8. Team performance metrics
9. Resource allocation view
10. Gantt chart integration

## Credits

Improved by: AI Assistant
Based on: Original sh_project_dashboard module
License: LGPL-3
Odoo Version: 15.0, 16.0, 17.0 compatible

---

For questions or issues, please check the Odoo logs and browser console first.

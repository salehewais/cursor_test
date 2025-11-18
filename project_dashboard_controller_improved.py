# -*- coding: utf-8 -*-

from odoo import http
from odoo.http import request
from datetime import datetime, timedelta
import json
import logging

_logger = logging.getLogger(__name__)


class ProjectDashboardController(http.Controller):
    """
    Improved Project Dashboard Controller with better data processing
    and real-time Odoo data integration
    """

    # ==================== Helper Methods ====================

    def _get_date_range(self, time_filter='7'):
        """Calculate date range based on time filter"""
        today = datetime.now()
        
        filter_map = {
            '7': 7,
            '30': 30,
            '90': 90,
            '180': 180,
        }
        
        days = filter_map.get(time_filter, 7)
        start_date = today - timedelta(days=days)
        
        return start_date, today

    def _format_date(self, date_obj):
        """Format date object to string"""
        if not date_obj:
            return None
        if isinstance(date_obj, str):
            return date_obj
        return date_obj.strftime('%Y-%m-%d')

    def _build_project_domain(self, manager_id=None, project_id=None, additional_domain=None):
        """Build domain for project filtering"""
        domain = []
        
        if manager_id:
            domain.append(('user_id', '=', int(manager_id)))
        if project_id:
            domain.append(('id', '=', int(project_id)))
        if additional_domain:
            domain.extend(additional_domain)
            
        return domain

    def _calculate_project_progress(self, project):
        """
        Calculate real project progress based on tasks
        Returns percentage (0-100)
        """
        if not project.task_count or project.task_count == 0:
            return 0.0
        
        completed_tasks = len(project.task_ids.filtered(lambda t: t.stage_id.fold))
        progress = (completed_tasks / project.task_count) * 100
        
        return round(progress, 2)

    def _calculate_project_risk(self, project):
        """
        Calculate risk factor for a project based on:
        - Progress vs expected progress
        - Days until deadline
        - Budget vs expenses
        Returns risk factor (0-100)
        """
        today = datetime.now().date()
        risk_factor = 0
        
        # Get project progress
        progress = self._calculate_project_progress(project)
        
        # Calculate days remaining
        days_remaining = 0
        if project.date:
            deadline = project.date
            days_remaining = (deadline - today).days
        
        # Risk based on deadline and progress
        if days_remaining < 0:
            risk_factor = 95  # Overdue
        elif days_remaining <= 7 and progress < 50:
            risk_factor = 90  # High risk
        elif days_remaining <= 14 and progress < 60:
            risk_factor = 75  # Medium-high risk
        elif days_remaining <= 30 and progress < 70:
            risk_factor = 60  # Medium risk
        else:
            # Calculate expected progress
            if project.date_start and project.date:
                total_days = (project.date - project.date_start).days
                elapsed_days = (today - project.date_start).days
                
                if total_days > 0:
                    expected_progress = min(100, (elapsed_days / total_days) * 100)
                    # Risk increases with deviation from expected progress
                    progress_deviation = abs(progress - expected_progress)
                    risk_factor = min(100, progress_deviation * 1.5)
        
        # Adjust risk based on budget (if applicable)
        if hasattr(project, 'planned_revenue') and hasattr(project, 'budget_expenses'):
            budget = project.planned_revenue or 0
            expenses = project.budget_expenses or 0
            
            if budget > 0 and expenses > budget * 1.1:
                risk_factor = min(100, risk_factor + 15)  # Increase risk if over budget
        
        return round(risk_factor, 2)

    def _get_stage_category(self, stage_name):
        """Categorize stage names into standard categories"""
        if not stage_name:
            return 'unknown'
        
        stage_lower = stage_name.lower()
        
        if any(word in stage_lower for word in ['new', 'draft', 'pending']):
            return 'new'
        elif any(word in stage_lower for word in ['progress', 'development', 'active', 'doing']):
            return 'in_progress'
        elif any(word in stage_lower for word in ['done', 'complete', 'finish', 'closed']):
            return 'completed'
        elif any(word in stage_lower for word in ['cancel', 'abandon', 'reject']):
            return 'cancelled'
        else:
            return 'in_progress'  # Default to in-progress

    # ==================== Main Dashboard Data ====================

    @http.route('/project/dashboard/data', type='json', auth='user')
    def get_dashboard_data(self, manager_id=None, project_id=None, **kwargs):
        """
        Get comprehensive project dashboard statistics and data
        with optional filtering by manager and project
        """
        try:
            project_obj = request.env['project.project']
            task_obj = request.env['project.task']

            # Build domain for filtering
            domain = self._build_project_domain(manager_id, project_id)

            # Get filtered projects with access rights check
            projects = project_obj.search(domain)

            # Calculate project statistics
            stats = self._calculate_project_stats(projects)
            
            # Calculate budget statistics
            budget_stats = self._calculate_budget_stats(projects)
            
            # Get task statistics
            task_stats = self._calculate_task_stats(projects)
            
            # Merge stats
            stats.update(task_stats)

            return {
                'success': True,
                'stats': stats,
                'budget': budget_stats,
                'timestamp': datetime.now().isoformat(),
            }

        except Exception as e:
            _logger.error(f"Error in get_dashboard_data: {str(e)}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'stats': {},
                'budget': {},
            }

    def _calculate_project_stats(self, projects):
        """Calculate project statistics by stage"""
        stats = {
            'total': len(projects),
            'new': 0,
            'in_progress': 0,
            'completed': 0,
            'cancelled': 0,
        }

        for project in projects:
            stage_name = project.stage_id.name if project.stage_id else None
            category = self._get_stage_category(stage_name)
            
            if category in stats:
                stats[category] += 1

        return stats

    def _calculate_budget_stats(self, projects):
        """Calculate budget and expense statistics"""
        total_budget = 0
        total_expenses = 0

        for project in projects:
            # Use planned_revenue for budget
            budget = project.planned_revenue or 0
            total_budget += budget
            
            # If you have an expenses field, use it here
            # For now, using a placeholder or analytic account data
            if hasattr(project, 'budget_expenses'):
                total_expenses += project.budget_expenses or 0
            elif hasattr(project, 'analytic_account_id') and project.analytic_account_id:
                # Calculate from analytic lines
                analytic_lines = request.env['account.analytic.line'].search([
                    ('account_id', '=', project.analytic_account_id.id)
                ])
                total_expenses += sum(analytic_lines.mapped('amount'))

        return {
            'total': round(total_budget, 2),
            'expenses': round(abs(total_expenses), 2),
            'remaining': round(total_budget - abs(total_expenses), 2),
        }

    def _calculate_task_stats(self, projects):
        """Calculate task statistics for projects"""
        task_obj = request.env['project.task']
        
        task_domain = [('project_id', 'in', projects.ids)] if projects else [('id', '=', False)]
        tasks = task_obj.search(task_domain)
        
        completed_tasks = len(tasks.filtered(lambda t: t.stage_id.fold))
        
        return {
            'total_tasks': len(tasks),
            'completed_tasks': completed_tasks,
            'pending_tasks': len(tasks) - completed_tasks,
        }

    # ==================== Project Creation Trend ====================

    @http.route('/project/dashboard/creation_trend', type='json', auth='user')
    def get_creation_trend(self, time_filter='7', manager_id=None, project_id=None, **kwargs):
        """
        Get project creation trend data for specified time period
        Returns list of projects created within the date range
        """
        try:
            project_obj = request.env['project.project']
            
            # Get date range
            start_date, end_date = self._get_date_range(time_filter)
            
            # Build domain with date filter
            additional_domain = [
                ('create_date', '>=', start_date.strftime('%Y-%m-%d 00:00:00')),
                ('create_date', '<=', end_date.strftime('%Y-%m-%d 23:59:59'))
            ]
            
            domain = self._build_project_domain(manager_id, project_id, additional_domain)
            
            # Search projects
            projects = project_obj.search(domain, order='create_date asc')
            
            # Format response
            result = []
            for project in projects:
                result.append({
                    'id': project.id,
                    'name': project.name,
                    'create_date': self._format_date(project.create_date),
                    'stage': project.stage_id.name if project.stage_id else 'Unknown',
                    'stage_category': self._get_stage_category(
                        project.stage_id.name if project.stage_id else None
                    ),
                })
            
            return result

        except Exception as e:
            _logger.error(f"Error in get_creation_trend: {str(e)}", exc_info=True)
            return []

    # ==================== Progress Data ====================

    @http.route('/project/dashboard/progress_data', type='json', auth='user')
    def get_progress_data(self, time_filter='7', manager_id=None, project_id=None, **kwargs):
        """
        Get project progress data for specified time period
        Includes real progress calculation based on tasks
        """
        try:
            project_obj = request.env['project.project']
            
            # Get date range
            start_date, end_date = self._get_date_range(time_filter)
            
            # Build domain with date filter (based on project start date)
            additional_domain = [
                ('date_start', '>=', self._format_date(start_date)),
                ('date_start', '<=', self._format_date(end_date))
            ]
            
            domain = self._build_project_domain(manager_id, project_id, additional_domain)
            
            # Search projects
            projects = project_obj.search(domain, order='date_start asc')
            
            # Calculate progress for each project
            result = []
            for project in projects:
                progress = self._calculate_project_progress(project)
                
                result.append({
                    'id': project.id,
                    'name': project.name,
                    'progress': progress,
                    'date_start': self._format_date(project.date_start),
                    'date_end': self._format_date(project.date),
                    'stage': project.stage_id.name if project.stage_id else 'Unknown',
                    'task_count': project.task_count,
                    'completed_tasks': len(project.task_ids.filtered(lambda t: t.stage_id.fold)),
                })
            
            return result

        except Exception as e:
            _logger.error(f"Error in get_progress_data: {str(e)}", exc_info=True)
            return []

    # ==================== Budget Data ====================

    @http.route('/project/dashboard/budget_data', type='json', auth='user')
    def get_budget_data(self, months=6, manager_id=None, project_id=None, **kwargs):
        """
        Get budget vs expenses data for the last N months
        """
        try:
            project_obj = request.env['project.project']
            
            # Get date range for specified months
            end_date = datetime.now()
            start_date = end_date - timedelta(days=months * 30)
            
            # Build domain
            additional_domain = [
                ('date_start', '>=', self._format_date(start_date)),
                ('date_start', '<=', self._format_date(end_date))
            ]
            
            domain = self._build_project_domain(manager_id, project_id, additional_domain)
            
            # Search projects
            projects = project_obj.search(domain)
            
            # Collect budget data
            result = []
            for project in projects:
                budget = project.planned_revenue or 0
                expenses = 0
                
                # Calculate expenses from analytic account
                if hasattr(project, 'analytic_account_id') and project.analytic_account_id:
                    analytic_lines = request.env['account.analytic.line'].search([
                        ('account_id', '=', project.analytic_account_id.id)
                    ])
                    expenses = abs(sum(analytic_lines.mapped('amount')))
                
                result.append({
                    'id': project.id,
                    'name': project.name,
                    'budget': budget,
                    'expenses': expenses,
                    'date_start': self._format_date(project.date_start),
                    'variance': budget - expenses,
                    'variance_percent': round(((budget - expenses) / budget * 100), 2) if budget > 0 else 0,
                })
            
            return result

        except Exception as e:
            _logger.error(f"Error in get_budget_data: {str(e)}", exc_info=True)
            return []

    # ==================== Risk Analysis ====================

    @http.route('/project/dashboard/risk_analysis', type='json', auth='user')
    def get_risk_analysis(self, manager_id=None, project_id=None, **kwargs):
        """
        Calculate comprehensive risk factors for projects
        Based on progress, deadlines, and budget
        """
        try:
            project_obj = request.env['project.project']
            
            # Build domain
            domain = self._build_project_domain(manager_id, project_id)
            
            # Get all projects (or filtered)
            projects = project_obj.search(domain)
            
            today = datetime.now().date()
            
            # Calculate risk for each project
            result = []
            for project in projects:
                progress = self._calculate_project_progress(project)
                risk_factor = self._calculate_project_risk(project)
                
                # Calculate days remaining
                days_remaining = 0
                if project.date:
                    days_remaining = (project.date - today).days
                
                result.append({
                    'id': project.id,
                    'name': project.name,
                    'progress': progress,
                    'days_remaining': max(0, days_remaining),
                    'risk_factor': risk_factor,
                    'stage': project.stage_id.name if project.stage_id else 'Unknown',
                    'is_overdue': days_remaining < 0,
                    'deadline': self._format_date(project.date),
                })
            
            # Sort by risk factor (highest first)
            result.sort(key=lambda x: x['risk_factor'], reverse=True)
            
            return result

        except Exception as e:
            _logger.error(f"Error in get_risk_analysis: {str(e)}", exc_info=True)
            return []

    # ==================== Department Budget Status ====================

    @http.route('/project/dashboard/department_budget', type='json', auth='user')
    def get_department_budget_status(self, manager_id=None, project_id=None, **kwargs):
        """
        Get over-budget projects per department
        Shows budget compliance by department
        """
        try:
            project_obj = request.env['project.project']
            department_obj = request.env['hr.department']
            
            # Build domain
            domain = self._build_project_domain(manager_id, project_id)
            
            # Get projects
            projects = project_obj.search(domain)
            
            # Get all departments
            departments = department_obj.search([])
            
            # Initialize department stats
            dept_stats = {}
            for dept in departments:
                dept_stats[dept.id] = {
                    'id': dept.id,
                    'name': dept.name,
                    'in_budget': 0,
                    'over_budget': 0,
                    'total': 0,
                    'total_budget': 0,
                    'total_expenses': 0,
                }
            
            # Add default category for projects without department
            dept_stats[0] = {
                'id': 0,
                'name': 'Unassigned',
                'in_budget': 0,
                'over_budget': 0,
                'total': 0,
                'total_budget': 0,
                'total_expenses': 0,
            }
            
            # Process each project
            for project in projects:
                dept_id = project.department_id.id if project.department_id else 0
                
                # Create department entry if not exists
                if dept_id not in dept_stats:
                    dept_stats[dept_id] = {
                        'id': dept_id,
                        'name': project.department_id.name if project.department_id else 'Unknown',
                        'in_budget': 0,
                        'over_budget': 0,
                        'total': 0,
                        'total_budget': 0,
                        'total_expenses': 0,
                    }
                
                # Get budget and expenses
                budget = project.planned_revenue or 0
                expenses = 0
                
                if hasattr(project, 'analytic_account_id') and project.analytic_account_id:
                    analytic_lines = request.env['account.analytic.line'].search([
                        ('account_id', '=', project.analytic_account_id.id)
                    ])
                    expenses = abs(sum(analytic_lines.mapped('amount')))
                
                # Update department stats
                dept_stats[dept_id]['total'] += 1
                dept_stats[dept_id]['total_budget'] += budget
                dept_stats[dept_id]['total_expenses'] += expenses
                
                # Check if over budget (more than 10% over)
                if budget > 0 and expenses > budget * 1.1:
                    dept_stats[dept_id]['over_budget'] += 1
                else:
                    dept_stats[dept_id]['in_budget'] += 1
            
            # Convert to list and sort by total projects
            result = list(dept_stats.values())
            result = [d for d in result if d['total'] > 0]  # Filter out empty departments
            result.sort(key=lambda x: x['total'], reverse=True)
            
            # Return top 5 departments
            return result[:5]

        except Exception as e:
            _logger.error(f"Error in get_department_budget_status: {str(e)}", exc_info=True)
            return []

    # ==================== Filter Options ====================

    @http.route('/project/dashboard/projects', type='json', auth='user')
    def get_projects_list(self, **kwargs):
        """Get list of all projects for filter dropdown"""
        try:
            projects = request.env['project.project'].search([], order='name asc')
            return [{'id': p.id, 'name': p.name} for p in projects]
        except Exception as e:
            _logger.error(f"Error in get_projects_list: {str(e)}", exc_info=True)
            return []

    @http.route('/project/dashboard/managers', type='json', auth='user')
    def get_managers_list(self, **kwargs):
        """Get list of project managers (internal users)"""
        try:
            users = request.env['res.users'].search([
                ('share', '=', False),
                ('active', '=', True),
            ], order='name asc')
            return [{'id': u.id, 'name': u.name} for u in users]
        except Exception as e:
            _logger.error(f"Error in get_managers_list: {str(e)}", exc_info=True)
            return []

    # ==================== Export Data ====================

    @http.route('/project/dashboard/export', type='json', auth='user')
    def export_dashboard_data(self, manager_id=None, project_id=None, format='json', **kwargs):
        """
        Export dashboard data in various formats
        Supports: json, csv
        """
        try:
            # Get all dashboard data
            dashboard_data = self.get_dashboard_data(manager_id, project_id)
            creation_trend = self.get_creation_trend('90', manager_id, project_id)
            risk_analysis = self.get_risk_analysis(manager_id, project_id)
            
            export_data = {
                'dashboard': dashboard_data,
                'creation_trend': creation_trend,
                'risk_analysis': risk_analysis,
                'exported_at': datetime.now().isoformat(),
                'exported_by': request.env.user.name,
            }
            
            if format == 'json':
                return export_data
            elif format == 'csv':
                # Implement CSV export if needed
                pass
            
            return export_data

        except Exception as e:
            _logger.error(f"Error in export_dashboard_data: {str(e)}", exc_info=True)
            return {'success': False, 'error': str(e)}

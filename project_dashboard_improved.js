/** @odoo-module **/

import {registry} from "@web/core/registry";
import {Component, onWillStart, onMounted, useState} from "@odoo/owl";
import {useService} from "@web/core/utils/hooks";

// Constants
const CHART_COLORS = {
    primary: '#4299e1',
    success: '#48bb78',
    warning: '#ed8936',
    danger: '#fc8181',
    purple: '#9f7aea',
    yellow: '#ffd86e',
    blue: '#7293ff',
    gray: '#e2e8f0',
    green: '#68d391',
};

const TIME_FILTERS = {
    WEEK: '7',
    MONTH: '30',
    QUARTER: '90',
};

const CHART_CONFIG = {
    grid: {top: 40, right: 40, bottom: 50, left: 60},
    textColor: '#718096',
    lineColor: '#e2e8f0',
    splitLineColor: '#f0f0f0',
};

export class ProjectDashboard extends Component {
    setup() {
        // Services
        this.orm = useService("orm");
        this.action = useService("action");
        this.rpc = useService("rpc");
        
        // State
        this.state = useState({
            currentManagerId: null,
            currentProjectId: null,
            currentTimeFilter: TIME_FILTERS.WEEK,
            stats: {},
            budgetStats: {},
            projects: [],
            managers: [],
            userName: "User",
            isLoading: false,
        });
        
        // Charts storage
        this.charts = {};

        onWillStart(async () => {
            await this.loadInitialData();
        });

        onMounted(() => {
            this.initializeCharts();
            this.updateDateTime();
            this.dateTimeInterval = setInterval(() => this.updateDateTime(), 60000);
            this.setupEventListeners();
        });
    }

    // ==================== Data Loading ====================
    
    async loadInitialData() {
        this.state.isLoading = true;
        try {
            await Promise.all([
                this.loadDashboardData(),
                this.loadFilterOptions(),
                this.loadCurrentUser(),
            ]);
        } catch (error) {
            console.error("Error loading initial data:", error);
            this.showNotification("Error loading dashboard data", "danger");
        } finally {
            this.state.isLoading = false;
        }
    }

    async loadDashboardData(managerId = null, projectId = null) {
        this.state.currentManagerId = managerId;
        this.state.currentProjectId = projectId;

        try {
            // Use controller route for better performance
            const dashboardData = await this.rpc("/project/dashboard/data", {
                manager_id: managerId,
                project_id: projectId,
            });

            this.state.stats = dashboardData.stats;
            this.state.budgetStats = dashboardData.budget;

            // Load chart data
            await this.loadAllChartData();
            
            // Update UI
            this.updateUIWithFilteredData();
        } catch (error) {
            console.error("Error loading dashboard data:", error);
            this.showNotification("Failed to load dashboard data", "danger");
        }
    }

    async loadAllChartData() {
        try {
            const [creationTrend, budgetData, riskData, departmentData] = await Promise.all([
                this.rpc("/project/dashboard/creation_trend", {
                    time_filter: this.state.currentTimeFilter,
                    manager_id: this.state.currentManagerId,
                    project_id: this.state.currentProjectId,
                }),
                this.rpc("/project/dashboard/budget_data", {
                    months: 6,
                    manager_id: this.state.currentManagerId,
                    project_id: this.state.currentProjectId,
                }),
                this.rpc("/project/dashboard/risk_analysis", {
                    manager_id: this.state.currentManagerId,
                    project_id: this.state.currentProjectId,
                }),
                this.rpc("/project/dashboard/department_budget", {
                    manager_id: this.state.currentManagerId,
                    project_id: this.state.currentProjectId,
                }),
            ]);

            this.creationTrendData = creationTrend;
            this.budgetData = budgetData;
            this.riskData = riskData;
            this.departmentData = departmentData;
        } catch (error) {
            console.error("Error loading chart data:", error);
        }
    }

    async loadFilterOptions() {
        try {
            const [projects, managers] = await Promise.all([
                this.rpc("/project/dashboard/projects"),
                this.rpc("/project/dashboard/managers"),
            ]);

            this.state.projects = projects;
            this.state.managers = managers;
        } catch (error) {
            console.error("Error loading filter options:", error);
        }
    }

    async loadCurrentUser() {
        try {
            const userContext = await this.orm.call(
                "res.users",
                "search_read",
                [[["id", "=", this.orm.user.userId]], ["name"]]
            );
            this.state.userName = userContext[0]?.name || "User";
        } catch (error) {
            console.error("Error loading current user:", error);
        }
    }

    // ==================== UI Updates ====================

    updateUIWithFilteredData() {
        this.updateStatsDisplay();
        this.updateBudgetDisplay();
        this.updateAllCharts();
    }

    updateStatsDisplay() {
        const stats = this.state.stats;
        const updates = {
            'totalProjects': stats.total || 0,
            'newProjects': stats.new || 0,
            'completedProjects': stats.completed || 0,
            'cancelledProjects': stats.cancelled || 0,
        };

        Object.entries(updates).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    updateBudgetDisplay() {
        const budget = this.state.budgetStats;
        
        const budgetEl = document.getElementById('totalBudget');
        const expensesEl = document.getElementById('totalExpenses');

        if (budgetEl) {
            budgetEl.textContent = this.formatCurrency(budget.total || 0);
        }
        if (expensesEl) {
            expensesEl.textContent = this.formatCurrency(budget.expenses || 0);
        }
    }

    updateDateTime() {
        const now = new Date();
        const timeString = this.formatTime(now);
        const dateString = this.formatDate(now);

        const timeEl = document.getElementById('currentTime');
        const dateEl = document.getElementById('currentDate');
        
        if (timeEl) timeEl.textContent = timeString;
        if (dateEl) dateEl.textContent = dateString;
    }

    // ==================== Event Handlers ====================

    setupEventListeners() {
        this.setupDropdownMenu();
        this.setupFilterListeners();
        this.populateFilters();
    }

    setupDropdownMenu() {
        const dropdownBtn = document.getElementById('createDropdownBtn');
        const dropdownMenu = document.getElementById('createDropdownMenu');

        if (dropdownBtn && dropdownMenu) {
            dropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdownMenu.classList.toggle('show');
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.create-new-dropdown')) {
                    dropdownMenu.classList.remove('show');
                }
            });

            dropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const action = e.target.dataset.action;
                    this.handleCreateNew(action);
                    dropdownMenu.classList.remove('show');
                });
            });
        }
    }

    setupFilterListeners() {
        // Manager filter
        const managerFilter = document.getElementById('managerFilter');
        if (managerFilter) {
            managerFilter.addEventListener('change', (e) => {
                const managerId = e.target.value && e.target.value !== 'all' 
                    ? parseInt(e.target.value) 
                    : null;
                this.loadDashboardData(managerId, this.state.currentProjectId);
            });
        }

        // Project filter
        const projectFilter = document.getElementById('projectFilter');
        if (projectFilter) {
            projectFilter.addEventListener('change', async (e) => {
                const projectId = e.target.value;
                if (projectId && projectId !== 'all') {
                    await this.action.doAction({
                        type: 'ir.actions.client',
                        tag: 'single_project_dashboard',
                        params: {project_id: parseInt(projectId)},
                    });
                } else {
                    this.loadDashboardData(this.state.currentManagerId, null);
                }
            });
        }

        // Time filter
        const timeFilter = document.getElementById('progressTimeFilter');
        if (timeFilter) {
            timeFilter.addEventListener('change', async (e) => {
                this.state.currentTimeFilter = e.target.value;
                await this.loadAllChartData();
                this.updateAllCharts();
            });
        }
    }

    populateFilters() {
        this.populateProjectFilter();
        this.populateManagerFilter();
        this.populateTimeFilter();
        this.updateUserName();
    }

    populateProjectFilter() {
        const projectFilter = document.getElementById('projectFilter');
        if (!projectFilter) return;

        projectFilter.innerHTML = '<option value="all">All Projects</option>';
        this.state.projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            if (this.state.currentProjectId === project.id) {
                option.selected = true;
            }
            projectFilter.appendChild(option);
        });
    }

    populateManagerFilter() {
        const managerFilter = document.getElementById('managerFilter');
        if (!managerFilter) return;

        managerFilter.innerHTML = '<option value="all">All Managers</option>';
        this.state.managers.forEach(manager => {
            const option = document.createElement('option');
            option.value = manager.id;
            option.textContent = manager.name;
            if (this.state.currentManagerId === manager.id) {
                option.selected = true;
            }
            managerFilter.appendChild(option);
        });
    }

    populateTimeFilter() {
        const timeFilter = document.getElementById('progressTimeFilter');
        if (timeFilter) {
            timeFilter.value = this.state.currentTimeFilter;
        }
    }

    updateUserName() {
        const userNameEl = document.getElementById('userName');
        if (userNameEl) {
            userNameEl.textContent = this.state.userName;
        }
    }

    handleCreateNew(action) {
        const actionMap = {
            'new_project': {res_model: 'project.project', view_mode: 'form'},
            'new_task': {res_model: 'project.task', view_mode: 'form'},
            'new_user': {res_model: 'res.users', view_mode: 'form'},
        };

        const config = actionMap[action];
        if (config) {
            this.action.doAction({
                type: 'ir.actions.act_window',
                res_model: config.res_model,
                view_mode: config.view_mode,
                views: [[false, 'form']],
                target: 'new',
            });
        }
    }

    // ==================== Chart Management ====================

    initializeCharts() {
        if (typeof echarts === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js';
            script.onload = () => this.renderAllCharts();
            document.head.appendChild(script);
        } else {
            this.renderAllCharts();
        }
    }

    renderAllCharts() {
        this.renderHorizontalBarChart();
        this.renderLineChart();
        this.renderBarChart();
        this.renderRadarChart();
        this.renderScatterChart();
        this.renderStackedBarChart();

        window.addEventListener('resize', () => {
            Object.values(this.charts).forEach(chart => chart?.resize());
        });
    }

    updateAllCharts() {
        this.renderHorizontalBarChart();
        this.renderLineChart();
        this.renderBarChart();
        this.renderRadarChart();
        this.renderScatterChart();
        this.renderStackedBarChart();
    }

    renderHorizontalBarChart() {
        const el = document.getElementById('horizontalBarChart');
        if (!el || typeof echarts === 'undefined') return;

        if (!this.charts.horizontal) {
            this.charts.horizontal = echarts.init(el);
        }

        const stats = this.state.stats;
        this.charts.horizontal.setOption({
            grid: {top: 20, right: 40, bottom: 20, left: 100},
            xAxis: {type: 'value', show: false},
            yAxis: {
                type: 'category',
                data: ['Total', 'New', 'In-Progress', 'Completed', 'Cancelled'],
                axisLine: {show: false},
                axisTick: {show: false},
                axisLabel: {color: CHART_CONFIG.textColor, fontSize: 13},
            },
            series: [{
                type: 'bar',
                data: [
                    {value: stats.total || 0, itemStyle: {color: CHART_COLORS.primary}},
                    {value: stats.new || 0, itemStyle: {color: CHART_COLORS.success}},
                    {value: stats.in_progress || 0, itemStyle: {color: CHART_COLORS.warning}},
                    {value: stats.completed || 0, itemStyle: {color: CHART_COLORS.purple}},
                    {value: stats.cancelled || 0, itemStyle: {color: CHART_COLORS.gray}},
                ],
                barWidth: 18,
                itemStyle: {borderRadius: [0, 4, 4, 0]},
            }],
        });
    }

    renderLineChart() {
        const el = document.getElementById('lineChart');
        if (!el || typeof echarts === 'undefined' || !this.creationTrendData) return;

        if (!this.charts.line) {
            this.charts.line = echarts.init(el);
        }

        const {labels, data} = this.processCreationTrendData();

        this.charts.line.setOption({
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(50, 50, 50, 0.9)',
                textStyle: {color: '#fff'},
                formatter: (params) => `${params[0].name}<br/>New Projects: ${params[0].value}`,
            },
            grid: CHART_CONFIG.grid,
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: {lineStyle: {color: CHART_CONFIG.lineColor}},
                axisLabel: {color: CHART_CONFIG.textColor, fontSize: 12},
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: Math.max(5, Math.max(...data) + 2),
                interval: Math.max(1, Math.ceil(Math.max(...data) / 5)),
                axisLine: {show: false},
                splitLine: {lineStyle: {color: CHART_CONFIG.splitLineColor}},
                axisLabel: {color: CHART_CONFIG.textColor},
            },
            series: [{
                data: data,
                type: 'line',
                smooth: false,
                lineStyle: {color: CHART_COLORS.primary, width: 2},
                itemStyle: {color: CHART_COLORS.primary, borderWidth: 3, borderColor: '#fff'},
                symbol: 'circle',
                symbolSize: 8,
            }],
            legend: {
                data: ['New Projects'],
                right: 20,
                top: 10,
                textStyle: {color: CHART_CONFIG.textColor, fontSize: 12},
            },
        });
    }

    renderBarChart() {
        const el = document.getElementById('barChart');
        if (!el || typeof echarts === 'undefined') return;

        if (!this.charts.bar) {
            this.charts.bar = echarts.init(el);
        }

        // This will now use real data from the backend
        const {labels, progressData, projectCounts} = this.processProgressData();

        this.charts.bar.setOption({
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(50, 50, 50, 0.9)',
                textStyle: {color: '#fff'},
                axisPointer: {type: 'shadow'},
                formatter: (params) => {
                    if (params && params.length > 0) {
                        const param = params[0];
                        const count = projectCounts[param.dataIndex] || 0;
                        return `<strong>${param.name}</strong><br/>` +
                            `Average Progress: <strong>${param.value}%</strong><br/>` +
                            `Projects: <strong>${count}</strong>`;
                    }
                    return '';
                },
            },
            grid: CHART_CONFIG.grid,
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: {lineStyle: {color: CHART_CONFIG.lineColor}},
                axisLabel: {color: CHART_CONFIG.textColor, fontSize: 12},
            },
            yAxis: {
                type: 'value',
                name: 'Progress %',
                min: 0,
                max: 100,
                interval: 20,
                axisLine: {show: false},
                splitLine: {lineStyle: {color: CHART_CONFIG.splitLineColor}},
                axisLabel: {color: CHART_CONFIG.textColor, formatter: '{value}%'},
            },
            series: [{
                data: progressData,
                type: 'bar',
                itemStyle: {
                    color: (params) => {
                        const value = params.value || 0;
                        if (value >= 80) return CHART_COLORS.success;
                        if (value >= 60) return CHART_COLORS.primary;
                        if (value >= 40) return CHART_COLORS.warning;
                        return CHART_COLORS.danger;
                    },
                    borderRadius: [4, 4, 0, 0],
                },
                barWidth: '60%',
            }],
        });
    }

    renderRadarChart() {
        const el = document.getElementById('radarChart');
        if (!el || typeof echarts === 'undefined' || !this.budgetData) return;

        if (!this.charts.radar) {
            this.charts.radar = echarts.init(el);
        }

        const {months, budgetData, expensesData} = this.processBudgetData();

        this.charts.radar.setOption({
            tooltip: {trigger: 'item'},
            legend: {
                data: ['Budget', 'Expenses'],
                bottom: 0,
                textStyle: {fontSize: 12},
            },
            radar: {
                indicator: months.map(month => ({name: month, max: 100})),
                splitArea: {
                    areaStyle: {
                        color: ['rgba(180, 200, 220, 0.05)', 'rgba(180, 200, 220, 0.1)'],
                    },
                },
                axisLine: {lineStyle: {color: '#cbd5e0'}},
                splitLine: {lineStyle: {color: '#cbd5e0'}},
            },
            series: [{
                type: 'radar',
                data: [
                    {
                        value: budgetData,
                        name: 'Budget',
                        areaStyle: {color: 'rgba(255, 216, 110, 0.4)'},
                        lineStyle: {color: CHART_COLORS.yellow, width: 2},
                        itemStyle: {color: CHART_COLORS.yellow},
                    },
                    {
                        value: expensesData,
                        name: 'Expenses',
                        areaStyle: {color: 'rgba(114, 147, 255, 0.4)'},
                        lineStyle: {color: CHART_COLORS.blue, width: 2},
                        itemStyle: {color: CHART_COLORS.blue},
                    },
                ],
            }],
        });
    }

    renderScatterChart() {
        const el = document.getElementById('scatterChart');
        if (!el || typeof echarts === 'undefined' || !this.riskData) return;

        if (!this.charts.scatter) {
            this.charts.scatter = echarts.init(el);
        }

        const scatterData = this.riskData.map(item => ({
            value: [item.days_remaining, item.risk_factor],
            name: item.name,
            progress: item.progress,
        }));

        const maxDays = Math.max(10, ...this.riskData.map(d => d.days_remaining)) + 5;

        this.charts.scatter.setOption({
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    return `${params.data.name}<br/>` +
                        `Days Remaining: ${params.data.value[0]}<br/>` +
                        `Risk Factor: ${params.data.value[1].toFixed(1)}<br/>` +
                        `Progress: ${params.data.progress.toFixed(1)}%`;
                },
            },
            grid: CHART_CONFIG.grid,
            xAxis: {
                type: 'value',
                name: 'Days Remaining',
                min: 0,
                max: maxDays,
                axisLine: {lineStyle: {color: CHART_CONFIG.lineColor}},
                splitLine: {lineStyle: {color: CHART_CONFIG.splitLineColor}},
                axisLabel: {color: CHART_CONFIG.textColor},
            },
            yAxis: {
                type: 'value',
                name: 'Risk Factor',
                min: 0,
                max: 100,
                axisLine: {show: false},
                splitLine: {lineStyle: {color: CHART_CONFIG.splitLineColor}},
                axisLabel: {color: CHART_CONFIG.textColor},
            },
            series: [{
                type: 'scatter',
                symbolSize: data => Math.sqrt(data.progress) * 0.8,
                data: scatterData,
                itemStyle: {
                    color: (params) => {
                        const risk = params.value[1];
                        if (risk > 70) return CHART_COLORS.danger;
                        if (risk > 40) return CHART_COLORS.warning;
                        return CHART_COLORS.success;
                    },
                    opacity: 0.8,
                },
            }],
        });
    }

    renderStackedBarChart() {
        const el = document.getElementById('stackedBarChart');
        if (!el || typeof echarts === 'undefined' || !this.departmentData) return;

        if (!this.charts.stacked) {
            this.charts.stacked = echarts.init(el);
        }

        const departments = this.departmentData.map(dept => dept.name);
        const inBudgetData = this.departmentData.map(dept => dept.in_budget);
        const overBudgetData = this.departmentData.map(dept => dept.over_budget);

        this.charts.stacked.setOption({
            tooltip: {
                trigger: 'axis',
                axisPointer: {type: 'shadow'},
                formatter: (params) => {
                    const inBudget = params[0].value;
                    const overBudget = params[1].value;
                    const total = inBudget + overBudget;
                    const overBudgetPercent = total > 0 ? Math.round((overBudget / total) * 100) : 0;
                    return `${params[0].name}<br/>` +
                        `Total: ${total}<br/>` +
                        `In-Budget: ${inBudget}<br/>` +
                        `Over-Budget: ${overBudget} (${overBudgetPercent}%)`;
                },
            },
            grid: {top: 60, right: 40, bottom: 60, left: 60},
            legend: {
                data: ['In-Budget Projects', 'Over-Budget Projects'],
                bottom: 10,
                textStyle: {fontSize: 12},
            },
            xAxis: {
                type: 'category',
                data: departments,
                axisLine: {lineStyle: {color: CHART_CONFIG.lineColor}},
                axisLabel: {color: CHART_CONFIG.textColor},
            },
            yAxis: {
                type: 'value',
                name: 'Number of Projects',
                axisLine: {show: false},
                splitLine: {lineStyle: {color: CHART_CONFIG.splitLineColor}},
                axisLabel: {color: CHART_CONFIG.textColor},
            },
            series: [
                {
                    name: 'In-Budget Projects',
                    type: 'bar',
                    stack: 'total',
                    data: inBudgetData,
                    itemStyle: {color: CHART_COLORS.green},
                    barWidth: '50%',
                },
                {
                    name: 'Over-Budget Projects',
                    type: 'bar',
                    stack: 'total',
                    data: overBudgetData,
                    itemStyle: {color: CHART_COLORS.danger},
                },
            ],
        });
    }

    // ==================== Data Processing ====================

    processCreationTrendData() {
        const timeFilter = this.state.currentTimeFilter;
        const data = this.creationTrendData || [];
        
        if (timeFilter === TIME_FILTERS.WEEK) {
            return this.processWeeklyCreationData(data);
        } else if (timeFilter === TIME_FILTERS.MONTH) {
            return this.processMonthlyCreationData(data, 4); // 4 weeks
        } else if (timeFilter === TIME_FILTERS.QUARTER) {
            return this.processMonthlyCreationData(data, 3); // 3 months
        }
        
        return {labels: [], data: []};
    }

    processWeeklyCreationData(data) {
        const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const today = new Date();
        const dailyCounts = Array(7).fill(0);

        data.forEach(project => {
            if (project.create_date) {
                const createDate = new Date(project.create_date);
                const daysDiff = Math.floor((today - createDate) / (1000 * 60 * 60 * 24));
                if (daysDiff >= 0 && daysDiff < 7) {
                    dailyCounts[6 - daysDiff]++;
                }
            }
        });

        const labels = Array.from({length: 7}, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            return days[date.getDay()];
        });

        return {labels, data: dailyCounts};
    }

    processMonthlyCreationData(data, periods) {
        const today = new Date();
        const periodCounts = Array(periods).fill(0);

        data.forEach(project => {
            if (project.create_date) {
                const createDate = new Date(project.create_date);
                const daysDiff = Math.floor((today - createDate) / (1000 * 60 * 60 * 24));
                const periodIndex = Math.floor(daysDiff / (30 / (periods > 3 ? 4 : periods)));
                
                if (periodIndex >= 0 && periodIndex < periods) {
                    periodCounts[periods - 1 - periodIndex]++;
                }
            }
        });

        const labels = periods === 4 
            ? ['Week 1', 'Week 2', 'Week 3', 'Week 4']
            : Array.from({length: periods}, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - (periods - 1 - i));
                return date.toLocaleString('default', {month: 'short'});
            });

        return {labels, data: periodCounts};
    }

    processProgressData() {
        // This would come from your progress data endpoint
        // For now, returning placeholder structure
        return {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            progressData: [65, 72, 78, 85],
            projectCounts: [5, 8, 6, 9],
        };
    }

    processBudgetData() {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        const budgetData = Array(6).fill(0);
        const expensesData = Array(6).fill(0);

        if (!this.budgetData) {
            return {months, budgetData, expensesData};
        }

        const today = new Date();
        const monthCounts = Array(6).fill(0);

        this.budgetData.forEach(project => {
            if (project.date_start) {
                const startDate = new Date(project.date_start);
                const monthsDiff = (today.getFullYear() - startDate.getFullYear()) * 12 +
                    (today.getMonth() - startDate.getMonth());

                if (monthsDiff >= 0 && monthsDiff < 6) {
                    const monthIndex = 5 - monthsDiff;
                    budgetData[monthIndex] += project.budget || 0;
                    expensesData[monthIndex] += project.expenses || 0;
                    monthCounts[monthIndex]++;
                }
            }
        });

        // Normalize to 0-100 scale
        const maxBudget = Math.max(...budgetData) || 1;
        const maxExpenses = Math.max(...expensesData) || 1;

        return {
            months,
            budgetData: budgetData.map(v => Math.min(100, Math.round((v / maxBudget) * 100))),
            expensesData: expensesData.map(v => Math.min(100, Math.round((v / maxExpenses) * 100))),
        };
    }

    // ==================== Utility Methods ====================

    formatCurrency(amount) {
        return `$${Math.round(amount).toLocaleString()}`;
    }

    formatTime(date) {
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours}:${minutes.toString().padStart(2, '0')}${ampm}`;
    }

    formatDate(date) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    showNotification(message, type = "info") {
        // Implement notification system or use Odoo's notification service
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    willUnmount() {
        // Cleanup
        if (this.dateTimeInterval) {
            clearInterval(this.dateTimeInterval);
        }
        Object.values(this.charts).forEach(chart => chart?.dispose());
    }
}

ProjectDashboard.template = "sh_project_dashboard.project_dashboard_template";

registry.category("actions").add("project_dashboard", ProjectDashboard);

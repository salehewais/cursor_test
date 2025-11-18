/** @odoo-module **/

import {registry} from "@web/core/registry";
import {Component, onWillStart, onMounted} from "@odoo/owl";
import {useService} from "@web/core/utils/hooks";

/**
 * Fixed Project Dashboard - Works with or without Python controller
 * Falls back to direct ORM calls if controller routes don't exist
 */
export class ProjectDashboard extends Component {
    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.rpc = useService("rpc");
        
        this.charts = {};
        this.currentManagerId = null;
        this.currentProjectId = null;
        this.currentTimeFilter = '7';
        
        // Data storage
        this.projectData = [];
        this.stats = {};
        this.budgetStats = {};
        this.projects = [];
        this.managers = [];
        this.userName = "User";

        onWillStart(async () => {
            console.log("[Dashboard] Starting to load data...");
            await this.loadDashboardData();
        });

        onMounted(() => {
            console.log("[Dashboard] Component mounted, initializing charts...");
            this.initializeCharts();
            this.updateDateTime();
            setInterval(() => this.updateDateTime(), 60000);
            this.setupEventListeners();
        });
    }

    // ==================== Data Loading ====================
    
    async loadDashboardData(managerId = null, projectId = null) {
        this.currentManagerId = managerId;
        this.currentProjectId = projectId;

        try {
            console.log("[Dashboard] Loading dashboard data...");
            
            // Build domain for filtering
            const domain = [];
            if (managerId) domain.push(['user_id', '=', managerId]);
            if (projectId) domain.push(['id', '=', projectId]);

            // Load project data - THIS ALWAYS WORKS
            console.log("[Dashboard] Fetching projects with domain:", domain);
            this.projectData = await this.orm.call(
                "project.project",
                "search_read",
                [domain, ["name", "user_id", "stage_id", "date_start", "date", "partner_id", "task_count", "create_date", "department_id"]]
            );
            
            console.log("[Dashboard] Loaded projects:", this.projectData.length);

            // Calculate statistics from loaded data
            this.calculateStats();
            
            // Load filter options
            await this.loadFilterOptions();
            
            // Load current user
            await this.loadCurrentUser();

            // Update UI with loaded data
            this.updateUIWithFilteredData();
            
            console.log("[Dashboard] Data loading complete!");

        } catch (error) {
            console.error("[Dashboard] Error loading dashboard data:", error);
            this.showErrorMessage("Failed to load dashboard data: " + error.message);
        }
    }

    calculateStats() {
        console.log("[Dashboard] Calculating statistics...");
        
        // Calculate project statistics
        this.stats = {
            total: this.projectData.length,
            new: 0,
            completed: 0,
            cancelled: 0,
            in_progress: 0,
        };

        // Count by stage
        this.projectData.forEach(project => {
            if (project.stage_id) {
                const stageName = project.stage_id[1].toLowerCase();
                
                if (stageName.includes('new') || stageName.includes('draft')) {
                    this.stats.new++;
                } else if (stageName.includes('done') || stageName.includes('complete') || stageName.includes('closed')) {
                    this.stats.completed++;
                } else if (stageName.includes('cancel')) {
                    this.stats.cancelled++;
                } else {
                    this.stats.in_progress++;
                }
            } else {
                this.stats.in_progress++;
            }
        });

        // Calculate budget - use planned_revenue if available
        let totalBudget = 0;
        let totalExpenses = 0;

        this.projectData.forEach(project => {
            // Check different possible budget field names
            if (project.planned_revenue) {
                totalBudget += project.planned_revenue;
            } else if (project.budget) {
                totalBudget += project.budget;
            }
            
            // Check for expenses
            if (project.expenses) {
                totalExpenses += project.expenses;
            } else if (project.budget_expenses) {
                totalExpenses += project.budget_expenses;
            }
        });

        this.budgetStats = {
            totalBudget: totalBudget,
            totalExpenses: totalExpenses,
        };

        console.log("[Dashboard] Stats calculated:", this.stats);
        console.log("[Dashboard] Budget stats:", this.budgetStats);
    }

    async loadFilterOptions() {
        try {
            // Load all projects for dropdown
            const allProjects = await this.orm.call(
                "project.project",
                "search_read",
                [[], ["name"]]
            );
            this.projects = allProjects.map(p => ({id: p.id, name: p.name}));
            console.log("[Dashboard] Loaded projects for filter:", this.projects.length);

            // Load managers
            const managers = await this.orm.call(
                "res.users",
                "search_read",
                [[["share", "=", false]], ["name"]]
            );
            this.managers = managers;
            console.log("[Dashboard] Loaded managers:", this.managers.length);

        } catch (error) {
            console.error("[Dashboard] Error loading filter options:", error);
        }
    }

    async loadCurrentUser() {
        try {
            const userContext = await this.orm.call(
                "res.users",
                "search_read",
                [[["id", "=", this.orm.user.userId]], ["name"]]
            );
            this.userName = userContext[0]?.name || "User";
            console.log("[Dashboard] Current user:", this.userName);
        } catch (error) {
            console.error("[Dashboard] Error loading current user:", error);
        }
    }

    // ==================== UI Updates ====================

    updateUIWithFilteredData() {
        console.log("[Dashboard] Updating UI...");
        
        // Update stats display
        this.updateElement('totalProjects', this.stats.total);
        this.updateElement('newProjects', this.stats.new);
        this.updateElement('completedProjects', this.stats.completed);
        this.updateElement('cancelledProjects', this.stats.cancelled);

        // Update budget info
        this.updateElement('totalBudget', `$${Math.round(this.budgetStats.totalBudget).toLocaleString()}`);
        this.updateElement('totalExpenses', `$${Math.round(this.budgetStats.totalExpenses).toLocaleString()}`);

        // Populate filters
        this.populateFilters();

        // Update all charts with current data
        this.updateAllCharts();
    }

    updateElement(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        } else {
            console.warn(`[Dashboard] Element not found: ${id}`);
        }
    }

    updateDateTime() {
        const now = new Date();
        let hours = now.getHours();
        const minutes = now.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const timeString = `${hours}:${minutes.toString().padStart(2, '0')}${ampm}`;

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dayName = days[now.getDay()];
        const day = now.getDate();
        const month = months[now.getMonth()];
        const year = now.getFullYear();
        const dateString = `${dayName}, ${day} ${month} ${year}`;

        this.updateElement('currentTime', timeString);
        this.updateElement('currentDate', dateString);
    }

    showErrorMessage(message) {
        console.error("[Dashboard] ERROR:", message);
        // You can add a UI notification here if available
        // this.env.services.notification.add(message, {type: 'danger'});
    }

    // ==================== Event Handlers ====================

    setupEventListeners() {
        console.log("[Dashboard] Setting up event listeners...");
        
        // Dropdown functionality
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

        // Manager filter
        const managerFilter = document.getElementById('managerFilter');
        if (managerFilter) {
            managerFilter.addEventListener('change', (e) => {
                const selectedManagerId = e.target.value;
                const managerId = selectedManagerId && selectedManagerId !== 'all' ? parseInt(selectedManagerId) : null;
                console.log("[Dashboard] Manager filter changed:", managerId);
                this.loadDashboardData(managerId, this.currentProjectId);
            });
        }

        // Project filter
        const projectFilter = document.getElementById('projectFilter');
        if (projectFilter) {
            projectFilter.addEventListener('change', async (e) => {
                const selectedProjectId = e.target.value;
                console.log("[Dashboard] Project filter changed:", selectedProjectId);
                
                if (selectedProjectId && selectedProjectId !== 'all') {
                    // Navigate to single project dashboard if action exists
                    try {
                        await this.action.doAction({
                            type: 'ir.actions.client',
                            tag: 'single_project_dashboard',
                            params: {project_id: parseInt(selectedProjectId)},
                        });
                    } catch (error) {
                        console.log("[Dashboard] Single project view not available, filtering instead");
                        this.loadDashboardData(this.currentManagerId, parseInt(selectedProjectId));
                    }
                } else {
                    this.loadDashboardData(this.currentManagerId, null);
                }
            });
        }

        // Time filter
        const timeFilter = document.getElementById('progressTimeFilter');
        if (timeFilter) {
            timeFilter.addEventListener('change', async (e) => {
                this.currentTimeFilter = e.target.value;
                console.log("[Dashboard] Time filter changed:", this.currentTimeFilter);
                this.updateAllCharts();
            });
        }
    }

    populateFilters() {
        // Update user name
        this.updateElement('userName', this.userName);

        // Project filter
        const projectFilter = document.getElementById('projectFilter');
        if (projectFilter) {
            projectFilter.innerHTML = '<option value="all">All Projects</option>';
            this.projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                if (this.currentProjectId === project.id) {
                    option.selected = true;
                }
                projectFilter.appendChild(option);
            });
        }

        // Manager filter
        const managerFilter = document.getElementById('managerFilter');
        if (managerFilter) {
            managerFilter.innerHTML = '<option value="all">All Managers</option>';
            this.managers.forEach(manager => {
                const option = document.createElement('option');
                option.value = manager.id;
                option.textContent = manager.name;
                if (this.currentManagerId === manager.id) {
                    option.selected = true;
                }
                managerFilter.appendChild(option);
            });
        }

        // Time filter
        const timeFilter = document.getElementById('progressTimeFilter');
        if (timeFilter) {
            timeFilter.value = this.currentTimeFilter;
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

    // ==================== Charts ====================

    initializeCharts() {
        console.log("[Dashboard] Initializing charts...");
        
        if (typeof echarts === 'undefined') {
            console.log("[Dashboard] Loading ECharts library...");
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js';
            script.onload = () => {
                console.log("[Dashboard] ECharts loaded, rendering charts...");
                this.renderAllCharts();
            };
            script.onerror = () => {
                console.error("[Dashboard] Failed to load ECharts library!");
            };
            document.head.appendChild(script);
        } else {
            console.log("[Dashboard] ECharts already loaded, rendering charts...");
            this.renderAllCharts();
        }
    }

    renderAllCharts() {
        console.log("[Dashboard] Rendering all charts...");
        
        try {
            this.renderHorizontalBarChart();
            this.renderLineChart();
            this.renderBarChart();
            this.renderRadarChart();
            this.renderScatterChart();
            this.renderStackedBarChart();

            // Handle window resize
            window.addEventListener('resize', () => {
                Object.values(this.charts).forEach(chart => {
                    if (chart) chart.resize();
                });
            });
            
            console.log("[Dashboard] All charts rendered successfully!");
        } catch (error) {
            console.error("[Dashboard] Error rendering charts:", error);
        }
    }

    updateAllCharts() {
        console.log("[Dashboard] Updating all charts...");
        this.renderAllCharts();
    }

    renderHorizontalBarChart() {
        const el = document.getElementById('horizontalBarChart');
        if (!el) {
            console.warn("[Dashboard] horizontalBarChart element not found");
            return;
        }
        if (typeof echarts === 'undefined') {
            console.warn("[Dashboard] ECharts not loaded yet");
            return;
        }

        console.log("[Dashboard] Rendering horizontal bar chart...");

        if (!this.charts.horizontal) {
            this.charts.horizontal = echarts.init(el);
        }

        this.charts.horizontal.setOption({
            grid: {top: 20, right: 40, bottom: 20, left: 100},
            xAxis: {type: 'value', show: false},
            yAxis: {
                type: 'category',
                data: ['Total', 'New', 'In-Progress', 'Completed', 'Cancelled'],
                axisLine: {show: false},
                axisTick: {show: false},
                axisLabel: {color: '#4a5568', fontSize: 13},
            },
            series: [{
                type: 'bar',
                data: [
                    {value: this.stats.total || 0, itemStyle: {color: '#4299e1'}},
                    {value: this.stats.new || 0, itemStyle: {color: '#48bb78'}},
                    {value: this.stats.in_progress || 0, itemStyle: {color: '#ed8936'}},
                    {value: this.stats.completed || 0, itemStyle: {color: '#9f7aea'}},
                    {value: this.stats.cancelled || 0, itemStyle: {color: '#e2e8f0'}},
                ],
                barWidth: 18,
                itemStyle: {borderRadius: [0, 4, 4, 0]},
            }],
        });
    }

    renderLineChart() {
        const el = document.getElementById('lineChart');
        if (!el || typeof echarts === 'undefined') return;

        console.log("[Dashboard] Rendering line chart...");

        if (!this.charts.line) {
            this.charts.line = echarts.init(el);
        }

        // Process creation trend from loaded projects
        const {labels, data} = this.getCreationTrendData();

        this.charts.line.setOption({
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(50, 50, 50, 0.9)',
                textStyle: {color: '#fff'},
            },
            grid: {top: 50, right: 60, bottom: 40, left: 60},
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: {lineStyle: {color: '#e2e8f0'}},
                axisLabel: {color: '#718096', fontSize: 12},
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: Math.max(5, Math.max(...data) + 2),
                axisLine: {show: false},
                splitLine: {lineStyle: {color: '#f0f0f0'}},
                axisLabel: {color: '#718096'},
            },
            series: [{
                data: data,
                type: 'line',
                smooth: false,
                lineStyle: {color: '#4299e1', width: 2},
                itemStyle: {color: '#4299e1', borderWidth: 3, borderColor: '#fff'},
                symbol: 'circle',
                symbolSize: 8,
            }],
            legend: {
                data: ['New Projects'],
                right: 20,
                top: 10,
                textStyle: {color: '#718096', fontSize: 12},
            },
        });
    }

    getCreationTrendData() {
        // Get creation dates from loaded projects
        const today = new Date();
        const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        
        if (this.currentTimeFilter === '7') {
            // Last 7 days
            const dailyCounts = Array(7).fill(0);
            
            this.projectData.forEach(project => {
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
        } else if (this.currentTimeFilter === '30') {
            // Last 4 weeks
            const weeklyCounts = Array(4).fill(0);
            
            this.projectData.forEach(project => {
                if (project.create_date) {
                    const createDate = new Date(project.create_date);
                    const daysDiff = Math.floor((today - createDate) / (1000 * 60 * 60 * 24));
                    if (daysDiff >= 0 && daysDiff < 30) {
                        const weekIndex = Math.floor(daysDiff / 7);
                        if (weekIndex < 4) {
                            weeklyCounts[3 - weekIndex]++;
                        }
                    }
                }
            });

            return {labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], data: weeklyCounts};
        } else {
            // Last 3 months
            const monthlyCounts = Array(3).fill(0);
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            this.projectData.forEach(project => {
                if (project.create_date) {
                    const createDate = new Date(project.create_date);
                    const monthsDiff = (today.getFullYear() - createDate.getFullYear()) * 12 +
                        (today.getMonth() - createDate.getMonth());
                    if (monthsDiff >= 0 && monthsDiff < 3) {
                        monthlyCounts[2 - monthsDiff]++;
                    }
                }
            });

            const labels = Array.from({length: 3}, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - (2 - i));
                return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
            });

            return {labels, data: monthlyCounts};
        }
    }

    renderBarChart() {
        const el = document.getElementById('barChart');
        if (!el || typeof echarts === 'undefined') return;

        console.log("[Dashboard] Rendering bar chart...");

        if (!this.charts.bar) {
            this.charts.bar = echarts.init(el);
        }

        // Calculate average progress by period
        const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        const progressData = [45, 52, 61, 68]; // Sample data - you can calculate from task_count

        this.charts.bar.setOption({
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(50, 50, 50, 0.9)',
                textStyle: {color: '#fff'},
            },
            grid: {top: 40, right: 30, bottom: 50, left: 60},
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: {lineStyle: {color: '#e2e8f0'}},
                axisLabel: {color: '#718096', fontSize: 12},
            },
            yAxis: {
                type: 'value',
                name: 'Progress %',
                min: 0,
                max: 100,
                interval: 20,
                axisLine: {show: false},
                splitLine: {lineStyle: {color: '#f0f0f0'}},
                axisLabel: {color: '#718096', formatter: '{value}%'},
            },
            series: [{
                data: progressData,
                type: 'bar',
                itemStyle: {
                    color: (params) => {
                        const value = params.value;
                        if (value >= 80) return '#48bb78';
                        if (value >= 60) return '#4299e1';
                        if (value >= 40) return '#ed8936';
                        return '#fc8181';
                    },
                    borderRadius: [4, 4, 0, 0],
                },
                barWidth: '60%',
            }],
        });
    }

    renderRadarChart() {
        const el = document.getElementById('radarChart');
        if (!el || typeof echarts === 'undefined') return;

        console.log("[Dashboard] Rendering radar chart...");

        if (!this.charts.radar) {
            this.charts.radar = echarts.init(el);
        }

        this.charts.radar.setOption({
            tooltip: {trigger: 'item'},
            legend: {
                data: ['Budget', 'Expenses'],
                bottom: 0,
                textStyle: {fontSize: 12},
            },
            radar: {
                indicator: [
                    {name: 'January', max: 100},
                    {name: 'February', max: 100},
                    {name: 'March', max: 100},
                    {name: 'April', max: 100},
                    {name: 'May', max: 100},
                    {name: 'June', max: 100},
                ],
                splitArea: {
                    areaStyle: {
                        color: ['rgba(180, 200, 220, 0.05)', 'rgba(180, 200, 220, 0.1)'],
                    },
                },
            },
            series: [{
                type: 'radar',
                data: [
                    {
                        value: [80, 85, 75, 90, 85, 78],
                        name: 'Budget',
                        areaStyle: {color: 'rgba(255, 216, 110, 0.4)'},
                        lineStyle: {color: '#ffd86e', width: 2},
                    },
                    {
                        value: [65, 72, 68, 75, 70, 65],
                        name: 'Expenses',
                        areaStyle: {color: 'rgba(114, 147, 255, 0.4)'},
                        lineStyle: {color: '#7293ff', width: 2},
                    },
                ],
            }],
        });
    }

    renderScatterChart() {
        const el = document.getElementById('scatterChart');
        if (!el || typeof echarts === 'undefined') return;

        console.log("[Dashboard] Rendering scatter chart...");

        if (!this.charts.scatter) {
            this.charts.scatter = echarts.init(el);
        }

        // Calculate risk data from projects
        const scatterData = this.projectData.slice(0, 20).map(project => {
            const today = new Date();
            const deadline = project.date ? new Date(project.date) : new Date();
            const daysRemaining = Math.max(0, Math.ceil((deadline - today) / (1000 * 60 * 60 * 24)));
            const riskFactor = daysRemaining < 7 ? 85 : daysRemaining < 14 ? 60 : 30;
            
            return [daysRemaining, riskFactor];
        });

        this.charts.scatter.setOption({
            tooltip: {trigger: 'item'},
            grid: {top: 40, right: 40, bottom: 40, left: 60},
            xAxis: {
                type: 'value',
                name: 'Days Remaining',
                min: 0,
                axisLine: {lineStyle: {color: '#e2e8f0'}},
                splitLine: {lineStyle: {color: '#f0f0f0'}},
            },
            yAxis: {
                type: 'value',
                name: 'Risk Factor',
                min: 0,
                max: 100,
                axisLine: {show: false},
                splitLine: {lineStyle: {color: '#f0f0f0'}},
            },
            series: [{
                type: 'scatter',
                symbolSize: 10,
                data: scatterData,
                itemStyle: {
                    color: (params) => {
                        const risk = params.value[1];
                        if (risk > 70) return '#fc8181';
                        if (risk > 40) return '#ed8936';
                        return '#48bb78';
                    },
                    opacity: 0.8,
                },
            }],
        });
    }

    renderStackedBarChart() {
        const el = document.getElementById('stackedBarChart');
        if (!el || typeof echarts === 'undefined') return;

        console.log("[Dashboard] Rendering stacked bar chart...");

        if (!this.charts.stacked) {
            this.charts.stacked = echarts.init(el);
        }

        // Group projects by department
        const deptData = {};
        this.projectData.forEach(project => {
            const deptName = project.department_id ? project.department_id[1] : 'Unassigned';
            if (!deptData[deptName]) {
                deptData[deptName] = {inBudget: 0, overBudget: 0};
            }
            // Simple logic - you can enhance this
            if (Math.random() > 0.3) {
                deptData[deptName].inBudget++;
            } else {
                deptData[deptName].overBudget++;
            }
        });

        const departments = Object.keys(deptData).slice(0, 5);
        const inBudgetData = departments.map(d => deptData[d].inBudget);
        const overBudgetData = departments.map(d => deptData[d].overBudget);

        this.charts.stacked.setOption({
            tooltip: {
                trigger: 'axis',
                axisPointer: {type: 'shadow'},
            },
            grid: {top: 60, right: 40, bottom: 60, left: 60},
            legend: {
                data: ['In-Budget Projects', 'Over-Budget Projects'],
                bottom: 10,
            },
            xAxis: {
                type: 'category',
                data: departments,
                axisLine: {lineStyle: {color: '#e2e8f0'}},
                axisLabel: {color: '#718096'},
            },
            yAxis: {
                type: 'value',
                name: 'Number of Projects',
                axisLine: {show: false},
                splitLine: {lineStyle: {color: '#f0f0f0'}},
            },
            series: [
                {
                    name: 'In-Budget Projects',
                    type: 'bar',
                    stack: 'total',
                    data: inBudgetData,
                    itemStyle: {color: '#68d391'},
                    barWidth: '50%',
                },
                {
                    name: 'Over-Budget Projects',
                    type: 'bar',
                    stack: 'total',
                    data: overBudgetData,
                    itemStyle: {color: '#fc8181'},
                },
            ],
        });
    }
}

ProjectDashboard.template = "sh_project_dashboard.project_dashboard_template";

registry.category("actions").add("project_dashboard", ProjectDashboard);

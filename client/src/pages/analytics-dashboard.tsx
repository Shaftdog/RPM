import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  Target, 
  CheckCircle, 
  Calendar, 
  Zap,
  Award,
  Filter,
  Eye,
  Repeat
} from "lucide-react";
import { format, subDays, isWithinInterval } from "date-fns";

interface CompletedTask {
  id: string;
  name: string;
  type: string;
  category: "Personal" | "Business";
  subcategory: string;
  timeHorizon: string;
  priority: "High" | "Medium" | "Low";
  estimatedTime: string;
  actualTime: string;
  caloriesIntake?: string;
  caloriesExpenditure?: string;
  progress: number;
  status: string;
  why?: string;
  dueDate?: string | null;
  xDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RecurringTask {
  id: string;
  taskName: string;
  taskType: string;
  timeBlock: string;
  daysOfWeek: string[];
  category: "Personal" | "Business";
  subcategory: string;
  durationMinutes: number;
  energyImpact: number;
  priority: "High" | "Medium" | "Low";
  isActive: boolean;
  description?: string;
}

export default function AnalyticsDashboard() {
  const [timeRange, setTimeRange] = useState("7"); // days
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"overview" | "tasks" | "insights">("overview");

  const { data: allTasks = [], isLoading } = useQuery<CompletedTask[]>({
    queryKey: ['/api/tasks'],
  });

  const { data: recurringTasks = [], isLoading: isLoadingRecurring } = useQuery<RecurringTask[]>({
    queryKey: ['/api/recurring-tasks'],
  });

  // Filter to only completed tasks
  const completedTasks = allTasks.filter(task => task.status === 'completed');

  // Apply time range filter
  const filteredTasks = completedTasks.filter(task => {
    if (timeRange === "all") return true;
    
    const days = parseInt(timeRange);
    const taskDate = new Date(task.updatedAt || task.createdAt);
    
    // Guard against invalid dates
    if (isNaN(taskDate.getTime())) {
      return timeRange === "all"; // Include in all-time view if date is invalid
    }
    
    const rangeStart = subDays(new Date(), days);
    
    return isWithinInterval(taskDate, { start: rangeStart, end: new Date() });
  });

  // Apply category filter
  const displayTasks = categoryFilter === "all" 
    ? filteredTasks 
    : filteredTasks.filter(task => task.category.toLowerCase() === categoryFilter);

  // Calculate analytics
  const analytics = {
    totalCompleted: displayTasks.length,
    personalTasks: displayTasks.filter(t => t.category === 'Personal').length,
    businessTasks: displayTasks.filter(t => t.category === 'Business').length,
    highPriority: displayTasks.filter(t => t.priority === 'High').length,
    totalEstimatedHours: displayTasks.reduce((sum, task) => 
      sum + (parseFloat(task.estimatedTime || '0') || 0), 0),
    totalActualHours: displayTasks.reduce((sum, task) => 
      sum + (parseFloat(task.actualTime || '0') || 0), 0),
    totalCaloriesGained: displayTasks.reduce((sum, task) => 
      sum + (parseFloat(task.caloriesIntake || '0') || 0), 0),
    totalCaloriesSpent: displayTasks.reduce((sum, task) => 
      sum + (parseFloat(task.caloriesExpenditure || '0') || 0), 0),
    avgTimeAccuracy: 0,
    categoryBreakdown: {} as Record<string, number>,
  };

  // Calculate time accuracy
  const tasksWithBothTimes = displayTasks.filter(t => 
    parseFloat(t.estimatedTime || '0') > 0 && parseFloat(t.actualTime || '0') > 0);
  
  if (tasksWithBothTimes.length > 0) {
    const accuracySum = tasksWithBothTimes.reduce((sum, task) => {
      const estimated = parseFloat(task.estimatedTime || '0');
      const actual = parseFloat(task.actualTime || '0');
      const accuracy = Math.min(estimated / actual, actual / estimated) * 100;
      return sum + accuracy;
    }, 0);
    analytics.avgTimeAccuracy = accuracySum / tasksWithBothTimes.length;
  }

  // Category breakdown
  displayTasks.forEach(task => {
    analytics.categoryBreakdown[task.subcategory] = 
      (analytics.categoryBreakdown[task.subcategory] || 0) + 1;
  });

  const netCalories = analytics.totalCaloriesGained - analytics.totalCaloriesSpent;

  // Calculate recurring tasks analytics
  const activeRecurringTasks = categoryFilter === "all"
    ? recurringTasks.filter(t => t.isActive)
    : recurringTasks.filter(t => t.isActive && t.category.toLowerCase() === categoryFilter);

  const recurringAnalytics = {
    totalActive: activeRecurringTasks.length,
    personalRecurring: activeRecurringTasks.filter(t => t.category === 'Personal').length,
    businessRecurring: activeRecurringTasks.filter(t => t.category === 'Business').length,
    totalWeeklyMinutes: activeRecurringTasks.reduce((sum, task) => 
      sum + (task.durationMinutes * task.daysOfWeek.length), 0),
    totalEnergyImpact: activeRecurringTasks.reduce((sum, task) => 
      sum + (task.energyImpact || 0), 0),
    highPriorityRecurring: activeRecurringTasks.filter(t => t.priority === 'High').length,
    categoryBreakdown: {} as Record<string, number>,
  };

  // Category breakdown for recurring tasks
  activeRecurringTasks.forEach(task => {
    recurringAnalytics.categoryBreakdown[task.subcategory] = 
      (recurringAnalytics.categoryBreakdown[task.subcategory] || 0) + 1;
  });

  const weeklyHours = recurringAnalytics.totalWeeklyMinutes / 60;

  if (isLoading || isLoadingRecurring) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-2">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Track your productivity and completed task insights
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32" data-testid="select-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 3 months</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-32" data-testid="select-category-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="business">Business</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex space-x-2">
        <Button
          variant={viewMode === "overview" ? "default" : "outline"}
          onClick={() => setViewMode("overview")}
          data-testid="button-overview-view"
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          Overview
        </Button>
        <Button
          variant={viewMode === "tasks" ? "default" : "outline"}
          onClick={() => setViewMode("tasks")}
          data-testid="button-tasks-view"
        >
          <Eye className="h-4 w-4 mr-2" />
          Completed Tasks
        </Button>
        <Button
          variant={viewMode === "insights" ? "default" : "outline"}
          onClick={() => setViewMode("insights")}
          data-testid="button-insights-view"
        >
          <Award className="h-4 w-4 mr-2" />
          Insights
        </Button>
      </div>

      {viewMode === "overview" && (
        <>
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Completed</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-completed">{analytics.totalCompleted}</div>
                <p className="text-xs text-muted-foreground">
                  {analytics.personalTasks} Personal • {analytics.businessTasks} Business
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Time Accuracy</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-time-accuracy">
                  {analytics.avgTimeAccuracy.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {analytics.totalEstimatedHours.toFixed(1)}h est • {analytics.totalActualHours.toFixed(1)}h actual
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Priority</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-high-priority">{analytics.highPriority}</div>
                <p className="text-xs text-muted-foreground">
                  {analytics.totalCompleted > 0 ? Math.round((analytics.highPriority / analytics.totalCompleted) * 100) : 0}% of completed tasks
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Energy Balance</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${netCalories >= 0 ? 'text-green-600' : 'text-red-600'}`} 
                     data-testid="text-net-calories">
                  {netCalories > 0 ? '+' : ''}{netCalories.toFixed(0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {analytics.totalCaloriesGained.toFixed(0)} gained • {analytics.totalCaloriesSpent.toFixed(0)} spent
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recurring Tasks Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Repeat className="h-5 w-5" />
                    Active Recurring Tasks
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Your ongoing weekly commitments</p>
                </div>
                <Badge variant="outline" className="text-lg px-3" data-testid="badge-recurring-count">
                  {recurringAnalytics.totalActive}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary" data-testid="text-weekly-hours">
                    {weeklyHours.toFixed(1)}h
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Weekly Time Commitment</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className={`text-2xl font-bold ${recurringAnalytics.totalEnergyImpact >= 0 ? 'text-green-600' : 'text-red-600'}`} 
                       data-testid="text-recurring-energy">
                    {recurringAnalytics.totalEnergyImpact > 0 ? '+' : ''}{recurringAnalytics.totalEnergyImpact}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Total Energy Impact</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary" data-testid="text-recurring-high-priority">
                    {recurringAnalytics.highPriorityRecurring}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">High Priority Tasks</p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium text-sm">Category Distribution</h4>
                {Object.entries(recurringAnalytics.categoryBreakdown).length > 0 ? (
                  Object.entries(recurringAnalytics.categoryBreakdown)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 6)
                    .map(([category, count]) => (
                      <div key={category} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">{category}</Badge>
                          <span className="text-sm text-muted-foreground">{count} tasks</span>
                        </div>
                        <Progress 
                          value={(count / recurringAnalytics.totalActive) * 100} 
                          className="w-20"
                        />
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No active recurring tasks found
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Category Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Category Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">Tasks completed by subcategory</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(analytics.categoryBreakdown)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 8)
                  .map(([category, count]) => (
                    <div key={category} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline">{category}</Badge>
                        <span className="text-sm text-muted-foreground">{count} tasks</span>
                      </div>
                      <Progress 
                        value={(count / analytics.totalCompleted) * 100} 
                        className="w-20"
                      />
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {viewMode === "tasks" && (
        <Card>
          <CardHeader>
            <CardTitle>Completed Tasks</CardTitle>
            <p className="text-sm text-muted-foreground">
              {displayTasks.length} completed tasks found
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {displayTasks.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium">No completed tasks found</h3>
                  <p className="text-muted-foreground">Try adjusting your filters or complete some tasks first.</p>
                </div>
              ) : (
                displayTasks.map(task => (
                  <div key={task.id} className="border border-border rounded-lg p-4" data-testid={`completed-task-${task.id}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium">{task.name}</h3>
                        <div className="flex items-center space-x-2 mt-2">
                          <Badge variant="outline" className="text-xs">{task.type}</Badge>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              task.category === 'Personal' 
                                ? 'bg-personal/10 text-personal border-personal' 
                                : 'bg-business/10 text-business border-business'
                            }`}
                          >
                            {task.category}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{task.subcategory}</Badge>
                          <Badge 
                            variant={task.priority === 'High' ? 'destructive' : 
                                   task.priority === 'Medium' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {task.priority}
                          </Badge>
                        </div>
                        {task.why && (
                          <p className="text-sm text-muted-foreground mt-2">{task.why}</p>
                        )}
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <div>Completed {(() => {
                          const dateStr = task.updatedAt || task.createdAt;
                          if (!dateStr) return 'Unknown date';
                          const date = new Date(dateStr);
                          return !isNaN(date.getTime()) ? format(date, 'MMM d, yyyy') : 'Unknown date';
                        })()}</div>
                        {(task.estimatedTime || task.actualTime) && (
                          <div className="mt-1">
                            {parseFloat(task.estimatedTime || '0') > 0 && `Est: ${task.estimatedTime}h`}
                            {parseFloat(task.estimatedTime || '0') > 0 && parseFloat(task.actualTime || '0') > 0 && ' • '}
                            {parseFloat(task.actualTime || '0') > 0 && `Actual: ${task.actualTime}h`}
                          </div>
                        )}
                        {(task.caloriesIntake || task.caloriesExpenditure) && (
                          <div className="mt-1">
                            {parseFloat(task.caloriesIntake || '0') > 0 && `+${task.caloriesIntake} cal`}
                            {parseFloat(task.caloriesIntake || '0') > 0 && parseFloat(task.caloriesExpenditure || '0') > 0 && ' '}
                            {parseFloat(task.caloriesExpenditure || '0') > 0 && `-${task.caloriesExpenditure} cal`}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === "insights" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Productivity Patterns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Most Productive Categories</h4>
                <div className="space-y-2">
                  {Object.entries(analytics.categoryBreakdown)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 3)
                    .map(([category, count], index) => (
                      <div key={category} className="flex items-center justify-between">
                        <span className="text-sm">#{index + 1} {category}</span>
                        <Badge variant="outline">{count} tasks</Badge>
                      </div>
                    ))}
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Time Management</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Average Task Duration</span>
                    <span>{analytics.totalCompleted > 0 ? (analytics.totalActualHours / analytics.totalCompleted).toFixed(1) : 0}h</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Estimation Accuracy</span>
                    <span className={analytics.avgTimeAccuracy >= 80 ? 'text-green-600' : 
                                   analytics.avgTimeAccuracy >= 60 ? 'text-yellow-600' : 'text-red-600'}>
                      {analytics.avgTimeAccuracy.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Achievement Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">{analytics.totalCompleted}</div>
                <p className="text-muted-foreground">Tasks Completed</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-xl font-semibold">{analytics.totalActualHours.toFixed(1)}</div>
                  <p className="text-sm text-muted-foreground">Hours Invested</p>
                </div>
                <div>
                  <div className={`text-xl font-semibold ${netCalories >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {netCalories > 0 ? '+' : ''}{netCalories.toFixed(0)}
                  </div>
                  <p className="text-sm text-muted-foreground">Energy Balance</p>
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-2">Quick Stats</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Personal vs Business</span>
                    <span>{analytics.personalTasks}:{analytics.businessTasks}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>High Priority Focus</span>
                    <span>{analytics.totalCompleted > 0 ? Math.round((analytics.highPriority / analytics.totalCompleted) * 100) : 0}%</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
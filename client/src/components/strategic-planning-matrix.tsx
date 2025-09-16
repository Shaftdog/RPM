import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Filter, BarChart3 } from "lucide-react";

interface Task {
  id: string;
  name: string;
  type: string;
  category: "Personal" | "Business";
  subcategory: string;
  timeHorizon: string;
  priority: "High" | "Medium" | "Low";
  estimatedTime: string;
  progress: number;
  status: string;
}

export default function StrategicPlanningMatrix() {
  const [aiCommand, setAiCommand] = useState("");
  const { toast } = useToast();

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, newTimeHorizon, newSubcategory }: {
      taskId: string;
      newTimeHorizon?: string;
      newSubcategory?: string;
    }) => {
      const response = await apiRequest("POST", "/api/planning/move", {
        taskId,
        newTimeHorizon,
        newSubcategory,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Task moved successfully",
        description: "The task has been repositioned in your planning matrix",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to move task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const aiCommandMutation = useMutation({
    mutationFn: async (command: string) => {
      const response = await apiRequest("POST", "/api/ai/chat", {
        message: command,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "AI Command Processed",
        description: data.response,
      });
    },
    onError: (error) => {
      toast({
        title: "AI Command Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Organize tasks by matrix structure
  const timeHorizons = ['VISION', '10 Year', '5 Year', '1 Year', 'Quarter', 'Week', 'Today', 'BACKLOG'];
  const categories = ['Physical', 'Mental', 'Relationship', 'Environmental', 'Financial', 'Adventure', 'Marketing', 'Sales', 'Operations', 'Products', 'Production'];

  const matrix: Record<string, Record<string, Task[]>> = {};
  timeHorizons.forEach(horizon => {
    matrix[horizon] = {};
    categories.forEach(category => {
      matrix[horizon][category] = [];
    });
  });

  // Populate matrix with tasks
  tasks.forEach(task => {
    const horizon = task.timeHorizon === '1 Year' ? '1 Year' : 
                   task.timeHorizon === '5 Year' ? '5 Year' : 
                   task.timeHorizon === '10 Year' ? '10 Year' : 
                   task.timeHorizon || 'BACKLOG';
    const category = task.subcategory || 'Mental';
    
    if (matrix[horizon] && matrix[horizon][category]) {
      matrix[horizon][category].push(task);
    }
  });

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData('application/json', JSON.stringify(task));
  };

  const handleDrop = (e: React.DragEvent, timeHorizon: string, subcategory: string) => {
    e.preventDefault();
    const taskData = JSON.parse(e.dataTransfer.getData('application/json'));
    
    if (taskData.timeHorizon !== timeHorizon || taskData.subcategory !== subcategory) {
      moveTaskMutation.mutate({
        taskId: taskData.id,
        newTimeHorizon: timeHorizon,
        newSubcategory: subcategory,
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleAiCommand = () => {
    if (!aiCommand.trim()) return;
    aiCommandMutation.mutate(aiCommand);
    setAiCommand("");
  };

  const getTaskStats = () => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const personal = tasks.filter(t => t.category === 'Personal').length;
    const business = tasks.filter(t => t.category === 'Business').length;
    
    return {
      total,
      completed,
      personalPercent: total > 0 ? Math.round((personal / total) * 100) : 0,
      businessPercent: total > 0 ? Math.round((business / total) * 100) : 0,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  };

  const stats = getTaskStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-2">Loading planning matrix...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-8">
      {/* Planning Grid */}
      <div className="flex-1">
        <Card>
          <CardHeader>
            <CardTitle>Strategic Planning Matrix</CardTitle>
            <p className="text-sm text-muted-foreground">
              Drag tasks between time horizons and categories
            </p>
          </CardHeader>
          
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-4 text-left text-sm font-medium text-muted-foreground w-32">
                      Time Horizon
                    </th>
                    {categories.slice(0, 6).map(cat => (
                      <th key={cat} className="px-3 py-4 text-center text-xs font-medium text-personal uppercase tracking-wider bg-personal/5">
                        {cat}
                      </th>
                    ))}
                    {categories.slice(6).map(cat => (
                      <th key={cat} className="px-3 py-4 text-center text-xs font-medium text-business uppercase tracking-wider bg-business/5">
                        {cat}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeHorizons.map(horizon => (
                    <tr key={horizon} className={`border-b border-border hover:bg-muted/50 ${horizon === 'Today' ? 'bg-yellow-50' : ''}`}>
                      <td className={`px-3 py-4 font-medium text-sm text-foreground ${horizon === 'Today' ? 'bg-yellow-100' : 'bg-accent/30'}`}>
                        {horizon}
                      </td>
                      {categories.map(category => {
                        const cellTasks = matrix[horizon][category];
                        const isPersonal = categories.indexOf(category) < 6;
                        
                        return (
                          <td
                            key={category}
                            className={`px-3 py-4 min-h-[120px] align-top ${
                              horizon === 'Today' 
                                ? isPersonal ? 'bg-personal/10' : 'bg-business/10'
                                : horizon === 'BACKLOG' 
                                ? 'bg-muted/20' 
                                : isPersonal ? 'bg-personal/5' : 'bg-business/5'
                            }`}
                            onDrop={(e) => handleDrop(e, horizon, category)}
                            onDragOver={handleDragOver}
                            data-testid={`cell-${horizon}-${category}`}
                          >
                            <div className="space-y-2">
                              {cellTasks.map(task => (
                                <div
                                  key={task.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, task)}
                                  className={`p-2 rounded text-xs cursor-move border-l-4 ${
                                    horizon === 'BACKLOG'
                                      ? 'bg-muted border-muted-foreground'
                                      : isPersonal
                                      ? `bg-personal/20 border-personal ${horizon === 'Today' ? 'bg-personal/30' : ''}`
                                      : `bg-business/20 border-business ${horizon === 'Today' ? 'bg-business/30' : ''}`
                                  } hover:opacity-80 transition-opacity`}
                                  data-testid={`task-card-${task.id}`}
                                >
                                  <div className="font-medium">{task.name}</div>
                                  <div className={`text-xs mt-1 ${
                                    horizon === 'BACKLOG' 
                                      ? 'text-muted-foreground'
                                      : isPersonal ? 'text-personal' : 'text-business'
                                  }`}>
                                    {task.type} • {task.estimatedTime}h • {task.priority}
                                    {task.progress > 0 && ` • ${task.progress}%`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Right Sidebar */}
      <div className="w-80 space-y-6">
        {/* AI Assistant */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Planning Assistant</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Try these commands:</p>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-left h-auto py-2 px-3"
                  onClick={() => setAiCommand("Move all Marketing tasks to next week")}
                  data-testid="button-ai-suggestion-1"
                >
                  "Move all Marketing tasks to next week"
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-left h-auto py-2 px-3"
                  onClick={() => setAiCommand("Balance my Personal and Business tasks")}
                  data-testid="button-ai-suggestion-2"
                >
                  "Balance my Personal and Business tasks"
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-left h-auto py-2 px-3"
                  onClick={() => setAiCommand("Show what's blocking my milestones")}
                  data-testid="button-ai-suggestion-3"
                >
                  "Show what's blocking my milestones"
                </Button>
              </div>
            </div>
            <div className="flex mt-4 space-x-2">
              <Input 
                value={aiCommand}
                onChange={(e) => setAiCommand(e.target.value)}
                placeholder="Ask AI to reorganize..." 
                className="text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleAiCommand()}
                data-testid="input-ai-command"
              />
              <Button 
                size="sm" 
                onClick={handleAiCommand}
                disabled={aiCommandMutation.isPending}
                data-testid="button-ai-send"
              >
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Statistics */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5" />
              <CardTitle className="text-base">Planning Stats</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Active Tasks</span>
              <span className="text-sm font-medium" data-testid="text-active-tasks">{stats.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Completed Tasks</span>
              <span className="text-sm font-medium text-business" data-testid="text-completed-tasks">{stats.completed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Personal vs Business</span>
              <span className="text-sm font-medium" data-testid="text-category-balance">
                {stats.personalPercent}% / {stats.businessPercent}%
              </span>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>Weekly Progress</span>
                <span data-testid="text-completion-rate">{stats.completionRate}%</span>
              </div>
              <Progress value={stats.completionRate} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Filter Options */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <CardTitle className="text-base">Filters</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-filter-incomplete">
              Show Only Incomplete
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-filter-high-priority">
              High Priority Only
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-filter-personal">
              Personal Tasks Only
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-filter-business">
              Business Tasks Only
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

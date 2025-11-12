import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, User, LogOut, CalendarIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface HeaderNavigationProps {
  activeTab: "capture" | "planning" | "daily" | "recurring" | "analytics" | "notes";
  onTabChange: (tab: "capture" | "planning" | "daily" | "recurring" | "analytics" | "notes") => void;
}

export default function HeaderNavigation({ activeTab, onTabChange }: HeaderNavigationProps) {
  const { user, logoutMutation } = useAuth();
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickTaskData, setQuickTaskData] = useState({
    name: "",
    category: "Personal",
    priority: "Medium",
    estimatedTime: 1,
    caloriesIntake: undefined as number | undefined,
    caloriesExpenditure: undefined as number | undefined,
    description: "",
    dueDate: null as Date | null,
    xDate: null as Date | null,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: any) => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
      });
      if (!response.ok) throw new Error('Failed to create task');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Task created successfully!",
        description: "Your task has been added to your list.",
      });
      setIsQuickAddOpen(false);
      setQuickTaskData({
        name: "",
        category: "Personal", 
        priority: "Medium",
        estimatedTime: 1,
        caloriesIntake: undefined,
        caloriesExpenditure: undefined,
        description: "",
        dueDate: null,
        xDate: null,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error creating task",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`;
    }
    return user?.username?.[0]?.toUpperCase() || "U";
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleQuickAdd = () => {
    setIsQuickAddOpen(true);
  };

  const handleQuickTaskSubmit = () => {
    if (!quickTaskData.name.trim()) {
      toast({
        title: "Task name required",
        description: "Please enter a task name",
        variant: "destructive",
      });
      return;
    }

    const taskToCreate = {
      ...quickTaskData,
      type: "Task",
      subcategory: "Mental",
      timeHorizon: "Week",
      why: "Quick add task",
      dependencies: [],
      dueDate: quickTaskData.dueDate ? quickTaskData.dueDate.toISOString() : null,
      xDate: quickTaskData.xDate ? quickTaskData.xDate.toISOString() : null,
    };

    createTaskMutation.mutate(taskToCreate);
  };

  return (
    <header className="bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-foreground">ProductivityAI</h1>
            </div>
            <nav className="flex space-x-4">
              <Button
                variant={activeTab === "capture" ? "default" : "secondary"}
                onClick={() => onTabChange("capture")}
                data-testid="tab-capture"
              >
                Capture
              </Button>
              <Button
                variant={activeTab === "planning" ? "default" : "secondary"}
                onClick={() => onTabChange("planning")}
                data-testid="tab-planning"
              >
                Planning
              </Button>
              <Button
                variant={activeTab === "daily" ? "default" : "secondary"}
                onClick={() => onTabChange("daily")}
                data-testid="tab-daily"
              >
                Daily
              </Button>
              <Button
                variant={activeTab === "recurring" ? "default" : "secondary"}
                onClick={() => onTabChange("recurring")}
                data-testid="tab-recurring"
              >
                Recurring
              </Button>
              <Button
                variant={activeTab === "analytics" ? "default" : "secondary"}
                onClick={() => onTabChange("analytics")}
                data-testid="tab-analytics"
              >
                Analytics
              </Button>
              <Button
                variant={activeTab === "notes" ? "default" : "secondary"}
                onClick={() => onTabChange("notes")}
                data-testid="tab-notes"
              >
                Notes
              </Button>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleQuickAdd}
              data-testid="button-quick-add"
            >
              <Plus className="h-4 w-4 mr-2" />
              Quick Add Task
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Avatar className="cursor-pointer" data-testid="avatar-user">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback>{getInitials()}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} data-testid="button-logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Dialog open={isQuickAddOpen} onOpenChange={setIsQuickAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Quick Add Task</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="task-name">Task Name *</Label>
              <Input
                id="task-name"
                value={quickTaskData.name}
                onChange={(e) => setQuickTaskData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter task name..."
                data-testid="input-task-name"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="task-category">Category</Label>
              <Select 
                value={quickTaskData.category} 
                onValueChange={(value) => setQuickTaskData(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger data-testid="select-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Personal">Personal</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-priority">Priority</Label>
              <Select 
                value={quickTaskData.priority} 
                onValueChange={(value) => setQuickTaskData(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger data-testid="select-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="estimated-time">Estimated Time (hours)</Label>
              <Input
                id="estimated-time"
                type="number"
                min="0.5"
                step="0.5"
                value={quickTaskData.estimatedTime}
                onChange={(e) => setQuickTaskData(prev => ({ ...prev, estimatedTime: parseFloat(e.target.value) || 1 }))}
                data-testid="input-estimated-time"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="calorie-intake">Calorie Intake (optional)</Label>
                <Input
                  id="calorie-intake"
                  type="number"
                  min="0"
                  step="1"
                  value={quickTaskData.caloriesIntake || ""}
                  onChange={(e) => setQuickTaskData(prev => ({ ...prev, caloriesIntake: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  placeholder="e.g., 300"
                  data-testid="input-calorie-intake"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="calorie-expenditure">Calorie Expenditure (optional)</Label>
                <Input
                  id="calorie-expenditure"
                  type="number"
                  min="0"
                  step="1"
                  value={quickTaskData.caloriesExpenditure || ""}
                  onChange={(e) => setQuickTaskData(prev => ({ ...prev, caloriesExpenditure: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  placeholder="e.g., 150"
                  data-testid="input-calorie-expenditure"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-x-date">Work Date (X Date) (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !quickTaskData.xDate && "text-muted-foreground",
                      quickTaskData.xDate && "text-blue-600"
                    )}
                    data-testid="button-x-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {quickTaskData.xDate ? (
                      format(quickTaskData.xDate, "PPP")
                    ) : (
                      <span>Pick a work date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={quickTaskData.xDate || undefined}
                    onSelect={(date) => setQuickTaskData(prev => ({ ...prev, xDate: date || null }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {quickTaskData.xDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full"
                  onClick={() => setQuickTaskData(prev => ({ ...prev, xDate: null }))}
                  data-testid="button-clear-x-date"
                >
                  Clear work date
                </Button>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-due-date">Due Date (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !quickTaskData.dueDate && "text-muted-foreground"
                    )}
                    data-testid="button-due-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {quickTaskData.dueDate ? (
                      format(quickTaskData.dueDate, "PPP")
                    ) : (
                      <span>Pick a due date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={quickTaskData.dueDate || undefined}
                    onSelect={(date) => setQuickTaskData(prev => ({ ...prev, dueDate: date || null }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {quickTaskData.dueDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full"
                  onClick={() => setQuickTaskData(prev => ({ ...prev, dueDate: null }))}
                  data-testid="button-clear-due-date"
                >
                  Clear due date
                </Button>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-description">Description (optional)</Label>
              <Textarea
                id="task-description"
                value={quickTaskData.description}
                onChange={(e) => setQuickTaskData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional task description..."
                data-testid="textarea-description"
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button 
              variant="outline" 
              onClick={() => setIsQuickAddOpen(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleQuickTaskSubmit}
              disabled={createTaskMutation.isPending}
              data-testid="button-create-task"
            >
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}

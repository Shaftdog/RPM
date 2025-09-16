import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, User, LogOut } from "lucide-react";

interface HeaderNavigationProps {
  activeTab: "capture" | "planning" | "daily";
  onTabChange: (tab: "capture" | "planning" | "daily") => void;
}

export default function HeaderNavigation({ activeTab, onTabChange }: HeaderNavigationProps) {
  const { user, logoutMutation } = useAuth();

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`;
    }
    return user?.username?.[0]?.toUpperCase() || "U";
  };

  const handleLogout = () => {
    logoutMutation.mutate();
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
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" data-testid="button-quick-add">
              <Plus className="h-4 w-4 mr-2" />
              Quick Add Task
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Avatar className="cursor-pointer" data-testid="avatar-user">
                  <AvatarImage src={user?.profileImageUrl} />
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
    </header>
  );
}

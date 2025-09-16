import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Brain, Target, Clock, BarChart3 } from "lucide-react";

export default function AuthPage() {
  const { user, isLoading, loginMutation, registerMutation } = useAuth();
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [registerData, setRegisterData] = useState({ 
    username: "", 
    password: "", 
    email: "",
    firstName: "",
    lastName: "" 
  });

  // Redirect if already authenticated
  if (!isLoading && user) {
    return <Redirect to="/" />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginData);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(registerData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="grid lg:grid-cols-2 min-h-screen">
        {/* Left Panel - Authentication Forms */}
        <div className="flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold text-foreground">ProductivityAI</h1>
              <p className="text-muted-foreground">
                AI-driven personal productivity system
              </p>
            </div>

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <Card>
                  <CardHeader>
                    <CardTitle>Welcome back</CardTitle>
                    <CardDescription>
                      Sign in to your productivity dashboard
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="login-username">Username</Label>
                        <Input
                          id="login-username"
                          type="text"
                          value={loginData.username}
                          onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                          required
                          data-testid="input-login-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="login-password">Password</Label>
                        <Input
                          id="login-password"
                          type="password"
                          value={loginData.password}
                          onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                          required
                          data-testid="input-login-password"
                        />
                      </div>
                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={loginMutation.isPending}
                        data-testid="button-login"
                      >
                        {loginMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          "Sign in"
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="register">
                <Card>
                  <CardHeader>
                    <CardTitle>Create account</CardTitle>
                    <CardDescription>
                      Join thousands of productive users
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="register-firstname">First Name</Label>
                          <Input
                            id="register-firstname"
                            type="text"
                            value={registerData.firstName}
                            onChange={(e) => setRegisterData({ ...registerData, firstName: e.target.value })}
                            data-testid="input-register-firstname"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="register-lastname">Last Name</Label>
                          <Input
                            id="register-lastname"
                            type="text"
                            value={registerData.lastName}
                            onChange={(e) => setRegisterData({ ...registerData, lastName: e.target.value })}
                            data-testid="input-register-lastname"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-username">Username</Label>
                        <Input
                          id="register-username"
                          type="text"
                          value={registerData.username}
                          onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                          required
                          data-testid="input-register-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-email">Email</Label>
                        <Input
                          id="register-email"
                          type="email"
                          value={registerData.email}
                          onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                          data-testid="input-register-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-password">Password</Label>
                        <Input
                          id="register-password"
                          type="password"
                          value={registerData.password}
                          onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                          required
                          data-testid="input-register-password"
                        />
                      </div>
                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={registerMutation.isPending}
                        data-testid="button-register"
                      >
                        {registerMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating account...
                          </>
                        ) : (
                          "Create account"
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Right Panel - Hero Section */}
        <div className="hidden lg:flex items-center justify-center p-8 bg-gradient-to-br from-primary/5 to-business/5">
          <div className="max-w-md space-y-8 text-center">
            <div className="space-y-4">
              <h2 className="text-4xl font-bold text-foreground">
                Master Your Productivity
              </h2>
              <p className="text-xl text-muted-foreground">
                AI-powered task management that adapts to your workflow and maximizes your potential.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3 p-6 rounded-lg bg-card border border-border">
                <Brain className="h-8 w-8 text-primary mx-auto" />
                <h3 className="font-semibold">AI Task Extraction</h3>
                <p className="text-sm text-muted-foreground">
                  Automatically extract tasks from emails, documents, and conversations
                </p>
              </div>

              <div className="space-y-3 p-6 rounded-lg bg-card border border-border">
                <Target className="h-8 w-8 text-business mx-auto" />
                <h3 className="font-semibold">Strategic Planning</h3>
                <p className="text-sm text-muted-foreground">
                  Organize tasks across time horizons from today to 10-year vision
                </p>
              </div>

              <div className="space-y-3 p-6 rounded-lg bg-card border border-border">
                <Clock className="h-8 w-8 text-primary mx-auto" />
                <h3 className="font-semibold">Smart Scheduling</h3>
                <p className="text-sm text-muted-foreground">
                  AI-optimized daily schedules based on your energy and priorities
                </p>
              </div>

              <div className="space-y-3 p-6 rounded-lg bg-card border border-border">
                <BarChart3 className="h-8 w-8 text-business mx-auto" />
                <h3 className="font-semibold">Progress Tracking</h3>
                <p className="text-sm text-muted-foreground">
                  Real-time insights and analytics on your productivity patterns
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
